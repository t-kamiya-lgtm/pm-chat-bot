import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NewProductGroupButton } from "@/components/admin/NewProductGroupButton";

export const dynamic = "force-dynamic";

export default async function AdminProductGroupsPage() {
  const supabase = createSupabaseAdminClient();
  const { data: productGroups } = await supabase
    .from("product_groups")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">商品種類(親品番)</h1>
        <NewProductGroupButton />
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        単品/定期で品番を分けて登録する前に、まず商品種類を登録してください。仕様情報・商品QAは商品種類単位で管理します。
      </p>

      <div className="space-y-3">
        {productGroups?.map((group) => (
          <Link
            key={group.id}
            href={`/admin/product-groups/${group.id}`}
            className="block rounded-lg border border-neutral-200 bg-white p-4 hover:shadow-sm"
          >
            {group.name}
          </Link>
        ))}
        {!productGroups?.length && (
          <p className="rounded-lg border border-dashed border-neutral-300 p-6 text-center text-neutral-400">
            商品種類が登録されていません
          </p>
        )}
      </div>
    </div>
  );
}
