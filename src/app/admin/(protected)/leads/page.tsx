import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { leads } from "@/db/schema";
import { LeadsTable, type LeadRow } from "@/components/admin/LeadsTable";

export const dynamic = "force-dynamic";

/**
 * 決済フォーム入力途中で離脱した見込み客(名前・電話番号・メールアドレス・選択商品)の一覧。
 * スマレジ等への正式な連携が整うまでの間、CSVダウンロードして手動で活用する想定。
 * 注文状況は注文作成時(セッションID紐付け)に一度だけ確定し、後から別の注文が入っても更新されない。
 */
export default async function AdminLeadsPage() {
  let leadRows: LeadRow[] = [];
  try {
    const db = await getDb();
    const rows = await db.query.leads.findMany({
      orderBy: [desc(leads.updatedAt)],
      limit: 500,
      with: {
        product: { columns: { name: true } },
      },
    });
    leadRows = rows.map((lead) => ({
      id: lead.id,
      updated_at: lead.updatedAt,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      products: lead.product ? { name: lead.product.name } : null,
      survey_responses: lead.surveyResponses as Record<string, string> | null,
      order_status: lead.orderStatus as LeadRow["order_status"],
      contacted_phone: lead.contactedPhone,
      contacted_email: lead.contactedEmail,
      contacted_sms: lead.contactedSms,
    }));
  } catch (err) {
    console.error("[admin/leads] failed to load leads", err);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">アクセスログ</h1>
          <p className="mt-1 text-sm text-neutral-500">
            決済フォームの入力途中で離脱したお客様の情報です。氏名・電話番号・メールアドレスのいずれかが
            入力された時点で記録されます(注文が完了した場合もここには残ります)。
          </p>
        </div>
        <Link
          href="/api/leads/export"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
        >
          CSVダウンロード
        </Link>
      </div>

      <LeadsTable leads={leadRows} />
    </div>
  );
}
