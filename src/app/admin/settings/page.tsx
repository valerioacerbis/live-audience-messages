import { AccessDenied } from "@/components/admin/AccessDenied";
import { SettingsConsole } from "@/components/admin/SettingsConsole";
import { requireAdminToken } from "../authGate";

export default async function AdminSettingsPage(props: PageProps<"/admin/settings">) {
  const params = await props.searchParams;
  const token = await requireAdminToken(params);

  if (!token) return <AccessDenied />;

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6">
      <SettingsConsole token={token} />
    </main>
  );
}
