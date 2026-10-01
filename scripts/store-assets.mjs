// Renders store screenshots and promo tiles from the real built app with sample data.
// Usage: npm run build && node scripts/store-assets.mjs
// Output: release/store/ (1280x800 screenshots, 440x280 and 1400x560 tiles, 128px icon).
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import sharp from 'sharp';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const out = 'release/store';
await rm(out, { recursive: true, force: true });
await mkdir(`${out}/screenshots`, { recursive: true });
await mkdir(`${out}/tiles`, { recursive: true });

const server = await preview({
  build: { outDir: 'dist/web' },
  preview: { port: 4173, strictPort: true, host: '127.0.0.1' },
  logLevel: 'silent',
});
const origin = 'http://127.0.0.1:4173';

/** Captures at 2x, then downsamples so text stays sharp at the store's exact size. */
async function save(buffer, file, width, height) {
  await sharp(buffer).resize(width, height, { kernel: 'lanczos3' }).png().toFile(file);
}
async function shoot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await save(await page.screenshot(), `${out}/screenshots/${name}.png`, 1280, 800);
}
const scrollTo = (page, selector, offset = 24) =>
  page.evaluate(
    ([sel, off]) => {
      const el = document.querySelector(sel);
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - off });
    },
    [selector, offset],
  );

const browser = await chromium.launch();
try {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(origin);
    await page.locator('.balance-card').waitFor();
    if (scheme === 'light') {
      await shoot(page, '1-overview');
      await page.getByRole('button', { name: 'Insights', exact: true }).click();
      await page.locator('.safe-card').waitFor();
      await shoot(page, '2-insights-payday');
      await scrollTo(page, '#subscriptions-title');
      await shoot(page, '3-insights-subscriptions');
      await page.getByRole('button', { name: 'Transactions', exact: true }).click();
      await page.getByRole('button', { name: 'View Uber Eats transaction' }).first().click();
      await page.locator('.transaction-page h1').waitFor();
      await shoot(page, '4-transaction');
    } else {
      await page.getByRole('button', { name: 'Insights', exact: true }).click();
      await scrollTo(page, '#changed-title');
      await shoot(page, '5-what-changed-dark');
    }
    if (scheme === 'light') {
      // Tiles reuse the app's own fonts and colours.
      await page.goto(origin);
      await page.locator('.balance-card').waitFor();
      const overview = (await sharp(`${out}/screenshots/1-overview.png`).png().toBuffer()).toString(
        'base64',
      );
      for (const [name, width, height] of [
        ['small-promo-440x280', 440, 280],
        ['marquee-1400x560', 1400, 560],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          ({ width, height, image }) => {
            const wide = width > 600;
            document.body.innerHTML = `
            <div class="tile" style="width:${width}px;height:${height}px">
              <div class="tile-copy">
                <div class="brand tile-brand"><span class="brand-mark"><span></span><span></span><span></span></span>UpDeck</div>
                <p class="tile-line">Payday, subscriptions and spending for Up, worked out on your device.</p>
                <p class="tile-meta">Unofficial · Free · Open source</p>
              </div>
              ${wide ? `<img class="tile-shot" src="data:image/png;base64,${image}" alt="">` : ''}
            </div>`;
            const style = document.createElement('style');
            style.textContent = `
              body { margin: 0; background: #1d4527; }
              .tile { box-sizing: border-box; display: flex; align-items: center; gap: 48px; overflow: hidden;
                padding: ${wide ? '0 0 0 72px' : '0 32px'}; color: #fff;
                background: radial-gradient(120% 140% at 0% 0%, #2e6b3c 0%, #1d4527 60%, #163a20 100%); }
              .tile-copy { flex: ${wide ? '0 0 470px' : '1'}; }
              .tile-brand { color: #fff; font-size: ${wide ? 46 : 32}px; gap: 14px; }
              .tile-brand .brand-mark span { background: #d4f09a !important; }
              .tile-brand .brand-mark span:nth-child(2) { background: #8fd19e !important; }
              .tile-brand .brand-mark span:nth-child(3) { background: #fff !important; }
              .tile-line { margin: ${wide ? 22 : 14}px 0 0; font-size: ${wide ? 26 : 18}px; line-height: 1.3;
                font-family: 'Fraunces Variable', Georgia, serif; }
              .tile-meta { margin: ${wide ? 18 : 12}px 0 0; font-size: ${wide ? 17 : 13}px; color: #cfe3c9; }
              .tile-shot { height: 470px; margin-top: 130px; border-radius: 14px 0 0 0;
                box-shadow: 0 24px 80px #0008; }`;
            document.head.append(style);
          },
          { width, height, image: overview },
        );
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(200);
        await save(await page.screenshot(), `${out}/tiles/${name}.png`, width, height);
      }
    }
    await context.close();
  }

  // The connect screen only exists inside the installed extension.
  const profile = await mkdtemp(join(tmpdir(), 'updeck-store-'));
  const extension = resolve('dist/chrome');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
    await page.getByRole('heading', { level: 1, name: 'Connect Up' }).waitFor();
    await shoot(page, '6-connect');
  } finally {
    await context.close();
    await rm(profile, { recursive: true, force: true });
  }
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(done));
}
// Store icon: 96px artwork inside 16px of transparent padding, per Chrome's image guidelines.
await sharp('scripts/icon.svg', { density: 300 })
  .resize(96, 96)
  .extend({ top: 16, bottom: 16, left: 16, right: 16, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(`${out}/icon-128.png`);
await sharp('scripts/icon.svg', { density: 300 })
  .resize(300, 300)
  .png()
  .toFile(`${out}/icon-300.png`);
console.log(`Store assets written to ${out}/`);
