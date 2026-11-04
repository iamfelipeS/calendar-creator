import type { Competition, FixtureQuery, FixtureSearchResult, FixtureSource, SourceFixture, SourceResult } from './contracts.ts';
import { reconcileFixtures } from './reconcile.ts';
import { normalizeFixtures } from './normalize.ts';
import { discoverPalmeirasFixtures, fetchCBFFixtures, fetchConmebolFixtures, fetchSecondaryFixtures, type Fetcher } from './sources.ts';
import { sameConfrontation, verifyWithCBF, verifyWithConmebol, verifyWithESPN } from './verification.ts';

export interface SearchContext { fallbackCompetitions?: Competition[] }
export type SourceLoader = (query: FixtureQuery, discovered?: SourceFixture[], context?: SearchContext) => Promise<SourceResult>;
export type SourceFetchers = Partial<Record<FixtureSource, Fetcher>>;
export const makeLoaders = (conmebolUrl?: string, fetchers: SourceFetchers = {}): Record<FixtureSource, SourceLoader> => {
  const sourceFetch = (source: FixtureSource) => fetchers[source] || fetch;
  return {
    Palmeiras: q => discoverPalmeirasFixtures(q, sourceFetch('Palmeiras')),
    CBF: (q, seeds) => seeds ? verifyWithCBF(q, seeds, sourceFetch('CBF')) : fetchCBFFixtures(q, sourceFetch('CBF')),
    CONMEBOL: (q, seeds) => seeds ? verifyWithConmebol(q, seeds, sourceFetch('CONMEBOL'), conmebolUrl)
      : fetchConmebolFixtures(q, sourceFetch('CONMEBOL'), conmebolUrl),
    ESPN: async (q, seeds, context) => {
      if (!seeds) return fetchSecondaryFixtures(q, sourceFetch('ESPN'));
      let verified: SourceResult;
      try { verified = await verifyWithESPN(q, seeds.filter(f => !context?.fallbackCompetitions?.includes(f.competition)), sourceFetch('ESPN')); }
      catch {
        if (!context?.fallbackCompetitions?.length) throw new Error('Não foi possível consultar a ESPN.');
        verified = { source: 'ESPN', fixtures: [], warnings: ['ESPN: verificação pontual indisponível.'], complete: false };
      }
      if (!context?.fallbackCompetitions?.length) return verified;
      // Scan only competitions whose official monthly coverage was unavailable in fallback mode.
      // Known confrontations in those competitions are covered by this scan, not queried twice.
      let broad: SourceResult;
      try { broad = await fetchSecondaryFixtures(q, sourceFetch('ESPN'), context.fallbackCompetitions); }
      catch {
        if (!verified.fixtures.length) throw new Error('Não foi possível consultar a ESPN.');
        broad = { source: 'ESPN', fixtures: [], warnings: ['ESPN: fallback diário indisponível em competições sem cobertura oficial.'], complete: false };
      }
      return { source: 'ESPN', fixtures: normalizeFixtures([...verified.fixtures, ...broad.fixtures]),
        warnings: [...verified.warnings, ...broad.warnings], complete: broad.complete };
    },
  };
};
export async function syncFixtures(query: FixtureQuery, loaders = makeLoaders(), log: (event: object) => void = console.info): Promise<FixtureSearchResult> {
  log({ event: 'fixtures.start', ...query, strategy: 'discovery-first' });
  const sourceErrors: FixtureSearchResult['sourceErrors'] = [];
  const results: Partial<Record<FixtureSource, SourceResult>> = {};
  const prefix = `${query.year}-${String(query.month).padStart(2, '0')}-`;
  const invoke = async (source: FixtureSource, seeds?: SourceFixture[], context?: SearchContext) => {
    try {
      const result = await loaders[source](query, seeds, context);
      const fixtures = normalizeFixtures(result.fixtures);
      results[source] = { ...result, fixtures };
      sourceErrors.push(...result.warnings.map(message => ({ source, message })));
      log({ event: 'fixtures.source_complete', source, count: fixtures.filter(f => f.date.startsWith(prefix)).length });
      return results[source]!;
    } catch {
      sourceErrors.push({ source, message: source === 'CONMEBOL'
        ? 'Consulta oficial CONMEBOL indisponível ou não configurada; Libertadores exige conferência manual.'
        : `Não foi possível consultar ${source}; cobertura incompleta.` });
      log({ event: 'fixtures.source_failed', source }); return null;
    }
  };
  // Discovery always precedes authority/secondary requests.
  const discovery = await invoke('Palmeiras');
  const discovered = (discovery?.fixtures || []).filter(f => f.date.startsWith(prefix));
  const discoveryFallback = !discovered.length || !!discovery?.discoveryCoverage && discovery.discoveryCoverage !== 'calendar';
  log({ event: 'fixtures.discovery', source: 'Palmeiras', count: discovered.length, fallback: discoveryFallback });
  let cbf: SourceResult | null, conmebol: SourceResult | null;
  if (!discoveryFallback) {
    [cbf, conmebol] = await Promise.all([invoke('CBF', discovered), invoke('CONMEBOL', discovered)]);
  } else {
    sourceErrors.push({ source: 'Palmeiras', message: 'Discovery incompleto/indisponível para o período; usando fallback das demais fontes, com cobertura explicitamente parcial quando houver falhas.' });
    [cbf, conmebol] = await Promise.all([invoke('CBF'), invoke('CONMEBOL')]);
  }
  const authorities = [...(cbf?.fixtures || []), ...(conmebol?.fixtures || [])];
  const targets = discoveryFallback ? normalizeFixtures([...discovered, ...authorities.filter(f => f.date.startsWith(prefix))]) : discovered.map(seed =>
    authorities.find(a => sameConfrontation(seed, a) && Math.abs(Date.parse(seed.date) - Date.parse(a.date)) <= 7 * 86400000) || seed);
  const uncovered: Competition[] = [];
  if (discoveryFallback) {
    if (!cbf?.complete) uncovered.push('Brasileirão', 'Copa do Brasil');
    if (!conmebol?.complete) uncovered.push('Libertadores');
  }
  await invoke('ESPN', targets, discoveryFallback ? { fallbackCompetitions: uncovered } : undefined);
  const rows = Object.values(results).flatMap(r => r.fixtures);
  const fixtures = reconcileFixtures(rows, query);
  const sourceCounts: FixtureSearchResult['sourceCounts'] = {};
  for (const [source, result] of Object.entries(results)) sourceCounts[source as FixtureSource] = result.fixtures.filter(f => f.date.startsWith(prefix)).length;
  log({ event: 'fixtures.complete', count: fixtures.length, sourceWarnings: sourceErrors.length });
  return { ...query, fixtures, sourceErrors, sourceCounts, fetchedAt: new Date().toISOString(), timezone: 'America/Sao_Paulo',
    discoverySource: discoveryFallback ? 'fallback' : 'Palmeiras', discoveryFallback, discoveryCount: discovered.length,
    discoveryCoverage: discovery?.discoveryCoverage || 'unknown' };
}
