"use client";

import { publicConfig } from "@/lib/config.public";

/**
 * Cosa resta a schermo quando non c'e' proprio nulla da mostrare.
 *
 * Capita in un solo caso: `/display` aperto prima che sia arrivato il primo
 * messaggio. Appena ne arriva uno la rotazione parte e questa schermata non si
 * rivede piu' per tutta la serata — e soprattutto non contiene il QR, che ha
 * la sua pagina e non deve ricomparire qui.
 */
export function StandbyScreen() {
  return (
    <div className="animate-enter flex flex-col items-center gap-4 text-center">
      <p className="text-[clamp(0.7rem,1vw,1rem)] font-medium uppercase tracking-[0.35em] text-ink-faint">
        {publicConfig.event.name}
      </p>
      <div className="animate-breathe size-2 rounded-full bg-accent/60" aria-hidden />
    </div>
  );
}
