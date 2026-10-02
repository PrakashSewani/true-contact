#!/usr/bin/env node
/**
 * Label-driven release helper. Bumps the single repo version in the root
 * package.json and opens a new section in CHANGELOG.md, leaving the previous
 * [Unreleased] entries under the new version heading.
 *
 * Usage: node scripts/release.mjs <patch|minor|major>
 * Prints the new version to stdout (used by the release workflow).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const BUMPS = ['patch', 'minor', 'major'];
const bump = process.argv[2];

if (!BUMPS.includes(bump)) {
  console.error(`Usage: node scripts/release.mjs <${BUMPS.join('|')}>`);
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');
const packagePath = join(root, 'package.json');
const changelogPath = join(root, 'CHANGELOG.md');

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
const parts = String(pkg.version)
  .split('.')
  .map((value) => Number.parseInt(value, 10));

if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
  console.error(`Unsupported version in package.json: ${pkg.version}`);
  process.exit(1);
}

const [major, minor, patch] = parts;
const next =
  bump === 'major'
    ? `${major + 1}.0.0`
    : bump === 'minor'
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

pkg.version = next;
writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);

const changelog = readFileSync(changelogPath, 'utf8');
const date = new Date().toISOString().slice(0, 10);
const updated = changelog.replace('## [Unreleased]', `## [Unreleased]\n\n## [${next}] - ${date}`);

if (updated === changelog) {
  console.error('CHANGELOG.md has no "## [Unreleased]" section to open a release under.');
  process.exit(1);
}
writeFileSync(changelogPath, updated);

console.log(next);
