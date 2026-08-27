import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewBrandButton } from "@/components/admin/NewBrandButton";
import { BrandsList } from "@/components/admin/BrandsList";

export const dynamic = "force-dynamic";

export default async function AdminBrandsPage() {
  const supabase = createSupabaseAdminClient();
  const [{ data: brands }, { data: groups }] = await Promise.all([
    supabase.from("brands").select("*").order("created_at", { ascending: false }),
    supabase.from("product_groups").select("id, name, brand_id"),
  ]);

  const rows = (brands ?? []).map((brand) => ({
    id: brand.id as string,
    name: brand.name as string,
    code: (brand.code as string | null) ?? null,
    groups: (groups ?? [])
      .filter((g) => g.brand_id === brand.id)
      .map((g) => ({ id: g.id as string, name: g.name as string })),
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">ブランド</h1>
        <NewBrandButton />
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        アイテム(親品番)の一段上の階層です。例:「プロテインモンスター」ブランドの下に、通常品とソバ味などのアイテムをまとめられます。各アイテムの詳細画面でブランドを割り当ててください。
        ブランドコード(英字2文字)は、シナリオコード(シナリオ編集画面の「シナリオコード」欄)の先頭2文字と突き合わせて、実績ダッシュボードのブランド別集計に使われます。
      </p>

      <BrandsList initialBrands={rows} />
    </div>
  );
}
