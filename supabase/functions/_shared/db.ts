import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Cliente con service_role: la función es backend de confianza (bypassa RLS).
export function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key, { auth: { persistSession: false } });
}
