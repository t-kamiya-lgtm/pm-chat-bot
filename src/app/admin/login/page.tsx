"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, getAuth, signInWithPopup } from "firebase/auth";
import { firebaseApp } from "@/lib/firebase/client";

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hd: process.env.NEXT_PUBLIC_ADMIN_ALLOWED_GOOGLE_DOMAIN ?? "" });
      const credential = await signInWithPopup(getAuth(firebaseApp), provider);
      const idToken = await credential.user.getIdToken();

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        setError("ログインに失敗しました。招待されたメールアドレスかご確認ください。");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("ログインに失敗しました。もう一度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-sky-50">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-center text-xl font-semibold">
          チャットボット決済システム
          <br />
          管理画面ログイン
        </h1>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          Googleでログイン
        </button>
        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
        <p className="mt-4 text-center text-xs text-neutral-500">
          自社ドメインのGoogleアカウントでのみログインできます。
        </p>
      </div>
    </main>
  );
}
