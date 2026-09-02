"use client";

import Link from "next/link";
import { useState } from "react";

import { publicConfig } from "@/lib/config.public";
import type { ModerationMessage } from "@/lib/domain/types";
import { useReviewSnapshot } from "./useReviewSnapshot";

/**
 * Revisione: cosa e' gia' a schermo (o eleggibile per finirci) e cosa e'
 * bloccato, per correggere un errore gia' fatto — non per moderarne uno
 * nuovo, che resta il compito di `/admin`.
 *
 * Due soli interventi, entrambi reversibili con la stessa azione al
 * contrario: "Rimuovi" su un approvato per errore, "Manda a schermo" su un
 * bloccato per errore (es. letto male un messaggio innocuo).
 */

type Section = "approved" | "rejected";

function VerdictBadge({ message }: { message: ModerationMessage }) {
  if (message.filterVerdict === "blocked") {
    return (
      <span className="inline-block rounded-full bg-red-500/15 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-red-400">
        bloccato dal filtro
      </span>
    );
  }
  if (message.filterVerdict === "suspect") {
    return (
      <span className="inline-block rounded-full bg-amber-500/15 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-amber-400">
        da verificare
      </span>
    );
  }
  return null;
}

export function ReviewConsole() {
  const { snapshot, setSnapshot, error, setError, call } = useReviewSnapshot();
  const [busy, setBusy] = useState<Set<string>>(new Set());

  async function moderate(message: ModerationMessage, from: Section) {
    const action = from === "approved" ? "remove" : "approve";
    setBusy((prev) => new Set(prev).add(message.id));

    try {
      await call("/api/admin/moderate", {
        method: "POST",
        body: JSON.stringify({ eventSlug: publicConfig.event.slug, id: message.id, action }),
      });
      setSnapshot((prev) => {
        if (!prev) return prev;
        const moved: ModerationMessage = {
          ...message,
          status: from === "approved" ? "rejected" : "approved",
        };
        return from === "approved"
          ? { approved: prev.approved.filter((m) => m.id !== message.id), rejected: [moved, ...prev.rejected] }
          : { rejected: prev.rejected.filter((m) => m.id !== message.id), approved: [moved, ...prev.approved] };
      });
    } catch {
      setError("Azione non riuscita. Riprovo a caricare.");
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(message.id);
        return next;
      });
    }
  }

  if (!snapshot) {
    return <p className="py-20 text-center text-ink-dim">{error ?? "Carico..."}</p>;
  }

  function renderSection(title: string, items: ModerationMessage[], section: Section) {
    const actionLabel = section === "approved" ? "Rimuovi" : "Manda a schermo";
    const actionColor = section === "approved" ? "text-red-400 active:bg-red-500/15" : "text-emerald-400 active:bg-emerald-500/15";

    return (
      <section className="space-y-3">
        <h2 className="px-1 text-sm font-medium text-ink-dim">
          {title} <span className="text-ink-faint">({items.length})</span>
        </h2>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">Niente qui.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((message) => {
              const isBusy = busy.has(message.id);
              return (
                <li
                  key={message.id}
                  className={`overflow-hidden rounded-2xl border border-line bg-surface-raised transition-opacity ${
                    isBusy ? "opacity-60" : ""
                  }`}
                >
                  <div className="space-y-2 p-4">
                    <VerdictBadge message={message} />
                    {message.source === "synthetic" && (
                      <span className="inline-block rounded-full bg-sky-500/15 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-sky-400">
                        🤖 pre-scritta
                      </span>
                    )}
                    <p className="text-lg leading-snug text-ink">{message.body}</p>
                    {message.name && <p className="text-sm text-ink-dim">&mdash; {message.name}</p>}
                  </div>

                  {isBusy ? (
                    <div className="flex items-center justify-center gap-2 border-t border-line bg-surface py-3.5 text-sm font-medium text-ink-dim">
                      <span
                        aria-hidden
                        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                      />
                      In corso...
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void moderate(message, section)}
                      className={`w-full border-t border-line bg-surface py-3.5 text-base font-semibold transition ${actionColor}`}
                    >
                      {actionLabel}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-10">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold">Revisione</h1>
        <div className="flex items-center justify-between text-xs">
          <p className="text-ink-faint">
            Cosa è a schermo e cosa è bloccato: rimuovi un messaggio approvato per errore, o manda a
            schermo uno bloccato per errore.
          </p>
          <Link href="/admin" className="shrink-0 pl-3 text-ink-faint underline underline-offset-2">
            Moderazione
          </Link>
        </div>
      </header>

      {error && (
        <p role="status" className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          {error}
        </p>
      )}

      {renderSection("A schermo", snapshot.approved, "approved")}
      {renderSection("Bloccati", snapshot.rejected, "rejected")}
    </div>
  );
}
