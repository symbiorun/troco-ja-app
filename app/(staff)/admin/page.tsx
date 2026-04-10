"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { formatBRL, formatPct } from "@/lib/utils";

interface AdminConfig {
  key: string;
  value: string;
  value_type: string;
  description?: string;
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  is_active: boolean;
}

type Tab = "fees" | "users" | "reports";

export default function AdminPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("fees");
  const [configs, setConfigs] = useState<AdminConfig[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [editedConfigs, setEditedConfigs] = useState<Record<string, string>>({});

  const fetchConfigs = useCallback(async () => {
    const { data } = await supabase.from("admin_configs").select("*").order("key");
    if (data) {
      const typed = data as unknown as AdminConfig[];
      setConfigs(typed);
      const vals: Record<string, string> = {};
      typed.forEach((c) => { vals[c.key] = c.value; });
      setEditedConfigs(vals);
    }
    setLoading(false);
  }, [supabase]);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, created_at, is_active")
      .order("created_at", { ascending: false });
    if (data) setUsers(data as unknown as Profile[]);
  }, [supabase]);

  useEffect(() => {
    fetchConfigs();
    fetchUsers();
  }, [fetchConfigs, fetchUsers]);

  async function saveConfigs() {
    setSaving(true);
    setSaveMsg("");
    try {
      for (const [key, value] of Object.entries(editedConfigs)) {

        await (supabase as any).from("admin_configs").update({ value, updated_at: new Date().toISOString() }).eq("key", key);
      }
      setSaveMsg("Configurações salvas com sucesso!");
      await fetchConfigs();
    } catch {
      setSaveMsg("Erro ao salvar configurações.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  async function toggleUserRole(userId: string, currentRole: string) {
    const newRole = currentRole === "operator" ? "client" : "operator";
    // eslint-disable-next-line -- profiles table not in generated Supabase types
    await (supabase as any).from("profiles").update({ role: newRole }).eq("id", userId);
    await fetchUsers();
  }

  const feeConfigs = configs.filter((c) =>
    ["mp_debit_fee_pct", "mp_credit_fee_pct", "mp_credit_12x_fee_pct",
     "asaas_fee_pct", "operator_margin_pct", "min_pix_amount", "max_pix_amount"].includes(c.key)
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-primary shadow-lg z-10">
        <div className="flex items-center gap-3">
          <Image
            src="/assets/logo-horizontal.png"
            alt="TrocoJá"
            width={120}
            height={32}
            className="object-contain"
          />
          <span className="text-on-primary/60 text-sm font-medium hidden sm:block">
            — Painel Admin
          </span>
        </div>
        <a href="/dashboard" className="text-on-primary/70 text-sm font-bold hover:text-on-primary transition-colors">
          ← Voltar ao dashboard
        </a>
      </header>

      {/* Tabs */}
      <div className="flex-shrink-0 flex gap-1 px-5 py-4 bg-surface-container-low">
        {([
          { value: "fees", label: "Taxas & Limites", icon: "percent" },
          { value: "users", label: "Usuários", icon: "group" },
          { value: "reports", label: "Relatórios", icon: "bar_chart" },
        ] as { value: Tab; label: string; icon: string }[]).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold transition-colors ${
              tab === t.value
                ? "bg-primary text-on-primary"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            <span className="material-symbols-outlined text-lg">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* FEES TAB */}
            {tab === "fees" && (
              <div className="space-y-4">
                <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-card">
                  <div className="px-5 py-4 bg-surface-container-high">
                    <h2 className="text-body-md font-bold text-on-surface">
                      Taxas do Mercado Pago
                    </h2>
                    <p className="text-[11px] text-on-surface-variant">
                      Taxas cobradas pela maquininha (custo do operador)
                    </p>
                  </div>
                  <div className="p-5 space-y-4">
                    {[
                      { key: "mp_debit_fee_pct", label: "Débito (D0)", hint: "ex: 1.99" },
                      { key: "mp_credit_fee_pct", label: "Crédito à vista (D0)", hint: "ex: 4.98" },
                      { key: "mp_credit_12x_fee_pct", label: "Crédito 12x (D0)", hint: "ex: 22.59" },
                    ].map(({ key, label, hint }) => (
                      <ConfigInput
                        key={key}
                        label={label}
                        hint={hint}
                        value={editedConfigs[key] ?? ""}
                        suffix="%"
                        onChange={(v) => setEditedConfigs((p) => ({ ...p, [key]: v }))}
                      />
                    ))}
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-card">
                  <div className="px-5 py-4 bg-surface-container-high">
                    <h2 className="text-body-md font-bold text-on-surface">Taxas Asaas</h2>
                    <p className="text-[11px] text-on-surface-variant">
                      Para operações online com link de pagamento
                    </p>
                  </div>
                  <div className="p-5 space-y-4">
                    <ConfigInput
                      label="Taxa Asaas (crédito)"
                      hint="ex: 2.89"
                      value={editedConfigs["asaas_fee_pct"] ?? ""}
                      suffix="%"
                      onChange={(v) => setEditedConfigs((p) => ({ ...p, asaas_fee_pct: v }))}
                    />
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-card">
                  <div className="px-5 py-4 bg-surface-container-high">
                    <h2 className="text-body-md font-bold text-on-surface">
                      Margem do Operador & Limites
                    </h2>
                  </div>
                  <div className="p-5 space-y-4">
                    <ConfigInput
                      label="Margem de lucro padrão"
                      hint="ex: 2.5"
                      value={editedConfigs["operator_margin_pct"] ?? ""}
                      suffix="%"
                      onChange={(v) => setEditedConfigs((p) => ({ ...p, operator_margin_pct: v }))}
                    />
                    <ConfigInput
                      label="PIX mínimo"
                      hint="ex: 50"
                      value={editedConfigs["min_pix_amount"] ?? ""}
                      prefix="R$"
                      onChange={(v) => setEditedConfigs((p) => ({ ...p, min_pix_amount: v }))}
                    />
                    <ConfigInput
                      label="PIX máximo"
                      hint="ex: 5000"
                      value={editedConfigs["max_pix_amount"] ?? ""}
                      prefix="R$"
                      onChange={(v) => setEditedConfigs((p) => ({ ...p, max_pix_amount: v }))}
                    />
                  </div>
                </div>

                {saveMsg && (
                  <p className={`text-body-sm px-1 ${saveMsg.includes("sucesso") ? "text-primary" : "text-error"}`}>
                    {saveMsg}
                  </p>
                )}

                <button
                  onClick={saveConfigs}
                  disabled={saving}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-container
                             text-on-primary font-bold font-headline flex items-center justify-center gap-2
                             disabled:opacity-60"
                >
                  <span className="material-symbols-outlined text-lg">save</span>
                  {saving ? "Salvando..." : "Salvar configurações"}
                </button>
              </div>
            )}

            {/* USERS TAB */}
            {tab === "users" && (
              <div className="space-y-3">
                <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-card">
                  <p className="text-[11px] text-on-surface-variant font-medium">
                    Gerencie os níveis de acesso dos usuários.
                    Operadores têm acesso ao dashboard. Admins têm acesso total.
                  </p>
                </div>

                {users.map((user) => (
                  <div key={user.id}
                       className="bg-surface-container-lowest rounded-2xl p-4 shadow-card
                                  flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-primary text-xl">person</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-on-surface text-body-sm truncate">
                        {user.full_name || "Sem nome"}
                      </p>
                      <p className="text-[11px] text-on-surface-variant truncate">{user.email}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                        user.role === "admin"
                          ? "bg-error/10 text-error"
                          : user.role === "operator"
                          ? "bg-primary/10 text-primary"
                          : "bg-surface-container text-on-surface-variant"
                      }`}>
                        {user.role}
                      </span>
                      {user.role !== "admin" && (
                        <button
                          onClick={() => toggleUserRole(user.id, user.role)}
                          className="text-[11px] text-secondary font-bold hover:underline"
                        >
                          {user.role === "operator" ? "→ client" : "→ operator"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* REPORTS TAB */}
            {tab === "reports" && (
              <ReportsTab />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Config Input ── */
function ConfigInput({ label, hint, value, suffix, prefix, onChange }: {
  label: string;
  hint: string;
  value: string;
  suffix?: string;
  prefix?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-body-sm font-bold text-on-surface">{label}</p>
        <p className="text-[11px] text-on-surface-variant">{hint}</p>
      </div>
      <div className="flex items-center gap-1 bg-surface-container rounded-xl px-3 py-2">
        {prefix && <span className="text-body-sm text-on-surface-variant">{prefix}</span>}
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 bg-transparent outline-none text-body-sm font-bold text-on-surface text-right"
        />
        {suffix && <span className="text-body-sm text-on-surface-variant">{suffix}</span>}
      </div>
    </div>
  );
}

/* ── Reports Tab ── */
function ReportsTab() {
  const supabase = createClient();
  const [stats, setStats] = useState<{
    total: number; completed: number; revenue: number; avgTicket: number;
    byChannel: { online: number; machine: number };
  } | null>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("applications")
        .select("pix_amount, card_total, channel, status");

      if (!data) return;

      type AppRow = { status: string; card_total: number; pix_amount: number; channel: string };
      const rows = data as unknown as AppRow[];
      const completed = rows.filter((a) => a.status === "completed");
      const revenue = completed.reduce((s, a) => s + (a.card_total - a.pix_amount), 0);
      const avgTicket = completed.length ? completed.reduce((s, a) => s + a.pix_amount, 0) / completed.length : 0;
      const byChannel = {
        online: rows.filter((a) => a.channel === "online_link").length,
        machine: rows.filter((a) => a.channel === "machine_delivery").length,
      };

      setStats({ total: rows.length, completed: completed.length, revenue, avgTicket, byChannel });
    }
    load();
  }, [supabase]);

  if (!stats) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <ReportCard label="Total de operações" value={stats.total.toString()} icon="list_alt" />
        <ReportCard label="Concluídas" value={stats.completed.toString()} icon="check_circle" />
        <ReportCard label="Receita total" value={formatBRL(stats.revenue)} icon="payments" />
        <ReportCard label="Ticket médio PIX" value={formatBRL(stats.avgTicket)} icon="account_balance_wallet" />
      </div>

      <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-card">
        <h3 className="text-body-md font-bold text-on-surface mb-4">Operações por canal</h3>
        <div className="space-y-3">
          <ChannelBar label="Online (Asaas)" count={stats.byChannel.online} total={stats.total} color="bg-secondary" />
          <ChannelBar label="Maquininha (MP)" count={stats.byChannel.machine} total={stats.total} color="bg-primary" />
        </div>
      </div>

      <div className="bg-secondary-fixed/20 rounded-2xl p-4 flex items-start gap-3">
        <span className="material-symbols-outlined text-secondary text-xl flex-shrink-0 mt-0.5">info</span>
        <p className="text-[11px] text-on-surface-variant leading-relaxed">
          Para relatórios detalhados com exportação em CSV ou integração com BI,
          acesse diretamente o Supabase Studio no painel do projeto.
        </p>
      </div>
    </div>
  );
}

function ReportCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-card">
      <span className="material-symbols-outlined text-primary text-2xl block mb-2">{icon}</span>
      <p className="text-title-lg font-extrabold font-headline text-on-surface">{value}</p>
      <p className="text-[11px] text-on-surface-variant mt-0.5">{label}</p>
    </div>
  );
}

function ChannelBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-body-sm text-on-surface">{label}</span>
        <span className="text-body-sm font-bold text-on-surface">{count} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
