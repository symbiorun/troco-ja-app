import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rotas que requerem autenticação
const PROTECTED_CLIENT_ROUTES = [
  "/pix",
  "/documentos",
  "/contrato",
  "/pagamento",
  "/status",
];

// Rotas exclusivas para staff (operador/admin)
const STAFF_ROUTES = ["/dashboard", "/admin"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Rotas protegidas do cliente — redireciona para login
  if (PROTECTED_CLIENT_ROUTES.some((r) => path.startsWith(r)) && !user) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", path);
    return NextResponse.redirect(loginUrl);
  }

  // Rotas de staff — verifica role
  if (STAFF_ROUTES.some((r) => path.startsWith(r))) {
    if (!user) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }

    // Verifica role no perfil
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role;
    if (!role || !["operator", "admin"].includes(role)) {
      return NextResponse.redirect(new URL("/simulacao", request.url));
    }

    // Admin routes — apenas admin
    if (path.startsWith("/admin") && role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|assets|api/webhook|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
