import { it, expect } from 'vitest';
import { parseMatchesInput, serializeMatchesText, toCalendarProjectMatches } from '../client/src/lib/calendar-matches';
import { importFixturesText } from '../client/src/lib/fixture-import';
import type { ConsolidatedFixture } from '../supabase/functions/_shared/contracts';
const base = { day: 18, homeTeam: 'Cruzeiro', awayTeam: 'Palmeiras' };
const period = { month: 11, year: 2026 };
const fixture = (time: string | null | undefined) => ({ date: '2026-11-18', homeTeam: base.homeTeam, awayTeam: base.awayTeam, kickoffTime: time } as ConsolidatedFixture);
it.each([[undefined, '18 - Cruzeiro x Palmeiras'], [null, '18 A DEFINIR - Cruzeiro x Palmeiras'], ['21:30', '18 21:30 - Cruzeiro x Palmeiras']] as const)('round-trips %s through text, MatchDay, saved JSON and reload', (kickoffTime, text) => {
  const original = { ...base, kickoffTime };
  expect(serializeMatchesText([original])).toBe(text);
  const parsed = parseMatchesInput(text);
  expect(parsed[0].kickoffTime).toBe(kickoffTime);
  const stored = JSON.parse(JSON.stringify(toCalendarProjectMatches(parsed)));
  expect(stored[0].kickoffTime).toBe(kickoffTime);
  expect(Object.hasOwn(stored[0], 'kickoffTime')).toBe(kickoffTime !== undefined);
  expect(serializeMatchesText(stored)).toBe(text);
  expect(parseMatchesInput(serializeMatchesText(stored))[0].kickoffTime).toBe(kickoffTime);
  expect(importFixturesText('', [fixture(kickoffTime)], period, 'replace')).toBe(text);
});
it.each([null, '21:30'])('enriches a legacy duplicate with %s and preserves team spelling', kickoffTime => {
  const text = importFixturesText('18 - CRUZEIRO x Palmeiras', [fixture(kickoffTime), fixture(kickoffTime)], period, 'append');
  expect(text.split('\n')).toHaveLength(1);
  expect(parseMatchesInput(text)[0]).toMatchObject({ homeTeam: 'CRUZEIRO', kickoffTime });
});
it.each([null, '20:00'])('preserves an explicit existing decision %s', kickoffTime => {
  const current = serializeMatchesText([{ ...base, kickoffTime }]);
  expect(importFixturesText(current, [fixture('21:30')], period, 'append')).toBe(current);
});
it('enriches duplicate observations within the same import', () => {
  const text = importFixturesText('', [fixture(undefined), fixture(null)], period, 'replace');
  expect(text).toBe('18 A DEFINIR - Cruzeiro x Palmeiras');
});
