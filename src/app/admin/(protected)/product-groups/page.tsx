import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroups } from "@/db/schema";
import { NewProductGroupButton } from "@/components/admin/NewProductGroupButton";
import { ProductGroupsList } from "@/components/admin/ProductGroupsList";

export const dynamic = "force-dynamic";

export default async function AdminProductGroupsPage() {
  const db = await getDb();
  const rows = await db
    .select({ id: productGroups.id, name: productGroups.name })
    .from(productGroups)
    .orderBy(desc(productGroups.createdAt));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">アイテム</h1>
        <NewProductGroupButton />
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        単品/定期で品番を分けて登録する前に、まずアイテムを登録してください。仕様情報・商品QAはアイテム単位で管理します。
      </p>

      <ProductGroupsList initialGroups={rows} />
    </div>
  );
}
