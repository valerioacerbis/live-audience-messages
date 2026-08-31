import type { NextRequest } from "next/server";
import { z } from "zod";

import { serverConfig } from "@/lib/config";
import { publicConfig } from "@/lib/config.public";
import { isAdmin, jsonError, jsonOk, readJsonBody } from "@/lib/http/request";
import {
  addSyntheticMessages,
  clearDisplay,
  purgeMessages,
  setModerationMode,
} from "@/lib/service/admin";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set-mode"),
    eventSlug: z.string().default(publicConfig.event.slug),
    mode: z.enum(["manual", "assisted", "auto"]),
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
      case "clear":
        await clearDisplay(parsed.data.eventSlug);
        return jsonOk({ ok: true });
      case "purge":
        await purgeMessages(parsed.data.eventSlug);
        return jsonOk({ ok: true });
      case "add-synthetic": {
        const { added } = await addSyntheticMessages(
          parsed.data.eventSlug,
          serverConfig.moderation.syntheticBatchSize,
        );
        return jsonOk({ ok: true, added });
      }
    }
  } catch (error) {
    console.error("[api/admin/control]", error);
    return jsonError(500, "Operazione non riuscita.");
  }
}
