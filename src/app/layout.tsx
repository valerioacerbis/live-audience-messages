import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { publicConfig } from "@/lib/config.public";
import "./globals.css";

// `next/font` scarica e ospita il font a build time: nessuna richiesta a un
// CDN esterno mentre il pubblico e' sulla rete satura del locale.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: publicConfig.event.name,
  description: "Scrivi il tuo messaggio: comparira' sul maxischermo.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  // Il form non deve poter essere zoomato per sbaglio mentre si scrive.
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className={inter.variable}>
      <body className="min-h-dvh bg-stage text-ink antialiased">{children}</body>
    </html>
  );
}
