import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brands, productGroups } from "@/db/schema";
import { NewBrandButton } from "@/components/admin/NewBrandButton";
import { BrandsList } from "@/components/admin/BrandsList";

export const dynamic = "force-dynamic";

export default async function AdminBrandsPage() {
  const db = await getDb();
  const [brandRows, groupRows] = await Promise.all([
    db.select().from(brands).orderBy(desc(brands.createdAt)),
    db.select({ id: productGroups.id, name: productGroups.name, brandId: productGroups.brandId }).from(productGroups),
  ]);

  const rows = brandRows.map((brand) => ({
    id: brand.id,
    name: brand.name,
    code: brand.code ?? null,
    groups: groupRows
      .filter((g) => g.brandId === brand.id)
      .map((g) => ({ id: g.id, name: g.name })),
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
