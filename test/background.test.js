const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createFakeBrowser } = require("./fake-browser.js");

const SRC = path.join(__dirname, "..", "src");
const wait = (ms = 600) => new Promise((r) => setTimeout(r, ms));

async function boot(setup) {
  const fake = createFakeBrowser();
  if (setup) await setup(fake);
  const ctx = vm.createContext({ browser: fake.browser, console, setTimeout, clearTimeout, URL, structuredClone });
  for (const f of ["categories.js", "grouping.js", "background.js"]) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), "utf8"), ctx, { filename: f });
  }
  await wait(50);
  return fake;
}

test("groups tabs as they open, and regroups when one closes", async () => {
  const fake = await boot();
  const gh = [fake.open("https://github.com/a"), fake.open("https://github.com/b")];
  fake.open("https://amazon.com"); fake.open("https://ebay.com"); fake.open("https://reddit.com");
  await wait();
  // Two GitHub tabs are below the site threshold, so they land in the Dev category.
  assert.deepStrictEqual(fake.layout(), { Dev: ["github.com", "github.com"], Shopping: ["amazon.com", "ebay.com"], Social: ["reddit.com"] });

  gh.push(fake.open("https://github.com/c"));
  await wait();
  assert.deepStrictEqual(fake.layout()["Github"], ["github.com", "github.com", "github.com"]);
  const ghGroup = [...fake.groups.values()].find((g) => g.title === "Github");
  assert.ok(ghGroup.color);

  fake.close(gh[2].id);
  await wait();
  assert.strictEqual(fake.layout()["Github"], undefined, "site group dissolves below threshold");
  assert.deepStrictEqual(fake.layout()["Dev"], ["github.com", "github.com"]);
});

test("pinned tabs and user-made groups are left alone", async () => {
  const fake = await boot();
  fake.open("https://facebook.com", { pinned: true });
  const mine = fake.open("https://x.com");
  fake.groups.set(999, { id: 999, title: "Mine", color: "red", windowId: 1 });
  mine.groupId = 999;
  fake.open("https://instagram.com");
  fake.open("https://reddit.com");
  await wait();
  const l = fake.layout();
  assert.deepStrictEqual(l["Mine"], ["x.com"]);
  assert.deepStrictEqual(l["Social"], ["instagram.com", "reddit.com"]);
  assert.ok(fake.tabs.find((t) => t.pinned).groupId === -1);
});

test("pinning a grouped tab takes it out of the group", async () => {
  const fake = await boot();
  const t = fake.open("https://amazon.com"); fake.open("https://ebay.com");
  await wait();
  assert.deepStrictEqual(fake.layout()["Shopping"], ["amazon.com", "ebay.com"]);
  fake.pin(t.id);
  await wait();
  assert.strictEqual(fake.tabs.find((x) => x.id === t.id).groupId, -1);
  assert.deepStrictEqual(fake.layout()["Shopping"], ["ebay.com"]);
});

test("a tab pinned while a regroup is running is not grouped", async () => {
  const fake = await boot();
  const query = fake.browser.tabs.query;
  let target;
  // Pin the tab right after the regroup reads the tab list, before it groups anything.
  fake.browser.tabs.query = async (opts) => {
    const result = await query(opts);
    if (target && opts.pinned === undefined) {
      target.pinned = true;
      target = null;
    }
    return result;
  };
  target = fake.open("https://amazon.com");
  fake.open("https://ebay.com");
  await wait();
  assert.strictEqual(fake.tabs[0].pinned, true);
  assert.strictEqual(fake.tabs.find((t) => t.pinned).groupId, -1);
  assert.deepStrictEqual(fake.layout()["Shopping"], ["ebay.com"]);
});

test("dragging a tab into a category group teaches Smart Group that site", async () => {
  const fake = await boot();
  fake.open("https://amazon.com"); fake.open("https://ebay.com");
  const t = fake.open("https://some-new-site.example/page");
  await wait();
  assert.deepStrictEqual(fake.layout()["Miscellaneous"], ["some-new-site.example"]);

  fake.moveToGroup(t.id, fake.groupByTitle("Shopping").id);
  await wait();
  assert.deepStrictEqual(fake.store.sync.settings.customRules, [{ site: "some-new-site.example", category: "Shopping" }]);
  assert.deepStrictEqual(fake.layout()["Shopping"], ["amazon.com", "ebay.com", "some-new-site.example"], "the moved tab stays put");

  // Next time that site opens, it goes straight to Shopping.
  fake.close(t.id);
  fake.open("https://some-new-site.example/other");
  await wait();
  assert.deepStrictEqual(fake.layout()["Shopping"], ["amazon.com", "ebay.com", "some-new-site.example"]);
  assert.strictEqual(fake.layout()["Miscellaneous"], undefined);
});

test("moving a site again replaces its learned rule", async () => {
  const fake = await boot();
  fake.open("https://amazon.com"); fake.open("https://reddit.com");
  const t = fake.open("https://some-new-site.example");
  await wait();
  fake.moveToGroup(t.id, fake.groupByTitle("Shopping").id);
  await wait();
  fake.moveToGroup(t.id, fake.groupByTitle("Social").id);
  await wait();
  assert.deepStrictEqual(fake.store.sync.settings.customRules, [{ site: "some-new-site.example", category: "Social" }]);
  assert.deepStrictEqual(fake.layout()["Social"], ["reddit.com", "some-new-site.example"]);
});

test("Smart Group's own moves and moves into user-made groups teach nothing", async () => {
  const fake = await boot();
  fake.open("https://amazon.com");
  const t = fake.open("https://etsy.com");
  const gh = [1, 2, 3].map((n) => fake.open("https://github.com/" + n));
  await wait();
  fake.navigate(t.id, "https://x.com"); // regroups the tab into Social by itself
  fake.close(gh[2].id); // dissolves the site group, so GitHub tabs move to Dev
  await wait();
  const user = fake.open("https://cnn.com");
  await wait();
  fake.groups.set(999, { id: 999, title: "Mine", color: "red", windowId: 1 });
  fake.moveToGroup(user.id, 999);
  await wait();
  assert.strictEqual(fake.store.sync.settings, undefined, "no rules were saved");
  assert.deepStrictEqual(fake.layout()["Mine"], ["cnn.com"]);
});

test("navigating a tab moves it to the right group", async () => {
  const fake = await boot();
  fake.open("https://amazon.com"); const t = fake.open("https://etsy.com"); fake.open("https://reddit.com");
  await wait();
  assert.ok(fake.layout()["Shopping"]);
  fake.navigate(t.id, "https://x.com");
  await wait();
  const l = fake.layout();
  assert.deepStrictEqual(l["Shopping"], ["amazon.com"]);
  assert.deepStrictEqual(l["Social"].sort(), ["reddit.com", "x.com"]);
});

test("settings changes apply right away, and turning it off removes our groups", async () => {
  const fake = await boot();
  fake.open("https://foo.dev/1"); fake.open("https://foo.dev/2");
  await wait();
  assert.deepStrictEqual(Object.keys(fake.layout()), ["Miscellaneous"]);
  await fake.browser.storage.sync.set({ settings: { siteThreshold: 2 } });
  await wait();
  assert.deepStrictEqual(Object.keys(fake.layout()), ["Foo"]);
  await fake.browser.storage.sync.set({ settings: { siteThreshold: 2, enabled: false } });
  await wait();
  assert.deepStrictEqual(Object.keys(fake.layout()), ["(none)"]);
});

test("every new site lands in a group, and exempting a site pulls it out", async () => {
  const fake = await boot();
  fake.open("about:newtab");
  const t = fake.open("https://some-new-site.example");
  await wait();
  assert.deepStrictEqual(fake.layout(), { "(none)": [""], Miscellaneous: ["some-new-site.example"] });
  fake.navigate(t.id, "https://www.target.com");
  await wait();
  assert.deepStrictEqual(fake.layout()["Shopping"], ["target.com"]);
  await fake.browser.storage.sync.set({ settings: { exemptSites: ["target.com"] } });
  await wait();
  assert.strictEqual(fake.groups.size, 0);
});

test("existing tabs get grouped on startup", async () => {
  const fake = await boot((f) => {
    f.open("https://nytimes.com"); f.open("https://cnn.com");
  });
  await wait();
  assert.deepStrictEqual(fake.layout(), { News: ["nytimes.com", "cnn.com"] });
});
