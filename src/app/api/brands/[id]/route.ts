import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { brands } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z
    .string()
    .regex(/^[A-Za-z]{2}$/, "英字2文字で入力してください(例: PM)")
    .transform((v) => v.toUpperCase())
    .nullable()
    .optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const db = await getDb();
    const [row] = await db
      .update(brands)
      .set({
        ...(parsed.data.name !== undefined && { name: parsed.data.name }),
        ...(parsed.data.code !== undefined && { code: parsed.data.code }),
      })
      .where(eq(brands.id, id))
      .returning();
    return NextResponse.json({ brand: row });
  } catch (err) {
    const message = isUniqueViolation(err) ? "このブランドコードは既に別のブランドで使用されています" : String(err);
    return NextResponse.json({ error: message }, { status: isUniqueViolation(err) ? 400 : 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    await db.delete(brands).where(eq(brands.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
