"use client";

import { useEffect, useRef, useState } from "react";
import { Toast } from "@/components/admin/Toast";
import type { EmailTemplates } from "@/lib/email-templates";

/** 件名・本文の入力欄と、デフォルト文言に戻すボタンをまとめたセクション見出し。 */
function TemplateSectionHeader({
  title,
  description,
  onReset,
}: {
  title: string;
  description: React.ReactNode;
  onReset: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-neutral-700">{title}</p>
        <button type="button" onClick={onReset} className="shrink-0 text-xs text-blue-600 hover:underline">
          デフォルト文章に戻す
        </button>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
    </div>
  );
}

export function EmailTemplatesForm({
  initialOrderCompletionSubject,
  initialOrderCompletionBody,
  initialRenewalSubject,
  initialRenewalBody,
  initialAbandonedLeadSubject,
  initialAbandonedLeadBody,
  initialInquiryAutoReplySubject,
  initialInquiryAutoReplyBody,
  initialCancellationSubject,
  initialCancellationBody,
  initialShipmentCompleteSubject,
  initialShipmentCompleteBody,
  defaults,
}: {
  initialOrderCompletionSubject: string;
  initialOrderCompletionBody: string;
  initialRenewalSubject: string;
  initialRenewalBody: string;
  initialAbandonedLeadSubject: string;
  initialAbandonedLeadBody: string;
  initialInquiryAutoReplySubject: string;
  initialInquiryAutoReplyBody: string;
  initialCancellationSubject: string;
  initialCancellationBody: string;
  initialShipmentCompleteSubject: string;
  initialShipmentCompleteBody: string;
  /** 誤って編集してしまった場合に戻せるよう、コード側に保持している初期文言(DBの保存内容とは独立)。 */
  defaults: EmailTemplates;
}) {
  const [orderCompletionSubject, setOrderCompletionSubject] = useState(initialOrderCompletionSubject);
  const [orderCompletionBody, setOrderCompletionBody] = useState(initialOrderCompletionBody);
  const [renewalSubject, setRenewalSubject] = useState(initialRenewalSubject);
  const [renewalBody, setRenewalBody] = useState(initialRenewalBody);
  const [abandonedLeadSubject, setAbandonedLeadSubject] = useState(initialAbandonedLeadSubject);
  const [abandonedLeadBody, setAbandonedLeadBody] = useState(initialAbandonedLeadBody);
  const [inquiryAutoReplySubject, setInquiryAutoReplySubject] = useState(initialInquiryAutoReplySubject);
  const [inquiryAutoReplyBody, setInquiryAutoReplyBody] = useState(initialInquiryAutoReplyBody);
  const [cancellationSubject, setCancellationSubject] = useState(initialCancellationSubject);
  const [cancellationBody, setCancellationBody] = useState(initialCancellationBody);
  const [shipmentCompleteSubject, setShipmentCompleteSubject] = useState(initialShipmentCompleteSubject);
  const [shipmentCompleteBody, setShipmentCompleteBody] = useState(initialShipmentCompleteBody);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const skipResetRef = useRef(true);

  useEffect(() => {
    if (skipResetRef.current) {
      skipResetRef.current = false;
      return;
    }
    setJustSaved(false);
  }, [
    orderCompletionSubject,
    orderCompletionBody,
    renewalSubject,
    renewalBody,
    abandonedLeadSubject,
    abandonedLeadBody,
    inquiryAutoReplySubject,
    inquiryAutoReplyBody,
    cancellationSubject,
    cancellationBody,
    shipmentCompleteSubject,
    shipmentCompleteBody,
  ]);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setToast(null);

    const res = await fetch("/api/email-templates", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderCompletionSubject,
        orderCompletionBody,
        renewalSubject,
        renewalBody,
        abandonedLeadSubject,
        abandonedLeadBody,
        inquiryAutoReplySubject,
        inquiryAutoReplyBody,
        cancellationSubject,
        cancellationBody,
        shipmentCompleteSubject,
        shipmentCompleteBody,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setJustSaved(true);
      setToast({ message: "保存しました", type: "success" });
    } else {
      setToast({ message: "保存に失敗しました", type: "error" });
    }
  }

  return (
    <form onSubmit={handleSave} className="max-w-xl space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      <div className="space-y-3 rounded-md border border-neutral-200 p-4">
        <TemplateSectionHeader
          title="注文完了メール"
          onReset={() => {
            setOrderCompletionSubject(defaults.orderCompletionSubject);
            setOrderCompletionBody(defaults.orderCompletionBody);
          }}
          description={
            <>
              決済確定時に購入者へ送信されます。差し込み項目:
              {" "}
              {"{{customer_name}} {{product_name}} {{order_number}} {{quantity}} {{total_amount}}"}
            </>
          }
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">件名</span>
          <input
            className="input"
            value={orderCompletionSubject}
            onChange={(e) => setOrderCompletionSubject(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">本文</span>
          <textarea
            className="input font-mono"
            rows={10}
            value={orderCompletionBody}
            onChange={(e) => setOrderCompletionBody(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-md border border-neutral-200 p-4">
        <TemplateSectionHeader
          title="定期便メール(2回目以降のお届け)"
          onReset={() => {
            setRenewalSubject(defaults.renewalSubject);
            setRenewalBody(defaults.renewalBody);
          }}
          description={
            <>
              定期購入の2回目以降の周期課金が完了するたびに送信されます。差し込み項目:
              {" "}
              {"{{customer_name}} {{product_name}} {{quantity}} {{total_amount}} {{cycle_number}}"}
            </>
          }
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">件名</span>
          <input className="input" value={renewalSubject} onChange={(e) => setRenewalSubject(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">本文</span>
          <textarea
            className="input font-mono"
            rows={10}
            value={renewalBody}
            onChange={(e) => setRenewalBody(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-md border border-neutral-200 p-4">
        <TemplateSectionHeader
          title="離脱者リマインドメール"
          onReset={() => {
            setAbandonedLeadSubject(defaults.abandonedLeadSubject);
            setAbandonedLeadBody(defaults.abandonedLeadBody);
          }}
          description={
            <>
              注文フォームの入力途中で1時間以上離脱したお客様へ送信されます。差し込み項目:
              {" "}
              {"{{customer_name}} {{product_name}} {{chat_url}} {{unsubscribe_url}}"}
              <br />
              配信停止リンク({"{{unsubscribe_url}}"})は特定電子メール法対応のため必ず本文に含めてください。
            </>
          }
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">件名</span>
          <input
            className="input"
            value={abandonedLeadSubject}
            onChange={(e) => setAbandonedLeadSubject(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">本文</span>
          <textarea
            className="input font-mono"
            rows={10}
            value={abandonedLeadBody}
            onChange={(e) => setAbandonedLeadBody(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-md border border-neutral-200 p-4">
        <TemplateSectionHeader
          title="問い合わせ受付の自動返信メール"
          onReset={() => {
            setInquiryAutoReplySubject(defaults.inquiryAutoReplySubject);
            setInquiryAutoReplyBody(defaults.inquiryAutoReplyBody);
          }}
          description={
            <>
              チャット内の「その他のご質問」フォームからお客様が問い合わせを送信した際、お客様へ自動で送信されます
              (社内担当者への通知メールとは別です)。差し込み項目:
              {" "}
              {"{{customer_name}} {{message}} {{chat_url}}"}
            </>
          }
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">件名</span>
          <input
            className="input"
            value={inquiryAutoReplySubject}
            onChange={(e) => setInquiryAutoReplySubject(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">本文</span>
          <textarea
            className="input font-mono"
            rows={10}
            value={inquiryAutoReplyBody}
            onChange={(e) => setInquiryAutoReplyBody(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-md border border-neutral-200 p-4">
        <TemplateSectionHeader
          title="キャンセル確認メール"
          onReset={() => {
            setCancellationSubject(defaults.cancellationSubject);
            setCancellationBody(defaults.cancellationBody);
          }}
          description={
            <>
              注文一覧で受注ステータスを「キャンセル」に変更した際、購入者へ送信されます。差し込み項目:
              {" "}
              {"{{customer_name}} {{product_name}} {{order_number}}"}
            </>
          }
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">件名</span>
          <input
            className="input"
            value={cancellationSubject}
            onChange={(e) => setCancellationSubject(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">本文</span>
          <textarea
            className="input font-mono"
            rows={10}
            value={cancellationBody}
            onChange={(e) => setCancellationBody(e.target.value)}
          />
        </label>
      </div>

      <div className="space-y-3 rounded-md border border-neutral-200 p-4">
        <TemplateSectionHeader
          title="出荷完了メール(Stripe注文のみ)"
          onReset={() => {
            setShipmentCompleteSubject(defaults.shipmentCompleteSubject);
            setShipmentCompleteBody(defaults.shipmentCompleteBody);
          }}
          description={
            <>
              送り状データCSVの取込みで受注ステータスが「出荷済」になった際、購入者へ送信されます。
              代引き・後払いの注文には送信されません。差し込み項目:
              {" "}
              {"{{customer_name}} {{product_name}} {{order_number}} {{ship_date}} {{carrier_name}} {{tracking_number}} {{delivery_datetime_line}}"}
              <br />
              {"{{delivery_datetime_line}}"}は「■お届け希望日時: ...」の行(配送方法が宅急便の場合のみ、それ以外は空欄)です。
            </>
          }
        />
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">件名</span>
          <input
            className="input"
            value={shipmentCompleteSubject}
            onChange={(e) => setShipmentCompleteSubject(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-neutral-700">本文</span>
          <textarea
            className="input font-mono"
            rows={10}
            value={shipmentCompleteBody}
            onChange={(e) => setShipmentCompleteBody(e.target.value)}
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {saving ? "保存中..." : justSaved ? "保存済み" : "保存する"}
      </button>
    </form>
  );
}
