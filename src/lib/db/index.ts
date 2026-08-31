import "server-only";

import { serverConfig } from "../config";
import { createMemoryRepository } from "./memory";
import { createSupabaseRepository } from "./supabase";
import type { Repository } from "./types";

let repository: Repository | null = null;

export function getRepository(): Repository {
  if (repository) return repository;

  if (serverConfig.db.driver === "supabase") {
    repository = createSupabaseRepository();
    return repository;
  }

  // Il driver `memory` tiene lo stato nel processo. Su Vercel ogni invocazione
  // puo' finire su un'istanza diversa: il display vedrebbe messaggi a caso e
  // il rate limit non conterebbe niente. Meglio fallire al deploy che a meta'
  // concerto.
  if (process.env.VERCEL === "1" && process.env.NODE_ENV === "production") {
    throw new Error(
      "DB_DRIVER=memory non e' utilizzabile su Vercel: ogni funzione avrebbe " +
        "il proprio stato. Configura Supabase (vedi README).",
    );
  }

  repository = createMemoryRepository();
  return repository;
}

export type { Repository } from "./types";
