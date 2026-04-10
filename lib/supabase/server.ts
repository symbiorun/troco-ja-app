import { createServerClient as _createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Cliente Supabase com anon key para Server Components / Route Handlers.
 * Mantém sessão do usuário via cookies. Respeita RLS.
 *
 * Named createServerClient to match import used in API routes.
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return _createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
          );
        } catch {
          // Silently ignore in Server Components (can't set cookies there)
        }
      },
    },
  });
}

/**
 * Alias para compatibilidade com componentes que importam createClient.
 */
export const createClient = createServerClient;

/**
 * Cliente admin com service_role key — bypassa RLS completamente.
 * NUNCA expor no cliente browser.
 * NÃO precisa de cookies pois usa service_role (não há sessão de usuário).
 */
export function createAdminClient() {
  // Service role client doesn't need cookie-based auth
  return _createServerClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    cookies: {
      getAll() { return []; },
      setAll() {},
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
