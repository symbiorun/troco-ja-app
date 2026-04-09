import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TrocoJá — Crédito Instantâneo via PIX",
  description: "Transforme o limite do seu cartão em dinheiro na hora. Crédito rápido, seguro e sem burocracia.",
  keywords: ["crédito", "PIX", "cartão", "empréstimo", "dinheiro rápido"],
  manifest: "/manifest.json",
  icons: {
    icon:  "/assets/logo-vertical.png",
    apple: "/assets/logo-vertical.png",
  },
  openGraph: {
    title: "TrocoJá — Crédito Instantâneo via PIX",
    description: "Transforme o limite do seu cartão em dinheiro na hora.",
    images: ["/assets/mascote.png"],
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#006b41",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className="bg-surface font-body text-on-surface min-h-dvh">
        {children}
      </body>
    </html>
  );
}
