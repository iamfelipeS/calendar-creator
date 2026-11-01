import type { FixtureQuery, SourceFixture } from './contracts.ts';
import { competitionFrom, localDate, normalizeFixtures, slug } from './normalize.ts';
import { parseSportsEvents } from './structured-events.ts';

interface Element { tag: string; attrs: Record<string, string>; children: (Element | string)[]; parent?: Element }
const entities: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", times: '×',
  atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ccedil: 'ç',
  acirc: 'â', ecirc: 'ê', ocirc: 'ô', agrave: 'à', ndash: '–', mdash: '—' };
const decode = (s: string) => s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (all, entity: string) => {
  if (entity[0] === '#') { const n = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all; }
  const value = entities[entity.toLowerCase()]; return value && entity[0] === entity[0].toUpperCase() ? value.toUpperCase() : value || all;
});
// Minimal non-executing HTML tree: quoted attributes and parent/child boundaries are preserved.
// No site prose is converted into a global date/team regex search.
function tree(html: string): Element {
  const root: Element = { tag: 'root', attrs: {}, children: [] }; const stack = [root];
  const clean = html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '');
  for (const token of clean.matchAll(/<\/?[a-z][^"'<>]*(?:(?:"[^"]*"|'[^']*')[^"'<>]*)*>|[^<]+/gi)) {
    const value = token[0];
    if (!value.startsWith('<')) { stack.at(-1)!.children.push(decode(value)); continue; }
    const tag = value.match(/^<\/?([\w:-]+)/)?.[1].toLowerCase(); if (!tag) continue;
    if (value.startsWith('</')) {
      const index = stack.map(e => e.tag).lastIndexOf(tag); if (index > 0) stack.length = index;
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const attr of value.slice(tag.length + 1).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4]);
    const node: Element = { tag, attrs, children: [], parent: stack.at(-1) }; node.parent!.children.push(node);
    if (!/^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag) && !value.endsWith('/>')) stack.push(node);
  }
  return root;
}
const children = (node: Element): Element[] => node.children.filter((c): c is Element => typeof c !== 'string');
const walk = (node: Element): Element[] => [node, ...children(node).flatMap(walk)];
const text = (node: Element): string => node.children.map(c => typeof c === 'string' ? c : c.tag === 'img' ? c.attrs.alt || '' : text(c)).join(' ').replace(/\s+/g, ' ').trim();
const marker = (node: Element) => `${node.attrs.id || ''} ${node.attrs.class || ''} ${node.attrs['data-calendar'] || ''}`.toLowerCase();
const news = (node: Element) => /noticia|related|news|post-item/.test(marker(node));
function excluded(node: Element): boolean { for (let p: Element | undefined = node; p; p = p.parent) if (news(p) || ['nav', 'footer', 'aside'].includes(p.tag)) return true; return false; }
const calendar = (node: Element) => /calend[áa]rio|calendar|fixture|proximas?-partidas|proximos?-jogos|lista-jogos/.test(marker(node));
const fullCalendar = (node: Element) => /calendario.?completo|calendário.?completo|full.?calendar/.test(marker(node)) ||
  children(node).some(c => /^h[1-6]$/.test(c.tag) && slug(text(c)) === 'CALENDARIO COMPLETO');
function gameLink(node: Element): boolean {
  if (node.tag !== 'a' || !node.attrs.href) return false;
  try { const url = new URL(node.attrs.href, 'https://www.palmeiras.com.br');
    return /(^|\.)palmeiras\.com\.br$/.test(url.hostname) && /\/jogo\/?$/.test(url.pathname) && /^\d+$/.test(url.searchParams.get('idjogo') || '');
  } catch { return false; }
}
const teams = (node: Element): RegExpMatchArray | null => text(node).match(/^(.{2,70}?)\s+[x×]\s+(.{2,70}?)$/i);
const belongsToMonth = (row: SourceFixture, query?: FixtureQuery) => !query || row.date.startsWith(`${query.year}-${String(query.month).padStart(2, '0')}-`);
export interface CalendarPage {
  fixtures: SourceFixture[];
  coverage: 'calendar' | 'upcoming_only' | 'unknown';
  warnings: string[];
  recognized: boolean;
}
export function parsePalmeirasCalendar(html: string, url: string, query?: FixtureQuery): CalendarPage {
  const structured = parseSportsEvents(html, 'Palmeiras', url);
  const root = tree(html); const nodes = walk(root); const rows: SourceFixture[] = [];
  let coverage: CalendarPage['coverage'] = nodes.some(n => !excluded(n) && fullCalendar(n)) ? 'calendar' : 'unknown';
  let missingYear = false;
  const anchors = nodes.filter(n => gameLink(n) && teams(n) && !excluded(n));
  for (const anchor of anchors) {
    const pair = teams(anchor)!;
    let scope: Element | undefined;
    for (let p = anchor.parent; p; p = p.parent) {
      if (fullCalendar(p)) { scope = p; break; }
      if (!scope && calendar(p)) scope = p;
    }
    // Explicit game links are accepted only in calendar/next-match blocks, never in news.
    if (!scope) continue;
    const isFull = fullCalendar(scope);
    if (isFull) coverage = 'calendar'; else if (coverage === 'unknown') coverage = 'upcoming_only';
    let card: Element | undefined;
    for (let p = anchor.parent; p; p = p.parent) {
      const content = text(p);
      const links = walk(p).filter(n => gameLink(n) && teams(n));
      const confrontations = new Set(links.map(n => slug(text(n))));
      if (confrontations.size > 1) break;
      if (confrontations.size === 1 && /\b\d{1,2}\/\d{2}\b/.test(content) && competitionFrom(content)) { card = p; break; }
      if (p === scope) break;
    }
    if (!card) continue;
    const content = text(card); const competition = competitionFrom(content); if (!competition) continue;
    const d = content.match(/\b(\d{1,2})\/(\d{2})(?:\/(20\d{2}))?\b/); if (!d) continue;
    const years = new Set((text(scope).match(/\b20\d{2}\b/g) || []).map(Number));
    const explicitYear = d[3] || card.attrs['data-year'] || scope.attrs['data-year'] || content.match(/\b(20\d{2})\b/)?.[1];
    const year = explicitYear ? Number(explicitYear) : years.size === 1 ? [...years][0] : undefined;
    if (!year) { missingYear = true; continue; }
    const date = localDate(`${year}-${d[2]}-${d[1].padStart(2, '0')}`); if (!date) continue;
    const time = content.match(/\b(\d{1,2})[hH:](\d{2})\b/);
    const kickoffTime = time && Number(time[1]) < 24 && Number(time[2]) < 60 ? `${time[1].padStart(2, '0')}:${time[2]}` : null;
    const gameUrl = new URL(anchor.attrs.href, url);
    const venueNode = walk(card).find(n => /(?:^|[-_\s])(estadio|stadium|venue|local)(?:$|[-_\s])/.test(marker(n)));
    const phase = content.match(/\b(Semifinal|Final|Quartas(?: de final)?|Oitavas(?: de final)?|Fase de grupos)\b/i)?.[0];
    rows.push({ source: 'Palmeiras', sourceId: gameUrl.searchParams.get('idjogo')!, url: gameUrl.href,
      date, homeTeam: pair[1], awayTeam: pair[2], competition, confirmed: false,
      conditional: /VENCEDOR|CLASSIFICADO|TBD|A DEFINIR/.test(slug(`${pair[1]} ${pair[2]}`)),
      kickoffTime, venue: venueNode ? text(venueNode) : undefined, phase,
      round: content.match(/\b(\d+)\s*(?:ª|a)?\s*rodada\b/i)?.[1],
      note: /A DEFINIR/.test(slug(content)) && !kickoffTime ? 'Horário a definir; descoberta de data-base, sem confirmação oficial da competição.' : undefined,
    });
  }
  // Preserve compatibility with a standalone semantic fixture fragment. A complete site page
  // must use explicit calendar/card boundaries above; arbitrary site prose is never scanned.
  if (!anchors.length && !/<(?:html|body|nav|section|article)\b/i.test(html)) {
    const fragment = html.trim().match(/^<div[^>]*>([^<]+\b20\d{2})\s*\|\s*(\d{2}\/\d{2}\/\d{4})\s*\|[^<]*<\/div>\s*<p[^>]*>([^<]+?)\s+[x×]\s+([^<]+)<\/p>$/i);
    const competition = fragment && competitionFrom(decode(fragment[1]));
    if (fragment && competition) rows.push({ source: 'Palmeiras', sourceId: `${fragment[2]}-${fragment[3]}-${fragment[4]}`, url,
      date: fragment[2], homeTeam: decode(fragment[3]), awayTeam: decode(fragment[4]), competition, confirmed: false, conditional: false });
  }
  const fixtures = normalizeFixtures([...structured, ...rows]).filter(f => belongsToMonth(f, query));
  // Prefer the calendar observation when structured data repeats the same match under another ID.
  const unique = [...new Map(fixtures.map(f => [`${f.date}|${slug(f.homeTeam)}|${slug(f.awayTeam)}|${f.competition}`, f])).values()];
  return { fixtures: unique, coverage, recognized: !!structured.length || !!rows.length || nodes.some(n => calendar(n) || fullCalendar(n)), warnings: missingYear ? ['Palmeiras: cartões sem ano/temporada inequívoca foram ignorados; não foi inferido o ano da consulta.'] : [] };
}
