import { describe, expect, it } from 'vitest';
import { compareReferences, renderReport, validateAllSources, validateMonth } from '../scripts/fixture-live-validation';
import type { Fetcher } from '../supabase/functions/_shared/sources';
const query = { month: 9, year: 2026 };
const event = { '@type': 'SportsEvent', name: 'Brasileirão 2026', startDate: '2026-09-06T16:00:00-03:00',
  homeTeam: { name: 'Botafogo' }, awayTeam: { name: 'Palmeiras' } };
const html = `<section id="calendario-completo"><h2>CALENDÁRIO COMPLETO</h2><script type="application/ld+json">${JSON.stringify(event)}</script></section>`;
const fetcher: Fetcher = async input => {
  const url = new URL(input);
  if (url.hostname === 'www.cbf.com.br') return new Response(JSON.stringify({ jogos: url.pathname.endsWith('/06') ? {
    'Campeonato Brasileiro': { 'Série A': [{ id_jogo: 1, data: '06/09/2026', hora: '16:00', rodada: 26,
      mandante: { nome: 'Botafogo' }, visitante: { nome: 'Palmeiras' } }] },
  } : {} }));
  if (url.hostname === 'site.api.espn.com') return new Response(JSON.stringify({ events: url.pathname.includes('bra.1/') ? [{
    id: 2, competitions: [{ date: '2026-09-06T19:00:00Z', status: { type: { name: 'STATUS_SCHEDULED' } }, competitors: [
      { homeAway: 'home', team: { displayName: 'Botafogo' } }, { homeAway: 'away', team: { displayName: 'Palmeiras' } },
    ] }],
  }] : [] }));
  if (url.hostname === 'www.palmeiras.com.br') return new Response(html);
  throw new Error('Unexpected test URL');
};
describe('live validator, with injected synthetic responses only', () => {
  it('runs production adapters, audits punctual CBF/ESPN verification after discovery and tolerates missing CONMEBOL', async () => {
    const report = await validateMonth(query, fetcher);
    expect(report.criticalErrors).toEqual([]);
    expect(report.sources.find(s => s.source === 'CBF')).toMatchObject({ daysConsulted: 1, successfulDays: 1, extracted: 1, state: 'ok' });
    const espn = report.sources.find(s => s.source === 'ESPN')!;
    expect(espn.requests.map(r => r.target).sort()).toEqual(['bra.1 20260906']);
    expect(espn.requests.find(r => r.target === 'bra.1 20260906')).toMatchObject({ httpStatus: 200, events: 1, extracted: 1 });
    expect(report.sources.find(s => s.source === 'Palmeiras')?.requests[0]).toMatchObject({ jsonLdFound: true, compatibleJsonLd: 1, usedHtmlFallback: false });
    expect(report.sources.find(s => s.source === 'CONMEBOL')).toMatchObject({ state: 'not_configured', requests: [] });
    expect(report.warnings).toContain('CONMEBOL: integração oficial ainda não configurada');
    expect(report.consolidated[0]).toMatchObject({ date: '2026-09-06', status: 'confirmed', confidence: 'high' });
    expect(report.comparison[1]).toMatchObject({ found: true, dateMatches: true });
    expect(report.comparison[0].found).toBe(false);
  });
  it('detects malformed CBF structure even when the production adapter would silently ignore that category', async () => {
    const report = await validateMonth(query, (url, init) => url.includes('www.cbf.com.br')
      ? Promise.resolve(new Response('{"jogos":{"Brasileirão":{"Série A":{}}}}')) : fetcher(url, init));
    expect(report.sources.find(s => s.source === 'CBF')?.state).toBe('incompatible');
    expect(report.criticalErrors.join(' ')).toContain('formato real incompatível');
  });
  it('does not make an HTTP failure or mismatched historical reference critical when another official source works', async () => {
    const report = await validateMonth(query, (url, init) => url.includes('cbf.com.br')
      ? Promise.resolve(new Response('', { status: 503 })) : fetcher(url, init));
    expect(report.sources.find(s => s.source === 'CBF')?.state).toBe('unavailable');
    expect(report.criticalErrors).toEqual([]);
    expect(report.consolidated[0]).toMatchObject({ status: 'base_date', confidence: 'medium' });
  });
  it('fails when only ESPN is accessible and never promotes it to authority', async () => {
    const report = await validateMonth(query, (url, init) => url.includes('site.api.espn.com')
      ? fetcher(url, init) : Promise.resolve(new Response('', { status: 403 })));
    expect(report.criticalErrors.join(' ')).toContain('Nenhuma fonte principal');
    expect(report.consolidated[0]).toMatchObject({ status: 'base_date', confidence: 'low' });
  });
  it('marks unexpected ESPN envelopes as incompatible and produces a report without raw response contents', async () => {
    const report = await validateMonth(query, (url, init) => url.includes('site.api.espn.com')
      ? Promise.resolve(new Response('{"private_payload":"do-not-log-this"}')) : fetcher(url, init));
    expect(report.criticalErrors.join(' ')).toContain('ESPN: formato real incompatível');
    const rendered = renderReport({ generatedAt: 'test', execution: 'test', months: [report], criticalErrors: report.criticalErrors });
    expect(rendered).toContain('formato'); expect(rendered).not.toContain('do-not-log-this');
  });
  it('detects the actual HTML fallback path, without substituting a parser in the script', async () => {
    const report = await validateMonth(query, (url, init) => url.includes('palmeiras.com.br')
      ? Promise.resolve(new Response('<div>Brasileirão Série A 2026 | 06/09/2026 | 16H00</div><p>Botafogo X Palmeiras</p>')) : fetcher(url, init));
    expect(report.sources.find(s => s.source === 'Palmeiras')?.requests[0]).toMatchObject({ jsonLdFound: false, usedHtmlFallback: true, extracted: 1 });
  });
  it('queries configured CONMEBOL only through its existing official-host restriction and never logs its URL/query', async () => {
    const configured = 'https://gol.conmebol.com/fixtures?token=should-not-appear';
    const libertadores = `<script type="application/ld+json">${JSON.stringify({ ...event, name: 'CONMEBOL Libertadores', homeTeam: { name: 'Palmeiras' }, awayTeam: { name: 'LDU' } })}</script>`;
    const report = await validateMonth(query, (url, init) => url === configured ? Promise.resolve(new Response(libertadores))
      : url.includes('www.palmeiras.com.br') ? Promise.resolve(new Response(html + libertadores)) : fetcher(url, init), configured);
    expect(report.sources.find(s => s.source === 'CONMEBOL')?.state).toBe('ok');
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('should-not-appear'); expect(serialized).not.toContain('?token');
  });
  it('preserves real comparison dates instead of changing them to the references', () => {
    const fixtures = [{ date: '2026-09-20', homeTeam: 'Grêmio', awayTeam: 'Palmeiras', competition: 'Brasileirão', sources: [] }];
    const match = compareReferences(fixtures, query)[5];
    expect(match).toMatchObject({ found: true, dateMatches: false });
    expect(match.fixtures[0].date).toBe('2026-09-20');
  });
  it('executes all three requested months despite a critical month and labels synthetic tests as test', async () => {
    const report = await validateAllSources(async () => new Response('', { status: 503 }), undefined, 'test');
    expect(report.months.map(m => m.month)).toEqual([9, 10, 11]);
    expect(report.criticalErrors).toHaveLength(3);
    expect(renderReport(report)).toContain('**test**');
  });
});
