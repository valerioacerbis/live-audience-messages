"use client";

import { publicConfig } from "@/lib/config.public";
import { useDisplayEngine } from "@/lib/display/useDisplayEngine";
import { DisplayScene } from "./DisplayScene";

/** Il display vero: messaggi dal server, realtime e polling di riserva. */
export function DisplayStage({ rendererName }: { rendererName?: string }) {
  const { state, connection } = useDisplayEngine(publicConfig.event.slug);
  return <DisplayScene state={state} status={connection.status} rendererName={rendererName} />;
}
