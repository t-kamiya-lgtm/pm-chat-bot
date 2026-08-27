import Link from "next/link";
import { getCurrentAppUser } from "@/lib/auth";

interface DashboardCard {
  href: string;
  title: string;
  description: string;
  adminOnly?: boolean;
}

const SECTIONS: { title: string; cards: DashboardCard[] }[] = [
  {
    title: "実績",
    cards: [
      {
        href: "/admin/dashboard",
        title: "実績ダッシュボード",
        description: "アクセス数・購入数・売上を広告・シナリオ別に確認",
      },
      { href: "/admin/leads", title: "アクセスログ", description: "チャット開始・離脱状況の確認と連絡管理" },
    ],
  },
  {
    title: "商品管理",
    cards: [
      { href: "/admin/brands", title: "ブランド管理", description: "ブランドの登録・名称変更" },
      { href: "/admin/product-groups", title: "アイテム管理", description: "仕様情報・QAカテゴリの管理単位" },
      { href: "/admin/products", title: "商品(品番)管理", description: "単品/定期を分けて品番登録・送料設定" },
      { href: "/admin/faqs", title: "商品QAレビュー", description: "生成されたQ&A候補の承認・却下" },
    ],
  },
  {
    title: "シナリオ管理",
    cards: [
      { href: "/admin/scenarios", title: "シナリオ管理", description: "選択肢分岐型トークフローの作成" },
      { href: "/admin/coupons", title: "クーポン", description: "自動適用クーポン・手入力コードの発行状況" },
    ],
  },
  {
    title: "注文管理",
    cards: [
      { href: "/admin/orders", title: "注文一覧", description: "決済・後払い・代引きの注文状況" },
      { href: "/admin/customers", title: "顧客管理", description: "購入者・お問い合わせ元の顧客情報" },
    ],
  },
  {
    title: "設定",
    cards: [
      { href: "/admin/checkout-fields", title: "基本設定", description: "あいさつ文・注文確認メッセージ等の共通設定" },
      { href: "/admin/email-settings", title: "メール設定", description: "自動メールの本文・送信元アドレスの管理" },
      { href: "/admin/business-days", title: "営業日設定", description: "配送日・営業カレンダーの管理" },
      {
        href: "/admin/users",
        title: "ユーザー権限",
        description: "管理画面ユーザーの招待・権限管理",
        adminOnly: true,
      },
      {
        href: "/admin/smaregi",
        title: "スマレジ連携",
        description: "スマレジAPI連携設定・同期状況",
        adminOnly: true,
      },
    ],
  },
];

export default async function AdminDashboardPage() {
  const user = await getCurrentAppUser();
  const isAdmin = user?.role === "admin";
  const sections = SECTIONS.map((section) => ({
    ...section,
    cards: section.cards.filter((card) => !card.adminOnly || isAdmin),
  }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">ダッシュボード</h1>
      <div className="space-y-8">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="mb-3 text-sm font-semibold text-neutral-500">{section.title}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.cards.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <h3 className="font-medium">{card.title}</h3>
                  <p className="mt-1 text-sm text-neutral-500">{card.description}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
