import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { TaxRatesManager } from "@/components/admin/TaxRatesManager";

export const dynamic = "force-dynamic";

export default async function AdminTaxRatesPage() {
  const supabase = createSupabaseAdminClient();
  const [{ data: taxRates }, { data: productGroups }] = await Promise.all([
    supabase.from("tax_rates").select("*").order("rate", { ascending: false }),
    supabase.from("product_groups").select("id, name").order("name", { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">税率設定</h1>
      <p className="mb-6 text-sm text-neutral-500">
        税率メニュー(標準税率・軽減税率など)を登録し、アイテム(親品番)単位で適用期間を設定します。注文には作成時点の税率がスナップショットとして記録され、後から設定を変更しても過去の実績には影響しません。
      </p>
      <TaxRatesManager
        initialTaxRates={(taxRates ?? []) as { id: string; name: string; rate: number }[]}
        productGroups={(productGroups ?? []) as { id: string; name: string }[]}
      />
    </div>
  );
}
