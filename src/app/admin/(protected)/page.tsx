import Link from "next/link";

const CARDS = [
  { href: "/admin/products", title: "商品管理", description: "商品登録・送料・定期購入設定" },
  { href: "/admin/scenarios", title: "シナリオ管理", description: "選択肢分岐型トークフローの作成" },
  { href: "/admin/faqs", title: "商品QAレビュー", description: "生成されたQ&A候補の承認・却下" },
  { href: "/admin/orders", title: "注文一覧", description: "決済・後払い・代引きの注文状況" },
];

export default function AdminDashboardPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">ダッシュボード</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <h2 className="font-medium">{card.title}</h2>
            <p className="mt-1 text-sm text-neutral-500">{card.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
