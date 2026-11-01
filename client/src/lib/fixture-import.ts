import type { ConsolidatedFixture, FixtureQuery } from '../../../supabase/functions/_shared/contracts';
import { canonicalTeam, normalizeKickoffTime } from '../../../supabase/functions/_shared/normalize';
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
  const seen = new Set<string>();
  if (mode === 'append') for (const line of current.split('\n')) {
    const m = line.trim().match(/^(\d{1,2})(?:\s+\d{2}:\d{2})?\s*-\s*(.+?)\s+x\s+(.+)$/i);
    if (m) seen.add(key(Number(m[1]), m[2], m[3]));
  }
  const prefix = `${period.year}-${String(period.month).padStart(2, '0')}-`;
  const added = [...fixtures].sort((a, b) => a.date.localeCompare(b.date)).map(f => {
    // A conflict can have the authority's date outside the requested month. Never silently import it.
    if (!f.date.startsWith(prefix)) throw new Error('Um jogo selecionado está fora do mês consultado. Revise a divergência.');
    const day = Number(f.date.slice(8, 10)), home = teamName(f.homeTeam), away = teamName(f.awayTeam);
    const id = key(day, home, away);
    if (seen.has(id)) return '';
    seen.add(id);
    return `${String(day).padStart(2, '0')}${normalizeKickoffTime(f.kickoffTime) ? ` ${normalizeKickoffTime(f.kickoffTime)}` : ''} - ${home} x ${away}`;
  }).filter(Boolean).join('\n');
  return mode === 'append' ? [current.trimEnd(), added].filter(Boolean).join('\n') : added;
}
