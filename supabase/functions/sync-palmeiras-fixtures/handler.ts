import { makeLoaders, syncFixtures } from '../_shared/sync.ts';
import type { SourceLoader } from '../_shared/sync.ts';
import type { FixtureSource } from '../_shared/contracts.ts';

export function allowedOrigin(origin: string): boolean {
  if (origin === 'https://iamfelipes.github.io') return true;
  try {
    const url = new URL(origin);
    return url.origin === origin && ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch { return false; }
}
export const createHandler = (loaders?: Record<FixtureSource, SourceLoader>) => async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Vary': 'Origin', 'Cache-Control': 'no-store' };
  if (origin && !allowedOrigin(origin)) return new Response(JSON.stringify({ error: 'Origem não permitida.' }), { status: 403, headers });
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
  headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);
  let query: { month: number; year: number };
  try {
    const body = await request.text();
    if (body.length > 1024) return reply({ error: 'Requisição muito grande.' }, 413);
    query = JSON.parse(body);
    if (!query || !Number.isInteger(query.month) || query.month < 1 || query.month > 12 ||
      !Number.isInteger(query.year) || query.year < 2020 || query.year > 2100) throw new Error();
  } catch { return reply({ error: 'Informe mês (1–12) e ano (2020–2100) válidos.' }, 400); }
  try { return reply(await syncFixtures({ month: query.month, year: query.year }, loaders)); }
  catch { return reply({ error: 'Não foi possível concluir a busca. Tente novamente.' }, 502); }
};

export { makeLoaders };
