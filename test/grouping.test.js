const test = require("node:test");
const assert = require("node:assert");
const g = require("../src/grouping.js");

let nextId = 1;
const tab = (url, extra = {}) => ({ id: nextId++, url, pinned: false, ...extra });
const titles = (plan) => plan.groups.map((x) => x.title).sort();

test("3+ tabs on one site make a site group", () => {
  const tabs = [tab("https://github.com/a"), tab("https://github.com/b"), tab("https://www.github.com/c"), tab("https://example.org")];
  const plan = g.planGroups(tabs, {});
  assert.deepStrictEqual(titles(plan), ["Github", "Miscellaneous"]);
  assert.strictEqual(plan.groups[0].tabIds.length, 3);
});

test("mixed sites are grouped by category", () => {
  const tabs = [tab("https://www.amazon.com/x"), tab("https://etsy.com/y"), tab("https://reddit.com"), tab("https://x.com/home")];
  assert.deepStrictEqual(titles(g.planGroups(tabs, {})), ["Shopping", "Social"]);
});

test("a site group takes priority over its category", () => {
  const tabs = [tab("https://amazon.com/1"), tab("https://amazon.com/2"), tab("https://amazon.com/3"), tab("https://ebay.com"), tab("https://etsy.com")];
  assert.deepStrictEqual(titles(g.planGroups(tabs, {})), ["Amazon", "Shopping"]);
});

test("pinned tabs, exempt sites, and non-web pages are never grouped", () => {
  const tabs = [
    tab("https://reddit.com", { pinned: true }), tab("https://x.com"), tab("https://facebook.com"),
    tab("https://instagram.com"), tab("about:preferences"),
  ];
  const plan = g.planGroups(tabs, { exemptSites: ["www.instagram.com"] });
  assert.deepStrictEqual(titles(plan), ["Social"]);
  assert.strictEqual(plan.groups[0].tabIds.length, 2);
  assert.strictEqual(plan.ungrouped.length, 3, "pinned, exempt, and about: tabs stay out");
});

test("every web tab gets a group, even a single one, and unknown sites go to Miscellaneous", () => {
  const tabs = [tab("https://amazon.com"), tab("https://unknown-site.dev"), tab("https://another.example")];
  const plan = g.planGroups(tabs, {});
  assert.deepStrictEqual(titles(plan), ["Miscellaneous", "Shopping"]);
  assert.deepStrictEqual(plan.ungrouped, []);
  assert.strictEqual(plan.groups.find((x) => x.title === "Miscellaneous").tabIds.length, 2);
});

test("unknown sites are categorized from their address or page title", () => {
  const cat = (url, title) => g.planGroups([tab(url, { title })], {}).groups[0].title;
  assert.strictEqual(cat("https://bobs-bike-shop.example"), "Shopping");
  assert.strictEqual(cat("https://example.com/p/1", "Cheap Flights to Paris | Example"), "Travel");
  assert.strictEqual(cat("https://localpaper.example", "Breaking News and Headlines"), "News");
  assert.strictEqual(cat("https://cs.stanford.edu"), "Reference");
  assert.strictEqual(cat("https://irs.gov"), "Reference");
  assert.strictEqual(cat("https://example.com", "Welcome"), "Miscellaneous");
});

test("turning off a category sends its tabs to Miscellaneous", () => {
  const tabs = [tab("https://reddit.com"), tab("https://x.com")];
  assert.deepStrictEqual(titles(g.planGroups(tabs, { disabledCategories: ["Social"] })), ["Miscellaneous"]);
});

test("custom rules beat built-in categories and support new categories", () => {
  const tabs = [tab("https://github.com"), tab("https://intranet.acme.com"), tab("https://acme.com")];
  const plan = g.planGroups(tabs, { customRules: [{ site: "github.com", category: "Acme" }, { site: "https://acme.com/", category: "Acme" }] });
  assert.deepStrictEqual(titles(plan), ["Acme"]);
  assert.strictEqual(plan.groups[0].tabIds.length, 3);
});

test("the site threshold setting is respected", () => {
  const tabs = [tab("https://foo.dev/1"), tab("https://foo.dev/2"), tab("https://bar.dev")];
  assert.deepStrictEqual(titles(g.planGroups(tabs, { siteThreshold: 2 })), ["Foo", "Miscellaneous"]);
  assert.deepStrictEqual(titles(g.planGroups(tabs, { siteThreshold: 5 })), ["Miscellaneous"]);
});

test("path patterns and subdomains match", () => {
  assert.ok(g.matchesPattern("https://www.google.com/travel/flights", "google.com/travel"));
  assert.ok(!g.matchesPattern("https://google.com/search", "google.com/travel"));
  assert.ok(g.matchesPattern("https://en.wikipedia.org/wiki/X", "wikipedia.org"));
  assert.ok(!g.matchesPattern("https://notwikipedia.org", "wikipedia.org"));
  assert.strictEqual(g.categoryOf("https://music.youtube.com", {}), "Music");
  assert.strictEqual(g.categoryOf("https://bestshop.example", {}), null, "keywords match whole words only");
  assert.strictEqual(g.categoryOf("https://my-shop.example", {}), "Shopping");
});

test("site labels are readable", () => {
  assert.strictEqual(g.siteLabel("bbc.co.uk"), "Bbc");
  assert.strictEqual(g.siteLabel("docs.google.com"), "Docs.google");
  assert.strictEqual(g.siteLabel("localhost"), "Localhost");
});
