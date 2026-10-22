// Pure grouping logic: given a window's tabs and the user's settings,
// decide which tabs belong in which group. No browser calls here, so it can be tested in Node.

/* global CATEGORY_COLORS, DEFAULT_CATEGORY_SITES, KEYWORD_HINTS, TLD_HINTS, MISC_CATEGORY */
if (typeof module !== "undefined") {
  ({ CATEGORY_COLORS, DEFAULT_CATEGORY_SITES, KEYWORD_HINTS, TLD_HINTS, MISC_CATEGORY } = require("./categories.js"));
}

const DEFAULT_SETTINGS = {
  enabled: true,
  siteThreshold: 3, // this many tabs on one site -> a site group
  exemptSites: [], // sites that are never grouped
  customRules: [], // [{ site: "example.com", category: "Work" }]
  disabledCategories: [], // built-in categories the user turned off
  shortenTitles: false, // drop the site name from tab titles (needs site access)
};

const GROUP_COLORS = ["blue", "cyan", "green", "yellow", "orange", "red", "pink", "purple", "grey"];

function siteOf(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  return u.hostname.replace(/^www\./, "").toLowerCase();
}

// Normalize what a user types ("https://www.Example.com/path") into "example.com" or "example.com/path".
function normalizeSitePattern(text) {
  let s = String(text || "").trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  return s;
}

// Does a tab URL match a pattern like "google.com" or "google.com/travel"?
// A domain pattern also matches its subdomains.
function matchesPattern(url, pattern) {
  const host = siteOf(url);
  if (!host || !pattern) return false;
  const [pHost, ...pathParts] = pattern.split("/");
  const hostOk = host === pHost || host.endsWith("." + pHost);
  if (!hostOk) return false;
  if (pathParts.length === 0) return true;
  const path = new URL(url).pathname.toLowerCase();
  const pPath = "/" + pathParts.join("/");
  return path === pPath || path.startsWith(pPath + "/");
}

// Longest (most specific) matching pattern wins.
function bestMatch(url, entries) {
  let best = null;
  for (const [pattern, category] of entries) {
    if (matchesPattern(url, pattern) && (!best || pattern.length > best[0].length)) {
      best = [pattern, category];
    }
  }
  return best ? best[1] : null;
}

// Pick a category for a tab. Returns null when nothing fits (the caller uses Miscellaneous).
function categoryOf(url, settings, title = "") {
  settings = settings || {};
  const custom = (settings.customRules || []).map((r) => [normalizeSitePattern(r.site), r.category]);
  const fromCustom = bestMatch(url, custom);
  if (fromCustom) return fromCustom;

  const disabled = new Set(settings.disabledCategories || []);
  const builtIn = [];
  for (const [category, sites] of Object.entries(DEFAULT_CATEGORY_SITES)) {
    if (disabled.has(category)) continue;
    for (const site of sites) builtIn.push([site, category]);
  }
  const fromBuiltIn = bestMatch(url, builtIn);
  if (fromBuiltIn) return fromBuiltIn;

  // Unknown site: look for hints in its address, then in the page title.
  const host = siteOf(url) || "";
  const hostWords = host.replace(/[.-]/g, " ");
  const titleWords = String(title || "").toLowerCase();
  for (const text of [hostWords, titleWords]) {
    for (const [re, category] of KEYWORD_HINTS) {
      if (!disabled.has(category) && re.test(text)) return category;
    }
  }
  const tldCategory = TLD_HINTS[host.split(".").pop()];
  if (tldCategory && !disabled.has(tldCategory)) return tldCategory;
  return null;
}

function isExempt(url, settings) {
  return (settings.exemptSites || []).some((p) => matchesPattern(url, normalizeSitePattern(p)));
}

// A friendly label for a site group: "github.com" -> "GitHub"-ish "Github", "docs.google.com" -> "Docs.google".
function siteLabel(host) {
  const parts = host.split(".");
  const known2 = ["co.uk", "com.au", "co.jp", "com.br", "co.nz"];
  const tail2 = parts.slice(-2).join(".");
  const drop = known2.includes(tail2) ? 2 : 1;
  const name = parts.length > drop ? parts.slice(0, parts.length - drop).join(".") : host;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function hashColor(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}

function categoryColor(category) {
  return CATEGORY_COLORS[category] || hashColor(category);
}

/**
 * Decide the groups for one window.
 * Every eligible tab ends up in exactly one group: its site's group if the site has
 * enough tabs, otherwise its category, otherwise Miscellaneous.
 * @param {Array<{id:number,url:string,title?:string,pinned:boolean}>} tabs
 * @param {object} settings
 * @returns {{groups: Array<{key:string,title:string,color:string,tabIds:number[]}>, ungrouped: number[]}}
 *   `ungrouped` lists tabs that should not be in any of our groups (pinned, exempt, non-web).
 */
function planGroups(tabs, settings) {
  settings = { ...DEFAULT_SETTINGS, ...(settings || {}) };
  const eligible = tabs.filter((t) => !t.pinned && siteOf(t.url) && !isExempt(t.url, settings));

  const bySite = new Map();
  for (const t of eligible) {
    const host = siteOf(t.url);
    if (!bySite.has(host)) bySite.set(host, []);
    bySite.get(host).push(t);
  }

  const groups = [];
  const leftover = [];
  for (const [host, siteTabs] of bySite) {
    if (siteTabs.length >= settings.siteThreshold) {
      groups.push({
        key: "site:" + host,
        title: siteLabel(host),
        color: hashColor(host),
        tabIds: siteTabs.map((t) => t.id),
      });
    } else {
      leftover.push(...siteTabs);
    }
  }

  // Every remaining tab goes into a category; unknown sites go to Miscellaneous.
  const byCategory = new Map();
  for (const t of leftover) {
    const cat = categoryOf(t.url, settings, t.title) || MISC_CATEGORY;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(t);
  }
  for (const [cat, catTabs] of byCategory) {
    groups.push({ key: "cat:" + cat, title: cat, color: categoryColor(cat), tabIds: catTabs.map((t) => t.id) });
  }

  // Anything not in a planned group (pinned, exempt, or not a web page) stays out of our groups.
  const grouped = new Set(groups.flatMap((g) => g.tabIds));
  const ungrouped = tabs.filter((t) => !grouped.has(t.id)).map((t) => t.id);

  // Keep groups in the order their first tab appears, so the tab strip doesn't jump around.
  const order = new Map(tabs.map((t, i) => [t.id, i]));
  groups.sort((a, b) => Math.min(...a.tabIds.map((id) => order.get(id))) - Math.min(...b.tabIds.map((id) => order.get(id))));
  return { groups, ungrouped };
}

if (typeof module !== "undefined") {
  module.exports = {
    DEFAULT_SETTINGS, siteOf, normalizeSitePattern, matchesPattern, categoryOf,
    isExempt, siteLabel, categoryColor, planGroups,
  };
}
