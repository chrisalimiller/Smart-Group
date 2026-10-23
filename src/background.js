// Smart Group background script: watches tabs and keeps Firefox tab groups in sync
// with the plan from grouping.js. Only touches groups it created itself, so groups
// the user makes by hand are left alone.

/* global planGroups, DEFAULT_SETTINGS, siteOf, isExempt, normalizeSitePattern, titlesForSite, addMessageListener, addUpdatedListener */

const NO_GROUP = -1;
let settings = { ...DEFAULT_SETTINGS };

// windowId -> { [groupKey]: groupId } for groups this extension created.
let managed = {};

// tabId -> the groupId this extension last put the tab in. If a tab shows up in one of
// our groups that isn't this one, the user moved it there.
const placedBy = new Map();

async function loadState() {
  const stored = await browser.storage.sync.get("settings");
  settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  const session = await browser.storage.session.get(["managed", "pageTitles", "placedBy"]);
  managed = session.managed || {};
  pageTitles = new Map(Object.entries(session.pageTitles || {}).map(([id, p]) => [Number(id), p]));
  for (const [id, groupId] of Object.entries(session.placedBy || {})) placedBy.set(Number(id), groupId);
}

// placedBy is saved too: Chrome stops this worker when idle, and without it a restart would
// mistake the extension's own earlier moves for ones the user made.
function saveManaged() {
  return browser.storage.session.set({ managed, placedBy: Object.fromEntries(placedBy) });
}

function managedIds(windowId) {
  return new Set(Object.values(managed[windowId] || {}));
}

async function groupExists(groupId) {
  try {
    await browser.tabGroups.get(groupId);
    return true;
  } catch {
    return false;
  }
}

// Asked fresh each time, since a tab can be pinned while a regroup is in progress.
async function pinnedTabIds(windowId) {
  const pinned = await browser.tabs.query({ windowId, pinned: true });
  return new Set(pinned.map((t) => t.id));
}

async function ungroupManaged(windowId) {
  const ours = managedIds(windowId);
  const tabs = await browser.tabs.query({ windowId });
  const ids = tabs.filter((t) => ours.has(t.groupId)).map((t) => t.id);
  if (ids.length) await browser.tabs.ungroup(ids);
  delete managed[windowId];
  await saveManaged();
}

async function regroupWindow(windowId) {
  const win = await browser.windows.get(windowId).catch(() => null);
  if (!win || win.type !== "normal") return;

  if (!settings.enabled) {
    await ungroupManaged(windowId);
    return;
  }

  const ours = managedIds(windowId);
  const allTabs = await browser.tabs.query({ windowId });
  // Tabs in a group the user made themselves are off limits.
  // ("status" above re-checks a tab once its page loads, so its title can help pick a category.)
  const tabs = allTabs.filter((t) => t.groupId === undefined || t.groupId === NO_GROUP || ours.has(t.groupId));
  const tabById = new Map(tabs.map((t) => [t.id, t]));

  const plan = planGroups(tabs, settings);
  const windowGroups = managed[windowId] || {};
  const nextGroups = {};

  for (const g of plan.groups) {
    // Pinned tabs are never grouped, even ones pinned after the tab list above was read.
    const pinnedNow = await pinnedTabIds(windowId);
    const tabIds = g.tabIds.filter((id) => !pinnedNow.has(id));
    if (!tabIds.length) continue;

    let groupId = windowGroups[g.key];
    if (groupId !== undefined && !(await groupExists(groupId))) groupId = undefined;

    const toMove = tabIds.filter((id) => tabById.get(id).groupId !== groupId);
    if (groupId === undefined) {
      groupId = await browser.tabs.group({ tabIds, createProperties: { windowId } });
    } else if (toMove.length) {
      for (const id of toMove) placedBy.set(id, groupId);
      await browser.tabs.group({ tabIds: toMove, groupId });
    }
    for (const id of tabIds) placedBy.set(id, groupId);

    const info = await browser.tabGroups.get(groupId);
    if (info.title !== g.title || info.color !== g.color) {
      await browser.tabGroups.update(groupId, { title: g.title, color: g.color });
    }
    nextGroups[g.key] = groupId;
  }

  const toUngroup = plan.ungrouped.filter((id) => ours.has(tabById.get(id).groupId));
  for (const id of toUngroup) placedBy.set(id, NO_GROUP);
  if (toUngroup.length) await browser.tabs.ungroup(toUngroup);

  managed[windowId] = nextGroups;
  await saveManaged();
}

// When the user drags a tab into one of our category groups, remember the tab's site
// so it goes to that category from now on. Saved as a custom rule, editable in Options.
async function learnFromMove(tab) {
  await ready;
  if (!settings.enabled || tab.pinned || placedBy.get(tab.id) === tab.groupId) return;
  const groups = managed[tab.windowId] || {};
  const key = Object.keys(groups).find((k) => groups[k] === tab.groupId);
  // Brand-new groups aren't recorded until the regroup finishes, so our own moves into them
  // are skipped here too. Site groups are skipped: a site rule can't send another site there.
  if (!key || !key.startsWith("cat:")) return;
  const site = siteOf(tab.url);
  if (!site || isExempt(tab.url, settings)) return;

  placedBy.set(tab.id, tab.groupId);
  const category = key.slice("cat:".length);
  const rules = settings.customRules || [];
  const sameSite = (r) => normalizeSitePattern(r.site) === site;
  if (rules.some((r) => sameSite(r) && r.category === category)) return;
  // Replaces any older rule for this site. Saving triggers storage.onChanged, which
  // regroups every window with the new rule.
  settings = { ...settings, customRules: [...rules.filter((r) => !sameSite(r)), { site, category }] };
  await browser.storage.sync.set({ settings });
}

// "Shorten tab titles": Firefox has no API to rename a tab, so a small script changes each
// page's title. It only runs while the option is on and the user has granted site access.
const TITLE_ORIGINS = ["http://*/*", "https://*/*"];
const TITLE_SCRIPT = {
  id: "shorten-titles",
  js: ["compat.js", "title-content.js"],
  matches: TITLE_ORIGINS,
  runAt: "document_idle",
  persistAcrossSessions: false,
};

// Titles are picked here rather than in each page, so that different pages on the same
// site (in any window) don't end up with the same title.
// tabId -> { title, url }: each page's own full title, as the page reported it.
// Kept in session storage, since Firefox may unload this script when it's idle.
let pageTitles = new Map();
// tabId -> { title, url } last sent to that tab, to skip resending the same thing.
const sentTitles = new Map();

function savePageTitles() {
  return browser.storage.session.set({ pageTitles: Object.fromEntries(pageTitles) });
}

// Work out titles for every tab on `host` and send any that changed, except to `skipTabId`
// (that tab gets its title as the reply to its own message).
function retitleSite(host, skipTabId) {
  if (!host) return new Map();
  const pages = [...pageTitles]
    .filter(([, p]) => siteOf(p.url) === host)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => a.id - b.id);
  const titles = titlesForSite(pages, host);
  for (const [id, title] of titles) {
    if (id === skipTabId) continue;
    const { url } = pageTitles.get(id);
    const last = sentTitles.get(id);
    if (last && last.title === title && last.url === url) continue;
    sentTitles.set(id, { title, url });
    browser.tabs.sendMessage(id, { type: "set-title", title, url }).catch(() => {});
  }
  return titles;
}

// A page reported its own title. Returns the title it should show.
async function onPageTitle(tabId, title, url) {
  await ready;
  if (!settings.shortenTitles) return title;
  const old = pageTitles.get(tabId);
  pageTitles.set(tabId, { title, url });
  savePageTitles();
  if (old && siteOf(old.url) !== siteOf(url)) retitleSite(siteOf(old.url));
  const mine = retitleSite(siteOf(url), tabId).get(tabId) ?? title;
  sentTitles.set(tabId, { title: mine, url });
  return mine;
}

// The tab closed or left the page we know about. Other tabs on its site may now be able
// to drop their hints.
function forgetPage(tabId) {
  const old = pageTitles.get(tabId);
  sentTitles.delete(tabId);
  if (!old) return;
  pageTitles.delete(tabId);
  savePageTitles();
  retitleSite(siteOf(old.url));
}

// The tab's address changed. If its page is still running our script (a single-page app),
// ask it to report again; otherwise the old page is gone and a new one will report itself.
async function onTabAddressChange(tabId) {
  await ready;
  if (!pageTitles.has(tabId)) return;
  const alive = await browser.tabs.sendMessage(tabId, { type: "report-title" }).catch(() => false);
  if (alive !== true) forgetPage(tabId);
}

async function syncTitleScript() {
  const want = settings.shortenTitles && (await browser.permissions.contains({ origins: TITLE_ORIGINS }));
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: [TITLE_SCRIPT.id] });
  if (want && !registered.length) {
    await browser.scripting.registerContentScripts([TITLE_SCRIPT]);
    // Pages opened before the option was turned on don't get the script, so add it now.
    const tabs = await browser.tabs.query({ url: TITLE_ORIGINS });
    await Promise.all(
      tabs.map((t) => browser.scripting.executeScript({ target: { tabId: t.id }, files: TITLE_SCRIPT.js }).catch(() => {})),
    );
  } else if (!want && registered.length) {
    // Pages already running the script restore their titles when the setting changes.
    await browser.scripting.unregisterContentScripts({ ids: [TITLE_SCRIPT.id] });
  }
  if (!want && pageTitles.size) {
    pageTitles.clear();
    sentTitles.clear();
    await savePageTitles();
  }
}

// One sync at a time, so quick toggles can't register the script twice.
let titleSync = Promise.resolve();
function syncTitles() {
  titleSync = titleSync
    .then(syncTitleScript)
    .catch((err) => console.error("Smart Group: title shortening failed", err));
  return titleSync;
}

// If site access is taken away (in about:addons), turn the option off so pages restore their titles.
browser.permissions.onRemoved.addListener(async () => {
  if (!settings.shortenTitles || (await browser.permissions.contains({ origins: TITLE_ORIGINS }))) return;
  settings = { ...settings, shortenTitles: false };
  await browser.storage.sync.set({ settings });
});
browser.permissions.onAdded.addListener(syncTitles);

// Run at most one regroup per window at a time, and batch bursts of tab events.
const timers = new Map();
const running = new Set();
const rerun = new Set();

function schedule(windowId, delay = 400) {
  if (windowId === undefined || windowId === browser.windows.WINDOW_ID_NONE) return;
  clearTimeout(timers.get(windowId));
  timers.set(windowId, setTimeout(() => run(windowId), delay));
}

async function run(windowId) {
  timers.delete(windowId);
  if (running.has(windowId)) {
    rerun.add(windowId);
    return;
  }
  running.add(windowId);
  try {
    await ready;
    await regroupWindow(windowId);
  } catch (err) {
    console.error("Smart Group: regroup failed", err);
  } finally {
    running.delete(windowId);
    if (rerun.delete(windowId)) schedule(windowId, 0);
  }
}

async function scheduleAll() {
  const wins = await browser.windows.getAll({ windowTypes: ["normal"] });
  for (const w of wins) schedule(w.id, 0);
}

browser.tabs.onCreated.addListener((tab) => schedule(tab.windowId));
browser.tabs.onRemoved.addListener((id, info) => {
  placedBy.delete(id);
  ready.then(() => forgetPage(id));
  if (!info.isWindowClosing) schedule(info.windowId);
});
addUpdatedListener(["url"], (id) =>
  onTabAddressChange(id).catch((err) => console.error("Smart Group: title update failed", err)),
);
addUpdatedListener(["url", "pinned", "status"], (_id, _change, tab) => schedule(tab.windowId));
addUpdatedListener(["groupId"], (_id, _change, tab) =>
  learnFromMove(tab).catch((err) => console.error("Smart Group: learning failed", err)),
);
browser.tabs.onAttached.addListener((_id, info) => schedule(info.newWindowId));
browser.tabs.onDetached.addListener((_id, info) => schedule(info.oldWindowId));
browser.windows.onRemoved.addListener((windowId) => {
  delete managed[windowId];
  saveManaged();
});

browser.storage.onChanged.addListener(async (changes, area) => {
  if (area === "sync" && changes.settings) {
    settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue || {}) };
    syncTitles();
    await scheduleAll();
  }
});

addMessageListener((msg, sender) => {
  if (msg && msg.type === "regroup-now") return scheduleAll();
  if (msg && msg.type === "page-title" && sender && sender.tab) {
    return onPageTitle(sender.tab.id, String(msg.title || ""), String(msg.url || ""));
  }
  return undefined;
});

const ready = loadState();
ready.then(() => {
  syncTitles();
  return scheduleAll();
});
