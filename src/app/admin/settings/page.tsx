import { redirect } from "next/navigation";

import { SettingsConsole } from "@/components/admin/SettingsConsole";
import { requireAdmin } from "../authGate";

export default async function AdminSettingsPage() {
  if (!(await requireAdmin())) redirect("/admin/login");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <SettingsConsole />
    </main>
  );
}
