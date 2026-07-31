"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@/lib/types";

export function UserRoleSelect({ userId, role }: { userId: string; role: UserRole }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleChange(newRole: UserRole) {
    setSaving(true);
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      className="input w-auto"
      value={role}
      disabled={saving}
      onChange={(e) => handleChange(e.target.value as UserRole)}
    >
      <option value="unassigned">未割り当て</option>
      <option value="staff">一般ユーザー</option>
      <option value="admin">管理者</option>
    </select>
  );
}
