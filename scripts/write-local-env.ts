// Writes .env.local for the SPA from the running local Supabase stack (public values only).
import { writeFileSync } from 'node:fs';
import { readLocalSupabase } from './lib/local-supabase.ts';

const { apiUrl, anonKey } = readLocalSupabase();
writeFileSync('.env.local', `VITE_SUPABASE_URL=${apiUrl}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`);
console.log('Wrote .env.local');
