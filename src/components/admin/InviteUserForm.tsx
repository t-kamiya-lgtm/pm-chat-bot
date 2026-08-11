"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast } from "@/components/admin/Toast";
import type { UserRole } from "@/lib/types";

export function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Extract<UserRole, "admin" | "staff">>("staff");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setToast(null);

    const res = await fetch("/api/users/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const body = await res.json().catch(() => null);

    setSubmitting(false);
    if (res.ok) {
      setToast({ message: body?.warning ?? "招待メールを送信しました", type: body?.emailSent === false ? "error" : "success" });
      setEmail("");
      router.refresh();
    } else {
      setToast({ message: body?.error ?? "招待に失敗しました", type: "error" });
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-3 text-sm"
    >
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <label className="block">
        <span className="mb-1 block text-xs text-neutral-500">メールアドレス</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@example.jp"
          className="input min-w-[16rem]"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs text-neutral-500">権限</span>
        <select
          className="input"
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "staff")}
        >
          <option value="staff">スタッフ</option>
          <option value="admin">管理者</option>
        </select>
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {submitting ? "招待中..." : "ユーザーを招待する"}
      </button>
    </form>
  );
}
