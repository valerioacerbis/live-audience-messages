import { redirect } from "next/navigation";

import { AdminConsole } from "@/components/admin/AdminConsole";
import { requireAdmin } from "./authGate";

export default async function AdminPage() {
  if (!(await requireAdmin())) redirect("/admin/login");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <AdminConsole />
    </main>
  );
}
