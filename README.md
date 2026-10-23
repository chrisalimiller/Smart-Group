# Smart Group for Firefox and Chrome

A browser extension that automatically organizes your tabs using the browser's built-in tab groups. It runs in Firefox and in Chrome (and other Chromium browsers that support tab groups, like Edge and Brave).

- **By website:** when 3 or more tabs are open on the same site, they're grouped under that site's name.
- **By category:** every other tab is sorted into a category like Shopping, Social, News, or Video. Tabs that don't fit any category go into **Miscellaneous**, so every tab ends up in a group.
- **Pinned tabs are never grouped.**
- Groups get their own color and label, and work with tabs on top or vertical tabs on the side.
- A settings page lets you assign sites to categories, keep an exempt list, and change the threshold.

> Status: v0.1.0. Auto-grouping and settings work; submitting to the Firefox Add-ons store next. The Chrome version is new: it builds and passes the simulated-browser tests, but it isn't on the Chrome Web Store yet and hasn't had much testing in a real Chrome.

## Requirements

- **Firefox** 139 or newer (the first version with the tab groups extension API), on macOS or Windows.
- **Chrome** 102 or newer. Chrome has had the tab groups API for longer, but 102 is the first version with the session storage the extension uses.

## Install (Mac or Windows)

Once it's approved, install Smart Group from the Firefox Add-ons store: search for "Smart Group" at https://addons.mozilla.org and click **Add to Firefox**.

## Try it from source

### Firefox (temporary)

1. Download or clone this repo.
2. In Firefox, go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `src/manifest.json`.

A temporary add-on is removed when Firefox restarts.

### Chrome

1. Download or clone this repo, then run `npm install` and `npm run build:chrome`. This creates `dist/chrome`.
2. In Chrome, go to `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and pick the `dist/chrome` folder.

After changing the code, run `npm run build:chrome` again and click the reload button on the extension's card.

## How grouping works

1. Pinned tabs, exempt sites, and non-web pages (like `about:` pages) are skipped.
2. Any site with 3 or more open tabs gets its own group, labeled with the site's name.
3. Every remaining tab is sorted into a category (Shopping, Social, Video, Music, News, Email, Work, Dev, AI, Reference, Travel, Finance). Known sites come from the list in `src/categories.js`. For a site that isn't on the list, Smart Group looks for clues in its address and page title (for example "shop", "flights", or "news"), and treats `.edu` and `.gov` sites as Reference.
4. Anything that still doesn't fit goes into a **Miscellaneous** group.
5. Groups update automatically as you open, close, and navigate tabs.
6. **It learns from you.** Drag a tab into one of Smart Group's category groups (like Shopping or Miscellaneous) and that tab's site goes to that category from then on. This is saved as a rule you can see or remove in Settings. Moves into site groups or groups you made yourself don't create rules, and a site with 3 or more open tabs still gets its own site group.
7. Groups you make yourself are never touched. Turning the extension off removes the groups it made.

## Settings

In Firefox, open the menu, choose **Add-ons and themes**, click Smart Group, then **Options**. In Chrome, open `chrome://extensions`, click **Details** on Smart Group, then **Extension options**. You can:

- Turn automatic grouping on or off
- Change how many tabs a site needs to get its own group (default 3)
- Add your own rules, like `acme.com` to a new "Acme" category or `github.com` to Work
- List sites that should never be grouped
- Turn built-in categories off (their tabs go to Miscellaneous)
- **Shorten tab titles** (off by default): removes the site's name from tab titles, so "Lo-fi beats - YouTube" becomes "Lo-fi beats" and "Budget - Google Sheets" becomes "Budget". Unread counts like "(3)" are kept. Different pages on the same site never end up with the same title, even in different windows: if shortening would hide the difference, those tabs keep their full titles, and if the pages have the exact same title (like two "Untitled document" tabs), a short hint from the address goes in front, like "12 · Crash on start" for issue #12. The same page open twice can share a title. Neither Firefox nor Chrome lets an extension rename a tab, so Smart Group changes the title inside each page; turning this on asks for permission to access websites. Turning it off (or removing that permission in the browser's add-on settings) puts the full titles back.

Changes apply right away. Settings sync through your Firefox or Google account if you use one.

## Development

```sh
npm install
npm start      # opens a fresh Firefox profile with the extension loaded
npm run lint   # Mozilla's extension checker (Firefox version only)
npm test       # unit tests, plus a simulated-browser test of the background script
npm run build  # zips the Firefox extension into dist/
npm run build:chrome  # assembles the Chrome extension in dist/chrome
```

### How the two browsers share code

Almost everything lives in `src/` and runs in both browsers. The differences are small:

- `src/compat.js` makes `browser` point at `chrome` when needed, and papers over two differences: Chrome needs message replies sent with `sendResponse`, and its `tabs.onUpdated` has no `properties` filter.
- Firefox runs the background as a script list (`src/manifest.json`). Chrome runs it as a service worker (`chrome/sw.js`, which loads the same files with `importScripts`). Keep the two file lists in the same order.
- Chrome stops an idle service worker and starts it again later with no memory of the old one, so anything that must survive (which groups the extension made, which tab moves were its own) is kept in session storage. The restart tests in `test/background.test.js` cover this.
- `chrome/manifest.json` is the Chrome manifest. It has no version of its own: `npm run build:chrome` copies the version from `src/manifest.json`, so a release only bumps it in one place. Chrome also needs PNG icons, which the same script makes from `src/icons/icon.svg`.
- `npm run zip:chrome` builds and zips the Chrome extension to `dist/smart-group-chrome-<version>.zip`. CI builds it on every push and pull request.

## Publishing to the Firefox Add-ons store

Firefox only installs permanent add-ons that Mozilla has signed. The `Release` workflow submits each new version to addons.mozilla.org (AMO), where Mozilla reviews, signs and publishes it.

One-time setup:
1. Create API keys at https://addons.mozilla.org/developers/addon/api/key/ (free, needs a Firefox account).
2. Add them to this repo as Actions secrets named `AMO_JWT_ISSUER` (the "JWT issuer") and `AMO_JWT_SECRET` (the "JWT secret"), for example with `gh secret set AMO_JWT_ISSUER`.

For each release:
1. Bump `version` in `src/manifest.json` and merge it to `main`.
2. Push a matching tag, for example `git tag v0.1.0 && git push origin v0.1.0`.
3. Watch the Actions tab, then check the add-on's status at https://addons.mozilla.org/developers/addons. Review usually takes a few days.

The store listing's category, summary and license come from `amo-metadata.json`. After the first submission, edit the listing (description, screenshots, icon) on the AMO site.

## Publishing to the Chrome Web Store

The same tag push also runs the `chrome` job in the `Release` workflow. It always attaches `smart-group-chrome-<version>.zip` to the GitHub release. It uploads to the Chrome Web Store and submits for review only once the secrets below exist, so releases keep working before then.

One-time setup:
1. Register as a Chrome Web Store developer at https://chrome.google.com/webstore/devconsole (one-time $5 fee).
2. Upload the first zip by hand (take it from CI or the GitHub release) and fill in the listing: description, screenshots, and the privacy tab. The extension collects no data. Be ready to justify the `tabs`, `tabGroups`, `storage` and `scripting` permissions, and the optional website access used only by "Shorten tab titles". Note the extension's ID from the dashboard.
3. Create API credentials by following https://github.com/fregante/chrome-webstore-upload-keys. It walks through creating a Google Cloud OAuth client and getting a refresh token.
4. Add these as Actions secrets: `CWS_EXTENSION_ID`, `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`.

From then on a release is the same as for Firefox: bump `version` in `src/manifest.json`, merge, and push a matching tag. Google's review usually takes a few days, and a new version only goes live after it passes.
