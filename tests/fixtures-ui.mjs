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
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 1000 });
  const writes = [], errors = [], queries = [];
  page.on('pageerror', e => errors.push(e.message));
  const results = ['confirmed', 'base_date', 'conditional', 'conflict'].map((status, index) => ({
    id: String(index), date: `2026-11-${String(5 + index).padStart(2, '0')}`, homeTeam: 'Palmeiras', awayTeam: ['Remo', 'Cruzeiro', 'A definir', 'Flamengo'][index],
    competition: 'Brasileirão', status, confidence: status === 'confirmed' ? 'high' : 'low', note: null,
    sources: [{ source: 'ESPN', date: `2026-11-0${5 + index}`, url: 'https://www.espn.com.br', confirmed: false }],
  }));
  let endpointFailure = false;
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
      if (url.pathname.endsWith('/calendar_projects')) data = [{ id: 'test', month: 'NOVEMBRO', year: '2026', matches: [], matches_text: '05 - Palmeiras x Remo', calendar_format: 'square', visual_settings: null }];
      await request.respond({ status: 200, headers: cors, body: JSON.stringify(data) }); return;
    }
    if (url.hostname === '127.0.0.1' || url.protocol === 'data:') await request.continue(); else await request.abort();
  });
  const click = async text => {
    const button = await page.evaluateHandle(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label), text);
    assert.ok(button.asElement(), `Button: ${text}`); await button.asElement().click(); await button.dispose();
  };
  await page.goto(`http://127.0.0.1:${server.address().port}/calendar-creator/`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('textarea');
  await click('Buscar jogos automaticamente'); await click('Buscar jogos');
  await page.waitForSelector('article input[type=checkbox]');
  assert.deepEqual(await page.$$eval('article input[type=checkbox]', nodes => nodes.map(n => n.checked)), [true, true, false, false]);
  assert.deepEqual(queries[0], { month: 11, year: 2026 });
  await click('Importar selecionados (2)'); await click('Cancelar');
  assert.equal(await page.$eval('textarea', n => n.value), '05 - Palmeiras x Remo');
  await click('Importar selecionados (2)'); await click('Adicionar aos jogos existentes');
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
  assert.equal(await page.$eval('textarea', n => n.value), '05 - Palmeiras x Remo\n06 - Palmeiras x Cruzeiro');
  assert.ok(await page.evaluate(() => document.body.textContent.includes('Alteracoes nao salvas')));
  await click('Buscar jogos automaticamente'); await click('Buscar jogos');
  await page.waitForSelector('article input[type=checkbox]');
  await click('Importar selecionados (2)'); await click('Substituir partidas atuais');
  await page.waitForFunction(() => !document.querySelector('[role=dialog]'));
  endpointFailure = true;
  await click('Buscar jogos automaticamente'); await click('Buscar jogos');
  await page.waitForSelector('[role=alert]');
  assert.match(await page.$eval('[role=alert]', n => n.textContent), /função sync-palmeiras-fixtures/);
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  console.log('UI (mocked backend): default selection, period, cancel, append deduplication, replace, unsaved state, endpoint failure and zero Supabase writes: passed.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
