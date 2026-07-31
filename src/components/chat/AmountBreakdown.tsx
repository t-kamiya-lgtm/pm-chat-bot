export function AmountBreakdown({
  amount,
  shippingFee,
  paymentFee,
  paymentFeeLabel,
}: {
  amount: number;
  shippingFee: number;
  paymentFee: number;
  paymentFeeLabel?: string;
}) {
  const total = amount + shippingFee + paymentFee;
  return (
    <div className="rounded-md bg-neutral-50 p-3 text-sm">
      <Row label="商品代金" value={amount} />
      <Row label="送料" value={shippingFee} note={shippingFee === 0 ? "送料無料" : undefined} />
      {paymentFee > 0 && <Row label={paymentFeeLabel ?? "決済手数料"} value={paymentFee} note="税込" />}
      <div className="mt-1 flex justify-between border-t border-neutral-200 pt-1 font-medium">
        <span>合計</span>
        <span>{total.toLocaleString()}円</span>
      </div>
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
