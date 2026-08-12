"use client";

import { useState } from "react";
import type { UserRole } from "@/lib/types";

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理者",
  staff: "スタッフ",
  unassigned: "未割り当て",
};

export interface UserRow {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

function buildInviteText(email: string, role: UserRole): string {
  const loginUrl = `${window.location.origin}/admin/login`;
  return `チャットボット決済システム
ログインURL：${loginUrl}
権限種別：${ROLE_LABELS[role] ?? role}`;
}

export function UsersTable({ users }: { users: UserRow[] }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function handleCopy(user: UserRow) {
    const text = buildInviteText(user.email, user.role as UserRole);
    await navigator.clipboard.writeText(text);
    setCopiedId(user.id);
    setTimeout(() => setCopiedId((current) => (current === user.id ? null : current)), 2000);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-neutral-50 text-left text-neutral-500">
          <tr>
            <th className="px-4 py-2">メールアドレス</th>
            <th className="px-4 py-2">権限</th>
            <th className="px-4 py-2">登録日</th>
            <th className="px-4 py-2">招待状</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-t border-neutral-100">
              <td className="px-4 py-2">{u.email}</td>
              <td className="px-4 py-2">{ROLE_LABELS[u.role as UserRole] ?? u.role}</td>
              <td className="px-4 py-2">{new Date(u.created_at).toLocaleDateString("ja-JP")}</td>
              <td className="px-4 py-2">
                <button
                  type="button"
                  onClick={() => handleCopy(u)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {copiedId === u.id ? "コピーしました" : "招待状をコピー"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
