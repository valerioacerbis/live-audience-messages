"use client";

import { useEffect, useState } from "react";

import { publicConfig } from "@/lib/config.public";

/**
 * Pagina dell'invito: solo il QR, a tutto schermo.
 *
 * Vive su una rotta separata da `/display` per una ragione precisa: una volta
 * partiti i messaggi il QR non deve piu' ricomparire, e il modo piu' solido di
 * garantirlo e' che le due cose non condividano nemmeno una pagina. Non c'e'
 * nessuno stato da sbagliare.
 *
 * Nel frattempo i messaggi si accumulano lato server: quando si passa a
 * `/display`, la prima richiesta restituisce l'arretrato e parte tutto.
 */
export function QrScreen() {
  const code = useQrCode();

  return (
    <main className="stage relative grid h-dvh w-full place-items-center bg-stage">
      <div
        aria-hidden
        className="animate-breathe pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(249,115,22,0.12), transparent 60%)",
        }}
      />

      <div className="animate-enter relative flex flex-col items-center gap-[4vh] text-center">
        <div className="space-y-[1.5vh]">
          <p className="text-[clamp(0.75rem,1.1vw,1.1rem)] font-medium uppercase tracking-[0.35em] text-accent">
            {publicConfig.event.name}
          </p>
          <p className="text-[clamp(2rem,4.5vw,5.5rem)] font-semibold leading-tight tracking-tight text-ink">
            Il cambiamento comincia da te
          </p>
          <p className="text-[clamp(1rem,1.8vw,2rem)] font-light text-ink-dim">
            Inquadra il codice e lascia la tua promessa
          </p>
        </div>

        <div
          className="rounded-[2vh] bg-ink p-[2vh]"
          style={{ width: "min(46vh, 46vw)", height: "min(46vh, 46vw)" }}
        >
          {code && <QrSvg matrix={code.matrix} />}
        </div>

        <p className="font-mono text-[clamp(0.85rem,1.4vw,1.5rem)] tracking-wide text-ink-faint">
          {code?.url.replace(/^https?:\/\//, "")}
        </p>
      </div>
    </main>
  );
}

interface QrCode {
  url: string;
  matrix: boolean[][];
}

/**
 * Genera il QR nel browser.
 *
 * Nessun servizio esterno: il display deve poter funzionare anche con una
 * connessione pessima, e un QR che non carica significa nessuno che partecipa.
 * L'URL viene dedotto da `window.location`, cosi' funziona identico in locale,
 * in rete locale e in produzione senza configurare niente.
 */
function useQrCode(): QrCode | null {
  const [code, setCode] = useState<QrCode | null>(null);

  useEffect(() => {
    let cancelled = false;

    const build = async () => {
      const target = new URL("/", window.location.origin);
      if (publicConfig.event.slug !== "default") {
        target.searchParams.set("e", publicConfig.event.slug);
      }
      const url = target.toString();

      // Import dinamico: il generatore non pesa sul bundle iniziale.
      const QRCode = await import("qrcode");
      // Livello H: il codice viene inquadrato da lontano, di sbieco e con le
      // luci di scena addosso. La ridondanza serve davvero.
      const data = QRCode.create(url, { errorCorrectionLevel: "H" });
      const size = data.modules.size;

      const matrix: boolean[][] = [];
      for (let row = 0; row < size; row++) {
        const cells: boolean[] = [];
        for (let col = 0; col < size; col++) {
          cells.push(Boolean(data.modules.get(row, col)));
        }
        matrix.push(cells);
      }

      if (!cancelled) setCode({ url, matrix });
    };

    void build();
    return () => {
      cancelled = true;
    };
  }, []);

  return code;
}

function QrSvg({ matrix }: { matrix: boolean[][] }) {
  const count = matrix.length;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${count} ${count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code per inviare un messaggio"
    >
      <rect width={count} height={count} fill="#ffffff" />
      {matrix.map((row, y) =>
        row.map((filled, x) =>
          filled ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#000000" />
          ) : null,
        ),
      )}
    </svg>
  );
}
