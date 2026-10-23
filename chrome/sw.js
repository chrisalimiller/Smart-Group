// Chrome runs the background as a service worker, which can't list several scripts in the
// manifest, so load them here. Must stay in the same order as background.scripts in src/manifest.json.
importScripts("compat.js", "categories.js", "grouping.js", "titles.js", "background.js");
