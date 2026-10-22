// Runs inside web pages (injected by background.js only after the user turns on
// "Shorten tab titles" and grants site access). Tells the background script the page's own
// title and shows the title it sends back. The background decides, because it can see every
// tab and keep different pages on one site from looking the same. Puts the full title back
// when the option is turned off.

(() => {
  if (window.__smartGroupTitles) return; // already running in this page
  window.__smartGroupTitles = true;

  let active = false;
  let original = null; // the page's own title
  let applied = null; // the title we set
  let titleObserver = null;
  let headObserver = null;

  function setTitle(title) {
    if (!active || typeof title !== "string" || !title) return;
    applied = title;
    if (document.title !== title) document.title = title;
  }

  function report() {
    const url = location.href;
    browser.runtime
      .sendMessage({ type: "page-title", title: original, url })
      .then((title) => {
        if (location.href === url) setTitle(title);
      })
      .catch(() => {});
  }

  function onTitleChange() {
    const current = document.title;
    if (current === applied) return; // our own change
    original = current;
    applied = null;
    report();
  }

  // Watch the <title> element. Pages may replace it, so re-attach when <head> changes.
  function watchTitle() {
    titleObserver.disconnect();
    const el = document.querySelector("head > title") || document.querySelector("title");
    if (el) titleObserver.observe(el, { childList: true, characterData: true, subtree: true });
    onTitleChange();
  }

  function start() {
    if (active) return;
    active = true;
    titleObserver = new MutationObserver(onTitleChange);
    headObserver = new MutationObserver(watchTitle);
    if (document.head) headObserver.observe(document.head, { childList: true });
    watchTitle();
  }

  function stop() {
    if (!active) return;
    active = false;
    titleObserver.disconnect();
    headObserver.disconnect();
    if (applied !== null && document.title === applied) document.title = original;
    applied = null;
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (!active || !msg) return undefined;
    // Another tab on this site changed, so this one's title may need to change too.
    if (msg.type === "set-title") {
      if (msg.url === location.href) setTitle(msg.title);
      return Promise.resolve(true);
    }
    // The address changed without a page load (single-page apps): report again.
    if (msg.type === "report-title") {
      report();
      return Promise.resolve(true);
    }
    return undefined;
  });

  const update = (settings) => ((settings || {}).shortenTitles ? start() : stop());
  browser.storage.sync.get("settings").then((s) => update(s.settings));
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.settings) update(changes.settings.newValue);
  });
})();
