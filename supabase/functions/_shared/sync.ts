import type { FixtureQuery, FixtureSearchResult, FixtureSource, SourceResult } from './contracts.ts';
import { reconcileFixtures } from './reconcile.ts';
import { normalizeFixtures } from './normalize.ts';
import { fetchCBFFixtures, fetchConmebolFixtures, fetchPalmeirasFixtures, fetchSecondaryFixtures } from './sources.ts';

export type SourceLoader = (query: FixtureQuery) => Promise<SourceResult>;
export const makeLoaders = (conmebolUrl?: string): Record<FixtureSource, SourceLoader> => ({
  CBF: fetchCBFFixtures, CONMEBOL: q => fetchConmebolFixtures(q, fetch, conmebolUrl),
  Palmeiras: fetchPalmeirasFixtures, ESPN: fetchSecondaryFixtures,
});
export async function syncFixtures(query: FixtureQuery, loaders = makeLoaders(), log: (event: object) => void = console.info): Promise<FixtureSearchResult> {
  const sources = Object.keys(loaders) as FixtureSource[];
  log({ event: 'fixtures.start', ...query });
  const results = await Promise.allSettled(sources.map(source => loaders[source](query)));
  const sourceErrors: FixtureSearchResult['sourceErrors'] = [];
  const sourceCounts: FixtureSearchResult['sourceCounts'] = {};
  const prefix = `${query.year}-${String(query.month).padStart(2, '0')}-`;
  const rows = results.flatMap((result, index) => {
    const source = sources[index];
    if (result.status === 'rejected') {
      const message = source === 'CONMEBOL' ? 'Consulta oficial CONMEBOL indisponível ou não configurada; Libertadores exige conferência manual.'
        : `Não foi possível consultar ${source}; cobertura incompleta.`;
      sourceErrors.push({ source, message });
      log({ event: 'fixtures.source_failed', source });
      return [];
    }
    const fixtures = normalizeFixtures(result.value.fixtures);
    sourceCounts[source] = fixtures.filter(f => f.date.startsWith(prefix)).length;
    sourceErrors.push(...result.value.warnings.map(message => ({ source, message })));
    log({ event: 'fixtures.source_complete', source, count: sourceCounts[source] });
    return fixtures;
  });
  const fixtures = reconcileFixtures(rows, query);
  log({ event: 'fixtures.complete', count: fixtures.length, failedSources: sourceErrors.length });
  return { ...query, fixtures, sourceErrors, sourceCounts, fetchedAt: new Date().toISOString(), timezone: 'America/Sao_Paulo' };
}
