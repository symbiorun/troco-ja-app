// Prevent static pre-rendering — pages require Supabase auth at runtime
export const dynamic = 'force-dynamic'

/**
 * Layout do fluxo do cliente
 * Telas: simulacao, resultado, cadastro, pix, documentos, contrato, pagamento, status
 */
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
