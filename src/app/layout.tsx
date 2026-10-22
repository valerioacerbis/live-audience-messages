import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

// `next/font` scarica e ospita il font a build time: nessuna richiesta a un
// CDN esterno mentre il pubblico e' sulla rete satura del locale.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const TITLE = "Smooth Criminals — Fai una promessa. Cambia il mondo.";
const DESCRIPTION =
  "Cosa sei disposto a fare, da oggi, per rendere il mondo un posto migliore? Scrivi la tua promessa: comparirà sul maxischermo.";

/**
 * Testi dell'anteprima quando il link viene condiviso. L'immagine e' in
 * `opengraph-image.tsx`, le icone in `icon.png` / `apple-icon.png` /
 * `favicon.ico`: Next le collega da solo. Niente `metadataBase`: su Vercel
 * Next usa l'indirizzo di produzione per gli URL assoluti delle immagini.
 */
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: "Smooth Criminals",
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Smooth Criminals",
    locale: "it_IT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  // Condivisibile si', ma fuori dai motori di ricerca: vive una sera sola.
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
