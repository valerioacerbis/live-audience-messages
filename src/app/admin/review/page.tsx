import { redirect } from "next/navigation";

import { ReviewConsole } from "@/components/admin/ReviewConsole";
import { requireAdmin } from "../authGate";

export default async function AdminReviewPage() {
  if (!(await requireAdmin())) redirect("/admin/login");

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <ReviewConsole />
    </main>
  );
}
