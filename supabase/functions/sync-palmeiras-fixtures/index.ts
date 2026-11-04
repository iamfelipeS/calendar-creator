import { createHandler, makeLoaders } from './handler.ts';

// Public read-only search: no database writes and no privileged Supabase key.
Deno.serve(createHandler(makeLoaders(Deno.env.get('CONMEBOL_FIXTURES_URL'))));
