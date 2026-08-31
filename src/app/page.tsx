import Image from "next/image";

import { MessageForm } from "@/components/audience/MessageForm";
import { publicConfig } from "@/lib/config.public";

/**
 * Pagina del pubblico.
 *
 * Server Component che rende un solo componente client: il JavaScript spedito
 * al telefono e' il minimo indispensabile. Su una cella satura da cinquecento
 * persone, ogni kilobyte in meno e' un invio in piu' che va a buon fine.
 */
export default function AudiencePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-start gap-8 px-5 py-10 sm:justify-center">
      <MessageForm>
        <header className="space-y-2 text-center">
          <Image
            src="/logo.webp"
            alt=""
            width={56}
            height={56}
            priority
            className="mx-auto h-14 w-auto"
          />
          <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
            {publicConfig.event.name}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Sei davanti allo specchio
          </h1>
          <p className="text-balance text-ink-dim">
            Cosa sei disposto a fare, da oggi, per rendere il mondo un posto
            migliore? La tua promessa comparirà sul maxischermo e potrà
            ispirare chi la legge dopo di te.
          </p>
        </header>
      </MessageForm>
    </main>
  );
}
