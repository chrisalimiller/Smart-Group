// Pure tab-title shortening. Removes the site's name from a page title, since the tab's
// favicon and group already say which site it is:
//   "Pull requests · mozilla/gecko-dev · GitHub" -> "Pull requests · mozilla/gecko-dev"
//   "(3) Lo-fi beats - YouTube"                 -> "(3) Lo-fi beats"
// titlesForSite() then makes sure different pages on one site don't end up with the same
// title. No browser calls here, so it can be tested in Node.

// " - ", " | ", " · ", " / " and friends. Spaces are required on both sides, so "e-mail" stays whole.
const TITLE_SEPARATOR = /(\s+[-|–—·•»:/]\s+)/;

const squash = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

// Is this piece of a title just the site's name? For "docs.google.com" that covers
// "Google Docs", "Google", "docs.google.com"; for "stackoverflow.com", "Stack Overflow".
// With `brand`, also "<site> <product>", like "Google Sheets" or "Microsoft Teams".
function isSiteName(segment, host, brand = false) {
  const labels = host.split(".").filter((l) => l && l !== "www");
  const nameLabels = labels.slice(0, -1).map(squash); // without the ending (.com, .org)
  const names = new Set([squash(host), ...labels.map(squash), nameLabels.join("")]);
  names.delete("");

  const words = segment.trim().split(/\s+/).map(squash).filter(Boolean);
  if (!words.length || words.length > 4) return false;
  if (names.has(words.join(""))) return true;
  if (words.every((w) => names.has(w))) return true;
  return brand && words.length === 2 && nameLabels.includes(words[0]);
}

function shortenTitle(title, host) {
  const full = String(title || "").trim();
  host = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!full || !host) return full;

  // Keep an unread count like "(3) " in front, outside the shortening.
  const [, count = "", rest] = full.match(/^(\(\d+\+?\)\s*)?([\s\S]*)$/);
  const parts = rest.split(TITLE_SEPARATOR); // [text, sep, text, sep, text]

  // Drop the site name from the end first (most common), then from the start.
  // Always keep at least one piece. "Google Sheets"-style names only count at the end:
  // at the start, "GitHub Copilot - Your AI pair programmer" is the page's real subject.
  while (parts.length > 1 && isSiteName(parts[parts.length - 1], host, true)) parts.splice(-2);
  while (parts.length > 1 && isSiteName(parts[0], host)) parts.splice(0, 2);

  const short = parts.join("").trim();
  return short ? count + short : full;
}

// --- Telling pages on the same site apart ---

const TRACKING_PARAM = /^(utm_.*|fbclid|gclid|dclid|msclkid|mc_eid|mc_cid|_ga)$/i;

// Two tabs show the same page if their addresses match, ignoring "#section" and tracking tags.
function pageKey(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return String(url);
  }
  u.hash = "";
  for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
  return u.href;
}

function groupBy(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const k = keyOf(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return [...map.values()];
}

// Make one piece of an address readable: "my-cool_post.html" -> "my cool post".
// Long IDs ("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms") are cut to "1BxiMV…".
function prettySegment(text) {
  let s = String(text);
  try {
    s = decodeURIComponent(s);
  } catch {
    // keep it as is
  }
  s = s.replace(/\.(html?|php|aspx?|jsp)$/i, "").replace(/[-_+]+/g, " ").trim();
  if (s.length > 12 && !/\s/.test(s) && /\d/.test(s) && /[a-z]/i.test(s)) return s.slice(0, 6) + "…";
  return s.length > 30 ? s.slice(0, 29).trim() + "…" : s;
}

// A short label for each address, built from the parts where the addresses differ:
//   /mozilla/gecko/issues/12, /mozilla/gecko/issues/15 -> "12", "15"
//   /search?q=cats, /search?q=dogs                    -> "cats", "dogs"
function urlHints(urls) {
  const parsed = urls.map((u) => {
    try {
      return new URL(u);
    } catch {
      return null;
    }
  });
  const paths = parsed.map((u) => (u ? u.pathname.split("/").filter(Boolean) : []));
  const longest = Math.max(0, ...paths.map((p) => p.length));
  const differs = [];
  for (let i = 0; i < longest; i++) {
    if (new Set(paths.map((p) => p[i])).size > 1) differs.push(i);
  }

  const queries = parsed.map((u) => (u ? u.searchParams : new URLSearchParams()));
  const keys = [...new Set(queries.flatMap((q) => [...q.keys()]))].filter((k) => !TRACKING_PARAM.test(k));
  const differentKeys = keys.filter((k) => new Set(queries.map((q) => q.getAll(k).join(","))).size > 1);

  return paths.map((path, n) => {
    const pieces = differs.map((i) => path[i]).filter(Boolean).map(prettySegment);
    for (const k of differentKeys) {
      const v = queries[n].getAll(k).join(",");
      if (v) pieces.push(prettySegment(v));
    }
    const hint = pieces.filter(Boolean).join("/");
    if (hint) return hint;
    // Nothing of its own (for example the home page next to deeper pages).
    return path.length ? prettySegment(path[path.length - 1]) : "home";
  });
}

// "(3) Inbox" + "work" -> "(3) work · Inbox". The hint goes first so it stays visible
// when Firefox cuts off the end of a narrow tab.
function withHint(title, hint) {
  const [, count = "", rest] = title.match(/^(\(\d+\+?\)\s*)?([\s\S]*)$/);
  return `${count}${hint} · ${rest}`;
}

/**
 * Pick the title for every tab on one site, across all windows.
 * Each tab gets its short title, unless that would make different pages look the same:
 *  1. If their full titles differ, those tabs keep their full titles.
 *  2. If even the full titles match, a hint from the address goes in front ("12 · Issue").
 * Tabs showing the same page may share a title.
 * @param {Array<{id:number,title:string,url:string}>} pages in a stable order (e.g. by tab id)
 * @param {string} host
 * @returns {Map<number,string>} tab id -> title
 */
function titlesForSite(pages, host) {
  const out = new Map();
  const items = pages.map((p) => {
    const full = String(p.title || "").trim();
    return { id: p.id, full, short: shortenTitle(full, host), key: pageKey(p.url), url: p.url };
  });

  for (const same of groupBy(items, (p) => p.short.toLowerCase())) {
    const pageCount = new Set(same.map((p) => p.key)).size;
    if (pageCount <= 1) {
      same.forEach((p) => out.set(p.id, p.short));
      continue;
    }
    const byFull = groupBy(same, (p) => p.full.toLowerCase());
    for (const sub of byFull) {
      const base = byFull.length > 1 ? sub[0].full : sub[0].short;
      const pagesInSub = groupBy(sub, (p) => p.key);
      if (pagesInSub.length === 1) {
        sub.forEach((p) => out.set(p.id, base));
        continue;
      }
      const hints = urlHints(pagesInSub.map((g) => g[0].url));
      // If two different pages still get the same hint, number them.
      const seen = new Map();
      pagesInSub.forEach((g, i) => {
        let hint = hints[i];
        const n = (seen.get(hint.toLowerCase()) || 0) + 1;
        seen.set(hint.toLowerCase(), n);
        if (n > 1) hint += ` (${n})`;
        g.forEach((p) => out.set(p.id, withHint(base, hint)));
      });
    }
  }
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { shortenTitle, isSiteName, titlesForSite, pageKey, urlHints };
}
