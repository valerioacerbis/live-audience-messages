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
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center gap-8 px-5 py-10">
      <header className="space-y-2 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-accent">
          {publicConfig.event.name}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Il tuo messaggio sul maxischermo
        </h1>
        <p className="text-balance text-ink-dim">
          Scrivi una dedica, un saluto, un pensiero. Comparira&apos; sullo schermo
          durante il concerto.
        </p>
      </header>

      <MessageForm />
    </main>
  );
}
