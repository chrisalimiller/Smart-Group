# Smart Group for Firefox

A Firefox extension that automatically organizes your tabs using Firefox's built-in tab groups.

- **By website:** when 3 or more tabs are open on the same site, they're grouped under that site's name.
- **By category:** every other tab is sorted into a category like Shopping, Social, News, or Video. Tabs that don't fit any category go into **Miscellaneous**, so every tab ends up in a group.
- **Pinned tabs are never grouped.**
- Groups get their own color and label, and work with tabs on top or vertical tabs on the side.
- A settings page lets you assign sites to categories, keep an exempt list, and change the threshold.

> Status: v0.1.0. Auto-grouping and settings work; submitting to the Firefox Add-ons store next.

## Requirements

Firefox 139 or newer (the first version with the tab groups extension API), on macOS or Windows.

## Install (Mac or Windows)

Once it's approved, install Smart Group from the Firefox Add-ons store: search for "Smart Group" at https://addons.mozilla.org and click **Add to Firefox**.

## Try it from source (temporary)

1. Download or clone this repo.
2. In Firefox, go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `src/manifest.json`.

A temporary add-on is removed when Firefox restarts.

## How grouping works

1. Pinned tabs, exempt sites, and non-web pages (like `about:` pages) are skipped.
2. Any site with 3 or more open tabs gets its own group, labeled with the site's name.
3. Every remaining tab is sorted into a category (Shopping, Social, Video, Music, News, Email, Work, Dev, AI, Reference, Travel, Finance). Known sites come from the list in `src/categories.js`. For a site that isn't on the list, Smart Group looks for clues in its address and page title (for example "shop", "flights", or "news"), and treats `.edu` and `.gov` sites as Reference.
4. Anything that still doesn't fit goes into a **Miscellaneous** group.
5. Groups update automatically as you open, close, and navigate tabs.
6. **It learns from you.** Drag a tab into one of Smart Group's category groups (like Shopping or Miscellaneous) and that tab's site goes to that category from then on. This is saved as a rule you can see or remove in Settings. Moves into site groups or groups you made yourself don't create rules, and a site with 3 or more open tabs still gets its own site group.
7. Groups you make yourself are never touched. Turning the extension off removes the groups it made.

## Settings

Open the menu, choose **Add-ons and themes**, click Smart Group, then **Options**. You can:

- Turn automatic grouping on or off
- Change how many tabs a site needs to get its own group (default 3)
- Add your own rules, like `acme.com` to a new "Acme" category or `github.com` to Work
- List sites that should never be grouped
- Turn built-in categories off (their tabs go to Miscellaneous)

Changes apply right away. Settings sync through your Firefox account if you use one.

## Development

```sh
npm install
npm start      # opens a fresh Firefox profile with the extension loaded
npm run lint   # Mozilla's extension checker
npm test       # unit tests, plus a simulated-browser test of the background script
npm run build  # zips the extension into dist/
```

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
