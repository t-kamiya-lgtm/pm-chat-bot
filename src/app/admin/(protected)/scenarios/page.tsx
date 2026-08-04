import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewScenarioButton } from "@/components/admin/NewScenarioButton";
import { ScenariosList } from "@/components/admin/ScenariosList";

export const dynamic = "force-dynamic";

export default async function AdminScenariosPage() {
  const supabase = createSupabaseAdminClient();
  const { data: scenarios, error: scenariosError } = await supabase
    .from("scenarios")
    .select("*")
    .order("display_order", { ascending: true });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">シナリオ</h1>
        <NewScenarioButton />
      </div>

      {scenariosError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          シナリオ一覧の取得に失敗しました({scenariosError.message})
        </p>
      )}

      <ScenariosList
        initialScenarios={(scenarios ?? []).map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          displayOrder: s.display_order ?? 0,
        }))}
      />
    </div>
  );
}
