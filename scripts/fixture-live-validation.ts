import type { Competition, ConsolidatedFixture, FixtureQuery, FixtureSource, SourceFixture } from '../supabase/functions/_shared/contracts.ts';
import { canonicalTeam, normalizeFixtures, slug } from '../supabase/functions/_shared/normalize.ts';
import { parseCBF, parseESPN, parseSportsEvents, type Fetcher } from '../supabase/functions/_shared/sources.ts';
import { parsePalmeirasCalendar } from '../supabase/functions/_shared/palmeiras-calendar.ts';
import { makeLoaders, syncFixtures, type SourceLoader } from '../supabase/functions/_shared/sync.ts';

type Outcome = 'ok' | 'http_error' | 'network_error' | 'format_error' | 'code_error';
export interface RequestAudit {
  target: string;
  httpStatus: number | null;
  outcome: Outcome;
  events?: number;
  extracted?: number;
  jsonLdFound?: boolean;
  compatibleJsonLd?: number;
  usedHtmlFallback?: boolean;
  structure?: string;
  issue?: string;
}
export interface PublicFixture {
  date: string; homeTeam: string; awayTeam: string; competition: string;
  status?: string; confidence?: string; kickoffTime?: string | null; venue?: string; phase?: string;
  sources: { source: FixtureSource; date: string; kickoffTime: string | null; confirmed: boolean }[];
}
export interface SourceAudit {
  source: FixtureSource;
  state: 'ok' | 'partial' | 'unavailable' | 'incompatible' | 'not_configured' | 'not_applicable';
  requests: RequestAudit[];
  fixtures: PublicFixture[];
  daysConsulted?: number;
  successfulDays?: number;
  extracted: number;
}
export interface Comparison {
  reference: string;
  found: boolean;
  dateMatches: boolean;
  fixtures: PublicFixture[];
}
export interface MonthReport extends FixtureQuery {
  sources: SourceAudit[];
  consolidated: PublicFixture[];
  comparison: Comparison[];
  extraFixtures: PublicFixture[];
  sourceErrors: { source: FixtureSource; message: string }[];
  warnings: string[];
  criticalErrors: string[];
  discoverySource?: string;
  discoveryFallback?: boolean;
  discoveryCount?: number;
  discoveryCoverage?: string;
  totalRequests: number;
}
export interface ValidationReport {
  generatedAt: string;
  execution: 'live' | 'test';
  months: MonthReport[];
  criticalErrors: string[];
}
// Comparison references only: never passed to a source, normalizer or reconciler as observations.
export const references: Record<number, readonly [number, string, string][]> = {
  9: [[2, 'Santos', 'Palmeiras'], [6, 'Botafogo', 'Palmeiras'], [9, 'Palmeiras', 'LDU Quito'],
    [12, 'Palmeiras', 'São Paulo'], [16, 'LDU Quito', 'Palmeiras'], [19, 'Grêmio', 'Palmeiras']],
  10: [[8, 'Palmeiras', 'Bahia'], [11, 'Palmeiras', 'Corinthians'], [14, 'Fluminense', 'Palmeiras'],
    [17, 'Athletico-PR', 'Palmeiras'], [21, 'Palmeiras', 'Fluminense'], [24, 'Palmeiras', 'Red Bull Bragantino'], [28, 'Santos', 'Palmeiras']],
};
const competitionByLeague: Record<string, Competition> = {
  'bra.1': 'Brasileirão', 'bra.copa_do_brasil': 'Copa do Brasil', 'conmebol.libertadores': 'Libertadores',
};
const publicFixture = (f: ConsolidatedFixture | SourceFixture): PublicFixture => ({
  date: f.date, homeTeam: f.homeTeam, awayTeam: f.awayTeam, competition: f.competition,
  kickoffTime: f.kickoffTime ?? null,
  ...('source' in f ? { venue: f.venue, phase: f.phase } : {}),
  ...('status' in f ? { status: f.status, confidence: f.confidence } : {}),
  sources: ('sources' in f ? f.sources : [f]).map(s => ({ source: s.source, date: s.date, kickoffTime: s.kickoffTime ?? null, confirmed: s.confirmed })),
});
const teamKey = (name: string) => slug(canonicalTeam(name));
export function compareReferences(fixtures: PublicFixture[], query: FixtureQuery): Comparison[] {
  return (references[query.month] || []).map(([day, home, away]) => {
    const expectedDate = `${query.year}-${String(query.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const matches = fixtures.filter(f => teamKey(f.homeTeam) === teamKey(home) && teamKey(f.awayTeam) === teamKey(away));
    return { reference: `${expectedDate} — ${home} x ${away}`, found: matches.length > 0,
      dateMatches: matches.some(f => f.date === expectedDate), fixtures: matches };
  });
}

// Structural checks complement (but never replace or adapt) the production parsers.
function assertCBFShape(payload: Record<string, unknown>): string {
  if (!payload || !payload.jogos || typeof payload.jogos !== 'object' || Array.isArray(payload.jogos)) throw new Error('shape');
  let games = 0, categories = 0;
  for (const group of Object.values(payload.jogos)) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error('shape');
    for (const matches of Object.values(group)) {
      categories++;
      if (!Array.isArray(matches)) throw new Error('shape');
      games += matches.length;
      for (const game of matches) {
        if (!game || typeof game !== 'object' || typeof game.mandante?.nome !== 'string' || typeof game.visitante?.nome !== 'string') throw new Error('shape');
      }
    }
  }
  return `jogos: objeto; competições: ${Object.keys(payload.jogos).length}; categorias: ${categories}; partidas no payload: ${games}`;
}
function assertESPNShape(payload: Record<string, unknown>): string {
  if (!payload || !Array.isArray(payload.events)) throw new Error('shape');
  for (const event of payload.events) {
    if (!event || !Array.isArray(event.competitions)) throw new Error('shape');
    for (const game of event.competitions) {
      if (!Array.isArray(game.competitors) || typeof (game.date || event.date) !== 'string') throw new Error('shape');
      for (const side of ['home', 'away']) {
        const competitor = game.competitors.find((c: { homeAway?: string }) => c?.homeAway === side);
        if (typeof competitor?.team?.displayName !== 'string') throw new Error('shape');
      }
    }
  }
  return 'events[] → competitions[] → competitors[]; date e mandante/visitante reconhecidos';
}
async function boundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty');
  let bytes = 0, text = ''; const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > 3_000_000) { await reader.cancel(); throw new Error('size'); }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { reader.releaseLock(); }
}
function observedFetcher(source: FixtureSource, audit: SourceAudit, fetcher: Fetcher): Fetcher {
  return async (input, init) => {
    const url = new URL(input);
    const league = url.pathname.split('/').at(-2) || '';
    const target = source === 'CBF' ? url.pathname : source === 'ESPN' ? `${league} ${url.searchParams.get('dates')}` : `${source}: página oficial do adapter`;
    const record: RequestAudit = { target, httpStatus: null, outcome: 'network_error' };
    audit.requests.push(record);
    let response: Response;
    try { response = await fetcher(input, init); }
    catch { record.issue = 'Requisição não concluída (rede/timeout/redirect recusado).'; throw new Error('source_network'); }
    record.httpStatus = response.status;
    if (!response.ok) { record.outcome = 'http_error'; record.issue = 'Fonte retornou HTTP sem sucesso.'; return response; }
    let text: string;
    try { text = await boundedText(response.clone()); }
    catch { record.issue = 'Não foi possível ler a resposta dentro do limite de 3 MB e do timeout do adapter.'; return response; }
    try {
      if (source === 'CBF') {
        const payload = JSON.parse(text);
        record.structure = assertCBFShape(payload);
        const date = url.pathname.slice(-10).replaceAll('/', '-');
        record.extracted = parseCBF(payload, date, input).length;
      } else if (source === 'ESPN') {
        const payload = JSON.parse(text);
        record.structure = assertESPNShape(payload);
        record.events = payload.events.length;
        if (!competitionByLeague[league]) throw new Error('league');
        record.extracted = parseESPN(payload, competitionByLeague[league], input).length;
      } else {
        record.jsonLdFound = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(text);
        const structured = parseSportsEvents(text, source, input);
        record.compatibleJsonLd = structured.length;
        if (source === 'Palmeiras') {
          record.usedHtmlFallback = !structured.length;
          const calendar = parsePalmeirasCalendar(text, input);
          record.extracted = calendar.fixtures.length;
          if (!calendar.recognized) throw new Error('html_shape');
        } else record.extracted = structured.filter(f => f.competition === 'Libertadores').length;
        if (source === 'CONMEBOL' && !record.extracted) throw new Error('html_shape');
        record.structure = structured.length ? 'SportsEvent JSON-LD compatível' : 'Fallback HTML do adapter reconheceu partidas';
      }
      record.outcome = 'ok';
    } catch {
      record.outcome = 'format_error';
      record.issue = 'HTTP 2xx recebido, mas estrutura incompatível com o adapter atual; corrigir com base na resposta real. Nenhuma adaptação foi feita pelo validador.';
    }
    // Return the original unmodified response. The real adapter still performs parsing and normalization.
    return response;
  };
}

export async function validateMonth(query: FixtureQuery, fetcher: Fetcher = fetch, conmebolUrl?: string): Promise<MonthReport> {
  const names: FixtureSource[] = ['CBF', 'ESPN', 'Palmeiras', 'CONMEBOL'];
  const audits = names.map(source => ({ source, state: source === 'CONMEBOL' && !conmebolUrl ? 'not_configured' : 'unavailable',
    requests: [], fixtures: [], extracted: 0 } as SourceAudit));
  const loaders = {} as Record<FixtureSource, SourceLoader>;
  const criticalErrors: string[] = [];
  const fetchers = Object.fromEntries(audits.map(audit => [audit.source, observedFetcher(audit.source, audit, fetcher)]));
  const realLoaders = makeLoaders(conmebolUrl, fetchers);
  for (const audit of audits) {
    loaders[audit.source] = async (q, seeds, context) => {
      const notNeeded = !!seeds && (audit.source === 'CBF' ? !seeds.some(f => f.competition !== 'Libertadores')
        : audit.source === 'CONMEBOL' ? !seeds.some(f => f.competition === 'Libertadores')
        : audit.source === 'ESPN' ? !seeds.length && !context?.fallbackCompetitions?.length : false);
      try {
        const result = await realLoaders[audit.source](q, seeds, context);
        audit.extracted = normalizeFixtures(result.fixtures).length;
        const prefix = `${query.year}-${String(query.month).padStart(2, '0')}-`;
        audit.fixtures = normalizeFixtures(result.fixtures).filter(f => f.date.startsWith(prefix)).map(publicFixture);
        if (notNeeded) audit.state = audit.source === 'CONMEBOL' && !conmebolUrl ? 'not_configured' : 'not_applicable';
        else audit.state = audit.requests.some(r => r.outcome !== 'ok') ? 'partial' : 'ok';
        return result;
      } catch {
        if (audit.state !== 'not_configured') audit.state = 'unavailable';
        if (audit.requests.length && audit.requests.every(r => r.outcome === 'ok')) {
          audit.state = 'incompatible'; criticalErrors.push(`${audit.source}: adapter falhou após receber estrutura reconhecida.`);
        } else if (!audit.requests.length && audit.state !== 'not_configured' && !notNeeded) {
          criticalErrors.push(`${audit.source}: adapter/configuração falhou antes de iniciar a consulta.`);
        }
        throw new Error('Source validation failed');
      } finally {
        if (audit.requests.some(r => r.outcome === 'format_error')) {
          audit.state = 'incompatible'; criticalErrors.push(`${audit.source}: formato real incompatível com o adapter.`);
        }
        if (audit.source === 'CBF') {
          audit.daysConsulted = audit.requests.length;
          audit.successfulDays = audit.requests.filter(r => r.outcome === 'ok').length;
        }
      }
    };
  }
  const result = await syncFixtures(query, loaders, () => {});
  if (!audits.some(a => a.source !== 'ESPN' && a.requests.some(r => r.outcome === 'ok'))) {
    criticalErrors.push('Nenhuma fonte principal oficial (CBF/Palmeiras/CONMEBOL) foi acessada com estrutura compatível. ESPN sozinha não satisfaz a validação.');
  }
  const consolidated = result.fixtures.map(publicFixture);
  const comparison = compareReferences(consolidated, query);
  const warnings = result.sourceErrors.map(e => `${e.source}: ${e.message}`);
  if (!conmebolUrl) warnings.push('CONMEBOL: integração oficial ainda não configurada');
  if (!consolidated.length) warnings.push('Nenhum jogo consolidado nas fontes disponíveis; isso não comprova ausência de partidas.');
  return { ...query, sources: audits, consolidated, comparison, discoverySource: result.discoverySource,
    discoveryFallback: result.discoveryFallback, discoveryCount: result.discoveryCount, discoveryCoverage: result.discoveryCoverage,
    totalRequests: audits.reduce((sum, audit) => sum + audit.requests.length, 0),
    extraFixtures: comparison.length ? consolidated.filter(f => !comparison.some(c => c.fixtures.includes(f))) : [],
    sourceErrors: result.sourceErrors, warnings, criticalErrors: [...new Set(criticalErrors)] };
}

export async function validateAllSources(fetcher: Fetcher = fetch, conmebolUrl?: string, execution: 'live' | 'test' = 'live'): Promise<ValidationReport> {
  const report: ValidationReport = { generatedAt: new Date().toISOString(), execution, months: [], criticalErrors: [] };
  // Sequential months preserve the adapters' concurrency cap instead of tripling CBF fanout.
  for (const month of [9, 10, 11]) {
    try {
      const result = await validateMonth({ month, year: 2026 }, fetcher, conmebolUrl);
      report.months.push(result);
      report.criticalErrors.push(...result.criticalErrors.map(e => `${month}/2026 — ${e}`));
    } catch {
      report.criticalErrors.push(`${month}/2026 — Erro de código impediu concluir a validação do mês (sem stack/payload no relatório).`);
    }
  }
  return report;
}
const cell = (value: unknown) => String(value ?? '').replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|').replace(/`/g, "'");
const tableFixtures = (fixtures: PublicFixture[]) => [
  '| Data | Confronto | Competição | Horário discovery | Status | Confidence | Fontes e datas |',
  '|---|---|---|---|---|---|---|',
  ...fixtures.map(f => `| ${cell(f.date)} | ${cell(f.homeTeam)} x ${cell(f.awayTeam)} | ${cell(f.competition)} | ${cell(f.kickoffTime === null ? 'A DEFINIR' : f.kickoffTime || '—')} | ${cell(f.status || 'observação da fonte')} | ${cell(f.confidence || 'não atribuída isoladamente')} | ${f.sources.map(s => `${cell(s.source)}: ${cell(s.date)} ${cell(s.kickoffTime || 'A definir')} (${s.confirmed ? 'detalhada' : 'não confirmada pela autoridade'})`).join('; ')} |`),
  ...(!fixtures.length ? ['| — | Nenhuma partida extraída/disponível | — | — | — | — | — |'] : []),
].join('\n');
export function renderReport(report: ValidationReport): string {
  const lines = ['# Validação real de fontes — Calendar Creator', '', `Execução: **${report.execution}** · ${report.generatedAt}`,
    '', 'Este relatório reutiliza os adapters, normalização e conciliação de produção. As referências históricas não são observações de fonte. ESPN continua secundária. Ausência de partidas não prova cobertura completa.',
    '', `Resultado: **${report.criticalErrors.length ? 'FALHOU — há erros críticos' : 'concluído sem erros críticos (ver cobertura e warnings)'}**`, ''];
  for (const month of report.months) {
    lines.push(`## ${String(month.month).padStart(2, '0')}/${month.year}`, '',
      `Estratégia: discovery + verification; discoverySource: ${month.discoverySource}; discoveryFallback: ${month.discoveryFallback}; jogos descobertos: ${month.discoveryCount}; cobertura: ${month.discoveryCoverage}; requests totais: ${month.totalRequests}.`, '');
    for (const audit of month.sources) {
      lines.push(`### ${audit.source}: ${audit.state}`, '');
      if (audit.state === 'not_configured') lines.push('CONMEBOL: integração oficial ainda não configurada', '');
      if (audit.daysConsulted !== undefined) lines.push(`Dias consultados: ${audit.daysConsulted}; dias com sucesso e estrutura válida: ${audit.successfulDays}.`, '');
      lines.push(`Fixtures extraídas pelo adapter: ${audit.extracted}; partidas do Palmeiras no mês: ${audit.fixtures.length}.`, '',
        '| Consulta | HTTP | Resultado | Eventos | Extraídas | Estrutura / JSON-LD / fallback |', '|---|---|---|---|---|---|');
      for (const request of audit.requests) lines.push(`| ${cell(request.target)} | ${request.httpStatus ?? 'sem resposta'} | ${request.outcome} | ${request.events ?? '—'} | ${request.extracted ?? '—'} | ${cell(request.structure || request.issue)}${request.jsonLdFound !== undefined ? `; JSON-LD: ${request.jsonLdFound}; compatíveis: ${request.compatibleJsonLd}; fallback HTML: ${request.usedHtmlFallback ?? false}` : ''} |`);
      lines.push('', tableFixtures(audit.fixtures), '');
    }
    lines.push('### Resultado consolidado', '', tableFixtures(month.consolidated), '');
    if (month.comparison.length) {
      lines.push('### Comparação com referência histórica', '', '| Referência | Encontrado | Mesma data | Resultado real (datas / status / confidence / fontes) |', '|---|---|---|---|');
      for (const comparison of month.comparison) lines.push(`| ${cell(comparison.reference)} | ${comparison.found ? 'sim' : 'não nas fontes disponíveis'} | ${comparison.dateMatches ? 'sim' : 'não'} | ${comparison.fixtures.map(f => `${cell(f.date)}: ${cell(f.status)}, ${cell(f.confidence)}; ${f.sources.map(s => `${cell(s.source)} ${cell(s.date)}`).join(', ')}`).join('; ') || 'não apurado/encontrado nas fontes disponíveis'} |`);
      lines.push('', `Referências: ${month.comparison.length}; confrontos encontrados: ${month.comparison.filter(c => c.found).length}; com mesma data: ${month.comparison.filter(c => c.dateMatches).length}.`, '', 'Jogos adicionais às referências:', '', tableFixtures(month.extraFixtures), '');
    }
    lines.push('### Divergências', '', tableFixtures(month.consolidated.filter(f => f.status === 'conflict')), '',
      '### Warnings', '', ...month.warnings.map(w => `- ${cell(w)}`), '', '### sourceErrors', '',
      ...month.sourceErrors.map(e => `- ${e.source}: ${cell(e.message)}`), '', '### Erros críticos', '', ...month.criticalErrors.map(e => `- ${cell(e)}`), '');
  }
  lines.push('## Erros críticos da execução', '', ...(report.criticalErrors.length ? report.criticalErrors.map(e => `- ${cell(e)}`) : ['Nenhum.']), '');
  return lines.join('\n');
}
