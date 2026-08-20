"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ImportResult {
  success: number;
  total: number;
  errors: { line: number; orderNumber: string; reason: string }[];
}

/** 送り状データCSV(注文番号・出荷日・運送会社名・送り状番号)を取り込み、Stripe注文を出荷済にする。 */
export function ShipmentImportForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setResult(null);

    const csv = await file.text();
    const res = await fetch("/api/orders/import-shipment", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });

    setUploading(false);
    if (res.ok) {
      setResult(await res.json());
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setResult({
        success: 0,
        total: 0,
        errors: [{ line: 0, orderNumber: "", reason: typeof body.error === "string" ? body.error : "取り込みに失敗しました" }],
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
      >
        送り状CSV取込み(Stripe注文のみ)
      </button>
      {open && (
        <div className="mt-2 max-w-xl rounded-lg border border-neutral-200 bg-white p-3 text-sm">
          <p className="mb-2 text-xs text-neutral-500">
            列構成: 注文番号, 出荷日, 運送会社名, 送り状番号(ヘッダー行の有無どちらでも可)。
            取り込むと該当注文の受注ステータスが「出荷済」になり、購入者へ出荷完了メールが送信されます。
            代引き・後払いの注文は対象外です。
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            disabled={uploading}
          />
          {uploading && <p className="mt-2 text-xs text-neutral-500">取り込み中...</p>}
          {result && (
            <div className="mt-2 text-xs">
              <p className={result.errors.length > 0 ? "text-amber-700" : "text-green-700"}>
                {result.success}/{result.total}件を出荷済にしました
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red-700">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      {e.line > 0 ? `${e.line}行目` : ""}
                      {e.orderNumber ? `(${e.orderNumber})` : ""}: {e.reason}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
