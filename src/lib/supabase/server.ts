import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Server-only Supabase client. Uses the service_role key, which bypasses RLS.
// Safe because this module is only imported from Server Actions ('use server')
// and never ships to the browser. Never import this from a Client Component.
export async function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
