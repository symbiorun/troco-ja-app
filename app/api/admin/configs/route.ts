import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";

const UpdateConfigsSchema = z.record(z.string());

/**
 * GET /api/admin/configs
 * Returns all admin configurations. Requires admin or operator role.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const admin = createAdminClient();

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "operator"].includes(profile.role)) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { data: configs, error } = await admin
      .from("admin_configs")
      .select("key, value, value_type, description")
      .order("key");

    if (error) {
      return NextResponse.json({ error: "Erro ao buscar configurações" }, { status: 500 });
    }

    return NextResponse.json(configs);
  } catch (err) {
    console.error("[GET /api/admin/configs]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/configs
 * Updates one or more admin configurations. Requires admin role only.
 * Body: { key: "value", ... }
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const admin = createAdminClient();

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.role !== "admin") {
      return NextResponse.json({ error: "Somente administradores podem alterar configurações" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = UpdateConfigsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
    }

    const updates = parsed.data;
    const errors: string[] = [];

    for (const [key, value] of Object.entries(updates)) {
      const { error: uErr } = await admin
        .from("admin_configs")
        .update({ value, updated_at: new Date().toISOString() })
        .eq("key", key);

      if (uErr) errors.push(`Falha ao atualizar ${key}: ${uErr.message}`);
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: "Erros parciais", details: errors }, { status: 207 });
    }

    // Audit log
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "admin_configs_updated",
      metadata: { updated_keys: Object.keys(updates) },
    });

    return NextResponse.json({ success: true, updated: Object.keys(updates).length });
  } catch (err) {
    console.error("[PATCH /api/admin/configs]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
