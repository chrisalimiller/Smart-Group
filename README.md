# Smart Group for Firefox

A Firefox extension that automatically organizes your tabs using Firefox's built-in tab groups.

- **By website:** when 3 or more tabs are open on the same site, they're grouped under that site's name.
- **By category:** other tabs are sorted into categories like Shopping, Social, News, and Video.
- **Pinned tabs are never grouped.**
- Groups get their own color and label, and work with tabs on top or vertical tabs on the side.
- A settings page lets you assign sites to categories, keep an exempt list, and change the threshold.

> Status: v0.1.0. Auto-grouping and settings work; signed release coming next.

## Requirements

Firefox 139 or newer (the first version with the tab groups extension API), on macOS or Windows.

## Install a release (Mac or Windows)

1. Download the latest `.xpi` file from this repo's Releases page.
2. In Firefox, open the menu, choose **Add-ons and themes**, click the gear icon, and pick **Install Add-on From File…**
3. Select the `.xpi` file and confirm.

## Try it from source (temporary)

1. Download or clone this repo.
2. In Firefox, go to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `src/manifest.json`.

A temporary add-on is removed when Firefox restarts.

## How grouping works

1. Pinned tabs, exempt sites, and non-web pages (like `about:` pages) are skipped.
2. Any site with 3 or more open tabs gets its own group, labeled with the site's name.
3. Remaining tabs are sorted into categories (Shopping, Social, Video, Music, News, Email, Work, Dev, AI, Reference, Travel, Finance) using the list in `src/categories.js`. A category needs at least 2 tabs to become a group.
4. Groups update automatically as you open, close, and navigate tabs.
5. Groups you make yourself are never touched. Turning the extension off removes the groups it made.

## Settings

Open the menu, choose **Add-ons and themes**, click Smart Group, then **Options**. You can:

- Turn automatic grouping on or off
- Change how many tabs a site needs to get its own group (default 3)
- Change how many tabs a category needs to become a group (default 2)
- Add your own rules, like `acme.com` to a new "Acme" category or `github.com` to Work
- List sites that should never be grouped
- Turn built-in categories off
- Put unmatched sites in an "Other" group

Changes apply right away. Settings sync through your Firefox account if you use one.

## Development

```sh
npm install
npm start      # opens a fresh Firefox profile with the extension loaded
npm run lint   # Mozilla's extension checker
npm test       # unit tests, plus a simulated-browser test of the background script
npm run build  # zips the extension into dist/
```

## Releasing a signed build

Firefox only installs permanent add-ons that Mozilla has signed. The `Release` workflow handles this:

1. Create API keys at https://addons.mozilla.org/developers/addon/api/key/ (free, needs a Firefox account).
2. Add them to this repo under **Settings → Secrets and variables → Actions** as `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.
3. Bump `version` in `src/manifest.json`, then push a matching tag, for example `git tag v0.1.0 && git push origin v0.1.0`.

The workflow signs the add-on as unlisted (it won't appear on the add-ons store) and attaches the `.xpi` to a GitHub release.

