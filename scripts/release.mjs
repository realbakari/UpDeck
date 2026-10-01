// Packages a store release. Run through `npm run release`, which tests and builds first.
// Output in release/: the Chrome and Firefox packages, a source archive for Firefox
// reviewers, store images and the listing documents.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const out = resolve('release');
const version = pkg.version;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const zip = (cwd, file, entries, exclude = []) =>
  execFileSync(
    'zip',
    ['-r', '-X', '-q', '-9', file, ...entries, ...exclude.flatMap((e) => ['-x', e])],
    {
      cwd,
      stdio: 'inherit',
    },
  );

for (const target of ['chrome', 'firefox'])
  zip(resolve('dist', target), `${out}/updeck-${target}-${version}.zip`, ['.']);

// Everything needed to rebuild the packages, nothing generated.
zip(
  resolve('.'),
  `${out}/updeck-source-${version}.zip`,
  [
    'src',
    'scripts',
    'tests',
    'examples',
    'store',
    'docs',
    'index.html',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'playwright.config.ts',
    'playwright.extension.config.ts',
    '.prettierrc.json',
    '.gitignore',
    'README.md',
    'SECURITY.md',
    'PRIVACY.md',
    'LICENSE',
  ],
  ['*.DS_Store'],
);

execFileSync('node', ['scripts/store-assets.mjs'], { stdio: 'inherit' });
for (const doc of ['LISTING.md', 'REVIEWER-NOTES.md'])
  await cp(resolve('store', doc), `${out}/${doc}`);
await cp('PRIVACY.md', `${out}/PRIVACY.md`);
console.log(`Release ${version} written to release/`);
