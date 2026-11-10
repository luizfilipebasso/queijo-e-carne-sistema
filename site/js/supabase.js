import { createClient } from './supabase-lib.js';
import { SUPABASE_URL, SUPABASE_CHAVE_PUBLICAVEL } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_CHAVE_PUBLICAVEL);
