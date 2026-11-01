import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/calendar-supabase', () => ({
  normalizeTeamSlug: (name: string) => name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase(),
}));

vi.mock('@/lib/calendar-team-logos', () => ({ teamLogos: {} }));

import {
  parseMatchesInput,
  serializeMatchesText,
  toCalendarProjectMatches,
} from '@/lib/calendar-matches';

describe('fixture kickoff metadata', () => {
  it('preserves games without a specified time', () => {
    const games = parseMatchesInput('21 - Palmeiras x Flamengo');

    expect(games).toHaveLength(1);
    expect(games[0].kickoff).toBeUndefined();
    expect(serializeMatchesText(toCalendarProjectMatches(games)))
      .toBe('21 - Palmeiras x Flamengo');
  });

  it('normalizes a confirmed time and persists it with the game', () => {
    const games = parseMatchesInput('05 - Palmeiras x Remo | 19h30');

    expect(games[0].kickoff).toEqual({ status: 'confirmed', time: '19:30' });
    expect(toCalendarProjectMatches(games)[0].kickoff)
      .toEqual({ status: 'confirmed', time: '19:30' });
    expect(serializeMatchesText(toCalendarProjectMatches(games)))
      .toBe('05 - Palmeiras x Remo | 19:30');
  });

  it('stores A definir separately from an unknown time', () => {
    const games = parseMatchesInput(
      '18 - Cruzeiro x Palmeiras | A definir\n21 - Palmeiras x Flamengo',
    );

    expect(games[0].kickoff).toEqual({ status: 'to_be_defined' });
    expect(games[1].kickoff).toBeUndefined();
    expect(serializeMatchesText(toCalendarProjectMatches(games)))
      .toBe('18 - Cruzeiro x Palmeiras | A definir\n21 - Palmeiras x Flamengo');
  });

  it('roundtrips persisted match records and remains compatible with old records', () => {
    const stored = toCalendarProjectMatches(parseMatchesInput(
      '05 - Palmeiras x Remo | 19:30\n18 - Cruzeiro x Palmeiras | A definir\n21 - Palmeiras x Flamengo',
    ));

    const hydrated = parseMatchesInput(serializeMatchesText(stored));
    expect(toCalendarProjectMatches(hydrated)).toEqual(stored);

    expect(serializeMatchesText([{ day: 21, homeTeam: 'Palmeiras', awayTeam: 'Flamengo' }]))
      .toBe('21 - Palmeiras x Flamengo');
  });

  it('does not accept impossible or ambiguous kickoff values', () => {
    expect(parseMatchesInput('05 - Palmeiras x Remo | 25:99')).toHaveLength(0);
    expect(parseMatchesInput('05 - Palmeiras x Remo | 19h')).toHaveLength(0);
  });
});
