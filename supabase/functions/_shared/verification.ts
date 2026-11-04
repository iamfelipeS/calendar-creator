import type { Competition, FixtureQuery, SourceFixture, SourceResult } from './contracts.ts';
import { canonicalTeam, normalizeFixtures, slug } from './normalize.ts';
import { fetchCBFDate, fetchESPNDate, fetchConmebolFixtures, type Fetcher } from './sources.ts';

export const verificationRadiusDays = 3;
export const sameConfrontation = (a: SourceFixture, b: SourceFixture): boolean => a.competition === b.competition &&
  slug(canonicalTeam(a.homeTeam)) === slug(canonicalTeam(b.homeTeam)) && slug(canonicalTeam(a.awayTeam)) === slug(canonicalTeam(b.awayTeam)) &&
  !(a.round && b.round && a.round !== b.round) && !(a.leg && b.leg && a.leg !== b.leg);
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

async function verifyDates(source: 'CBF' | 'ESPN', seeds: SourceFixture[],
  load: (date: string, competition: Competition) => Promise<SourceFixture[]>): Promise<SourceResult> {
  const cache = new Map<string, Promise<SourceFixture[]>>(); const errors = new Set<string>();
  const get = (date: string, competition: Competition) => {
    const key = source === 'CBF' ? date : `${competition}|${date}`;
    if (!cache.has(key)) cache.set(key, load(date, competition).catch(() => { errors.add(key); throw new Error('Source unavailable'); }));
    return cache.get(key)!;
  };
  const targets = [...new Map(seeds.map(f => [`${f.date}|${slug(canonicalTeam(f.homeTeam))}|${slug(canonicalTeam(f.awayTeam))}|${f.competition}`, f])).values()];
  const fixtures: SourceFixture[] = []; let cursor = 0, missing = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < targets.length) {
      const target = targets[cursor++]; let found: SourceFixture[] = [];
      // A failure on the known date is reported, not multiplied into surrounding network failures.
      try { found = (await get(target.date, target.competition)).filter(f => sameConfrontation(target, f)); } catch { missing++; continue; }
      if (!found.length) {
        for (let delta = 1; delta <= verificationRadiusDays && !found.length; delta++) {
          for (const offset of [-delta, delta]) {
            try { found = (await get(shift(target.date, offset), target.competition)).filter(f => sameConfrontation(target, f)); } catch { /* Other dates/sources can still succeed. */ }
            if (found.length) break;
          }
        }
      }
      if (!found.length) missing++;
      fixtures.push(...found);
    }
  }));
  if (targets.length && errors.size === cache.size) throw new Error(`Não foi possível consultar ${source}.`);
  return { source, fixtures: normalizeFixtures(fixtures), complete: false, warnings: [
    ...(errors.size ? [`${source}: ${errors.size} consultas pontuais indisponíveis.`] : []),
    ...(missing ? [`${source}: ${missing} confrontos não localizados na data conhecida/janela de ±${verificationRadiusDays} dias; ausência não confirma inexistência.`] : []),
  ] };
}
export const verifyWithCBF = (_query: FixtureQuery, seeds: SourceFixture[], fetcher: Fetcher = fetch) =>
  verifyDates('CBF', seeds.filter(f => f.competition !== 'Libertadores'), date => fetchCBFDate(date, fetcher));
export const verifyWithESPN = (_query: FixtureQuery, seeds: SourceFixture[], fetcher: Fetcher = fetch) =>
  verifyDates('ESPN', seeds, (date, competition) => fetchESPNDate(date, competition, fetcher));
export async function verifyWithConmebol(query: FixtureQuery, seeds: SourceFixture[], fetcher: Fetcher = fetch, configuredUrl?: string): Promise<SourceResult> {
  const targets = seeds.filter(f => f.competition === 'Libertadores');
  if (!targets.length) return { source: 'CONMEBOL', fixtures: [], warnings: [], complete: false };
  const result = await fetchConmebolFixtures(query, fetcher, configuredUrl);
  return { ...result, fixtures: result.fixtures.filter(row => targets.some(t => sameConfrontation(t, row) && Math.abs(Date.parse(t.date) - Date.parse(row.date)) <= 7 * 86400000)) };
}
