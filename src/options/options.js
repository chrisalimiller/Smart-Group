/* global DEFAULT_SETTINGS, DEFAULT_CATEGORY_SITES, categoryColor, normalizeSitePattern */

// Firefox's tab group colors, as shown in the tab strip (approximate).
const SWATCH = {
  blue: "#45a1ff", cyan: "#00c8d7", green: "#54ffbd", yellow: "#ffe900", orange: "#ffa436",
  red: "#ff6a75", pink: "#ff8ac5", purple: "#c069ff", grey: "#b1b1b3",
};

let settings = structuredClone(DEFAULT_SETTINGS);
const $ = (id) => document.getElementById(id);

async function load() {
  const stored = await browser.storage.sync.get("settings");
  settings = { ...structuredClone(DEFAULT_SETTINGS), ...(stored.settings || {}) };
  // Options from earlier versions that no longer exist.
  delete settings.minCategorySize;
  delete settings.groupUncategorized;
  render();
}

let savedTimer;
async function save() {
  await browser.storage.sync.set({ settings });
  $("saved").textContent = "Saved";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => ($("saved").textContent = ""), 1500);
}

function li(content, onRemove, label) {
  const item = document.createElement("li");
  const text = document.createElement("span");
  text.append(...content);
  const btn = document.createElement("button");
  btn.className = "remove";
  btn.textContent = "×";
  btn.title = btn.ariaLabel = "Remove " + label;
  btn.addEventListener("click", onRemove);
  item.append(text, btn);
  return item;
}

function empty(text) {
  const item = document.createElement("li");
  item.className = "empty";
  item.textContent = text;
  return item;
}

function tag(category) {
  const t = document.createElement("span");
  t.className = "tag";
  t.textContent = category;
  t.style.background = SWATCH[categoryColor(category)] || SWATCH.grey;
  return t;
}

function render() {
  $("enabled").checked = settings.enabled;
  $("siteThreshold").value = settings.siteThreshold;

  const categories = new Set([...Object.keys(DEFAULT_CATEGORY_SITES), ...settings.customRules.map((r) => r.category)]);
  $("categoryList").replaceChildren(...[...categories].sort().map((c) => Object.assign(document.createElement("option"), { value: c })));

  const rules = $("rules");
  rules.replaceChildren(
    ...(settings.customRules.length
      ? settings.customRules.map((r, i) =>
          li([r.site, " →", tag(r.category)], () => {
            settings.customRules.splice(i, 1);
            save().then(render);
          }, r.site))
      : [empty("No rules yet.")]),
  );

  const exempt = $("exempt");
  exempt.replaceChildren(
    ...(settings.exemptSites.length
      ? settings.exemptSites.map((s, i) =>
          li([s], () => {
            settings.exemptSites.splice(i, 1);
            save().then(render);
          }, s))
      : [empty("No exempt sites.")]),
  );

  const disabled = new Set(settings.disabledCategories);
  $("builtIn").replaceChildren(
    ...Object.entries(DEFAULT_CATEGORY_SITES).map(([cat, sites]) => {
      const d = document.createElement("details");
      const s = document.createElement("summary");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !disabled.has(cat);
      box.ariaLabel = "Use " + cat;
      box.addEventListener("click", (e) => e.stopPropagation());
      box.addEventListener("change", () => {
        settings.disabledCategories = box.checked
          ? settings.disabledCategories.filter((c) => c !== cat)
          : [...settings.disabledCategories, cat];
        save();
      });
      s.append(box, tag(cat), ` ${sites.length} sites`);
      const p = document.createElement("p");
      p.textContent = sites.join(", ");
      d.append(s, p);
      return d;
    }),
  );
}

function clampNumber(input, min, max, fallback) {
  const n = Math.round(Number(input.value));
  const v = Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  input.value = v;
  return v;
}

$("enabled").addEventListener("change", (e) => { settings.enabled = e.target.checked; save(); });
$("siteThreshold").addEventListener("change", (e) => {
  settings.siteThreshold = clampNumber(e.target, 2, 20, DEFAULT_SETTINGS.siteThreshold); save();
});

$("ruleForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const site = normalizeSitePattern($("ruleSite").value);
  const category = $("ruleCategory").value.trim();
  if (!site || !category) return;
  // Replace an existing rule for the same site.
  settings.customRules = settings.customRules.filter((r) => normalizeSitePattern(r.site) !== site);
  settings.customRules.push({ site, category });
  $("ruleSite").value = $("ruleCategory").value = "";
  save().then(render);
});

$("exemptForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const site = normalizeSitePattern($("exemptSite").value);
  if (!site) return;
  if (!settings.exemptSites.includes(site)) settings.exemptSites.push(site);
  $("exemptSite").value = "";
  save().then(render);
});

$("reset").addEventListener("click", async () => {
  if (!confirm("Reset all Smart Group settings to the defaults? Your rules and exempt sites will be removed.")) return;
  settings = structuredClone(DEFAULT_SETTINGS);
  await save();
  render();
});

load();
