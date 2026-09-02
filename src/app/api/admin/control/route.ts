import type { NextRequest } from "next/server";
import { z } from "zod";

import { serverConfig } from "@/lib/config";
import { publicConfig } from "@/lib/config.public";
import { isAdmin, jsonError, jsonOk, readJsonBody } from "@/lib/http/request";
import {
  addSyntheticMessages,
  clearDisplay,
  closeEvent,
  purgeMessages,
  reopenEvent,
  setClosingPhrase,
  setModerationMode,
} from "@/lib/service/admin";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set-mode"),
    eventSlug: z.string().default(publicConfig.event.slug),
    mode: z.enum(["manual", "assisted", "auto"]),
  }),
  z.object({
    action: z.literal("set-closing-phrase"),
    eventSlug: z.string().default(publicConfig.event.slug),
    // Solo un tetto di sicurezza contro un payload assurdo: il vero limite
    // (in grafemi, configurabile) e' applicato da `setClosingPhrase`.
    phrase: z.string().max(1000),
  }),
  z.object({
    action: z.literal("clear"),
    eventSlug: z.string().default(publicConfig.event.slug),
  }),
  z.object({
    action: z.literal("purge"),
    eventSlug: z.string().default(publicConfig.event.slug),
  }),
  z.object({
    action: z.literal("add-synthetic"),
    eventSlug: z.string().default(publicConfig.event.slug),
  }),
  z.object({
    action: z.literal("end-event"),
    eventSlug: z.string().default(publicConfig.event.slug),
  }),
  z.object({
    action: z.literal("reopen-event"),
    eventSlug: z.string().default(publicConfig.event.slug),
  }),
]);

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAdmin(request)) return jsonError(401, "Non autorizzato.");

  const body = await readJsonBody(request);
  if (!body.ok) return jsonError(body.status, body.message);

  const parsed = schema.safeParse(body.value);
  if (!parsed.success) return jsonError(400, "Richiesta non valida.");

  try {
    switch (parsed.data.action) {
      case "set-mode":
        await setModerationMode(parsed.data.eventSlug, parsed.data.mode);
        return jsonOk({ ok: true });
      case "set-closing-phrase": {
        const result = await setClosingPhrase(parsed.data.eventSlug, parsed.data.phrase);
        if (!result.ok) {
          return jsonError(
            400,
            `La frase supera ${serverConfig.limits.closingPhraseMaxLength} caratteri.`,
          );
        }
        return jsonOk({ ok: true });
      }
      case "clear":
        await clearDisplay(parsed.data.eventSlug);
        return jsonOk({ ok: true });
      case "purge":
        await purgeMessages(parsed.data.eventSlug);
        return jsonOk({ ok: true });
      case "add-synthetic": {
        const { added, available } = await addSyntheticMessages(
          parsed.data.eventSlug,
          serverConfig.moderation.syntheticBatchSize,
        );
        return jsonOk({ ok: true, added, available });
      }
      case "end-event":
        await closeEvent(parsed.data.eventSlug);
        return jsonOk({ ok: true });
      case "reopen-event":
        await reopenEvent(parsed.data.eventSlug);
        return jsonOk({ ok: true });
    }
  } catch (error) {
    console.error("[api/admin/control]", error);
    return jsonError(500, "Operazione non riuscita.");
  }
}
