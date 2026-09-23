/**
 * Il tasto premuto e' quello che passa alla modalita' demo?
 *
 * Maiuscole e minuscole indifferenti (il Caps Lock acceso non deve
 * disarmare il paracadute). Mai con Cmd/Ctrl/Alt: Cmd+X e simili sono
 * scorciatoie del sistema, non una richiesta di cambiare schermo. E mai
 * sulle ripetizioni di un tasto tenuto premuto, che farebbero rimbalzare
 * avanti e indietro tra le due modalita'.
 */
export interface KeyPress {
  key: string;
  repeat: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export function isDemoToggleKey(event: KeyPress, toggleKey: string): boolean {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return false;
  return event.key.toLowerCase() === toggleKey.toLowerCase();
}
