import { redirect } from "next/navigation";

// Redireciona / → /simulacao (entrada principal do fluxo)
export default function RootPage() {
  redirect("/simulacao");
}
