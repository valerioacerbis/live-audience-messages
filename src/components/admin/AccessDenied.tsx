/** Nessun sistema di account: e' una persona sola con un link. */
export function AccessDenied() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm space-y-3 text-center">
        <h1 className="text-xl font-semibold">Accesso richiesto</h1>
        <p className="text-sm text-ink-dim">
          Apri questa pagina con il link che contiene il token di moderazione.
        </p>
      </div>
    </main>
  );
}
