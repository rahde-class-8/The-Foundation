import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { getEnv } from './env';

const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = getEnv();

export const supabase = createClient<Database>(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
