import type { FixtureSource, SourceFixture } from './contracts.ts';
import { competitionFrom, normalizeFixtures, timestampKickoffTime, slug } from './normalize.ts';

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
          date: node.startDate, kickoffTime: timestampKickoffTime(node.startDate), homeTeam: home, awayTeam: away, competition,
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

