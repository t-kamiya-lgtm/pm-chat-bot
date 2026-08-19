"use client";

interface CouponCardProps {
  imageUrl: string | null;
  message: string;
  discountLabel: string;
  code?: string | null;
}

export function CouponCard({ imageUrl, message, discountLabel, code }: CouponCardProps) {
  return (
    <div className="max-w-[85%] space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <span className="inline-block rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">
        お得なクーポン
      </span>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="h-auto w-full rounded-lg object-cover" />
      )}
      <p className="text-sm font-medium text-neutral-800">{message}</p>
      <p className="text-sm font-semibold text-amber-700">{discountLabel}</p>
      {code && <p className="text-xs text-neutral-500">クーポンコード: {code}</p>}
    </div>
  );
}
