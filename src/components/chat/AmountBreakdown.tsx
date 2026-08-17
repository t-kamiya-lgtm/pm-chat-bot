export function AmountBreakdown({
  amount,
  quantity = 1,
  shippingFee,
  paymentFee,
  paymentFeeLabel,
  addonAmount,
  addonLabel,
  discountAmount,
  firstTimeUnitPrice,
}: {
  amount: number;
  quantity?: number;
  shippingFee: number;
  paymentFee: number;
  paymentFeeLabel?: string;
  addonAmount?: number;
  addonLabel?: string;
  discountAmount?: number;
  /** 定期購入の初回特別価格(設定されている場合のみ)。2回目以降はamountを使う。 */
  firstTimeUnitPrice?: number;
}) {
  const subtotal = amount * quantity;
  const total = Math.max(
    0,
    subtotal + shippingFee + paymentFee + (addonAmount ?? 0) - (discountAmount ?? 0),
  );
  const hasFirstTimePrice = firstTimeUnitPrice !== undefined && firstTimeUnitPrice < amount;
  const firstTimeTotal = hasFirstTimePrice
    ? Math.max(
        0,
        firstTimeUnitPrice * quantity + shippingFee + paymentFee + (addonAmount ?? 0) - (discountAmount ?? 0),
      )
    : total;
  return (
    <div className="rounded-md bg-neutral-50 p-3 text-sm">
      <Row label={quantity > 1 ? `商品代金(数量: ${quantity})` : "商品代金"} value={subtotal} />
      {addonAmount !== undefined && addonAmount > 0 && (
        <Row label={addonLabel ?? "追加商品"} value={addonAmount} />
      )}
      <Row label="送料" value={shippingFee} note={shippingFee === 0 ? "送料無料" : undefined} />
      {paymentFee > 0 && <Row label={paymentFeeLabel ?? "決済手数料"} value={paymentFee} note="税込" />}
      {discountAmount !== undefined && discountAmount > 0 && (
        <div className="flex justify-between text-red-600">
          <span>クーポン割引</span>
          <span>-{discountAmount.toLocaleString()}円</span>
        </div>
      )}
      <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-medium">
        <span>{hasFirstTimePrice ? "初回合計" : "合計"}</span>
        <span>{firstTimeTotal.toLocaleString()}円</span>
      </div>
      {hasFirstTimePrice && (
        <p className="mt-1 text-xs text-neutral-500">2回目以降のお支払い: {total.toLocaleString()}円</p>
      )}
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="flex justify-between text-neutral-600">
      <span>{label}</span>
      <span>
        {note === "送料無料" ? note : `${value.toLocaleString()}円${note ? `(${note})` : ""}`}
      </span>
    </div>
  );
}
