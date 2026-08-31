import { DisplayStage, FullscreenGate } from "@/components/display/DisplayStage";

/**
 * Pagina del maxischermo.
 *
 * `?renderer=basic` sceglie il renderer visuale: allo STEP 2 servira' a
 * confrontare il renderer WebGL con quello base durante il soundcheck.
 */
export default async function DisplayPage(props: PageProps<"/display">) {
  const params = await props.searchParams;
  const renderer = typeof params.renderer === "string" ? params.renderer : undefined;

  return (
    <FullscreenGate>
      <DisplayStage rendererName={renderer} />
    </FullscreenGate>
  );
}
