import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewScenarioButton } from "@/components/admin/NewScenarioButton";

export const dynamic = "force-dynamic";

export default async function AdminScenariosPage() {
  const supabase = createSupabaseAdminClient();
  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">シナリオ</h1>
        <NewScenarioButton />
      </div>

      <div className="space-y-3">
        {scenarios?.map((scenario) => (
          <Link
            key={scenario.id}
            href={`/admin/scenarios/${scenario.id}`}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-4 hover:shadow-sm"
          >
            <span>{scenario.name}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                scenario.status === "published"
                  ? "bg-green-100 text-green-800"
                  : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {scenario.status === "published" ? "公開中" : "下書き"}
            </span>
          </Link>
        ))}
        {!scenarios?.length && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
            シナリオが登録されていません
          </p>
        )}
      </div>
    </div>
  );
}
