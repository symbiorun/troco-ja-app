// Prevent static pre-rendering — staff pages require Supabase auth at runtime
export const dynamic = 'force-dynamic'

/**
 * Layout do painel operacional (operador/admin)
 */
export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface-container-low">
      {children}
    </div>
  );
}
