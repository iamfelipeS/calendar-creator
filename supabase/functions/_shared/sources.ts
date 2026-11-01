import type { FixtureQuery, FixtureSource, SourceFixture, SourceResult } from './contracts.ts';
import { competitionFrom, localDate, normalizeFixtures, slug } from './normalize.ts';

type Json = Record<string, any>;
export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

async function get(url: string, fetcher: Fetcher): Promise<string> {
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
  // At most six simultaneous daily requests; no unbounded month-wide fanout.
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < dates.length) {
      const date = dates[cursor++];
      const url = `https://www.cbf.com.br/api/cbf/calendario/jogos/${date.replaceAll('-', '/')}`;
      try { fixtures.push(...parseCBF(JSON.parse(await get(url, fetcher)), date, url)); } catch { failed++; }
    }
  }));
  if (failed === days) throw new Error('Não foi possível consultar a CBF.');
  return { source: 'CBF', fixtures, warnings: failed ? [`CBF: ${failed} de ${days} dias não puderam ser consultados; cobertura incompleta.`] : [] };
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

export async function fetchSecondaryFixtures(query: FixtureQuery, fetcher: Fetcher = fetch): Promise<SourceResult> {
  const start = `${query.year}${String(query.month).padStart(2, '0')}01`;
  const end = `${query.year}${String(query.month).padStart(2, '0')}${new Date(Date.UTC(query.year, query.month, 0)).getUTCDate()}`;
  const leagues = [{ id: 'bra.1', name: 'Brasileirão' }, { id: 'bra.copa_do_brasil', name: 'Copa do Brasil' },
    { id: 'conmebol.libertadores', name: 'Libertadores' }] as const;
  const results = await Promise.allSettled(leagues.map(async league => {
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard?dates=${start}-${end}&limit=1000`;
    return parseESPN(JSON.parse(await get(url, fetcher)), league.name, url);
  }));
  if (results.every(r => r.status === 'rejected')) throw new Error('Não foi possível consultar a ESPN.');
  return { source: 'ESPN', fixtures: results.flatMap(r => r.status === 'fulfilled' ? r.value : []),
    warnings: results.flatMap((r, i) => r.status === 'rejected' ? [`ESPN: consulta de ${leagues[i].name} indisponível.`] : []) };
}

const decode = (text: string) => text.replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

export function parseSportsEvents(html: string, source: FixtureSource, url: string): SourceFixture[] {
  const rows: SourceFixture[] = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.includes('SportsEvent') || types.includes('Event')) {
      const competition = competitionFrom(`${node.competition?.name || node.superEvent?.name || ''} ${node.name || ''}`);
      const home = node.homeTeam?.name, away = node.awayTeam?.name;
      if (competition && typeof home === 'string' && typeof away === 'string' && typeof node.startDate === 'string' &&
        !/EventCancelled|EventPostponed/.test(node.eventStatus || '')) {
        const conditional = /VENCEDOR|WINNER|A DEFINIR|TBD|SE AVANCAR/.test(slug(`${home} ${away} ${node.description || ''}`));
        const detailed = /T\d{2}:\d{2}/.test(node.startDate) && /(Z|[+-]\d{2}:?\d{2})$/.test(node.startDate);
        rows.push({ source, sourceId: String(node['@id'] || node.url || `${node.startDate}-${home}-${away}`), url,
          date: node.startDate, homeTeam: home, awayTeam: away, competition,
          confirmed: detailed && source === (competition === 'Libertadores' ? 'CONMEBOL' : 'CBF'), conditional });
      }
    }
    Object.values(node).forEach(child => { if (child && typeof child === 'object') visit(child); });
  };
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1])); } catch { /* A broken unrelated script must not discard other events. */ }
  }
  return normalizeFixtures(rows);
}

export function parsePalmeirasHTML(html: string, url: string): SourceFixture[] {
  const structured = parseSportsEvents(html, 'Palmeiras', url);
  if (structured.length) return structured;
  // Semantic text fallback: competition/year | DD/MM/YYYY | time, then home X away.
  // Never scan news prose for arbitrary team/date coincidences.
  const text = decode(html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, ' $1 ').replace(/<[^>]+>/g, '\n'));
  const lines = text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const rows: SourceFixture[] = [];
  for (let i = 0; i < lines.length; i++) {
    const header = lines.slice(i, i + 3).join(' ');
    const match = header.match(/^(.+?\b20\d{2})\s*\|\s*(\d{2}\/\d{2}\/\d{4})\s*\|/);
    if (!match) continue;
    const competition = competitionFrom(match[1]); if (!competition) continue;
    const window = lines.slice(i + 1, i + 16).join(' | ');
    const teams = window.match(/(?:^|\|)\s*([^|]+?)\s+(?:X|x|×)\s+([^|]+?)(?:\||$)/) ||
      window.match(/(?:^|\|)\s*([^|]+?)\s*\|\s*(?:X|x|×)\s*\|\s*([^|]+?)(?:\||$)/);
    if (!teams) continue;
    rows.push({ source: 'Palmeiras', sourceId: `${match[2]}-${teams[1]}-${teams[2]}`, url,
      date: match[2], homeTeam: teams[1], awayTeam: teams[2], competition, confirmed: false,
      conditional: /A DEFINIR|VENCEDOR|TBD/.test(slug(`${teams[1]} ${teams[2]}`)) });
  }
  return normalizeFixtures(rows);
}

export async function fetchPalmeirasFixtures(_query: FixtureQuery, fetcher: Fetcher = fetch): Promise<SourceResult> {
  const url = 'https://www.palmeiras.com.br/dados-jogos/jogos/';
  const fixtures = parsePalmeirasHTML(await get(url, fetcher), url);
  if (!fixtures.length) throw new Error('Página do Palmeiras sem jogos estruturados reconhecidos.');
  return { source: 'Palmeiras', fixtures, warnings: ['Palmeiras: a página pública pode não cobrir todo o histórico; ausência não confirma inexistência de jogo.'] };
}

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
