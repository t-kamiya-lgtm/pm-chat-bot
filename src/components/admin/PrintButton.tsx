"use client";

export function PrintButton({ label = "PDFに保存(A4縦)" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
    >
      {label}
    </button>
  );
}
