// Lets the same code run in Firefox (browser.*) and Chrome (chrome.*). Loaded first
// everywhere the extension runs code: background, options page and the title script.

/* exported addMessageListener, addUpdatedListener */
var browser = globalThis.browser ?? globalThis.chrome;

// Chrome ignores a promise returned from onMessage; it needs sendResponse and `return true`.
// `handler` may return a promise (or a plain value) to reply, or undefined to not reply.
function addMessageListener(handler) {
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const reply = handler(msg, sender);
    if (reply === undefined) return undefined;
    Promise.resolve(reply).then(sendResponse, () => sendResponse(undefined));
    return true;
  });
}

// tabs.onUpdated only accepts a `properties` filter in Firefox, so filter by hand.
function addUpdatedListener(properties, fn) {
  browser.tabs.onUpdated.addListener((id, change, tab) => {
    if (properties.some((p) => p in change)) fn(id, change, tab);
  });
}
