/**
 * Genera il QR code da stampare o da proiettare.
 *
 *   npm run qr -- --url https://tuo-dominio.vercel.app
 *   npm run qr -- --url https://tuo-dominio.vercel.app --out qr.svg
 *
 * Il QR punta alla pagina del pubblico. Se un giorno il link finisse in giro,
 * si cambia il token dell'evento e si rigenera: il codice vecchio smette di
 * funzionare senza toccare una riga di codice.
 */

import { writeFile } from "node:fs/promises";
import QRCode from "qrcode";

function arg(flag: string, fallback: string | null = null): string | null {
  const index = process.argv.indexOf(`--${flag}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function main(): Promise<void> {
  const url = arg("url", "http://localhost:3000")!;
  const out = arg("out");
  const token = arg("token");

  const target = new URL(url);
  if (token) target.searchParams.set("t", token);

  // Livello H: un QR proiettato su un maxischermo puo' essere letto di
  // sbieco, da lontano e con le luci addosso. La ridondanza serve.
  const svg = await QRCode.toString(target.toString(), {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 2,
    width: 1200,
  });

  if (out) {
    await writeFile(out, svg, "utf8");
    console.log(`QR scritto in ${out}`);
  } else {
    console.log(await QRCode.toString(target.toString(), { type: "terminal", small: true }));
  }

  console.log(`\nPunta a: ${target.toString()}`);
}

void main();
