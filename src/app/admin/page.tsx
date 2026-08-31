import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AdminConsole } from "@/components/admin/AdminConsole";
import { ADMIN_COOKIE, matchesAdminToken } from "@/lib/http/request";

/**
 * Pagina di moderazione.
 *
 * Il token arriva da `?k=` e viene scambiato con un cookie httpOnly da
 * `/api/admin/session`: cosi' non resta nella cronologia ne' finisce in uno
 * screenshot. Il giro passa da una Route Handler perche' un Server Component
 * puo' leggere i cookie ma non scriverli.
 *
 * Nessun sistema di account: e' una persona sola con un link.
 */
export default async function AdminPage(props: PageProps<"/admin">) {
  const params = await props.searchParams;
  const fromQuery = typeof params.k === "string" ? params.k : null;

  if (fromQuery) {
    redirect(`/api/admin/session?k=${encodeURIComponent(fromQuery)}`);
  }

  const token = (await cookies()).get(ADMIN_COOKIE)?.value;

  if (!matchesAdminToken(token)) {
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

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <AdminConsole token={token!} />
    </main>
  );
}
