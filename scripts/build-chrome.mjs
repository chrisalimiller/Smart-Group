// Assembles an unpacked Chrome extension in dist/chrome from the shared code in src/
// plus the Chrome-only files in chrome/. Chrome needs PNG icons, so this rasterizes icon.svg
// (needs the `sharp` dev dependency). The version comes from src/manifest.json, so it is
// only ever changed in one place.
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "chrome");

await rm(out, { recursive: true, force: true });
await mkdir(join(out, "icons"), { recursive: true });
await cp(join(root, "src"), out, {
  recursive: true,
  filter: (p) => !/manifest\.json$/.test(p) && !p.endsWith("icon.svg"),
});
const { version } = JSON.parse(await readFile(join(root, "src", "manifest.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(root, "chrome", "manifest.json"), "utf8"));
// Put version right after manifest_version, where it is in the Firefox manifest.
const { manifest_version, ...rest } = manifest;
await writeFile(join(out, "manifest.json"), JSON.stringify({ manifest_version, version, ...rest }, null, 2) + "\n");
await cp(join(root, "chrome", "sw.js"), join(out, "sw.js"));

const svg = await readFile(join(root, "src", "icons", "icon.svg"));
for (const size of [16, 32, 48, 128]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(out, "icons", `icon-${size}.png`));
}
console.log("Built", out);
