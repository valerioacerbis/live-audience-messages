import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

/**
 * Anteprima quando qualcuno condivide il link (WhatsApp, Instagram, Telegram).
 *
 * Generata una volta a build time e poi servita come file statico: nessun
 * costo per richiesta la sera del concerto. Riprende la sfera e le onde della
 * schermata di conferma, cosi' chi apre il link riconosce subito la pagina.
 *
 * Font in TTF dentro `assets/fonts/`: il generatore non legge il woff2, e
 * scaricarlo a build time farebbe dipendere il deploy dalla rete.
 */

export const alt = "Smooth Criminals — Fai una promessa. Cambia il mondo.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#f97316";

export default async function OpengraphImage() {
  const [semiBold, regular] = await Promise.all([
    readFile(join(process.cwd(), "assets/fonts/Inter-SemiBold.ttf")),
    readFile(join(process.cwd(), "assets/fonts/Inter-Regular.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "#000000",
          backgroundImage:
            "radial-gradient(circle at 78% 50%, rgba(249,115,22,0.30) 0%, rgba(249,115,22,0.08) 30%, rgba(0,0,0,0) 55%)",
          fontFamily: "Inter",
          padding: "0 80px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
          <div
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: 7,
              color: ACCENT,
              textTransform: "uppercase",
            }}
          >
            Smooth Criminals
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 76,
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: "#f5f5f4",
            }}
          >
            Fai una promessa. Cambia il mondo.
          </div>
          <div style={{ marginTop: 32, fontSize: 32, lineHeight: 1.35, color: "#a8a29e" }}>
            Cosa sei disposto a fare, da oggi, per rendere il mondo un posto migliore?
          </div>
        </div>

        {/* La sfera della promessa, con le onde che si allargano. */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            height: "100%",
          }}
        >
          {[400, 310].map((ring, i) => (
            <div
              key={ring}
              style={{
                position: "absolute",
                width: ring,
                height: ring,
                borderRadius: ring,
                border: `2px solid rgba(249,115,22,${i === 0 ? 0.18 : 0.35})`,
              }}
            />
          ))}
          <div
            style={{
              width: 210,
              height: 210,
              borderRadius: 210,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundImage: "radial-gradient(circle at 50% 40%, #fdba74 0%, #f97316 55%, #c2410c 100%)",
              boxShadow: "0 0 90px 20px rgba(249,115,22,0.45)",
            }}
          >
            <svg width="96" height="96" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 12.5 9.5 18 20 7"
                stroke="#ffffff"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Inter", data: semiBold, style: "normal", weight: 600 },
        { name: "Inter", data: regular, style: "normal", weight: 400 },
      ],
    },
  );
}
