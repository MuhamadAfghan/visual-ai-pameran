#!/usr/bin/env node
// Embeds backend-web/assets/fonts/TitilliumWeb-Bold.ttf into a TS module so the
// label font is part of the compiled JS bundle. This guarantees evidence-frame
// labels render correctly even on deployments where the assets/ folder is not
// shipped alongside dist/.
//
// Run from the backend-web/ directory:
//   node scripts/embed-font.js
//
// Or from anywhere — the script resolves paths from its own location.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const TTF_PATH = path.join(ROOT, "assets/fonts/TitilliumWeb-Bold.ttf");
const OUT_PATH = path.join(ROOT, "src/utils/embeddedFont.ts");

const ttf = fs.readFileSync(TTF_PATH);
const b64 = ttf.toString("base64");

const body =
  "// AUTO-GENERATED — embeds backend-web/assets/fonts/TitilliumWeb-Bold.ttf so labels render\n" +
  "// correctly on any deployment, even if the assets/ folder is not shipped.\n" +
  "// Regenerate with: node scripts/embed-font.js\n\n" +
  "export const EMBEDDED_FONT_BASE64 = " + JSON.stringify(b64) + ";\n";

fs.writeFileSync(OUT_PATH, body);
console.log(`Wrote ${OUT_PATH} (${body.length} chars, base64 size ${b64.length})`);
