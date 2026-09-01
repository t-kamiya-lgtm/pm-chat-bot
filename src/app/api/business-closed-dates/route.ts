import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { businessClosedDates } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const dateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().optional(),
});

export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  try {
    const db = await getDb();
    const rows = await db.select().from(businessClosedDates).orderBy(asc(businessClosedDates.date));
    return NextResponse.json({ closedDates: rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = dateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const db = await getDb();
    const values = { date: parsed.data.date, reason: parsed.data.reason ?? null };
    await db
      .insert(businessClosedDates)
      .values(values)
      .onConflictDoUpdate({ target: businessClosedDates.date, set: values });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date) return NextResponse.json({ error: "date is required" }, { status: 400 });

  try {
    const db = await getDb();
    await db.delete(businessClosedDates).where(eq(businessClosedDates.date, date));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
