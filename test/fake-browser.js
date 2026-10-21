// A small in-memory stand-in for Firefox's tabs/tabGroups APIs, enough to run background.js.
function createFakeBrowser() {
  const listeners = {};
  const on = (name) => ({ addListener: (fn, filter) => (listeners[name] = listeners[name] || []).push({ fn, filter }) });
  const fire = (name, ...args) => (listeners[name] || []).forEach(({ fn }) => fn(...args));
  // tabs.onUpdated honors the `properties` filter, like Firefox.
  const fireUpdated = (id, change) => {
    const tab = { ...tabs.find((t) => t.id === id) };
    for (const { fn, filter } of listeners["tabs.onUpdated"] || []) {
      if (!filter || !filter.properties || filter.properties.some((p) => p in change)) fn(id, change, tab);
    }
  };
  const setGroup = (t, groupId) => {
    if (t.groupId === groupId) return;
    t.groupId = groupId;
    fireUpdated(t.id, { groupId });
  };
  const tabs = []; // ordered list
  const groups = new Map();
  let nextTab = 1, nextGroup = 100;
  const store = { sync: {}, session: {} };

  const cleanupGroups = () => {
    for (const id of groups.keys()) if (!tabs.some((t) => t.groupId === id)) groups.delete(id);
  };
  const area = (name) => ({
    get: async (key) => (key in store[name] ? { [key]: structuredClone(store[name][key]) } : {}),
    set: async (obj) => {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: store[name][k], newValue: structuredClone(v) };
        store[name][k] = structuredClone(v);
      }
      fire("storage.onChanged", changes, name);
    },
  });

  const browser = {
    windows: {
      WINDOW_ID_NONE: -1,
      get: async (id) => ({ id, type: "normal" }),
      getAll: async () => [{ id: 1, type: "normal" }],
      onRemoved: on("windows.onRemoved"),
    },
    storage: { sync: area("sync"), session: area("session"), onChanged: on("storage.onChanged") },
    runtime: { onMessage: on("runtime.onMessage") },
    tabs: {
      query: async ({ windowId, pinned }) =>
        tabs
          .map((t, index) => ({ ...t, index }))
          .filter((t) => t.windowId === windowId && (pinned === undefined || t.pinned === pinned)),
      group: async ({ tabIds, groupId, createProperties }) => {
        if (groupId === undefined) {
          groupId = nextGroup++;
          groups.set(groupId, { id: groupId, title: "", color: "grey", windowId: createProperties.windowId });
        } else if (!groups.has(groupId)) throw new Error("no group");
        // Move grouped tabs next to each other, after the group's first tab.
        const moving = tabs.filter((t) => tabIds.includes(t.id));
        moving.forEach((t) => setGroup(t, groupId));
        const rest = tabs.filter((t) => !tabIds.includes(t.id));
        let at = rest.findIndex((t) => t.groupId === groupId);
        if (at === -1) at = Math.min(...moving.map((t) => tabs.indexOf(t)));
        else while (at < rest.length && rest[at].groupId === groupId) at++;
        at = Math.min(at, rest.length);
        tabs.splice(0, tabs.length, ...rest.slice(0, at), ...moving, ...rest.slice(at));
        cleanupGroups();
        return groupId;
      },
      ungroup: async (ids) => {
        tabs.forEach((t) => ids.includes(t.id) && setGroup(t, -1));
        cleanupGroups();
      },
      onCreated: on("tabs.onCreated"), onRemoved: on("tabs.onRemoved"), onUpdated: on("tabs.onUpdated"),
      onAttached: on("tabs.onAttached"), onDetached: on("tabs.onDetached"),
    },
    tabGroups: {
      get: async (id) => {
        if (!groups.has(id)) throw new Error("no group " + id);
        return { ...groups.get(id) };
      },
      update: async (id, props) => Object.assign(groups.get(id), props),
    },
  };

  const api = {
    browser, tabs, groups, store,
    open(url, extra = {}) {
      const t = { id: nextTab++, windowId: 1, url, pinned: false, groupId: -1, ...extra };
      tabs.push(t);
      fire("tabs.onCreated", { ...t });
      return t;
    },
    close(id) {
      tabs.splice(tabs.findIndex((t) => t.id === id), 1);
      cleanupGroups();
      fire("tabs.onRemoved", id, { windowId: 1, isWindowClosing: false });
    },
    navigate(id, url) {
      const t = tabs.find((x) => x.id === id);
      t.url = url;
      fireUpdated(id, { url });
    },
    pin(id) {
      const t = tabs.find((x) => x.id === id);
      t.pinned = true;
      fireUpdated(id, { pinned: true });
    },
    // The user drags a tab into an existing group.
    moveToGroup(id, groupId) {
      const t = tabs.find((x) => x.id === id);
      const rest = tabs.filter((x) => x !== t);
      let at = rest.findLastIndex((x) => x.groupId === groupId) + 1;
      tabs.splice(0, tabs.length, ...rest.slice(0, at), t, ...rest.slice(at));
      setGroup(t, groupId);
      cleanupGroups();
    },
    groupByTitle: (title) => [...groups.values()].find((g) => g.title === title),
    // Snapshot: { "Title": [urls...] , "(none)": [...] }
    layout() {
      const out = {};
      for (const t of tabs) {
        const name = t.groupId === -1 ? "(none)" : groups.get(t.groupId).title || "(untitled)";
        (out[name] = out[name] || []).push(new URL(t.url).hostname.replace(/^www\./, ""));
      }
      return out;
    },
  };
  return api;
}
module.exports = { createFakeBrowser };
