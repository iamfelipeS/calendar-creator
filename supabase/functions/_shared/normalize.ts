import type { Competition, SourceFixture } from './contracts.ts';

export const slug = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const aliases: Record<string, string> = {
  'SE PALMEIRAS': 'Palmeiras', 'PALMEIRAS SP': 'Palmeiras', 'S E PALMEIRAS': 'Palmeiras',
  'PALMEIRAS': 'Palmeiras', 'SANTOS FC': 'Santos', 'SANTOS SP': 'Santos',
  'BOTAFOGO RJ': 'Botafogo', 'ATHLETICO PR': 'Athletico Paranaense',
  'ATHLETICO': 'Athletico Paranaense', 'ATHLETICO PARANAENSE': 'Athletico Paranaense',
  'ATLETICO PR': 'Athletico Paranaense', 'LDU': 'LDU Quito', 'LDU EQU': 'LDU Quito',
  'LIGA DE QUITO': 'LDU Quito', 'LIGA DEPORTIVA UNIVERSITARIA': 'LDU Quito',
  'RB BRAGANTINO': 'Red Bull Bragantino', 'BRAGANTINO': 'Red Bull Bragantino',
  'VASCO DA GAMA': 'Vasco', 'VASCO DA GAMA SAF': 'Vasco',
};
export const canonicalTeam = (name: string) => {
  const clean = name.trim().replace(/\s+/g, ' ');
  return aliases[slug(clean)] || aliases[slug(clean).replace(/ (SP|RJ|RS|MG|BA|SC|PA|PR)$/, '')] || clean;
};
export function competitionFrom(value: string): Competition | null {
  const s = slug(value);
  if (/SUB ?\d|FEMIN|WOMEN|YOUTH|U ?\d{2}/.test(s)) return null;
  if (/LIBERTADORES/.test(s)) return 'Libertadores';
  if (/COPA DO BRASIL/.test(s)) return 'Copa do Brasil';
  if (/BRASILEIR|CAMPEONATO BRASILEIRO/.test(s) && !/SERIE [BCD]/.test(s)) return 'Brasileirão';
  return null;
}
export function localDate(value: string): string | null {
  if (typeof value !== 'string') return null;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) value = `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? value : null;
  }
  // Never let a timezone-less timestamp inherit the Edge runtime's timezone.
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(value)) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (key: string) => parts.find(p => p.type === key)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function normalizeFixtures(rows: SourceFixture[]): SourceFixture[] {
  const seen = new Set<string>();
  return rows.flatMap(row => {
    if (typeof row.homeTeam !== 'string' || typeof row.awayTeam !== 'string') return [];
    const date = localDate(row.date);
    const homeTeam = canonicalTeam(row.homeTeam), awayTeam = canonicalTeam(row.awayTeam);
    if (!date || !homeTeam || !awayTeam || ![homeTeam, awayTeam].some(t => slug(t) === 'PALMEIRAS' ||
      (row.conditional && slug(t).includes('PALMEIRAS')))) return [];
    const key = `${row.source}|${row.sourceId}|${date}|${slug(homeTeam)}|${slug(awayTeam)}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ ...row, date, homeTeam, awayTeam }];
  });
}
