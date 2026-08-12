"use client";

export default function CustomersError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="mb-2 font-semibold">顧客管理ページの読み込みに失敗しました。</p>
      <p className="whitespace-pre-wrap break-all">{error.message}</p>
      {error.digest && <p className="mt-2 text-xs text-red-500">digest: {error.digest}</p>}
    </div>
  );
}
