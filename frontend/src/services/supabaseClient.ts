import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const isTest = import.meta.env.MODE === 'test'

if (!supabaseUrl || !supabaseAnonKey) {
  if (!isTest) {
    throw new Error('Missing Supabase environment variables')
  }
}

/** Shared Supabase client for all frontend data/auth calls. */
export const supabase = createClient(supabaseUrl ?? 'http://localhost', supabaseAnonKey ?? 'test-anon-key')
