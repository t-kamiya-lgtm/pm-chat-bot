"use client";

import { useEffect, useState } from "react";
import type { Address, ShippingAddress } from "@/lib/types";

interface OrderDetail {
  orderNumber: string | null;
  deliveryDate: string | null;
  deliveryTimeSlot: string | null;
  shippingAddress: ShippingAddress | null;
  invoiceNote: string | null;
  customer: {
    name: string;
    nameKana: string | null;
    phone: string | null;
    address: Address | null;
    gender: string | null;
    birthDate: string | null;
  };
}

function formatAddress(address: Address | null): string {
  if (!address) return "-";
  return `〒${address.postalCode} ${address.prefecture}${address.city}${address.line1}${
    address.line2 ? ` ${address.line2}` : ""
  }`;
}

/**
 * 注文一覧の注文番号クリックで開く、一覧表だけでは確認できない詳細
 * (注文者の住所・電話番号・生年月日・性別、お届け先、お届け希望日時、お客様コメント)のポップアップ。
 */
export function OrderDetailDialog({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orders/${orderId}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `注文詳細の取得に失敗しました(${res.status})`);
        }
        return (await res.json()) as OrderDetail;
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-neutral-900">
            注文詳細{detail?.orderNumber ? `(${detail.orderNumber})` : ""}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {!error && !detail && <p className="text-sm text-neutral-400">読み込み中...</p>}

        {detail && (
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-neutral-400">注文者情報</dt>
              <dd className="mt-1 text-neutral-800">
                {detail.customer.name}様(フリガナ: {detail.customer.nameKana ?? "-"})
                <br />
                TEL: {detail.customer.phone ?? "-"}
                <br />
                住所: {formatAddress(detail.customer.address)}
                <br />
                性別: {detail.customer.gender || "未回答"} / 生年月日:{" "}
                {detail.customer.birthDate
                  ? new Date(detail.customer.birthDate).toLocaleDateString("ja-JP")
                  : "未回答"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">お届け先</dt>
              <dd className="mt-1 text-neutral-800">
                {detail.shippingAddress ? (
                  <>
                    {detail.shippingAddress.recipientName}様
                    <br />
                    TEL: {detail.shippingAddress.recipientPhone}
                    <br />
                    {formatAddress(detail.shippingAddress)}
                  </>
                ) : (
                  "注文者住所と同じ"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-400">お届け希望日時</dt>
              <dd className="mt-1 text-neutral-800">
                {detail.deliveryDate ? new Date(detail.deliveryDate).toLocaleDateString("ja-JP") : "-"}{" "}
                {detail.deliveryTimeSlot ?? ""}
              </dd>
            </div>
            {detail.invoiceNote && (
              <div>
                <dt className="text-xs text-neutral-400">お客様コメント</dt>
                <dd className="mt-1 whitespace-pre-wrap text-neutral-800">{detail.invoiceNote}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
