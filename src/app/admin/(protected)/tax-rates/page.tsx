import { asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { productGroups, taxRates } from "@/db/schema";
import { TaxRatesManager } from "@/components/admin/TaxRatesManager";

export const dynamic = "force-dynamic";

export default async function AdminTaxRatesPage() {
  const db = await getDb();
  const [taxRateRows, productGroupRows] = await Promise.all([
    db.select().from(taxRates).orderBy(desc(taxRates.rate)),
    db.select({ id: productGroups.id, name: productGroups.name }).from(productGroups).orderBy(asc(productGroups.name)),
  ]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">税率設定</h1>
      <p className="mb-6 text-sm text-neutral-500">
        税率メニュー(標準税率・軽減税率など)を登録し、アイテム(親品番)単位で適用期間を設定します。注文には作成時点の税率がスナップショットとして記録され、後から設定を変更しても過去の実績には影響しません。
      </p>
      <TaxRatesManager
        initialTaxRates={taxRateRows.map((t) => ({ id: t.id, name: t.name, rate: Number(t.rate) }))}
        productGroups={productGroupRows}
      />
    </div>
  );
}
