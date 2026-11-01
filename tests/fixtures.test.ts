import { describe, expect, it, vi } from 'vitest';
import type { SourceFixture, FixtureSource, ConsolidatedFixture } from '../supabase/functions/_shared/contracts';
import { canonicalTeam, competitionFrom, localDate } from '../supabase/functions/_shared/normalize';
import { reconcileFixtures } from '../supabase/functions/_shared/reconcile';
import { parseCBF, parseESPN, parsePalmeirasHTML, parseSportsEvents, fetchCBFFixtures, fetchSecondaryFixtures, fetchConmebolFixtures } from '../supabase/functions/_shared/sources';
import { syncFixtures, type SourceLoader } from '../supabase/functions/_shared/sync';
import { createHandler } from '../supabase/functions/sync-palmeiras-fixtures/handler';
import { importFixturesText } from '../client/src/lib/fixture-import';
const query = { year: 2026, month: 11 };
const row = (changes: Partial<SourceFixture> = {}): SourceFixture => ({ source: 'CBF', sourceId: 'a', url: 'https://www.cbf.com.br',
  date: '2026-11-05', homeTeam: 'Palmeiras', awayTeam: 'Remo', competition: 'Brasileirão', confirmed: true, conditional: false, ...changes });
const fixture = (changes: Partial<SourceFixture> = {}) => reconcileFixtures([row(changes)], query)[0];
const loaders = (): Record<FixtureSource, SourceLoader> => Object.fromEntries(['CBF', 'CONMEBOL', 'Palmeiras', 'ESPN'].map(source => [source,
  async () => ({ source, fixtures: [], warnings: [] })])) as Record<FixtureSource, SourceLoader>;

describe('normalization', () => {
  it('uses Brazilian calendar date for UTC kickoffs and validates dates', () => {
    expect(localDate('2026-11-06T01:00:00Z')).toBe('2026-11-05');
    expect(localDate('2026-11-06T00:00:00')).toBeNull();
    expect(localDate('2026-02-30')).toBeNull();
    expect(localDate('05/11/2026')).toBe('2026-11-05');
  });
  it('normalizes known aliases and excludes youth/women competitions', () => {
    expect(canonicalTeam('LDU')).toBe('LDU Quito');
    expect(canonicalTeam('Athletico-PR')).toBe('Athletico Paranaense');
    expect(canonicalTeam('Palmeiras-SP')).toBe('Palmeiras');
    expect(competitionFrom('Copa do Brasil Sub-20')).toBeNull();
    expect(competitionFrom('Brasileiro Feminino')).toBeNull();
    expect(competitionFrom('Campeonato Brasileiro Série B')).toBeNull();
  });
});
describe('reconciliation', () => {
  it('confirms CBF only for its competitions', () => {
    expect(fixture().status).toBe('confirmed'); expect(fixture().confidence).toBe('high');
    expect(fixture({ competition: 'Libertadores' }).status).toBe('base_date');
    expect(fixture({ competition: 'Libertadores', source: 'CONMEBOL' }).status).toBe('confirmed');
  });
  it('does not confirm secondary-only or undetailed official data', () => {
    expect(fixture({ source: 'ESPN' })).toMatchObject({ status: 'base_date', confidence: 'low' });
    expect(fixture({ confirmed: false }).status).toBe('base_date');
    expect(reconcileFixtures([row({ source: 'Palmeiras', confirmed: false }), row({ source: 'ESPN', confirmed: false })], query)[0])
      .toMatchObject({ status: 'base_date', confidence: 'medium' });
  });
  it('preserves authority date but marks disagreements as low-confidence conflict', () => {
    const result = reconcileFixtures([row({ source: 'Palmeiras', date: '2026-11-04' }), row()], query)[0];
    expect(result).toMatchObject({ date: '2026-11-05', status: 'conflict', confidence: 'low' });
    expect(result.sources).toHaveLength(2);
  });
  it('preserves conditional evidence and never confirms it', () => {
    expect(fixture({ conditional: true })).toMatchObject({ status: 'conditional', confidence: 'low' });
  });
  it('keeps competitions, repeated fixtures, rounds, and reversed legs separate', () => {
    expect(reconcileFixtures([row(), row({ sourceId: 'b', competition: 'Copa do Brasil' }), row({ sourceId: 'c', date: '2026-11-25' })], query)).toHaveLength(3);
    expect(reconcileFixtures([row({ round: '1' }), row({ round: '2', source: 'ESPN' })], query)).toHaveLength(2);
    expect(reconcileFixtures([row(), row({ homeTeam: 'Remo', awayTeam: 'Palmeiras' })], query)).toHaveLength(2);
  });
  it('deduplicates identical source records, excludes unrelated teams and filters month', () => {
    expect(reconcileFixtures([row(), row(), row({ homeTeam: 'Santos', awayTeam: 'Remo' }), row({ date: '2026-12-05' })], query)).toHaveLength(1);
  });
  it('retains a cross-month disagreement without silently importing the wrong month', () => {
    const f = reconcileFixtures([row({ date: '2026-10-31' }), row({ source: 'ESPN', date: '2026-11-01' })], query)[0];
    expect(f.status).toBe('conflict');
    expect(() => importFixturesText('', [f], query, 'replace')).toThrow(/fora do mês/);
  });
});
describe('source parsers (synthetic responses, not live validation)', () => {
  it('reads nested CBF daily JSON and distinguishes detailed from base dates', () => {
    const game = { id_jogo: 1, data: '05/11/2026', hora: '19:30', mandante: { nome: 'Palmeiras-SP' }, visitante: { nome: 'Remo' } };
    const result = parseCBF({ jogos: { 'Campeonato Brasileiro': { 'Série A': [game], 'Sub-20': [game] } } }, '2026-11-05', 'https://www.cbf.com.br');
    expect(result).toHaveLength(1); expect(result[0].confirmed).toBe(true);
    expect(parseCBF({ jogos: { 'Copa do Brasil': { Profissional: [{ ...game, hora: '' }] } } }, game.data, 'https://www.cbf.com.br')[0].confirmed).toBe(false);
    expect(() => parseCBF({}, game.data, '')).toThrow();
  });
  it('reads ESPN competitors and skips canceled matches', () => {
    const game = { date: '2026-11-06T01:00:00Z', competitors: [
      { homeAway: 'home', team: { displayName: 'Palmeiras' } }, { homeAway: 'away', team: { displayName: 'Remo' } }], status: { type: { name: 'STATUS_SCHEDULED' } } };
    expect(parseESPN({ events: [{ id: '1', competitions: [game] }] }, 'Brasileirão', 'https://site.api.espn.com')[0]).toMatchObject({ date: '2026-11-05', confirmed: false });
    game.status.type.name = 'STATUS_POSTPONED';
    expect(parseESPN({ events: [{ competitions: [game] }] }, 'Brasileirão', '')).toHaveLength(0);
  });
  it('parses JSON-LD SportsEvent graphs with explicit participants', () => {
    const html = `<script type="application/ld+json">${JSON.stringify({ '@graph': [{ '@type': 'SportsEvent', name: 'CONMEBOL Libertadores',
      startDate: '2026-11-28T17:00:00-03:00', homeTeam: { name: 'Palmeiras' }, awayTeam: { name: 'A definir' } }] })}</script>`;
    expect(parseSportsEvents(html, 'CONMEBOL', 'https://gol.conmebol.com')[0]).toMatchObject({ conditional: true, confirmed: true });
    expect(parseSportsEvents('<p>Palmeiras final 28/11</p>', 'CONMEBOL', '')).toEqual([]);
  });
  it('reads Palmeiras semantic cards but never treats it as competition authority', () => {
    const html = '<div>Brasileirão Série A 2026 | 05/11/2026 | 19H30</div><p>Palmeiras X Remo</p>';
    expect(parsePalmeirasHTML(html, 'https://www.palmeiras.com.br')[0]).toMatchObject({ homeTeam: 'Palmeiras', awayTeam: 'Remo', confirmed: false });
  });
  it('isolates daily CBF failures and bounds concurrency', async () => {
    let active = 0, maximum = 0;
    const mock = vi.fn(async (url: string) => {
      active++; maximum = Math.max(maximum, active); await Promise.resolve(); active--;
      if (url.endsWith('/01')) return new Response('', { status: 500 });
      return new Response(JSON.stringify({ jogos: {} }));
    });
    const r = await fetchCBFFixtures(query, mock);
    expect(mock).toHaveBeenCalledTimes(30); expect(maximum).toBeLessThanOrEqual(6); expect(r.warnings).toHaveLength(1);
  });
  it('isolates ESPN competition failures', async () => {
    const r = await fetchSecondaryFixtures(query, async url => url.includes('bra.1') ? new Response('{"events":[]}') : new Response('', { status: 500 }));
    expect(r.warnings).toHaveLength(2);
  });
  it('does not use an invented CONMEBOL API or arbitrary URLs', async () => {
    const fetcher = vi.fn();
    await expect(fetchConmebolFixtures(query, fetcher)).rejects.toThrow(/validado/);
    await expect(fetchConmebolFixtures(query, fetcher, 'https://evil.example/fixtures')).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
describe('orchestration and HTTP', () => {
  it('returns surviving sources and sanitizes failed-source errors', async () => {
    const l = loaders(); l.CBF = async () => { throw new Error('secret-token-do-not-expose'); };
    l.ESPN = async () => ({ source: 'ESPN', fixtures: [row({ source: 'ESPN', confirmed: false })], warnings: [] });
    const log = vi.fn(); const result = await syncFixtures(query, l, log);
    expect(result.fixtures).toHaveLength(1); expect(result.sourceErrors.some(e => e.source === 'CBF')).toBe(true);
    expect(JSON.stringify(result) + JSON.stringify(log.mock.calls)).not.toContain('secret-token');
  });
  it('checks CORS origin (not pathname), preflight, methods and invalid input', async () => {
    const handler = createHandler(loaders());
    const req = (origin: string, body: string, method = 'POST') => new Request('https://example.com', { method, headers: { origin }, ...(method === 'POST' ? { body } : {}) });
    const response = await handler(req('https://iamfelipes.github.io', JSON.stringify(query)));
    expect(response.status).toBe(200); expect(response.headers.get('access-control-allow-origin')).toBe('https://iamfelipes.github.io');
    expect((await handler(req('http://localhost:5173', '', 'OPTIONS'))).status).toBe(204);
    expect((await handler(req('https://iamfelipes.github.io.evil.example', '{}'))).status).toBe(403);
    expect((await handler(req('https://iamfelipes.github.io', '{'))).status).toBe(400);
    expect((await handler(req('https://iamfelipes.github.io', '{"month":13,"year":2026}'))).status).toBe(400);
    expect((await handler(req('https://iamfelipes.github.io', '', 'GET'))).status).toBe(405);
  });
});
describe('human-reviewed import', () => {
  it('deduplicates using canonical names and preserves names associated with existing shields', () => {
    const f = fixture({ awayTeam: 'Athletico-PR' });
    expect(importFixturesText('05 - Palmeiras x Athletico Paranaense', [f], query, 'append')).toBe('05 - Palmeiras x Athletico Paranaense');
    expect(importFixturesText('', [f], query, 'replace', ['Athletico-PR'])).toBe('05 - Palmeiras x Athletico-PR');
  });
  it('does not drop unparsed current lines when appending', () => {
    expect(importFixturesText('revisar partida manual', [fixture()], query, 'append')).toContain('revisar partida manual\n05 - Palmeiras x Remo');
  });
  it('does not mutate original result objects', () => {
    const f = fixture(); const snapshot = JSON.stringify(f); importFixturesText('', [f], query, 'replace'); expect(JSON.stringify(f)).toBe(snapshot);
  });
});
// User-provided reference lists exercise import format only. They are deliberately NOT production data
// and passing these tests does NOT mean that any source returned or confirmed these historical matches.
const historicalReferences: Record<number, [number, string, string][]> = {
  9: [[2, 'Santos', 'Palmeiras'], [6, 'Botafogo', 'Palmeiras'], [9, 'Palmeiras', 'LDU Quito'], [12, 'Palmeiras', 'São Paulo'], [16, 'LDU Quito', 'Palmeiras'], [19, 'Grêmio', 'Palmeiras']],
  10: [[8, 'Palmeiras', 'Bahia'], [11, 'Palmeiras', 'Corinthians'], [14, 'Fluminense', 'Palmeiras'], [17, 'Athletico-PR', 'Palmeiras'], [21, 'Palmeiras', 'Fluminense'], [24, 'Palmeiras', 'Red Bull Bragantino'], [28, 'Santos', 'Palmeiras']],
};
for (const month of [9, 10]) it(`formats the user-supplied ${month}/2026 reference list (not a live-source test)`, () => {
  const fixtures = historicalReferences[month].map(([day, homeTeam, awayTeam], i) => ({
    id: String(i), date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, homeTeam, awayTeam,
    competition: 'Brasileirão', status: 'base_date', confidence: 'low', sources: [], note: null,
  } as ConsolidatedFixture));
  const text = importFixturesText('', fixtures, { year: 2026, month }, 'replace');
  expect(text.split('\n')).toHaveLength(historicalReferences[month].length);
  expect(text.split('\n').map(l => Number(l.slice(0, 2)))).toEqual(historicalReferences[month].map(r => r[0]));
});
