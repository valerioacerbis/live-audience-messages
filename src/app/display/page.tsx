import { FullscreenGate } from "@/components/display/DisplayScene";
import { DisplayModeSwitch } from "@/components/display/DisplayModeSwitch";

/**
 * Pagina del maxischermo.
 *
 * `?renderer=basic` sceglie il renderer visuale: allo STEP 2 servira' a
 * confrontare il renderer WebGL con quello base durante il soundcheck.
 *
 * `?demo=1` apre direttamente in modalita' demo: ruotano solo le frasi
 * pre-scritte, senza rete e senza moderazione. Dal display vero ci si passa
 * anche col tasto X, senza ricaricare la pagina (vedi `DisplayModeSwitch`).
 * Sta nell'URL e non in `/admin/settings` di proposito: un'impostazione
 * salvata nel database non si potrebbe accendere proprio quando il database
 * e' il pezzo che non risponde.
 */
export default async function DisplayPage(props: PageProps<"/display">) {
  const params = await props.searchParams;
  const renderer = typeof params.renderer === "string" ? params.renderer : undefined;
  const demo = params.demo === "1";

  return (
    <FullscreenGate demo={demo}>
      <DisplayModeSwitch initialDemo={demo} rendererName={renderer} />
    </FullscreenGate>
  );
}
