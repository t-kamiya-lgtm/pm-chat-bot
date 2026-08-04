import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewScenarioButton } from "@/components/admin/NewScenarioButton";
import { ScenariosList } from "@/components/admin/ScenariosList";

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

      <ScenariosList
        initialScenarios={(scenarios ?? []).map((s) => ({ id: s.id, name: s.name, status: s.status }))}
      />
    </div>
  );
}
