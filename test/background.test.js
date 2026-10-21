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
