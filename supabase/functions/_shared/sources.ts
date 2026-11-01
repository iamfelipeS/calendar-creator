import { parsePalmeirasCalendar } from './palmeiras-calendar.ts';
import { parseSportsEvents } from './structured-events.ts';
export { parseSportsEvents } from './structured-events.ts';
import type { FixtureQuery, FixtureSource, SourceFixture, SourceResult } from './contracts.ts';
import { competitionFrom, localDate, normalizeFixtures, slug } from './normalize.ts';

type Json = Record<string, any>;
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function get(url: string, fetcher: Fetcher): Promise<string> {
  const response = await fetcher(url, { signal: AbortSignal.timeout(5000), redirect: 'error',
    headers: { Accept: 'application/json, text/html;q=0.9', 'User-Agent': 'CalendarCreator/1.0 (fixture review)' } });
  if (!response.ok) throw new Error('Fonte indisponível');
  // Bound memory as well as time; upstream pages must never be returned verbatim.
  if (Number(response.headers.get('content-length') || 0) > 3_000_000) throw new Error('Resposta muito grande');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Resposta vazia');
  const decoder = new TextDecoder(); let size = 0, text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 3_000_000) { await reader.cancel(); throw new Error('Resposta muito grande'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}

export function parseCBF(payload: Json, date: string, url: string): SourceFixture[] {
  if (!payload.jogos || typeof payload.jogos !== 'object' || Array.isArray(payload.jogos)) throw new Error('Formato CBF não reconhecido');
  const rows: SourceFixture[] = [];
  for (const [name, categories] of Object.entries(payload.jogos)) {
    if (!categories || typeof categories !== 'object') continue;
    for (const [category, matches] of Object.entries(categories)) {
      const competition = competitionFrom(`${name} ${category}`);
      if (!competition || competition === 'Libertadores' || !Array.isArray(matches)) continue;
      for (const game of matches) {
        if (!game || typeof game !== 'object') continue;
        rows.push({ source: 'CBF', sourceId: String(game.id_jogo || `${date}-${game.mandante?.nome}-${game.visitante?.nome}`),
          url, date: localDate(String(game.data || '')) || date,
          homeTeam: String(game.mandante?.nome || ''), awayTeam: String(game.visitante?.nome || ''), competition,
          round: game.rodada == null ? undefined : String(game.rodada),
          confirmed: /^\d{1,2}:\d{2}/.test(String(game.hora || '')),
          conditional: /A DEFINIR|VENCEDOR|CLASSIFICADO/.test(slug(`${game.mandante?.nome} ${game.visitante?.nome}`)),
        });
      }
    }
  }
  return normalizeFixtures(rows);
}

export async function fetchCBFFixtures(query: FixtureQuery, fetcher: Fetcher = fetch): Promise<SourceResult> {
  const days = new Date(Date.UTC(query.year, query.month, 0)).getUTCDate();
  const dates = Array.from({ length: days }, (_, i) => `${query.year}-${String(query.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  const fixtures: SourceFixture[] = []; let cursor = 0, failed = 0;
  // At most four simultaneous daily requests; no unbounded month-wide fanout.
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < dates.length) {
      const date = dates[cursor++];
      try { fixtures.push(...await fetchCBFDate(date, fetcher)); } catch { failed++; }
    }
  }));
  if (failed === days) throw new Error('Não foi possível consultar a CBF.');
  return { source: 'CBF', fixtures, complete: failed === 0, warnings: failed ? [`CBF: ${failed} de ${days} dias não puderam ser consultados; cobertura incompleta.`] : [] };
}

export function parseESPN(payload: Json, competition: SourceFixture['competition'], url: string): SourceFixture[] {
  if (!Array.isArray(payload.events)) throw new Error('Formato ESPN não reconhecido');
  return normalizeFixtures(payload.events.flatMap((event: Json) => (event.competitions || []).flatMap((game: Json) => {
    const home = game.competitors?.find((c: Json) => c.homeAway === 'home');
    const away = game.competitors?.find((c: Json) => c.homeAway === 'away');
    if (!home?.team?.displayName || !away?.team?.displayName) return [];
    if (/POSTPONED|CANCELED|CANCELLED|SUSPENDED/.test(game.status?.type?.name || event.status?.type?.name || '')) return [];
    // ESPN is always secondary, including when the API labels a fixture scheduled.
    return [{ source: 'ESPN', sourceId: String(event.id), url, date: game.date || event.date,
      homeTeam: home.team.displayName, awayTeam: away.team.displayName, competition,
      confirmed: false, conditional: /A DEFINIR|TBD|WINNER|VENCEDOR/.test(slug(`${home.team.displayName} ${away.team.displayName}`)),
    } satisfies SourceFixture];
  })));
}

export const espnLeagues = { 'Brasileirão': 'bra.1', 'Copa do Brasil': 'bra.copa_do_brasil', 'Libertadores': 'conmebol.libertadores' } as const;
export async function fetchCBFDate(date: string, fetcher: Fetcher = fetch): Promise<SourceFixture[]> {
  const url = `https://www.cbf.com.br/api/cbf/calendario/jogos/${date.replaceAll('-', '/')}`;
  return parseCBF(JSON.parse(await get(url, fetcher)), date, url);
}
export async function fetchESPNDate(date: string, competition: SourceFixture['competition'], fetcher: Fetcher = fetch): Promise<SourceFixture[]> {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${espnLeagues[competition]}/scoreboard?dates=${date.replaceAll('-', '')}`;
  return parseESPN(JSON.parse(await get(url, fetcher)), competition, url);
}
// Exceptional discovery fallback only. ESPN does not accept monthly date ranges.
export async function fetchSecondaryFixtures(query: FixtureQuery, fetcher: Fetcher = fetch,
  competitions: SourceFixture['competition'][] = ['Brasileirão', 'Copa do Brasil', 'Libertadores']): Promise<SourceResult> {
  const days = new Date(Date.UTC(query.year, query.month, 0)).getUTCDate();
  const jobs = competitions.flatMap(competition => Array.from({ length: days }, (_, i) => ({ competition,
    date: `${query.year}-${String(query.month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}` })));
  const fixtures: SourceFixture[] = []; const failed = new Set<string>(); let success = 0, cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < jobs.length) {
      const { date, competition } = jobs[cursor++];
      try { fixtures.push(...await fetchESPNDate(date, competition, fetcher)); success++; }
      catch { failed.add(competition); }
    }
  }));
  if (jobs.length && !success) throw new Error('Não foi possível consultar a ESPN.');
  return { source: 'ESPN', fixtures: normalizeFixtures(fixtures), complete: !failed.size,
    warnings: [...failed].map(competition => `ESPN: consulta de ${competition} indisponível em um ou mais dias.`) };
}

export function parsePalmeirasHTML(html: string, url: string): SourceFixture[] {
  return parsePalmeirasCalendar(html, url).fixtures;
}
export const palmeirasDiscoveryPages = [
  'https://www.palmeiras.com.br/ingressos/',
  'https://www.palmeiras.com.br/calendario/',
  'https://www.palmeiras.com.br/programacao-semanal/',
  'https://www.palmeiras.com.br/dados-jogos/jogos/',
];
export async function discoverPalmeirasFixtures(query: FixtureQuery, fetcher: Fetcher = fetch): Promise<SourceResult> {
  const fixtures: SourceFixture[] = []; const warnings: string[] = []; let failed = 0;
  let coverage: SourceResult['discoveryCoverage'] = 'unknown';
  for (const url of palmeirasDiscoveryPages) {
    try {
      const page = parsePalmeirasCalendar(await get(url, fetcher), url, query);
      fixtures.push(...page.fixtures); warnings.push(...page.warnings);
      if (page.coverage === 'calendar') coverage = 'calendar';
      else if (coverage === 'unknown') coverage = page.coverage;
      if (page.fixtures.length && page.coverage === 'calendar') break;
    } catch { failed++; }
  }
  if (failed === palmeirasDiscoveryPages.length) throw new Error('Não foi possível consultar o calendário do Palmeiras.');
  const unique = [...new Map(normalizeFixtures(fixtures).map(f => [`${f.date}|${slug(f.homeTeam)}|${slug(f.awayTeam)}|${f.competition}`, f])).values()];
  if (!unique.length) warnings.push('Palmeiras: discovery vazio para o período; pode não haver histórico/cobertura. Ativar fallback, sem concluir ausência de jogos.');
  if (unique.length && coverage === 'unknown') warnings.push('Palmeiras: jogos descobertos sem garantia de cobertura histórica completa; revisar o calendário oficial.');
  if (coverage === 'upcoming_only') warnings.push('Palmeiras: apenas próximas partidas reconhecidas; discovery incompleto, ativar fallback.');
  if (failed) warnings.push('Palmeiras: uma ou mais páginas de discovery indisponíveis.');
  return { source: 'Palmeiras', fixtures: unique, warnings, discoveryCoverage: coverage };
}
export const fetchPalmeirasFixtures = discoverPalmeirasFixtures;

export async function fetchConmebolFixtures(_query: FixtureQuery, fetcher: Fetcher = fetch, configuredUrl?: string): Promise<SourceResult> {
  if (!configuredUrl) throw new Error('CONMEBOL: endpoint oficial de fixtures ainda precisa ser validado e configurado.');
  const url = new URL(configuredUrl);
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
    !(url.hostname === 'conmebol.com' || url.hostname.endsWith('.conmebol.com'))) throw new Error('URL CONMEBOL inválida.');
  const fixtures = parseSportsEvents(await get(url.href, fetcher), 'CONMEBOL', url.href)
    .filter(row => row.competition === 'Libertadores');
  if (!fixtures.length) throw new Error('CONMEBOL: formato oficial ainda não reconhecido.');
  return { source: 'CONMEBOL', fixtures, warnings: [] };
}
