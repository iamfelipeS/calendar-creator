const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in repository Actions Variables.');
}

if (new URL(url).protocol !== 'https:') {
  throw new Error('VITE_SUPABASE_URL must use HTTPS.');
}

let publicKey = key.startsWith('sb_publishable_');
if (!publicKey && key.split('.').length === 3) {
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    publicKey = payload.role === 'anon';
  } catch {
    // Invalid JWTs are rejected below without exposing their contents.
  }
}
if (!publicKey) {
  throw new Error('Use a Supabase publishable or legacy anon key; secret and service_role keys are forbidden.');
}

console.log('Supabase public build configuration validated.');
