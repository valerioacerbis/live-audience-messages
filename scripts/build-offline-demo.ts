/**
 * Genera la modalita' demo del display come UN SOLO file HTML, da aprire
 * dal disco del portatile senza rete e senza server.
 *
 *   npm run offline-demo
 *   npm run offline-demo -- --out ~/Desktop/display-demo.html
 *
 * E' l'ultima riserva, per il caso in cui non si riesce nemmeno a caricare
 * `/display?demo=1` (Vercel irraggiungibile, rete del locale assente, e la
 * finestra pre-caricata persa per un riavvio). Dentro c'e' tutto: gli stessi
 * componenti React del display, il CSS di Tailwind compilato, il font Inter
 * in base64. Nessuna richiesta verso l'esterno.
 *
 * I tempi del display (`NEXT_PUBLIC_DISPLAY_*`) vengono dall'ambiente locale
 * (`.env.local`, poi i default di `config.public.ts`), non da Vercel: se in
 * produzione li hai cambiati, riportali in `.env.local` prima di rigenerare.
 * Va rigenerato anche dopo ogni modifica alle frasi o alla grafica.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadEnvConfig } from "@next/env";
import tailwind from "@tailwindcss/postcss";
import { build } from "esbuild";
import postcss from "postcss";

const ROOT = resolve(import.meta.dirname, "..");

function arg(flag: string, fallback: string): string {
  const index = process.argv.indexOf(`--${flag}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

/**
 * Solo le variabili pubbliche che servono al display. Le chiavi di Supabase e
 * Turnstile restano fuori: il file offline non parla con nessuno, e un file
 * che gira su una chiavetta non deve portarsele dietro.
 */
function publicEnv(): Record<string, string> {
  loadEnvConfig(ROOT, false, { info: () => {}, error: console.error });
  const env: Record<string, string> = { NODE_ENV: "production" };
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("NEXT_PUBLIC_") || value === undefined) continue;
    if (/SUPABASE|TURNSTILE|REALTIME/.test(key)) continue;
    env[key] = value;
  }
  return env;
}

async function bundleScript(env: Record<string, string>): Promise<string> {
  const result = await build({
    entryPoints: [resolve(ROOT, "scripts/offline-demo-entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2022",
    minify: true,
    jsx: "automatic",
    tsconfig: resolve(ROOT, "tsconfig.json"),
    define: {
      "process.env": JSON.stringify(env),
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    logLevel: "warning",
  });
  // `</script>` dentro il bundle chiuderebbe il tag in anticipo.
  return result.outputFiles[0]!.text.replaceAll("</script", "<\\/script");
}

async function compileCss(): Promise<string> {
  const from = resolve(ROOT, "src/app/globals.css");
  const source = await readFile(from, "utf8");
  const result = await postcss([tailwind({ base: ROOT, optimize: { minify: true } })]).process(
    source,
    { from },
  );

  // In Next il font arriva da `next/font`, che definisce `--font-inter` su
  // <html>. Qui lo facciamo a mano, con il file incorporato.
  const font = await readFile(resolve(ROOT, "assets/fonts/inter-latin.woff2"));
  const fontFace =
    `@font-face{font-family:Inter;font-style:normal;font-weight:100 900;font-display:block;` +
    `src:url(data:font/woff2;base64,${font.toString("base64")}) format("woff2")}` +
    `:root{--font-inter:Inter}`;

  return fontFace + result.css;
}

async function main(): Promise<void> {
  const out = resolve(arg("out", resolve(ROOT, "assets/offline/display-demo.html")));
  const env = publicEnv();

  const [script, css] = await Promise.all([bundleScript(env), compileCss()]);

  const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Display — demo offline</title>
<style>${css}</style>
</head>
<body class="min-h-dvh bg-stage text-ink antialiased">
<div id="root"></div>
<script>${script}</script>
</body>
</html>
`;

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, "utf8");

  const displayEnv = Object.entries(env).filter(([key]) => key.startsWith("NEXT_PUBLIC_"));
  console.log(`Demo offline scritta in ${out} (${Math.round(html.length / 1024)} KB)`);
  console.log(
    displayEnv.length
      ? `Variabili pubbliche incluse:\n${displayEnv.map(([k, v]) => `  ${k}=${v}`).join("\n")}`
      : "Nessuna variabile pubblica nell'ambiente: tempi e testi sono i default di config.public.ts",
  );
}

void main();
