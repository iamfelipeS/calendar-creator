import { matchLinePattern, matchTimeText } from './match-time';
import type { ConsolidatedFixture, FixtureQuery } from '../../../supabase/functions/_shared/contracts';
import { canonicalTeam } from '../../../supabase/functions/_shared/normalize';
import { normalizeTeamSlug } from './team-names';

export const calendarMonths = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
export const monthNumber = (name: string) => calendarMonths.findIndex(m => normalizeTeamSlug(m) === normalizeTeamSlug(name)) + 1;
export type ImportMode = 'replace' | 'append';

export function importFixturesText(current: string, fixtures: ConsolidatedFixture[], period: FixtureQuery,
  mode: ImportMode, assetTeamNames: string[] = []): string {
  const names = new Map(assetTeamNames.map(name => [normalizeTeamSlug(canonicalTeam(name)), name]));
  const teamName = (value: string) => names.get(normalizeTeamSlug(canonicalTeam(value))) || canonicalTeam(value);
  const key = (day: number, home: string, away: string) =>
    `${period.year}-${period.month}-${day}|${normalizeTeamSlug(canonicalTeam(home))}|${normalizeTeamSlug(canonicalTeam(away))}`;
  const lines = mode === 'append' && current.trimEnd() ? current.trimEnd().split('\n') : [];
  const seen = new Map<string, number>();
  lines.forEach((line, index) => {
    const m = line.trim().match(matchLinePattern);
    if (m) seen.set(key(Number(m[1]), m[3], m[4]), index);
  });
  const prefix = `${period.year}-${String(period.month).padStart(2, '0')}-`;
  for (const f of [...fixtures].sort((a, b) => a.date.localeCompare(b.date))) {
    // A conflict can have the authority's date outside the requested month. Never silently import it.
    if (!f.date.startsWith(prefix)) throw new Error('Um jogo selecionado está fora do mês consultado. Revise a divergência.');
    const day = Number(f.date.slice(8, 10)), home = teamName(f.homeTeam), away = teamName(f.awayTeam);
    const id = key(day, home, away);
    const index = seen.get(id);
    if (index !== undefined) {
      const old = lines[index].trim().match(matchLinePattern)!;
      // Only enrich absent information; retain explicit decisions and user edits.
      if (old[2] === undefined && f.kickoffTime !== undefined) {
        lines[index] = `${old[1]}${matchTimeText(f.kickoffTime)} - ${old[3]} x ${old[4]}`;
      }
      continue;
    }
    seen.set(id, lines.length);
    lines.push(`${String(day).padStart(2, '0')}${matchTimeText(f.kickoffTime)} - ${home} x ${away}`);
  }
  return lines.join('\n');
}
