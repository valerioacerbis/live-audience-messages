export default async function AdminLoginPage(props: PageProps<"/admin/login">) {
  const params = await props.searchParams;
  const wrongPassword = params.error === "1";

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <form
        method="POST"
        action="/api/admin/session"
        className="w-full max-w-sm space-y-4"
      >
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold">Moderazione</h1>
          <p className="text-sm text-ink-dim">Inserisci la password per accedere.</p>
        </div>

        {wrongPassword && (
          <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Password errata.
          </p>
        )}

        <input
          type="password"
          name="password"
          autoComplete="current-password"
          autoFocus
          required
          placeholder="Password"
          aria-label="Password"
          className="w-full rounded-2xl border border-line bg-surface-raised px-4 py-3.5 text-base text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/60"
        />

        <button
          type="submit"
          className="w-full rounded-2xl bg-accent px-6 py-4 text-lg font-semibold text-black transition active:scale-98"
        >
          Entra
        </button>
      </form>
    </main>
  );
}
