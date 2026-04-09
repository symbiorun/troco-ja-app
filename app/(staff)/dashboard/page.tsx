"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/utils";
import { ApplicationStatus, STATUS_LABELS } from "@/types";

interface Application {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_cpf: string;
  pix_amount: number;
  card_total: number;
  channel: string;
  installments: number;
  status: ApplicationStatus;
  created_at: string;
  updated_at: string;
  pix_key?: string;
  pix_key_type?: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-surface-container text-on-surface-variant",
  simulation_done: "bg-secondary-fixed/30 text-secondary",
  data_filled: "bg-secondary-fixed/50 text-secondary",
  pix_data_added: "bg-secondary-fixed/70 text-secondary",
  docs_pending: "bg-tertiary-fixed/50 text-[#5e4200]",
  contract_pending: "bg-tertiary-fixed/70 text-[#5e4200]",
  payment_pending: "bg-tertiary-fixed text-[#271900]",
  payment_confirmed: "bg-primary/20 text-primary",
  pix_ready_to_send: "bg-primary/30 text-primary",
  pix_sent: "bg-primary/20 text-primary",
  completed: "bg-primary/10 text-primary",
  rejected: "bg-error/10 text-error",
  cancelled: "bg-surface-container text-outline",
};

const FILTERS: { label: string; value: string }[] = [
  { label: "Todos", value: "all" },
  { label: "Aguardando docs", value: "docs_pending" },
  { label: "Pgto pendente", value: "payment_pending" },
  { label: "Pronto para PIX", value: "pix_ready_to_send" },
  { label: "Concluídos", value: "completed" },
];

export default function DashboardPage() {
  const supabase = createClient();
  const [applications, setApplications] = useState<Application[]>([]);
  const [filtered, setFiltered] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0, revenue: 0 });

  const fetchApplications = useCallback(async () => {
    const { data } = await supabase
      .from("applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (data) {
      setApplications(data);
      computeStats(data);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchApplications();

    // Real-time subscription
    const channel = supabase
      .channel("dashboard_applications")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "applications",
      }, () => {
        fetchApplications();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchApplications, supabase]);

  useEffect(() => {
    let result = applications;
    if (activeFilter !== "all") {
      result = result.filter((a) => a.status === activeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          a.customer_name?.toLowerCase().includes(q) ||
          a.customer_email?.toLowerCase().includes(q) ||
          a.customer_cpf?.includes(q) ||
          a.id.includes(q)
      );
    }
    setFiltered(result);
  }, [applications, activeFilter, search]);

  function computeStats(data: Application[]) {
    setStats({
      total: data.length,
      pending: data.filter((a) =>
        ["payment_pending", "pix_ready_to_send", "docs_pending"].includes(a.status)
      ).length,
      completed: data.filter((a) => a.status === "completed").length,
      revenue: data
        .filter((a) => a.status === "completed")
        .reduce((sum, a) => sum + (a.card_total - a.pix_amount), 0),
    });
  }

  async function handleAction(appId: string, action: "approve" | "reject" | "pix_sent") {
    setActionLoading(true);
    try {
      const statusMap = {
        approve: "pix_ready_to_send",
        reject: "rejected",
        pix_sent: "pix_sent",
      };

      const res = await fetch(`/api/aplicacao/${appId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusMap[action] }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar status");
      await fetchApplications();
      setSelectedApp(null);
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-6 py-4
                         bg-primary shadow-lg z-10">
        <div className="flex items-center gap-3">
          <Image
            src="/assets/logo-horizontal.png"
            alt="TrocoJá"
            width={120}
            height={32}
            className="object-contain"
          />
          <span className="text-on-primary/60 text-sm font-medium hidden sm:block">
            — Painel Operacional
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-on-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary text-lg">person</span>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-3 px-5 py-4">
        <StatCard label="Total" value={stats.total.toString()} icon="list_alt" color="text-on-surface" />
        <StatCard label="Em andamento" value={stats.pending.toString()} icon="pending" color="text-tertiary" />
        <StatCard label="Concluídos" value={stats.completed.toString()} icon="check_circle" color="text-primary" />
        <StatCard label="Receita" value={formatBRL(stats.revenue)} icon="payments" color="text-secondary" />
      </div>

      {/* Filters + Search */}
      <div className="flex-shrink-0 px-5 pb-3 space-y-3">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2
                           text-outline text-xl">search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF ou e-mail..."
            className="w-full bg-surface-container-lowest rounded-2xl pl-10 pr-4 py-3
                       text-body-sm text-on-surface placeholder:text-outline-variant
                       border-2 border-transparent focus:border-primary/30 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f.value)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-[11px] font-bold transition-colors ${
                activeFilter === f.value
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Application list */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <span className="material-symbols-outlined text-5xl text-outline">inbox</span>
            <p className="text-body-sm text-on-surface-variant">Nenhuma operação encontrada</p>
          </div>
        ) : (
          filtered.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onSelect={() => setSelectedApp(app)}
            />
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selectedApp && (
        <AppDetailModal
          app={selectedApp}
          onClose={() => setSelectedApp(null)}
          onAction={handleAction}
          loading={actionLoading}
        />
      )}
    </div>
  );
}

/* ── Stat Card ── */
function StatCard({ label, value, icon, color }: {
  label: string; value: string; icon: string; color: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-4 shadow-card">
      <div className="flex items-center gap-2 mb-1">
        <span className={`material-symbols-outlined text-lg ${color}`}>{icon}</span>
        <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className={`text-title-lg font-extrabold font-headline ${color}`}>{value}</p>
    </div>
  );
}

/* ── App Card ── */
function AppCard({ app, onSelect }: { app: Application; onSelect: () => void }) {
  const channelLabel = app.channel === "online_link" ? "Online" : "Maquininha";
  const statusColor = STATUS_COLORS[app.status] ?? "bg-surface-container text-on-surface-variant";
  const date = new Date(app.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

  return (
    <button
      onClick={onSelect}
      className="w-full bg-surface-container-lowest rounded-2xl p-4 shadow-card
                 hover:shadow-float transition-shadow text-left"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-bold text-on-surface truncate">
              {app.customer_name || "Cliente sem nome"}
            </p>
            <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor}`}>
              {STATUS_LABELS[app.status] || app.status}
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant truncate">{app.customer_email}</p>
          <div className="flex items-center gap-3 mt-2">
            <span className="text-[10px] text-outline">{date}</span>
            <span className="text-[10px] bg-surface-container px-2 py-0.5 rounded-full text-on-surface-variant">
              {channelLabel}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-extrabold font-headline text-on-surface">{formatBRL(app.pix_amount)}</p>
          <p className="text-[11px] text-on-surface-variant">via PIX</p>
        </div>
      </div>
    </button>
  );
}

/* ── App Detail Modal ── */
function AppDetailModal({ app, onClose, onAction, loading }: {
  app: Application;
  onClose: () => void;
  onAction: (id: string, action: "approve" | "reject" | "pix_sent") => void;
  loading: boolean;
}) {
  const profit = app.card_total - app.pix_amount;

  const canApprove = app.status === "payment_confirmed";
  const canMarkSent = app.status === "pix_ready_to_send";
  const canReject = !["completed", "rejected", "cancelled", "pix_sent"].includes(app.status);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="w-full max-w-lg bg-surface rounded-3xl shadow-float overflow-hidden
                      max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-outline-variant/20">
          <h2 className="text-headline-xs font-headline font-bold text-on-surface">
            Detalhes da operação
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-surface-container
                                               flex items-center justify-center hover:bg-surface-container-high">
            <span className="material-symbols-outlined text-on-surface-variant text-lg">close</span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Client info */}
          <div className="bg-surface-container-low rounded-2xl p-4 space-y-2">
            <DetailRow label="Nome" value={app.customer_name || "—"} />
            <DetailRow label="E-mail" value={app.customer_email || "—"} />
            <DetailRow label="CPF" value={app.customer_cpf || "—"} />
          </div>

          {/* Operation info */}
          <div className="bg-surface-container-low rounded-2xl p-4 space-y-2">
            <DetailRow label="PIX a enviar" value={formatBRL(app.pix_amount)} highlight />
            <DetailRow label="Total cartão" value={formatBRL(app.card_total)} />
            <DetailRow
              label={`Parcelas (${app.installments}x)`}
              value={formatBRL(app.card_total / app.installments)}
            />
            <div className="h-px bg-outline-variant/20 my-1" />
            <DetailRow label="Lucro estimado" value={formatBRL(profit)} highlight />
          </div>

          {/* PIX key */}
          {app.pix_key && (
            <div className="bg-surface-container-low rounded-2xl p-4 space-y-2">
              <DetailRow label="Chave PIX" value={app.pix_key} />
              <DetailRow label="Tipo" value={app.pix_key_type?.toUpperCase() || "—"} />
            </div>
          )}

          {/* Status */}
          <div className="bg-surface-container-low rounded-2xl p-4">
            <DetailRow label="Status atual" value={STATUS_LABELS[app.status] || app.status} />
            <DetailRow label="Canal" value={app.channel === "online_link" ? "Online (Asaas)" : "Maquininha (MP)"} />
            <DetailRow
              label="Criado em"
              value={new Date(app.created_at).toLocaleString("pt-BR")}
            />
          </div>

          {/* Actions */}
          <div className="space-y-3 pt-2">
            {canApprove && (
              <button
                onClick={() => onAction(app.id, "approve")}
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-primary to-primary-container
                           text-on-primary font-bold font-headline flex items-center justify-center gap-2
                           disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-lg">check_circle</span>
                Aprovar e liberar PIX
              </button>
            )}
            {canMarkSent && (
              <button
                onClick={() => onAction(app.id, "pix_sent")}
                disabled={loading}
                className="w-full py-4 rounded-2xl bg-tertiary-fixed-dim
                           text-[#271900] font-bold font-headline flex items-center justify-center gap-2
                           disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-lg">send</span>
                Marcar PIX como enviado
              </button>
            )}
            {canReject && (
              <button
                onClick={() => onAction(app.id, "reject")}
                disabled={loading}
                className="w-full py-3 rounded-2xl bg-error/10 text-error font-bold
                           flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-lg">cancel</span>
                Rejeitar operação
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, highlight }: {
  label: string; value: string; highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-body-sm text-on-surface-variant">{label}</span>
      <span className={`text-body-sm font-bold ${highlight ? "text-primary" : "text-on-surface"}`}>
        {value}
      </span>
    </div>
  );
}
