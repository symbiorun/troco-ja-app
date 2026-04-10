// Prevent static pre-rendering — auth pages require Supabase at runtime
export const dynamic = 'force-dynamic'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
