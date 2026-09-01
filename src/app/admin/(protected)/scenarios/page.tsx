import { asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { scenarios } from "@/db/schema";
import { NewScenarioButton } from "@/components/admin/NewScenarioButton";
import { ScenariosList } from "@/components/admin/ScenariosList";

export const dynamic = "force-dynamic";

export default async function AdminScenariosPage() {
  let scenarioRows: (typeof scenarios.$inferSelect)[] = [];
  let loadError: string | null = null;
  try {
    const db = await getDb();
    scenarioRows = await db.select().from(scenarios).orderBy(asc(scenarios.displayOrder));
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    console.error("[admin/scenarios] failed to load scenarios", err);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">シナリオ</h1>
        <NewScenarioButton />
      </div>

      {loadError && (
        <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          シナリオ一覧の取得に失敗しました({loadError})
        </p>
      )}

      <ScenariosList
        initialScenarios={scenarioRows.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          displayOrder: s.displayOrder ?? 0,
        }))}
      />
    </div>
  );
}
