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
  const granted = new Set(); // host permissions the user has granted
  const scripts = new Map(); // registered content scripts, by id
  const injected = []; // tabIds that got executeScript
  const sent = []; // [tabId, message] sent with tabs.sendMessage
  const pages = new Map(); // tabId -> fake page script: (message) => response

  const cleanupGroups = () => {
    for (const id of groups.keys()) if (!tabs.some((t) => t.groupId === id)) groups.delete(id);
  };
  const area = (name) => ({
    // Like the real API, takes one key or a list of keys.
    get: async (keys) =>
      Object.fromEntries([].concat(keys).filter((k) => k in store[name]).map((k) => [k, structuredClone(store[name][k])])),
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
      query: async ({ windowId, pinned, url }) =>
        tabs
          .map((t, index) => ({ ...t, index }))
          .filter((t) => windowId === undefined || t.windowId === windowId)
          .filter((t) => pinned === undefined || t.pinned === pinned)
          .filter((t) => url === undefined || /^https?:/.test(t.url)),
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
      sendMessage: async (tabId, msg) => {
        sent.push([tabId, structuredClone(msg)]);
        if (!pages.has(tabId)) throw new Error("Could not establish connection. Receiving end does not exist.");
        return pages.get(tabId)(msg);
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
    permissions: {
      contains: async ({ origins }) => origins.every((o) => granted.has(o)),
      onAdded: on("permissions.onAdded"),
      onRemoved: on("permissions.onRemoved"),
    },
    scripting: {
      getRegisteredContentScripts: async ({ ids }) => ids.filter((id) => scripts.has(id)).map((id) => scripts.get(id)),
      registerContentScripts: async (list) => {
        for (const s of list) {
          if (scripts.has(s.id)) throw new Error("duplicate script id " + s.id);
          scripts.set(s.id, s);
        }
      },
      unregisterContentScripts: async ({ ids }) => ids.forEach((id) => scripts.delete(id)),
      executeScript: async ({ target }) => void injected.push(target.tabId),
    },
  };

  const api = {
    browser, tabs, groups, store, scripts, injected, sent, pages,
    // A content script sends a message; returns the background's reply.
    async message(msg, sender) {
      // Like Chrome: a listener replies through sendResponse and returns true.
      for (const { fn } of listeners["runtime.onMessage"] || []) {
        let respond;
        const response = new Promise((resolve) => (respond = resolve));
        if (fn(structuredClone(msg), sender, respond) === true) return response;
      }
      return undefined;
    },
    // Chrome stops an idle service worker: its listeners and variables are gone, but tabs,
    // groups and storage stay. Call this, then load the scripts again.
    dropListeners() {
      for (const k of Object.keys(listeners)) delete listeners[k];
    },
    grant(origins) {
      origins.forEach((o) => granted.add(o));
      fire("permissions.onAdded", { origins });
    },
    revoke(origins) {
      origins.forEach((o) => granted.delete(o));
      fire("permissions.onRemoved", { origins });
    },
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
    // Delivers a tabs.onUpdated event without changing anything (e.g. one that arrives late).
    update(id, change) {
      fireUpdated(id, change);
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
