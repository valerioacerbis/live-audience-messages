import type { NextConfig } from "next";

/**
 * Header di sicurezza.
 *
 * La CSP e' volutamente stretta: questa applicazione non carica nulla da
 * domini esterni (il font e' self-hosted da `next/font`, il QR e' generato
 * in locale), quindi non c'e' motivo di lasciare aperture. L'unica eccezione
 * prevista e' Cloudflare Turnstile, incluso solo se lo si accende.
 */
const turnstileEnabled = process.env.NEXT_PUBLIC_TURNSTILE_ENABLED === "true";

const scriptSrc = [
  "'self'",
  // Next inserisce script inline per l'idratazione. Non renderizziamo mai
  // HTML fornito dagli utenti, quindi la superficie e' il codice nostro.
  "'unsafe-inline'",
  // Solo in sviluppo: l'HMR di Turbopack usa eval.
  process.env.NODE_ENV !== "production" && "'unsafe-eval'",
  turnstileEnabled && "https://challenges.cloudflare.com",
]
  .filter(Boolean)
  .join(" ");

const frameSrc = turnstileEnabled ? "https://challenges.cloudflare.com" : "'none'";

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // `connect-src` deve restare aperto in wss: e' il canale realtime.
  "connect-src 'self' https: wss:",
  `frame-src ${frameSrc}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
