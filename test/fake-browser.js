// A small in-memory stand-in for Firefox's tabs/tabGroups APIs, enough to run background.js.
function createFakeBrowser() {
  const listeners = {};
  const on = (name) => ({ addListener: (fn) => (listeners[name] = listeners[name] || []).push(fn) });
  const fire = (name, ...args) => (listeners[name] || []).forEach((fn) => fn(...args));
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
      query: async ({ windowId }) => tabs.filter((t) => t.windowId === windowId).map((t, index) => ({ ...t, index })),
      group: async ({ tabIds, groupId, createProperties }) => {
        if (groupId === undefined) {
          groupId = nextGroup++;
          groups.set(groupId, { id: groupId, title: "", color: "grey", windowId: createProperties.windowId });
        } else if (!groups.has(groupId)) throw new Error("no group");
        // Move grouped tabs next to each other, after the group's first tab.
        const moving = tabs.filter((t) => tabIds.includes(t.id));
        moving.forEach((t) => (t.groupId = groupId));
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
        tabs.forEach((t) => ids.includes(t.id) && (t.groupId = -1));
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
      fire("tabs.onUpdated", id, { url }, { ...t });
    },
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
