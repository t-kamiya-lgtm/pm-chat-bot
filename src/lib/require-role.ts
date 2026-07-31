import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import type { AppUser } from "@/lib/types";

export type RoleCheckResult =
  | { ok: true; user: AppUser }
  | { ok: false; response: NextResponse };

/** admin/staff(商品・シナリオ登録権限)を要求する */
export async function requireCatalogRole(): Promise<RoleCheckResult> {
  const user = await getCurrentAppUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "admin" && user.role !== "staff") {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, user };
}

/** admin(ユーザー管理権限)を要求する */
export async function requireAdminRole(): Promise<RoleCheckResult> {
  const user = await getCurrentAppUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, user };
}
