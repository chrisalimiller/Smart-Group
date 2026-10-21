// Smart Group background script: watches tabs and keeps Firefox tab groups in sync
// with the plan from grouping.js. Only touches groups it created itself, so groups
// the user makes by hand are left alone.

/* global planGroups, DEFAULT_SETTINGS */

const NO_GROUP = -1;
let settings = { ...DEFAULT_SETTINGS };

// windowId -> { [groupKey]: groupId } for groups this extension created.
let managed = {};

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
  const tabs = allTabs.filter((t) => t.groupId === undefined || t.groupId === NO_GROUP || ours.has(t.groupId));
  const tabById = new Map(tabs.map((t) => [t.id, t]));

  const plan = planGroups(tabs, settings);
  const windowGroups = managed[windowId] || {};
  const nextGroups = {};

  for (const g of plan.groups) {
    let groupId = windowGroups[g.key];
    if (groupId !== undefined && !(await groupExists(groupId))) groupId = undefined;

    const toMove = g.tabIds.filter((id) => tabById.get(id).groupId !== groupId);
    if (groupId === undefined) {
      groupId = await browser.tabs.group({ tabIds: g.tabIds, createProperties: { windowId } });
    } else if (toMove.length) {
      await browser.tabs.group({ tabIds: toMove, groupId });
    }

    const info = await browser.tabGroups.get(groupId);
    if (info.title !== g.title || info.color !== g.color) {
      await browser.tabGroups.update(groupId, { title: g.title, color: g.color });
    }
    nextGroups[g.key] = groupId;
  }

  const toUngroup = plan.ungrouped.filter((id) => ours.has(tabById.get(id).groupId));
  if (toUngroup.length) await browser.tabs.ungroup(toUngroup);

  managed[windowId] = nextGroups;
  await saveManaged();
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
browser.tabs.onRemoved.addListener((_id, info) => {
  if (!info.isWindowClosing) schedule(info.windowId);
});
browser.tabs.onUpdated.addListener((_id, _change, tab) => schedule(tab.windowId), { properties: ["url", "pinned"] });
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
