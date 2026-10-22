const test = require("node:test");
const assert = require("node:assert");
const { shortenTitle, titlesForSite, pageKey } = require("../src/titles.js");

// Run titlesForSite on [url, title] pairs and return the titles in the same order.
function titles(host, ...pages) {
  const out = titlesForSite(pages.map(([url, title], i) => ({ id: i + 1, url, title })), host);
  return pages.map((_, i) => out.get(i + 1));
}

test("removes the site name from the end of a title", () => {
  assert.strictEqual(shortenTitle("Lo-fi beats to study to - YouTube", "www.youtube.com"), "Lo-fi beats to study to");
  assert.strictEqual(shortenTitle("Pull requests · mozilla/gecko-dev · GitHub", "github.com"), "Pull requests · mozilla/gecko-dev");
  assert.strictEqual(shortenTitle("How do I exit Vim? - Stack Overflow", "stackoverflow.com"), "How do I exit Vim?");
  assert.strictEqual(shortenTitle("Firefox - Wikipedia", "en.wikipedia.org"), "Firefox");
  assert.strictEqual(shortenTitle("Inbox - Outlook", "outlook.live.com"), "Inbox");
  assert.strictEqual(shortenTitle("Budget 2027 - Google Sheets", "docs.google.com"), "Budget 2027");
  assert.strictEqual(shortenTitle("Amazon.com : USB-C cable", "amazon.com"), "USB-C cable");
});

test("removes the site name from the start of a title", () => {
  assert.strictEqual(shortenTitle("Reddit - Dive into anything", "www.reddit.com"), "Dive into anything");
  assert.strictEqual(shortenTitle("GitHub | Settings | Notifications", "github.com"), "Settings | Notifications");
  // A product name at the start is the page's subject, so it stays.
  assert.strictEqual(shortenTitle("GitHub Copilot - Your AI pair programmer", "github.com"), "GitHub Copilot - Your AI pair programmer");
});

test("keeps an unread count in front", () => {
  assert.strictEqual(shortenTitle("(3) Lo-fi beats - YouTube", "youtube.com"), "(3) Lo-fi beats");
  assert.strictEqual(shortenTitle("(99+) Home / X", "x.com"), "(99+) Home");
});

test("leaves titles alone when there's nothing to remove", () => {
  assert.strictEqual(shortenTitle("The New York Times - Breaking News", "nytimes.com"), "The New York Times - Breaking News");
  assert.strictEqual(shortenTitle("An e-mail about re-use", "example.com"), "An e-mail about re-use");
  assert.strictEqual(shortenTitle("A guide to GitHub Actions", "github.com"), "A guide to GitHub Actions");
});

test("never shortens a title to nothing", () => {
  assert.strictEqual(shortenTitle("YouTube", "youtube.com"), "YouTube");
  assert.strictEqual(shortenTitle("GitHub - GitHub", "github.com"), "GitHub");
  assert.strictEqual(shortenTitle("", "github.com"), "");
  assert.strictEqual(shortenTitle("Hello - World", ""), "Hello - World");
});

test("pages with different titles just get their short titles", () => {
  assert.deepStrictEqual(
    titles("youtube.com", ["https://youtube.com/watch?v=1", "Cats - YouTube"], ["https://youtube.com/watch?v=2", "Dogs - YouTube"]),
    ["Cats", "Dogs"],
  );
});

test("the same page open twice shares its short title", () => {
  assert.deepStrictEqual(
    titles("github.com",
      ["https://github.com/o/r#readme", "o/r - GitHub"],
      ["https://github.com/o/r?utm_source=x", "o/r - GitHub"]),
    ["o/r", "o/r"],
  );
});

test("when shortening would hide the difference, the full titles stay", () => {
  assert.deepStrictEqual(
    titles("docs.google.com",
      ["https://docs.google.com/document/d/abc/edit", "Plan - Google Docs"],
      ["https://docs.google.com/spreadsheets/d/xyz/edit", "Plan - Google Sheets"],
      ["https://docs.google.com/document/d/other/edit", "Notes - Google Docs"]),
    ["Plan - Google Docs", "Plan - Google Sheets", "Notes"],
  );
});

test("identical titles on different pages get a hint from the address", () => {
  // Issue numbers.
  assert.deepStrictEqual(
    titles("github.com",
      ["https://github.com/o/r/issues/12", "Crash on start · Issue · o/r · GitHub"],
      ["https://github.com/o/r/issues/15", "Crash on start · Issue · o/r · GitHub"]),
    ["12 · Crash on start · Issue · o/r", "15 · Crash on start · Issue · o/r"],
  );
  // Search terms, readable path words, and long IDs cut short.
  assert.deepStrictEqual(
    titles("example.com", ["https://example.com/find?q=red+shoes", "Search"], ["https://example.com/find?q=boots", "Search"]),
    ["red shoes · Search", "boots · Search"],
  );
  assert.deepStrictEqual(
    titles("example.com", ["https://example.com/blog/my-first_post.html", "Blog"], ["https://example.com/blog/another-one", "Blog"]),
    ["my first post · Blog", "another one · Blog"],
  );
  assert.deepStrictEqual(
    titles("docs.google.com",
      ["https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit", "Untitled document - Google Docs"],
      ["https://docs.google.com/document/d/9ZzzzVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit", "Untitled document - Google Docs"]),
    ["1BxiMV… · Untitled document", "9ZzzzV… · Untitled document"],
  );
  // The home page next to a deeper page.
  assert.deepStrictEqual(
    titles("example.com", ["https://example.com/", "Example"], ["https://example.com/about", "Example"]),
    ["home · Example", "about · Example"],
  );
});

test("hints keep an unread count in front, and ties get numbers", () => {
  assert.deepStrictEqual(
    titles("mail.example.com", ["https://mail.example.com/u/0/", "(2) Inbox"], ["https://mail.example.com/u/1/", "(5) Inbox"]),
    ["(2) Inbox", "(5) Inbox"],
    "different counts already tell them apart",
  );
  assert.deepStrictEqual(
    titles("mail.example.com", ["https://mail.example.com/u/0/", "(2) Inbox"], ["https://mail.example.com/u/1/", "(2) Inbox"]),
    ["(2) 0 · Inbox", "(2) 1 · Inbox"],
  );
  // Long IDs that start the same can't be told apart by their first letters, so they're numbered.
  assert.deepStrictEqual(
    titles("example.com",
      ["https://example.com/d/abcdef123456789xyz", "Doc"],
      ["https://example.com/d/abcdef123456789qrs", "Doc"]),
    ["abcdef… · Doc", "abcdef… (2) · Doc"],
  );
});

test("page identity ignores #sections and tracking tags", () => {
  assert.strictEqual(pageKey("https://a.com/x?id=1&utm_source=z#top"), pageKey("https://a.com/x?id=1"));
  assert.notStrictEqual(pageKey("https://a.com/x?id=1"), pageKey("https://a.com/x?id=2"));
});
