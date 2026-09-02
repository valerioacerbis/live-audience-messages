"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "motion/react";

import { publicConfig } from "@/lib/config.public";
import { useDisplayEngine } from "@/lib/display/useDisplayEngine";
import { ClosingAnimation } from "./ClosingAnimation";
import { MessageRenderer } from "./renderers";
import { ConnectionDot } from "./ConnectionDot";
import { StandbyScreen } from "./StandbyScreen";

/**
 * La scena.
 *
 * Tiene insieme motore, renderer e stato della connessione, e non fa altro:
 * la logica di coda e di tempi sta nel reducer, il disegno sta nel renderer.
 *
 * Qui il QR non c'e' e non ci deve essere: vive su `/qr`. Una volta aperta
 * questa pagina si vedono messaggi e basta, e quando non ne arrivano di nuovi
 * il motore fa girare a rotazione quelli gia' passati.
 */
export function DisplayStage({ rendererName }: { rendererName?: string }) {
  const { state, connection } = useDisplayEngine(publicConfig.event.slug);

  useWakeLock();

  // Chiusura della serata: sostituisce la scena intera invece di infilarsi
  // tra rotazione e standby. Torna alla rotazione da sola se il moderatore
  // riapre la serata (vedi `state.ended` in engine.ts).
  if (state.ended) {
    return <ClosingAnimation phrase={state.closingPhrase} />;
  }

  return (
    // Chi soffre di sensibilita' al movimento non deve subire l'ingresso/
    // uscita lettera per lettera: "user" fa si' che Motion rispetti
    // prefers-reduced-motion del sistema operativo automaticamente.
    <MotionConfig reducedMotion="user">
      <main className="stage relative grid h-dvh w-full place-items-center bg-stage">
        {/* Fondale: un respiro lentissimo, appena percettibile. Serve a non far
            sembrare lo schermo spento quando non c'e' nessun messaggio. */}
        <div
          aria-hidden
          className="animate-breathe pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 45%, rgba(249,115,22,0.10), transparent 60%)",
          }}
        />

        <div className="relative grid place-items-center px-[6vw]">
          {state.current ? (
            <MessageRenderer
              name={rendererName}
              current={state.current}
              all={state.all}
              phase={state.phase}
              isReplay={state.isReplay}
              stats={{
                received: state.stats.received,
                displayed: state.stats.displayed,
                queueDepth: state.queue.length,
              }}
            />
          ) : (
            <StandbyScreen />
          )}
        </div>

        <ConnectionDot
          status={connection.status}
          queueDepth={state.queue.length}
          totalReceived={state.stats.received}
        />
      </main>
    </MotionConfig>
  );
}

/**
 * Impedisce al portatile di andare in standby a meta' concerto.
 *
 * Da sola non basta — va disattivata anche la sospensione a livello di sistema
 * operativo, ed e' nella checklist del RUNBOOK — ma copre lo spegnimento dello
 * schermo, che e' il caso piu' frequente.
 */
function useWakeLock(): void {
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    const acquire = async () => {
      try {
        if (!("wakeLock" in navigator)) return;
        sentinel = await navigator.wakeLock.request("screen");
      } catch {
        // Non supportato o negato: la checklist pre-show resta l'ultima parola.
      }
    };

    void acquire();

    // Il lock si perde quando la scheda va in background: va ripreso.
    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release();
    };
  }, []);
}

export function FullscreenGate({ children }: { children: React.ReactNode }) {
  const [entered, setEntered] = useState(false);

  if (entered) return <>{children}</>;

  return (
    <main className="grid h-dvh place-items-center bg-stage px-6">
      <div className="flex max-w-md flex-col items-center gap-8 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">Display</h1>
          <p className="text-balance text-ink-dim">
            Il browser richiede un click per entrare a schermo intero. Fallo una
            volta sola, prima che inizi il concerto.
          </p>
        </div>

        <button
          type="button"
          onClick={async () => {
            try {
              await document.documentElement.requestFullscreen();
            } catch {
              // Fullscreen negato: si continua comunque, in finestra.
            }
            setEntered(true);
          }}
          className="rounded-full bg-accent px-10 py-4 text-lg font-semibold text-black transition active:scale-98"
        >
          Entra in scena
        </button>

        <p className="text-xs text-ink-faint">
          Ricorda di disattivare sospensione e screensaver del computer.
        </p>
      </div>
    </main>
  );
}
