// Local preview only: never opens contact links or submits a payment.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium, webkit } = await import(process.env.RG_PERF_PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.RG_PERF_PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.RG_PERF_URL || 'http://127.0.0.1:3100';
const output = '/tmp/rg-contact-layout';
await mkdir(output, { recursive: true });

async function verify(browser, widths, engine) {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    if (width === 390 && engine === 'chrome') {
      const retiredPack = await page.request.post(`${base}/api/checkout/service`, { data: { serviceId: 'the_park' } });
      assert.equal(retiredPack.status(), 409, 'Retired duplicate cannot start an outdated checkout');
      assert.equal((await retiredPack.json()).contactUrl, '/services#artist-development');
    }
    await page.goto(`${base}/services`, { waitUntil: 'load' });
    for (const [id, current, previous] of [
      ['custom-production', 250, 350], ['mixing-mastering', 150, 200], ['artist-development', 400, 600],
    ]) {
      const card = page.locator(`#${id}`);
      assert.match(await card.innerText(), new RegExp(`\\$${current} USD`));
      assert.match(await card.locator('del').innerText(), new RegExp(`\\$${previous} USD`));
      const trigger = card.getByRole('button', { name: 'CONSULTAR SERVICIO →' });
      await trigger.click();
      const dialog = page.getByRole('dialog');
      const email = new URL(await dialog.getByRole('link', { name: 'Correo electrónico' }).getAttribute('href'));
      const whatsapp = new URL(await dialog.getByRole('link', { name: 'WhatsApp', exact: true }).getAttribute('href'));
      assert.equal(email.pathname, 'rgodbeat@gmail.com');
      assert.equal(whatsapp.pathname, '/17373067677');
      assert.match(whatsapp.searchParams.get('text'), new RegExp(`\\$${current} USD`));
      assert.equal(whatsapp.searchParams.get('text'), email.searchParams.get('body'));
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await trigger.evaluate(element => document.activeElement === element), true, 'Escape restores focus');
    }
    await page.locator('#mixing-mastering').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/services-${engine}-${width}.png` });
    for (const path of ['/services', '/the-park', '/park', '/beats']) {
      await page.goto(`${base}${path}`, { waitUntil: 'load' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} fits at ${width}px`);
      const layout = await page.evaluate(() => {
        const rect = selector => {
          const node = document.querySelector(selector);
          if (!node || getComputedStyle(node).display === 'none') return null;
          const r = node.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        return { content: rect('.site-content'), left: rect('aside[aria-label="Social Media Links"]'), right: rect('#rg-float-stack'), position: getComputedStyle(document.querySelector('#rg-float-stack')).position };
      });
      if (width >= 1280) {
        assert.ok(layout.left.right < layout.content.left, `${path}: left rail has its own space`);
        assert.ok(layout.right.left > layout.content.right, `${path}: right rail has its own space`);
      } else {
        assert.equal(layout.left, null);
        assert.equal(layout.position, 'static');
        assert.ok(layout.right.top >= layout.content.bottom, 'Compact contacts follow content');
      }
      if (path === '/the-park') {
        const section = page.locator('#the-park');
        assert.match(await section.innerText(), /\$400 USD \/ mes/);
        assert.match(await section.innerText(), /The Park Residency/);
        await section.getByRole('button', { name: 'COMUNICARME →', exact: true }).click();
        await page.screenshot({ path: `${output}/contact-${engine}-${width}.png` });
        await page.getByRole('button', { name: 'Cerrar contacto' }).click();
        await section.getByRole('heading', { name: 'Graba en el estudio', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/park-${engine}-${width}.png` });
      }
      if (path === '/beats') {
        await page.getByRole('button', { name: 'CONSULTAR PROGRAMA' }).click();
        assert.match(await page.getByRole('dialog').innerText(), /Desarrollo artístico/);
        await page.keyboard.press('Escape');
        assert.equal(await page.getByRole('button', { name: 'Activar 30 Días', exact: true }).count(), 1, 'Studio Pro checkout remains');
      }
    }
    if (width >= 1280) {
      await page.setViewportSize({ width, height: 600 });
      await page.evaluate(() => document.documentElement.style.setProperty('--rg-beat-player-height', '104px'));
      const rail = await page.locator('aside[aria-label="Social Media Links"]').boundingBox();
      assert.ok(rail.y >= 80, 'Short window keeps rail below navigation');
      assert.ok(rail.y + rail.height <= 496, 'Short window keeps rail above player');
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${engine} ${width}px: prices, contact choice, focus and unobstructed social rails`);
  }
}

const chrome = await chromium.launch({ channel: 'chrome', headless: true });
try { await verify(chrome, [390, 1024, 1280, 1440, 1920], 'chrome'); }
finally { await chrome.close(); }
if (process.env.RG_TEST_WEBKIT === '1') {
  const safari = await webkit.launch({ headless: true });
  try { await verify(safari, [390, 1440], 'webkit'); }
  finally { await safari.close(); }
}
