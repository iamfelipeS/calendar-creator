import type { ConsolidatedFixture, FixtureQuery, SourceFixture } from './contracts.ts';
import { normalizeFixtures, slug } from './normalize.ts';

const authority = (row: SourceFixture) => row.source === (row.competition === 'Libertadores' ? 'CONMEBOL' : 'CBF');
const rank = (row: SourceFixture) => authority(row) ? 0 : row.source === 'Palmeiras' ? 1 : 2;

export function reconcileFixtures(raw: SourceFixture[], query: FixtureQuery): ConsolidatedFixture[] {
  const groups: SourceFixture[][] = [];
  for (const row of normalizeFixtures(raw).sort((a, b) => a.date.localeCompare(b.date))) {
    const compatible = groups.filter(group => {
      const first = group[0];
      if (first.competition !== row.competition || slug(first.homeTeam) !== slug(row.homeTeam) ||
        slug(first.awayTeam) !== slug(row.awayTeam) || first.conditional !== row.conditional) return false;
      if (first.round && row.round && first.round !== row.round) return false;
      if (first.leg && row.leg && first.leg !== row.leg) return false;
      // Keep repeated meetings separate. Cross-source dates can disagree by at most 7 days
      // without an explicit common round; ambiguous candidates remain separate for review.
      if (group.some(r => r.source === row.source && r.sourceId !== row.sourceId)) return false;
      return first.round && row.round ? true : Math.abs(Date.parse(first.date) - Date.parse(row.date)) <= 7 * 86400000;
    });
    if (compatible.length === 1) compatible[0].push(row); else groups.push([row]);
  }
  const prefix = `${query.year}-${String(query.month).padStart(2, '0')}-`;
  return groups.filter(g => g.some(r => r.date.startsWith(prefix))).map(group => {
    const sources = [...group].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date));
    const chosen = sources[0];
    const conditional = sources.some(r => r.conditional);
    const conflicting = new Set(sources.map(r => r.date)).size > 1;
    const official = sources.some(r => authority(r) && r.confirmed);
    const agreement = new Set(sources.map(r => r.source)).size >= 2;
    const status = conflicting ? 'conflict' : conditional ? 'conditional' : official ? 'confirmed' : 'base_date';
    const confidence = conflicting || conditional ? 'low' : official ? 'high' : agreement ? 'medium' : 'low';
    const sameDate = sources.filter(r => r.date === chosen.date);
    const officialTime = sameDate.find(r => authority(r) && r.kickoffTime)?.kickoffTime;
    const times = new Set(sameDate.map(r => r.kickoffTime).filter(Boolean));
    const kickoffTime = officialTime || (times.size === 1 ? [...times][0]! : null);
    const timeNote = times.size > 1 ? 'Divergência de horário entre fontes; prevalece o horário da autoridade quando disponível. Revise as alternativas.'
      : kickoffTime && !officialTime ? 'Horário provisório, sem confirmação da autoridade da competição.' : null;
    const dateNote = conflicting ? 'Fontes divergem. A data exibida prioriza a autoridade da competição; revise as alternativas antes de importar.'
      : conditional ? 'Jogo ocorre apenas se o Palmeiras avançar; participação ainda não confirmada.'
      : !official ? 'Data-base: sem confirmação detalhada da autoridade da competição.' : null;
    return {
      kickoffTime,
      id: `${chosen.competition}|${slug(chosen.homeTeam)}|${slug(chosen.awayTeam)}|${chosen.round || ''}|${chosen.leg || ''}|${chosen.date}|${chosen.sourceId}`,
      date: chosen.date, homeTeam: chosen.homeTeam, awayTeam: chosen.awayTeam,
      competition: chosen.competition, status, confidence, sources,
      note: [dateNote, timeNote].filter(Boolean).join(' ') || null,
    } satisfies ConsolidatedFixture;
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
