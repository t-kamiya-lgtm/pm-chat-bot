import { NextResponse } from "next/server";
import { z } from "zod";
import { asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { scenarios } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";

const createSchema = z.object({ name: z.string().min(1) });

export async function GET() {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  try {
    const db = await getDb();
    const rows = await db.select().from(scenarios).orderBy(asc(scenarios.displayOrder));
    return NextResponse.json({ scenarios: rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const db = await getDb();

    const [lastScenario] = await db
      .select({ displayOrder: scenarios.displayOrder })
      .from(scenarios)
      .orderBy(desc(scenarios.displayOrder))
      .limit(1);
    const displayOrder = (lastScenario?.displayOrder ?? -1) + 1;

    const [row] = await db
      .insert(scenarios)
      .values({ name: parsed.data.name, createdBy: roleCheck.user.id, displayOrder })
      .returning();

    return NextResponse.json({ scenario: row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
