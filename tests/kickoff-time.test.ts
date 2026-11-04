import { describe, it, expect } from 'vitest';
import { parsePalmeirasCalendar } from '../supabase/functions/_shared/palmeiras-calendar';
import { normalizeKickoffTime, timestampKickoffTime } from '../supabase/functions/_shared/normalize';
import { parseCBF, parseESPN, parseSportsEvents } from '../supabase/functions/_shared/sources';
import { reconcileFixtures } from '../supabase/functions/_shared/reconcile';
import type { SourceFixture } from '../supabase/functions/_shared/contracts';
import { importFixturesText } from '../client/src/lib/fixture-import';
import { parseMatchesInput, serializeMatchesText, toCalendarProjectMatches } from '../client/src/lib/calendar-matches';
const query = { year: 2026, month: 11 };
const row = (changes: Partial<SourceFixture> = {}): SourceFixture => ({ source: 'Palmeiras', sourceId: '1', url: 'https://www.palmeiras.com.br/calendario/', date: '2026-11-05', homeTeam: 'Palmeiras', awayTeam: 'Remo', competition: 'Brasileirão', confirmed: false, conditional: false, kickoffTime: '19:00', ...changes });
const consolidate = (...rows: SourceFixture[]) => reconcileFixtures(rows, query)[0];
const card = (link = '/ingressos/?idjogo=123', time = '16H00') => `<article><div><span>Palmeiras</span> X <span>Vasco da Gama</span></div><p>Copa do Brasil</p><p>01/11 | ${time}</p><p>Nubank Parque</p><p>Semifinal</p><p>2ª rodada</p>${link ? `<a href="${link}">Página do jogo</a><a href="/ingressos/?idjogo=123">Ingressos</a>` : ''}</article>`;
const page = (body: string) => `<html><section data-year="2026"><h2>CALENDÁRIO COMPLETO</h2>${body}</section></html>`;
describe('kickoff survives discovery, authority, review and saved JSON', () => {
  it.each([['16H00', '16:00'], ['19h30', '19:30'], ['21:30', '21:30'], ['A DEFINIR', null], ['25:00', null]])('normalizes %s', (value, expected) => expect(normalizeKickoffTime(value)).toBe(expected));
  it('recognizes a confrontation outside the link and ingressos IDs, venue, round and phase', () => {
    const parsed = parsePalmeirasCalendar(page(card()), row().url, query);
    expect(parsed.fixtures).toHaveLength(1);
    expect(parsed.fixtures[0]).toMatchObject({ sourceId: '123', homeTeam: 'Palmeiras', awayTeam: 'Vasco', kickoffTime: '16:00', venue: 'Nubank Parque', round: '2', phase: 'Semifinal' });
  });
  it('generates stable IDs without links and never combines neighboring cards', () => {
    const html = page(card('', '19h30') + card('', 'A DEFINIR').replace('01/11', '05/11').replace('Vasco da Gama', 'Remo'));
    const first = parsePalmeirasCalendar(html, row().url, query).fixtures;
    expect(first).toHaveLength(2); expect(first[1].kickoffTime).toBeNull();
    expect(first[0].sourceId).toBe(parsePalmeirasCalendar(html, row().url, query).fixtures[0].sourceId);
    expect(first[0].sourceId).not.toBe(first[1].sourceId);
  });
  it('ignores identical cards in news or outside calendar regions', () => {
    expect(parsePalmeirasCalendar(`<html>${card()}</html>`, row().url, query).fixtures).toEqual([]);
    expect(parsePalmeirasCalendar(`<section class="news">${page(card())}</section>`, row().url, query).fixtures).toEqual([]);
  });
  it('accepts matching Palmeiras and CBF times', () => {
    expect(consolidate(row(), row({ source: 'CBF', confirmed: true }))).toMatchObject({ kickoffTime: '19:00', status: 'confirmed', note: null });
  });
  it('uses CBF time and exposes time differences without a date conflict', () => {
    const f = consolidate(row(), row({ source: 'CBF', confirmed: true, kickoffTime: '19:30' }));
    expect(f).toMatchObject({ kickoffTime: '19:30', status: 'confirmed', confidence: 'high' }); expect(f.note).toContain('Divergência de horário');
  });
  it('uses CONMEBOL for Libertadores, not CBF or ESPN', () => {
    const f = consolidate(...(['Palmeiras', 'ESPN', 'CONMEBOL'] as const).map(source => row({ source, competition: 'Libertadores', kickoffTime: source === 'CONMEBOL' ? '21:30' : '20:00', confirmed: source === 'CONMEBOL' })));
    expect(f.kickoffTime).toBe('21:30');
  });
  it('keeps agreeing secondary times provisional and conflicting ones undefined', () => {
    const f = consolidate(row(), row({ source: 'ESPN' }));
    expect(f).toMatchObject({ kickoffTime: '19:00', status: 'base_date' }); expect(f.note).toContain('provisório');
    expect(consolidate(row(), row({ source: 'ESPN', kickoffTime: '20:00' })).kickoffTime).toBeNull();
  });
  it('does not borrow a time from a different date or confirm A DEFINIR', () => {
    expect(consolidate(row(), row({ source: 'CBF', date: '2026-11-06', kickoffTime: null })).kickoffTime).toBeNull();
    expect(consolidate(row({ kickoffTime: null }))).toMatchObject({ kickoffTime: null, status: 'base_date' });
  });
  it('extracts CBF local time and rejects invalid official times', () => {
    const payload = (hora: string) => ({ jogos: { 'Brasileirão': { 'Série A': [{ hora, mandante: { nome: 'Palmeiras' }, visitante: { nome: 'Remo' } }] } } });
    expect(parseCBF(payload('19:30:00'), '2026-11-05', row().url)[0]).toMatchObject({ kickoffTime: '19:30', confirmed: true });
    expect(parseCBF(payload('29:30'), '2026-11-05', row().url)[0]).toMatchObject({ kickoffTime: null, confirmed: false });
  });
  it('converts ESPN and JSON-LD timestamps to São Paulo including date rollover', () => {
    const date = '2026-11-06T01:30:00Z';
    expect(timestampKickoffTime(date)).toBe('22:30');
    const f = parseESPN({ events: [{ id: '1', date, competitions: [{ competitors: [{ homeAway: 'home', team: { displayName: 'Palmeiras' } }, { homeAway: 'away', team: { displayName: 'Remo' } }] }] }] }, 'Brasileirão', row().url)[0];
    expect(f).toMatchObject({ date: '2026-11-05', kickoffTime: '22:30' });
    const html = `<script type="application/ld+json">${JSON.stringify({ '@type': 'SportsEvent', name: 'Libertadores', startDate: date, homeTeam: { name: 'Palmeiras' }, awayTeam: { name: 'Remo' } })}</script>`;
    expect(parseSportsEvents(html, 'CONMEBOL', row().url)[0]).toMatchObject({ date: '2026-11-05', kickoffTime: '22:30', confirmed: true });
  });
  it('preserves time through import, parse, JSON save/load and editing', () => {
    const fixture = consolidate(row({ source: 'CBF', confirmed: true, kickoffTime: '19:30' }));
    const text = importFixturesText('', [fixture], query, 'replace');
    expect(text).toBe('05 19:30 - Palmeiras x Remo');
    const saved = JSON.parse(JSON.stringify(toCalendarProjectMatches(parseMatchesInput(text))));
    expect(saved[0].kickoffTime).toBe('19:30');
    expect(serializeMatchesText(saved)).toBe(text);
    const edited = parseMatchesInput(serializeMatchesText(saved).replace('19:30', '20:00'));
    expect(toCalendarProjectMatches(edited)[0].kickoffTime).toBe('20:00');
  });
  it('append deduplicates the same game independently of time, preserving existing edits', () => {
    const fixture = consolidate(row());
    const current = '05 19:30 - Palmeiras x Remo';
    expect(importFixturesText(current, [fixture, fixture], query, 'append')).toBe(current);
    expect(importFixturesText('', [fixture, fixture], query, 'append')).toBe('05 19:00 - Palmeiras x Remo');
  });
  it('loads old JSON and old text with no kickoff without losing teams', () => {
    const old = [{ day: 5, homeTeam: 'Palmeiras', awayTeam: 'Remo' }];
    expect(serializeMatchesText(old)).toBe('05 - Palmeiras x Remo');
    expect(parseMatchesInput(serializeMatchesText(old))[0]).toMatchObject({ ...old[0] });
    expect(importFixturesText('', [consolidate(row({ kickoffTime: null }))], query, 'replace')).toBe('05 A DEFINIR - Palmeiras x Remo');
  });
});
