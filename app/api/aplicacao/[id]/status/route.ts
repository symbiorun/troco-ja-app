import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, createAdminClient } from "@/lib/supabase/server";
import { ApplicationStatus } from "@/types";

const UpdateStatusSchema = z.object({
  status: z.string() as z.ZodType<ApplicationStatus>,
  notes: z.string().optional(),
});

// Allowed transitions per role
const CLIENT_TRANSITIONS: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  new:            ["simulation_done"],
  simulation_done: ["data_filled"],
  data_filled:    ["pix_data_added"],
  pix_data_added: ["docs_pending"],
  docs_pending:   ["contract_pending"],
  contract_pending: ["payment_pending"],
};

const STAFF_TRANSITIONS: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  payment_confirmed: ["pix_ready_to_send", "rejected"],
  pix_ready_to_send: ["pix_sent"],
  pix_sent:          ["completed"],
  // Can reject at any point
  new: ["rejected"],
  simulation_done: ["rejected"],
  data_filled: ["rejected"],
  pix_data_added: ["rejected"],
  docs_pending: ["rejected"],
  contract_pending: ["rejected"],
  payment_pending: ["rejected"],
};

/**
 * PATCH /api/aplicacao/[id]/status
 * Updates application status with role-based transition validation.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClient();
    const admin = createAdminClient();

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const body = await req.json();
    const parsed = UpdateStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Status inválido", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { status: newStatus, notes } = parsed.data;
    const appId = params.id;

    // Fetch current application
    const { data: app, error: fetchErr } = await admin
      .from("applications")
      .select("id, status, user_id")
      .eq("id", appId)
      .single();

    if (fetchErr || !app) {
      return NextResponse.json({ error: "Operação não encontrada" }, { status: 404 });
    }

    // Fetch user role
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role ?? "client";
    const currentStatus = app.status as ApplicationStatus;

    // Validate ownership for clients
    if (role === "client" && app.user_id !== user.id) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    // Validate transition
    const allowed =
      role === "client"
        ? CLIENT_TRANSITIONS[currentStatus] ?? []
        : STAFF_TRANSITIONS[currentStatus] ?? [];

    if (!allowed.includes(newStatus)) {
      return NextResponse.json(
        {
          error: `Transição inválida: ${currentStatus} → ${newStatus}`,
          allowedTransitions: allowed,
        },
        { status: 422 }
      );
    }

    // Update status
    const { error: updateErr } = await admin
      .from("applications")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", appId);

    if (updateErr) {
      console.error("[PATCH status] update error:", updateErr);
      return NextResponse.json({ error: "Erro ao atualizar status" }, { status: 500 });
    }

    // Log event
    await admin.from("application_logs").insert({
      application_id: appId,
      event_type: "status_changed",
      previous_status: currentStatus,
      new_status: newStatus,
      changed_by: user.id,
      metadata: { role, notes: notes ?? null },
    });

    return NextResponse.json({ id: appId, status: newStatus, previous: currentStatus });
  } catch (err) {
    console.error("[PATCH /api/aplicacao/[id]/status]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
