"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MotionConfig } from "motion/react";

import { publicConfig } from "@/lib/config.public";
import { isToggleKey } from "@/lib/display/demoToggleKey";
import type { DisplayState } from "@/lib/display/engine";
import { ClosingAnimation } from "./ClosingAnimation";
import { MessageRenderer } from "./renderers";
import { ConnectionDot, type DotStatus } from "./ConnectionDot";
import { StandbyScreen } from "./StandbyScreen";

/**
 * La scena, senza sapere da dove arrivano i messaggi.
 *
 * Tiene insieme motore, renderer e stato della connessione, e non fa altro:
 * la logica di coda e di tempi sta nel reducer, il disegno sta nel renderer.
 * La usano sia il display vero (`DisplayStage`) sia la modalita' demo
 * (`DemoStage`): a schermo le due cose devono essere indistinguibili.
 *
 * Qui il QR non c'e' e non ci deve essere: vive su `/qr`. Una volta aperta
 * questa pagina si vedono messaggi e basta, e quando non ne arrivano di nuovi
 * il motore fa girare a rotazione quelli gia' passati.
 */
export function DisplayScene({
  state,
  status,
  rendererName,
}: {
  state: DisplayState;
  status: DotStatus;
  rendererName?: string;
}) {
  useWakeLock();
  const showClosing = useClosingToggle(state.ended);

  // Chiusura della serata: sostituisce la scena intera invece di infilarsi
  // tra rotazione e standby. Torna alla rotazione da sola se il moderatore
  // riapre la serata (vedi `state.ended` in engine.ts), o con lo spazio.
  if (showClosing) {
    return <ClosingAnimation phrase={state.closingPhrase} />;
  }

  return (
    // Chi soffre di sensibilita' al movimento non deve subire l'ingresso/
    // uscita lettera per lettera: "user" fa si' che Motion rispetti
    // prefers-reduced-motion del sistema operativo automaticamente.
    <MotionConfig reducedMotion="user">
      <main className="stage relative grid h-dvh w-full place-items-center bg-stage">
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
          status={status}
          queueDepth={state.queue.length}
          totalReceived={state.stats.received}
        />
      </main>
    </MotionConfig>
  );
}

/**
 * Schermata di chiusura comandata dal palco, senza moderatore.
 *
 * Lo spazio (`publicConfig.display.closingToggleKey`) manda in onda la
 * chiusura, e alla seconda pressione torna alla rotazione. E' un interruttore
 * di QUESTO schermo, non una chiusura della serata: niente richiesta al
 * server, niente password, quindi funziona anche con la rete giu' e nel
 * piano B. `/admin` non ne sa niente.
 *
 * Vince l'ultima azione: se dopo lo spazio il moderatore chiude o riapre la
 * serata da `/admin/settings`, lo schermo segue lui e l'interruttore si
 * azzera. Un ricaricamento della pagina (o il passaggio col tasto X) lo
 * azzera anche, e lo schermo torna a quello che dice il server.
 */
function useClosingToggle(serverEnded: boolean): boolean {
  const [override, setOverride] = useState<boolean | null>(null);

  // Il server ha cambiato idea: l'interruttore locale non conta piu'.
  // Aggiornamento durante il render, il modo che React raccomanda per lo
  // stato derivato da una prop (niente effetto, niente render in piu').
  const [lastServerEnded, setLastServerEnded] = useState(serverEnded);
  if (serverEnded !== lastServerEnded) {
    setLastServerEnded(serverEnded);
    setOverride(null);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isToggleKey(event, publicConfig.display.closingToggleKey)) return;
      // Lo spazio altrimenti scorre la pagina o "clicca" un elemento a fuoco.
      event.preventDefault();
      setOverride((current) => !(current ?? serverEnded));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [serverEnded]);

  return override ?? serverEnded;
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

export function FullscreenGate({
  children,
  demo = false,
  info,
}: {
  children: React.ReactNode;
  /** Dice all'operatore quale delle due finestre ha davanti, prima di entrare. */
  demo?: boolean;
  /**
   * Sotto il pulsante, finche' non si entra (smonta col click). Arriva da
   * fuori perche' sul display vero e' `ReadyCount`, che parla con la rete,
   * e questo file finisce anche nel bundle del piano B.
   */
  info?: React.ReactNode;
}) {
  const [entered, setEntered] = useState(false);

  // Un solo ingresso anche se click e Invio arrivano insieme (Invio sul
  // pulsante a fuoco genera anche un click).
  const entering = useRef(false);
  const enter = useCallback(async () => {
    if (entering.current) return;
    entering.current = true;
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Fullscreen negato: si continua comunque, in finestra.
    }
    setEntered(true);
  }, []);

  // Invio da tastiera, ovunque sia il fuoco: in regia il mouse non e' sempre
  // a portata. Il tasto premuto conta come gesto dell'utente, quindi il
  // browser concede lo schermo intero come per il click.
  useEffect(() => {
    if (entered) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      void enter();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entered, enter]);

  if (entered) return <>{children}</>;

  return (
    <main className="grid h-dvh place-items-center bg-stage px-6">
      <div className="flex max-w-md flex-col items-center gap-8 text-center">
        <button
          type="button"
          onClick={() => void enter()}
          className="rounded-full bg-accent px-10 py-4 text-lg font-semibold text-black transition active:scale-98"
        >
          Entra in scena
        </button>

        {info}

        <p className="text-xs text-ink-faint">
          {/* Niente "demo" scritto da nessuna parte: se questa schermata finisce
              per sbaglio sul maxischermo, il pubblico non deve leggere che
              esiste una versione finta. All'operatore basta "piano B", lo
              stesso nome del RUNBOOK. */}
          {demo && <span className="font-semibold text-ink-dim">Piano B. </span>}
          Si entra anche con{" "}
          <kbd className="font-semibold text-ink-dim">Invio</kbd>. Ricorda di disattivare
          sospensione e screensaver del computer.
          {!demo && (
            <>
              {" "}
              In caso di problemi, il tasto{" "}
              <kbd className="font-semibold text-ink-dim">
                {publicConfig.display.demoToggleKey.toUpperCase()}
              </kbd>{" "}
              passa al piano B.
            </>
          )}
        </p>
      </div>
    </main>
  );
}
