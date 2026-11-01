import { describe, expect, it } from 'vitest';
import { parsePalmeirasCalendar } from '../supabase/functions/_shared/palmeiras-calendar';
import { discoverPalmeirasFixtures, type Fetcher } from '../supabase/functions/_shared/sources';
import { makeLoaders, syncFixtures } from '../supabase/functions/_shared/sync';
import { verifyWithCBF, verifyWithESPN } from '../supabase/functions/_shared/verification';
import type { SourceFixture } from '../supabase/functions/_shared/contracts';
const query = { month: 11, year: 2026 };
// Semantic HTML fixtures are synthetic representations of the user-observed calendar fields,
// not a captured/validated production DOM.
const card = (id: number, home: string, away: string, date: string, competition: string, time = 'A DEFINIR') =>
  `<article class="fixture"><a href="/jogo/?idjogo=${id}">${home} X ${away}</a><p>${competition}</p><span>${date} | ${time}</span><span class="estadio">Estádio de teste</span><span>Semifinal</span></article>`;
const page = (...cards: string[]) => `<html><body><section id="calendario-completo" data-year="2026"><h2>CALENDÁRIO COMPLETO</h2>${cards.join('')}</section></body></html>`;
const seed = (changes: Partial<SourceFixture> = {}): SourceFixture => ({ source: 'Palmeiras', sourceId: '1', url: 'https://www.palmeiras.com.br/ingressos/', date: '2026-11-18', homeTeam: 'Cruzeiro', awayTeam: 'Palmeiras', competition: 'Brasileirão', confirmed: false, conditional: false, ...changes });
const cbf = (day = '18', time = '19:30') => new Response(JSON.stringify({ jogos: { 'Campeonato Brasileiro': { 'Série A': [{ id_jogo: 1, data: `${day}/11/2026`, hora: time, mandante: { nome: 'Cruzeiro' }, visitante: { nome: 'Palmeiras' } }] } } }));
const espn = (day = '18') => new Response(JSON.stringify({ events: [{ id: 2, competitions: [{ date: `2026-11-${day}T22:30:00Z`, competitors: [
  { homeAway: 'home', team: { displayName: 'Cruzeiro' } }, { homeAway: 'away', team: { displayName: 'Palmeiras' } },
] }] }] }));
const discoveryPage = page(card(1, 'Cruzeiro', 'Palmeiras', '18/11', 'Brasileirão Série A 2026'));
async function run(overrides: { cbf?: Fetcher; espn?: Fetcher; html?: string } = {}) {
  const requests: string[] = [];
  const fetcher: Fetcher = async (url, init) => {
    requests.push(url);
    if (url.includes('palmeiras.com.br')) return new Response(overrides.html || discoveryPage);
    if (url.includes('cbf.com.br')) return overrides.cbf ? overrides.cbf(url, init) : cbf();
    if (url.includes('espn.com')) return overrides.espn ? overrides.espn(url, init) : espn();
    throw new Error('Unexpected host');
  };
  const result = await syncFixtures(query, makeLoaders(undefined, { Palmeiras: fetcher, CBF: fetcher, ESPN: fetcher, CONMEBOL: fetcher }), () => {});
  return { result, requests };
}
describe('discovery + verification architecture', () => {
  it('extracts official calendar cards, year context, phase, venue and kickoff without confirming discovery', () => {
    const parsed = parsePalmeirasCalendar(page(
      card(1, 'Palmeiras', 'Vasco da Gama', '01/11', 'Copa do Brasil', '16H00'),
      card(2, 'Palmeiras', 'Remo', '05/11', 'Brasileirão Série A 2026', '19H30'),
      card(3, 'Cruzeiro', 'Palmeiras', '18/11', 'Brasileirão Série A 2026'),
    ), 'https://www.palmeiras.com.br/ingressos/', query);
    expect(parsed.coverage).toBe('calendar'); expect(parsed.fixtures).toHaveLength(3);
    expect(parsed.fixtures[0]).toMatchObject({ date: '2026-11-01', awayTeam: 'Vasco', kickoffTime: '16:00', confirmed: false, phase: 'Semifinal', venue: 'Estádio de teste' });
    expect(parsed.fixtures[2]).toMatchObject({ date: '2026-11-18', kickoffTime: null, conditional: false });
    expect(parsed.fixtures[2].note).toContain('Horário a definir');
  });
  it('does not extract news or infer an unknown year from the requested year', () => {
    const html = `<section class="noticias-relacionadas">${discoveryPage}</section>`;
    expect(parsePalmeirasCalendar(html, 'https://www.palmeiras.com.br', query).fixtures).toEqual([]);
    const noYear = `<section id="calendario-completo">${card(1, 'Palmeiras', 'Vasco', '01/11', 'Copa do Brasil')}</section>`;
    const parsed = parsePalmeirasCalendar(noYear, 'https://www.palmeiras.com.br', query);
    expect(parsed.fixtures).toEqual([]); expect(parsed.warnings.join()).toContain('sem ano');
  });
  it('does not leak fixtures from another queried year/month into discovery', () => {
    expect(parsePalmeirasCalendar(discoveryPage, 'https://www.palmeiras.com.br', { month: 10, year: 2026 }).fixtures).toEqual([]);
    expect(parsePalmeirasCalendar(discoveryPage, 'https://www.palmeiras.com.br', { month: 11, year: 2025 }).fixtures).toEqual([]);
  });
  it('does one calendar request followed by punctual authority and secondary requests', async () => {
    const { result, requests } = await run();
    expect(requests).toHaveLength(3); expect(requests[0]).toContain('/ingressos/');
    expect(requests[1]).toContain('/2026/11/18'); expect(requests[2]).toContain('dates=20261118');
    expect(result).toMatchObject({ discoverySource: 'Palmeiras', discoveryFallback: false, discoveryCount: 1, discoveryCoverage: 'calendar' });
    expect(result.fixtures[0]).toMatchObject({ status: 'confirmed', confidence: 'high' });
    expect(result.fixtures[0].sources.map(s => s.source)).toEqual(['CBF', 'Palmeiras', 'ESPN']);
  });
  it('keeps A DEFINIR as base_date with medium confidence for Palmeiras + ESPN without CBF', async () => {
    const { result, requests } = await run({ cbf: async () => new Response('', { status: 503 }) });
    expect(result.fixtures[0]).toMatchObject({ status: 'base_date', confidence: 'medium' });
    expect(result.sourceErrors.some(e => e.source === 'CBF')).toBe(true);
    expect(requests).toHaveLength(3); // do not multiply a known-date network failure into a date sweep
  });
  it('finds a shifted CBF date nearby and preserves a conflict rather than overriding discovery silently', async () => {
    const { result, requests } = await run({ cbf: async url => url.endsWith('/19') ? cbf('19') : new Response('{"jogos":{}}'), espn: async () => espn('19') });
    expect(result.fixtures[0]).toMatchObject({ date: '2026-11-19', status: 'conflict', confidence: 'low' });
    expect(result.fixtures[0].sources.map(s => s.date)).toEqual(['2026-11-19', '2026-11-18', '2026-11-19']);
    expect(requests.filter(u => u.includes('cbf.com.br'))).toHaveLength(3);
    expect(requests.find(u => u.includes('espn.com'))).toContain('dates=20261119');
  });
  it('falls back explicitly when Palmeiras fails, while ESPN uses only individual dates', async () => {
    const { result, requests } = await run({ html: '<html><body>Fonte sem calendário reconhecido</body></html>' });
    expect(result.discoveryFallback).toBe(true); expect(result.discoverySource).toBe('fallback');
    expect(result.sourceErrors.some(e => e.source === 'Palmeiras' && /fallback/.test(e.message))).toBe(true);
    const urls = requests.filter(u => u.includes('espn.com'));
    expect(urls.length).toBeGreaterThan(0);
    for (const value of urls) { const url = new URL(value); expect(url.searchParams.get('dates')).toMatch(/^\d{8}$/); expect(url.searchParams.has('limit')).toBe(false); }
  });
  it('treats upcoming-only discovery as incomplete and activates fallback', async () => {
    const html = `<section class="proximas-partidas" data-year="2026">${card(1, 'Cruzeiro', 'Palmeiras', '18/11', 'Brasileirão Série A 2026')}</section>`;
    const { result } = await run({ html });
    expect(result.discoveryCoverage).toBe('upcoming_only'); expect(result.discoveryFallback).toBe(true);
  });
  it('supports historical discovery when the full calendar actually exposes historical cards', async () => {
    const calls: string[] = [];
    const result = await discoverPalmeirasFixtures({ month: 9, year: 2026 }, async url => { calls.push(url); return new Response(page(card(1, 'Santos', 'Palmeiras', '02/09', 'Copa do Brasil'))); });
    expect(calls).toHaveLength(1); expect(result.fixtures[0].date).toBe('2026-09-02');
  });
  it('queries CONMEBOL only for discovered Libertadores fixtures and preserves secondary-only confidence', async () => {
    const html = page(card(9, 'Cruzeiro', 'Palmeiras', '18/11', 'CONMEBOL Libertadores 2026'));
    const { result, requests } = await run({ html });
    expect(requests.some(u => u.includes('cbf.com.br'))).toBe(false);
    expect(result.sourceErrors.some(e => e.source === 'CONMEBOL')).toBe(true);
    expect(result.fixtures[0]).toMatchObject({ competition: 'Libertadores', status: 'base_date', confidence: 'medium' });
    expect(result.fixtures[0].sources.map(s => s.source)).not.toContain('CONMEBOL');
  });
  it('deduplicates CBF requests for games on the same day and limits concurrency', async () => {
    const calls: string[] = []; let active = 0, maximum = 0;
    const fetcher: Fetcher = async url => { calls.push(url); active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--; return cbf(); };
    await verifyWithCBF(query, [seed(), seed({ sourceId: 'duplicate' })], fetcher);
    expect(calls).toHaveLength(1); expect(maximum).toBeLessThanOrEqual(4);
  });
  it('falls back when all official Palmeiras pages return HTTP errors', async () => {
    const requests: string[] = [];
    const fetcher: Fetcher = async url => {
      requests.push(url);
      if (url.includes('palmeiras.com.br')) return new Response('', { status: 503 });
      if (url.includes('cbf.com.br')) return cbf();
      return espn();
    };
    const result = await syncFixtures(query, makeLoaders(undefined, { Palmeiras: fetcher, CBF: fetcher, ESPN: fetcher }), () => {});
    expect(result.discoveryFallback).toBe(true);
    expect(result.fixtures.some(f => f.sources.some(s => s.source === 'CBF'))).toBe(true);
    expect(requests.filter(u => u.includes('palmeiras.com.br'))).toHaveLength(4);
  });
  it('reuses the known date cache while actually limiting multiple concurrent CBF requests', async () => {
    let active = 0, maximum = 0; const requests: string[] = [];
    const fetcher: Fetcher = async url => {
      requests.push(url); active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--;
      return cbf(url.slice(-2));
    };
    const seeds = Array.from({ length: 8 }, (_, i) => seed({ sourceId: String(i), date: `2026-11-${String(i + 10).padStart(2, '0')}` }));
    await verifyWithCBF(query, [...seeds, seeds[0]], fetcher);
    expect(requests).toHaveLength(8); expect(maximum).toBe(4);
  });
  it('preserves a cross-month official date found by the punctual verification window', async () => {
    const original = seed({ date: '2026-11-01' });
    const verified = await verifyWithCBF(query, [original], async url => url.endsWith('/2026/10/31') ? new Response(JSON.stringify({ jogos: {
      'Campeonato Brasileiro': { 'Série A': [{ id_jogo: 1, data: '31/10/2026', hora: '19:30', mandante: { nome: 'Cruzeiro' }, visitante: { nome: 'Palmeiras' } }] },
    } })) : new Response('{"jogos":{}}'));
    expect(verified.fixtures[0].date).toBe('2026-10-31');
  });
  it('ESPN never sends ranges and queries only the seed competition', async () => {
    const calls: string[] = [];
    await verifyWithESPN(query, [seed()], async url => { calls.push(url); return espn(); });
    expect(calls).toHaveLength(1); const url = new URL(calls[0]);
    expect(url.pathname).toContain('/bra.1/'); expect(url.searchParams.get('dates')).toBe('20261118');
  });
  it('does not confirm a known date solely because CBF has no detailed kickoff', async () => {
    const { result } = await run({ cbf: async () => cbf('18', '') });
    expect(result.fixtures[0]).toMatchObject({ status: 'base_date', confidence: 'medium' });
  });
});
