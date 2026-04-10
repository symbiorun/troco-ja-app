import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rotas públicas — qualquer visitante pode acessar
const PUBLIC_ROUTES = ["/simulacao", "/cadastro", "/auth"];

// Rotas que exigem apenas autenticação de cliente (qualquer role)
const CLIENT_AUTH_ROUTES = [
  "/pix",
  "/documentos",
  "/contrato",
  "/pagamento",
  "/status",
];

// Rotas de staff — exigem role 'operator' ou 'admin'
const STAFF_ROUTES = ["/staff"];

// Rotas de admin — exigem role 'admin' exclusivamente
const ADMIN_ROUTES = ["/staff/admin"];

// Webhooks — SEM autenticação via middleware (têm verificação própria)
// Garantido pelo matcher abaixo (api/webhook/* excluído explicitamente)

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Rotas públicas — permitir sem auth
  if (PUBLIC_ROUTES.some((r) => path.startsWith(r))) {
    return supabaseResponse;
  }

  // Rotas de staff/admin — verificam role
  const isAdminRoute = ADMIN_ROUTES.some((r) => path.startsWith(r));
  const isStaffRoute = STAFF_ROUTES.some((r) => path.startsWith(r));

  if (isAdminRoute || isStaffRoute) {
    if (!user) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile as { role?: string } | null)?.role;

    // /staff/admin/* — apenas admins
    if (isAdminRoute && role !== "admin") {
      return NextResponse.redirect(new URL("/staff", request.url));
    }

    // /staff/* — operator ou admin
    if (isStaffRoute && !["operator", "admin"].includes(role ?? "")) {
      return NextResponse.redirect(new URL("/simulacao", request.url));
    }

    return supabaseResponse;
  }

  // Rotas do cliente autenticado — qualquer usuário com sessão válida
  if (CLIENT_AUTH_ROUTES.some((r) => path.startsWith(r))) {
    if (!user) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", path);
      return NextResponse.redirect(loginUrl);
    }
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Processa todas as rotas EXCETO:
     * - _next/static  (arquivos estáticos)
     * - _next/image   (otimização de imagens)
     * - favicon.ico, assets
     * - api/webhook/* — webhooks têm verificação própria (token/HMAC)
     * - arquivos com extensão (svg, png, jpg, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|assets|api/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
