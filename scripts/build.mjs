import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import sharp from 'sharp';
import pkg from '../package.json' with { type: 'json' };

await rm('dist', { recursive: true, force: true });
await viteBuild();
const icon = await readFile('scripts/icon.svg');
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src https://api.up.com.au; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
for (const target of ['chrome', 'firefox']) {
  const out = `dist/${target}`;
  await cp('dist/web', out, { recursive: true });
  await mkdir(`${out}/icons`, { recursive: true });
  for (const size of [16, 32, 48, 128])
    await sharp(icon).resize(size).png().toFile(`${out}/icons/${size}.png`);
  await build({
    entryPoints: ['src/background.ts'],
    outfile: `${out}/background.js`,
    bundle: true,
    format: 'iife',
    target: target === 'firefox' ? 'firefox140' : 'chrome120',
    minify: true,
    sourcemap: false,
  });
  const manifest = {
    manifest_version: 3,
    name: 'UpDeck: unofficial dashboard for Up',
    short_name: 'UpDeck',
    homepage_url: 'https://github.com/realbakari/UpDeck',
    version: pkg.version,
    description:
      'Unofficial dashboard for Up: payday, subscriptions and spending, worked out on your device. Not made or endorsed by Up.',
    permissions: ['storage'],
    host_permissions: ['https://api.up.com.au/*'],
    action: { default_title: 'Open UpDeck' },
    icons: Object.fromEntries([16, 32, 48, 128].map((size) => [size, `icons/${size}.png`])),
    background:
      target === 'chrome' ? { service_worker: 'background.js' } : { scripts: ['background.js'] },
    content_security_policy: { extension_pages: csp },
    ...(target === 'chrome'
      ? { minimum_chrome_version: '120' }
      : {
          browser_specific_settings: {
            gecko: {
              id: 'updeck@updeck.local',
              strict_min_version: '142.0',
              data_collection_permissions: {
                required: ['authenticationInfo', 'financialAndPaymentInfo'],
              },
            },
          },
        }),
  };
  await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
}
console.log('UpDeck built: dist/chrome (Chrome, Edge, Brave) and dist/firefox.');
