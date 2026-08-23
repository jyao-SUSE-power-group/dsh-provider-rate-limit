#!/usr/bin/env node
/**
 * Patch the dsh host's Web settings allowlist so the llm-rate-limit
 * namespace is exposed on the plugin configuration page.
 *
 * The dsh host refuses settings namespaces that are not listed in
 * WEB_SETTINGS_NAMESPACES (dsh-host-apiproxy) with `settings-not-exposed`,
 * even when a plugin registered the namespace. This script adds
 * "llm-rate-limit" to that allowlist in every dsh installation under
 * ~/.npm/_npx, idempotently.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const NAMESPACE = "llm-rate-limit";
const TARGET = join(
  "@deepseek-ai",
  "dsh-host-apiproxy",
  "lib",
  "index.js",
);

function candidates() {
  const root = join(homedir(), ".npm", "_npx");
  const out = [];
  let dirs;
  try {
    dirs = readdirSync(root);
  } catch {
    return out;
  }
  for (const dir of dirs) {
    const path = join(root, dir, "node_modules", TARGET);
    if (existsSync(path)) out.push(path);
  }
  return out;
}

/** Insert the namespace into WEB_SETTINGS_NAMESPACES if absent. */
function patch(file) {
  let src = readFileSync(file, "utf8");
  if (src.includes(`"${NAMESPACE}"`)) {
    console.log(`SKIP  ${file} (already patched)`);
    return false;
  }
  const marker = '"web-search-deepseek"';
  const idx = src.indexOf(marker);
  if (idx === -1) {
    console.error(`FAIL  ${file} (marker ${marker} not found)`);
    return false;
  }
  // Insert the new entry after the last existing allowlist entry,
  // preserving the trailing `]` of the array.
  src = src.slice(0, idx) + marker + ",\n\t" + JSON.stringify(NAMESPACE) + src.slice(idx + marker.length);
  writeFileSync(file, src);
  console.log(`PATCH ${file}`);
  return true;
}

const files = candidates();
if (files.length === 0) {
  console.error("no dsh-host-apiproxy installations found under ~/.npm/_npx");
  process.exit(1);
}
let changed = 0;
for (const file of files) changed += patch(file) ? 1 : 0;
console.log(`${files.length} installation(s) scanned, ${changed} patched`);
