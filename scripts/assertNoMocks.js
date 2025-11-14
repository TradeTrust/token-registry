#!/usr/bin/env node
/*
 Ensures no mock artifacts are present in production build output.
 Checks:
 1) dist/artifacts/contracts/mocks should not exist
 2) No files under dist/artifacts containing "/mocks/"
*/
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const artifactsDir = path.join(root, "dist", "artifacts", "contracts");
const mocksDir = path.join(artifactsDir, "mocks");

let failed = false;
const errors = [];

if (fs.existsSync(mocksDir)) {
  failed = true;
  errors.push(`Found mocks artifacts directory: ${path.relative(root, mocksDir)}`);
}

function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else {
      const rel = path.relative(root, full);
      if (rel.includes(`${path.sep}mocks${path.sep}`)) {
        failed = true;
        errors.push(`Found mock artifact in dist: ${rel}`);
      }
    }
  });
}

if (fs.existsSync(artifactsDir)) {
  walk(artifactsDir);
}

if (failed) {
  console.error(`\nERROR: Production artifacts contain mocks.\n${errors.map((e) => ` - ${e}`).join("\n")}`);
  process.exit(1);
} else {
  console.log("No mock artifacts found in dist.");
}
