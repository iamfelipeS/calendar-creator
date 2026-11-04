// Integration test against compiled frontend. All Supabase traffic is intercepted; no real writes.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
const root = path.resolve('dist/public');
const server = createServer(async (req, res) => {
  try {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/calendar-creator\//, '');
    const file = path.resolve(root, relative || 'index.html');
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 2400 });
  const writes = [], errors = [], queries = [];
  page.on('pageerror', e => errors.push(e.message));
  const results = ['confirmed', 'base_date', 'conditional', 'conflict'].map((status, index) => ({
    id: String(index), date: `2026-11-${String(5 + index).padStart(2, '0')}`, homeTeam: 'Palmeiras', awayTeam: ['Remo', 'Cruzeiro', 'A definir', 'Flamengo'][index],
    kickoffTime: index === 0 ? '19:30' : null, competition: 'Brasileirão', status, confidence: status === 'confirmed' ? 'high' : 'low', note: null,
    sources: [{ source: 'ESPN', date: `2026-11-0${5 + index}`, url: 'https://www.espn.com.br', confirmed: false }],
  }));
  let endpointFailure = false;
  let selectedMonth = 'NOVEMBRO', selectedFormat = 'square';
  await page.setRequestInterception(true);
  page.on('request', async request => {
    const url = new URL(request.url());
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
    if (url.pathname.includes('/functions/v1/sync-palmeiras-fixtures')) {
      if (request.method() === 'OPTIONS') { await request.respond({ status: 204, headers: cors }); return; }
      const query = JSON.parse(request.postData()); queries.push(query);
      await request.respond({ status: endpointFailure ? 503 : 200, headers: cors,
        body: JSON.stringify(endpointFailure ? { error: 'not deployed' } : { ...query, fixtures: results, sourceCounts: { ESPN: 4 },
          sourceErrors: [{ source: 'CONMEBOL', message: 'Consulta indisponível' }], fetchedAt: new Date().toISOString(), timezone: 'America/Sao_Paulo' }) }); return;
    }
    if (url.pathname.includes('/rest/v1/')) {
      if (!['GET', 'OPTIONS'].includes(request.method())) writes.push(request.method() + ' ' + url.pathname);
      let data = [];
      if (url.pathname.endsWith('/calendar_projects')) data = [{ id: 'test', month: selectedMonth, year: '2026', matches: [{ day: 5, homeTeam: 'Palmeiras', awayTeam: 'Vasco', kickoffTime: '16:00' }, { day: 6, homeTeam: 'Palmeiras', awayTeam: 'Remo', kickoffTime: null }, { day: 7, homeTeam: 'Palmeiras', awayTeam: 'Cruzeiro' }], matches_text: '', calendar_format: selectedFormat, visual_settings: null }];
      await request.respond({ status: 200, headers: cors, body: JSON.stringify(data) }); return;
    }
    if (url.hostname === '127.0.0.1' || url.protocol === 'data:') await request.continue(); else await request.abort();
  });

  for (const month of ['NOVEMBRO', 'AGOSTO']) for (const format of ['feedPortrait', 'square', 'story']) {
    selectedMonth = month; selectedFormat = format;
    await page.goto(`http://127.0.0.1:${server.address().port}/calendar-creator/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-kickoff-time]');
    const checks = await page.evaluate(() => {
      const visible = day => [...document.querySelectorAll(`[data-calendar-day="${day}"]`)].find(n => n.getBoundingClientRect().width > 0);
      return [5, 6, 7].map(day => {
        const card = visible(day); const node = card.querySelector('[data-kickoff-time]');
        const c = card.getBoundingClientRect(), t = node?.getBoundingClientRect();
        return { day, text: node?.textContent || '', inside: !t || (t.top >= c.top && t.bottom <= c.bottom && t.left >= c.left && t.right <= c.right),
          rows: card.parentElement.children.length, background: node ? getComputedStyle(node).backgroundColor : null };
      });
    });
    assert.deepEqual(checks.map(c => c.text), ['16:00', 'A DEFINIR', '']);
    assert.ok(checks.every(c => c.inside), JSON.stringify({ month, format, checks }));
    assert.equal(checks[0].background, 'rgba(0, 0, 0, 0)');
    if (month === 'AGOSTO') assert.equal(checks[0].rows, 42);
    const cell = await page.$('[data-calendar-day="5"]');
    const calendar = await cell.evaluateHandle(n => n.parentElement.parentElement);
    await calendar.asElement().screenshot({ path: `/tmp/calendar-${month}-${format}.png` });
    console.log(`${month}/${format}: time, A DEFINIR, legacy and bounds passed`);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
