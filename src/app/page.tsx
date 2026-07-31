import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-neutral-50 p-8 text-center">
      <h1 className="text-2xl font-semibold">チャットボット決済システム</h1>
      <p className="max-w-md text-neutral-600">
        スマレジEC埋め込みのチャットボットで、商品提案から決済・定期注文までを完結させるシステムです。
      </p>
      <Link
        href="/admin"
        className="rounded-md bg-neutral-900 px-5 py-2.5 text-white hover:bg-neutral-700"
      >
        管理画面へ
      </Link>
    </main>
  );
}
