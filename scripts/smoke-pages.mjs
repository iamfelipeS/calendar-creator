import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import './validate-supabase-env.mjs';

const site = new URL(process.env.SMOKE_URL);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const [projects, assets, branding] = await Promise.all([
  supabase.from('calendar_projects').select('*')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false }).limit(1),
  supabase.from('calendar_team_assets').select('*').order('created_at', { ascending: false }),
  supabase.from('calendar_branding').select('logo_url').order('created_at', { ascending: false }).limit(1),
]);
for (const result of [projects, assets, branding]) {
  assert.ok(!result.error, `Supabase read failed (HTTP ${result.status}).`);
}
assert.ok(projects.data.length, 'No saved calendar exists to validate hydration.');
assert.ok(assets.data.length, 'No persisted shields exist to validate the library.');
const latest = projects.data[0];
const uniqueAssets = [...new Map([...assets.data].reverse().map(row => [row.team_slug, row])).values()];

const browser = await puppeteer.launch({
  executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  await page.setViewport({ width: 1440, height: 1000 });
  const failures = [];
  page.on('pageerror', () => failures.push('Uncaught browser exception'));
  page.on('console', message => {
    if (message.type() === 'error') failures.push('Browser console error');
  });
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.status() >= 400 && (url.origin === site.origin || url.origin === new URL(process.env.VITE_SUPABASE_URL).origin)) {
      failures.push(`HTTP ${response.status()} for ${url.pathname}`);
    }
  });
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === site.origin || url.origin === new URL(process.env.VITE_SUPABASE_URL).origin) {
      failures.push(`Request failed for ${url.pathname}`);
    }
  });
  const response = await page.goto(site.href, { waitUntil: 'networkidle0' });
  assert.equal(response.status(), 200, 'Home document must load.');
  await page.waitForSelector('textarea');
  await page.waitForFunction(({ month, year }) => {
    const inputs = [...document.querySelectorAll('input')].map(input => input.value);
    return inputs.includes(month) && inputs.includes(year);
  }, {}, { month: latest.month, year: latest.year });
  assert.equal(await page.$eval('textarea', node => node.value), latest.matches_text, 'Saved matches must hydrate.');
  console.log('Home, Supabase reads and latest saved calendar: passed.');

  await page.click('a[href="#/escudos"]');
  await page.waitForFunction(() => location.hash === '#/escudos');
  assert.equal(new URL(page.url()).pathname, site.pathname, 'Navigation must preserve the Pages base.');
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Biblioteca de Escudos');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('h1')?.textContent === 'Biblioteca de Escudos');
  const search = 'input[placeholder="Digite nome ou slug"]';
  for (const asset of uniqueAssets) {
    await page.$eval(search, input => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.type(search, asset.team_name);
    await page.waitForFunction(name => [...document.querySelectorAll('article h3')].some(node => node.textContent === name), {}, asset.team_name);
  }
  const imageUrls = [...new Set([
    ...uniqueAssets.map(asset => asset.logo_url),
    ...branding.data.map(row => row.logo_url),
  ].filter(Boolean))];
  const imagesLoaded = await page.evaluate(async urls => Promise.all(urls.map(url => new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => resolve(false), 30000);
    image.onload = () => { clearTimeout(timer); resolve(image.naturalWidth > 0); };
    image.onerror = () => { clearTimeout(timer); resolve(false); };
    image.src = url;
  }))), imageUrls);
  assert.ok(imagesLoaded.every(Boolean), 'Existing upload images must load.');
  await page.click('a[href="#/"]');
  await page.waitForSelector('textarea');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('textarea');
  assert.deepEqual(failures, [], 'No browser errors or failed site/Supabase assets are allowed.');
  console.log(`Library records (${uniqueAssets.length}), upload images (${imageUrls.length}), navigation and refresh: passed.`);
} finally {
  await browser.close();
}
