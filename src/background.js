// Smart Group background script: watches tabs and keeps Firefox tab groups in sync
// with the plan from grouping.js. Only touches groups it created itself, so groups
// the user makes by hand are left alone.

/* global planGroups, DEFAULT_SETTINGS, siteOf, isExempt, normalizeSitePattern */

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
  const session = await browser.storage.session.get("managed");
  managed = session.managed || {};
}

function saveManaged() {
  return browser.storage.session.set({ managed });
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
  if (!info.isWindowClosing) schedule(info.windowId);
});
browser.tabs.onUpdated.addListener((_id, _change, tab) => schedule(tab.windowId), { properties: ["url", "pinned", "status"] });
browser.tabs.onUpdated.addListener(
  (_id, change, tab) => {
    if ("groupId" in change) learnFromMove(tab).catch((err) => console.error("Smart Group: learning failed", err));
  },
  { properties: ["groupId"] },
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
    await scheduleAll();
  }
});

browser.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "regroup-now") return scheduleAll();
  return undefined;
});

loadState().then(scheduleAll);
