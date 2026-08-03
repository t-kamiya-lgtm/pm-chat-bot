import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewBrandButton } from "@/components/admin/NewBrandButton";

export const dynamic = "force-dynamic";

export default async function AdminBrandsPage() {
  const supabase = createSupabaseAdminClient();
  const [{ data: brands }, { data: groups }] = await Promise.all([
    supabase.from("brands").select("*").order("created_at", { ascending: false }),
    supabase.from("product_groups").select("id, name, brand_id"),
  ]);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ブランド</h1>
        <NewBrandButton />
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        アイテム(親品番)の一段上の階層です。例:「プロテインモンスター」ブランドの下に、通常品とソバ味などのアイテムをまとめられます。各アイテムの詳細画面でブランドを割り当ててください。
      </p>

      <div className="space-y-3">
        {brands?.map((brand) => {
          const belongingGroups = (groups ?? []).filter((g) => g.brand_id === brand.id);
          return (
            <div key={brand.id} className="rounded-lg border border-neutral-200 bg-white p-4">
              <p className="font-medium">{brand.name}</p>
              <div className="mt-2 space-y-1">
                {belongingGroups.map((g) => (
                  <Link
                    key={g.id}
                    href={`/admin/product-groups/${g.id}`}
                    className="block text-sm text-blue-600 hover:underline"
                  >
                    {g.name}
                  </Link>
                ))}
                {belongingGroups.length === 0 && (
                  <p className="text-sm text-neutral-400">紐づくアイテムがありません</p>
                )}
              </div>
            </div>
          );
        })}
        {!brands?.length && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
            ブランドが登録されていません
          </p>
        )}
      </div>
    </div>
  );
}
