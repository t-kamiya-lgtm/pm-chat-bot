"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";

export interface LeadRow {
  id: string;
  updated_at: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  products: { name: string } | null;
  survey_responses: Record<string, string> | null;
  order_status: "ordered" | "abandoned";
  contacted_phone: boolean;
  contacted_email: boolean;
  contacted_sms: boolean;
}

type ContactField = "contactedPhone" | "contactedEmail" | "contactedSms";

export function LeadsTable({ leads }: { leads: LeadRow[] }) {
  const router = useRouter();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function toggleContact(id: string, field: ContactField, value: boolean) {
    setUpdatingId(id);
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    setUpdatingId(null);
    if (res.ok) {
      router.refresh();
    } else {
      setToast({ message: "対応状況の更新に失敗しました", type: "error" });
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-4 py-2">更新日時</th>
            <th className="px-4 py-2">お名前</th>
            <th className="px-4 py-2">電話番号</th>
            <th className="px-4 py-2">メールアドレス</th>
            <th className="px-4 py-2">選択商品</th>
            <th className="px-4 py-2">アンケート</th>
            <th className="px-4 py-2">注文状況</th>
            <th className="px-4 py-2">フォロー対応</th>
            <th className="px-4 py-2">対応状況</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const surveyEntries = Object.entries(lead.survey_responses ?? {});
            const surveyText = surveyEntries.map(([q, a]) => `${q}: ${a}`).join("\n");
            const contacted = lead.contacted_phone || lead.contacted_email || lead.contacted_sms;
            const disabled = updatingId === lead.id;
            return (
              <tr key={lead.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 whitespace-nowrap">
                  {new Date(lead.updated_at).toLocaleString("ja-JP")}
                </td>
                <td className="px-4 py-2">{lead.name ?? "-"}</td>
                <td className="px-4 py-2">{lead.phone ?? "-"}</td>
                <td className="px-4 py-2">{lead.email ?? "-"}</td>
                <td className="px-4 py-2">{lead.products?.name ?? "-"}</td>
                <td className="px-4 py-2">
                  {surveyEntries.length > 0 ? (
                    <span title={surveyText} className="cursor-help underline decoration-dotted">
                      {surveyEntries.length}件
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-4 py-2">
                  {lead.order_status === "ordered" ? (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">
                      注文完了あり
                    </span>
                  ) : (
                    <span className="text-neutral-400">離脱のみ</span>
                  )}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <label className="mr-2 inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={lead.contacted_phone}
                      disabled={disabled}
                      onChange={(e) => toggleContact(lead.id, "contactedPhone", e.target.checked)}
                    />
                    電話
                  </label>
                  <label className="mr-2 inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={lead.contacted_email}
                      disabled={disabled}
                      onChange={(e) => toggleContact(lead.id, "contactedEmail", e.target.checked)}
                    />
                    メール
                  </label>
                  <label className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={lead.contacted_sms}
                      disabled={disabled}
                      onChange={(e) => toggleContact(lead.id, "contactedSms", e.target.checked)}
                    />
                    SMS
                  </label>
                </td>
                <td className="px-4 py-2">
                  {contacted ? (
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800">対応済み</span>
                  ) : (
                    <span className="text-neutral-400">未対応</span>
                  )}
                </td>
              </tr>
            );
          })}
          {!leads.length && (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-neutral-400">
                アクセスログはまだありません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
