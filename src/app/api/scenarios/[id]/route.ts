import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ilike, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { scenarioNodes, scenarios } from "@/db/schema";
import { requireCatalogRole } from "@/lib/require-role";
import { MENU_LAYOUTS } from "@/lib/menu-layouts";

const MENU_LAYOUT_KEYS = MENU_LAYOUTS.map((layout) => layout.key) as [string, ...string[]];

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["draft", "published"]).optional(),
  displayOrder: z.number().int().optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "半角英小文字・数字・ハイフンのみ使用できます")
    .nullable()
    .optional(),
  // シナリオコード(旧: 識別コード)。英字2文字(ブランドコード)+数字4桁(シナリオNo)。
  // 受注番号のプレフィックスとしても使われる。
  orderCode: z
    .string()
    .regex(/^[A-Za-z]{2}[0-9]{4}$/, "英字2文字+数字4桁で入力してください(例: PM0001)")
    .transform((v) => v.toUpperCase())
    .nullable()
    .optional(),
  chatBackgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "#RRGGBB形式で指定してください")
    .nullable()
    .optional(),
  menuBackgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "#RRGGBB形式で指定してください")
    .nullable()
    .optional(),
  messageBackgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "#RRGGBB形式で指定してください")
    .nullable()
    .optional(),
  userMessageBackgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "#RRGGBB形式で指定してください")
    .nullable()
    .optional(),
  headerMode: z.enum(["image", "title"]).nullable().optional(),
  headerImageUrl: z.string().nullable().optional(),
  headerTitle: z.string().nullable().optional(),
  headerBackgroundColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "#RRGGBB形式で指定してください")
    .nullable()
    .optional(),
  headerTextColor: z.enum(["white", "black"]).nullable().optional(),
  messageTextColor: z.enum(["white", "black"]).nullable().optional(),
  userMessageTextColor: z.enum(["white", "black"]).nullable().optional(),
  menuTextColor: z.enum(["white", "black"]).nullable().optional(),
  adTag: z.string().nullable().optional(),
  conversionTag: z.string().nullable().optional(),
  emailFromAddress: z.string().nullable().optional(),
  inquiryReceiveEmail: z.string().nullable().optional(),
  inquiryAutoReplyFrom: z.string().nullable().optional(),
  orderConfirmationFrom: z.string().nullable().optional(),
  abandonedReminderFrom: z.string().nullable().optional(),
  cancellationFrom: z.string().nullable().optional(),
  shipmentCompleteFrom: z.string().nullable().optional(),
  popupIconUrl: z.string().nullable().optional(),
  popupPosition: z.enum(["bottom-right", "bottom-left"]).nullable().optional(),
  popupButtonText: z.string().nullable().optional(),
  couponCodeFieldEnabled: z.boolean().optional(),
  menuLayoutKey: z.enum(MENU_LAYOUT_KEYS).optional(),
  menuImageUrl: z.string().nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    const [[scenario], nodes] = await Promise.all([
      db.select().from(scenarios).where(eq(scenarios.id, id)).limit(1),
      db.select().from(scenarioNodes).where(eq(scenarioNodes.scenarioId, id)),
    ]);

    if (!scenario) return NextResponse.json({ error: "not found" }, { status: 404 });

    return NextResponse.json({ scenario, nodes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
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
  const input = parsed.data;

  try {
    const db = await getDb();

    if (input.orderCode) {
      const [duplicate] = await db
        .select({ id: scenarios.id })
        .from(scenarios)
        .where(and(ilike(scenarios.orderCode, input.orderCode), ne(scenarios.id, id)))
        .limit(1);
      if (duplicate) {
        return NextResponse.json(
          { error: "このシナリオコードは既に別のシナリオで使用されています" },
          { status: 400 },
        );
      }
    }

    const [data] = await db
      .update(scenarios)
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.displayOrder !== undefined && { displayOrder: input.displayOrder }),
        ...(input.slug !== undefined && { slug: input.slug }),
        ...(input.orderCode !== undefined && { orderCode: input.orderCode }),
        ...(input.chatBackgroundColor !== undefined && { chatBackgroundColor: input.chatBackgroundColor }),
        ...(input.menuBackgroundColor !== undefined && { menuBackgroundColor: input.menuBackgroundColor }),
        ...(input.messageBackgroundColor !== undefined && {
          messageBackgroundColor: input.messageBackgroundColor,
        }),
        ...(input.userMessageBackgroundColor !== undefined && {
          userMessageBackgroundColor: input.userMessageBackgroundColor,
        }),
        ...(input.headerMode !== undefined && { headerMode: input.headerMode }),
        ...(input.headerImageUrl !== undefined && { headerImageUrl: input.headerImageUrl }),
        ...(input.headerTitle !== undefined && { headerTitle: input.headerTitle }),
        ...(input.headerBackgroundColor !== undefined && {
          headerBackgroundColor: input.headerBackgroundColor,
        }),
        ...(input.headerTextColor !== undefined && { headerTextColor: input.headerTextColor }),
        ...(input.messageTextColor !== undefined && { messageTextColor: input.messageTextColor }),
        ...(input.userMessageTextColor !== undefined && {
          userMessageTextColor: input.userMessageTextColor,
        }),
        ...(input.menuTextColor !== undefined && { menuTextColor: input.menuTextColor }),
        ...(input.adTag !== undefined && { adTag: input.adTag }),
        ...(input.conversionTag !== undefined && { conversionTag: input.conversionTag }),
        ...(input.emailFromAddress !== undefined && { emailFromAddress: input.emailFromAddress }),
        ...(input.inquiryReceiveEmail !== undefined && { inquiryReceiveEmail: input.inquiryReceiveEmail }),
        ...(input.inquiryAutoReplyFrom !== undefined && { inquiryAutoReplyFrom: input.inquiryAutoReplyFrom }),
        ...(input.orderConfirmationFrom !== undefined && {
          orderConfirmationFrom: input.orderConfirmationFrom,
        }),
        ...(input.abandonedReminderFrom !== undefined && {
          abandonedReminderFrom: input.abandonedReminderFrom,
        }),
        ...(input.cancellationFrom !== undefined && { cancellationFrom: input.cancellationFrom }),
        ...(input.shipmentCompleteFrom !== undefined && {
          shipmentCompleteFrom: input.shipmentCompleteFrom,
        }),
        ...(input.popupIconUrl !== undefined && { popupIconUrl: input.popupIconUrl }),
        ...(input.popupPosition !== undefined && { popupPosition: input.popupPosition }),
        ...(input.popupButtonText !== undefined && { popupButtonText: input.popupButtonText }),
        ...(input.couponCodeFieldEnabled !== undefined && {
          couponCodeFieldEnabled: input.couponCodeFieldEnabled,
        }),
        ...(input.menuLayoutKey !== undefined && { menuLayoutKey: input.menuLayoutKey }),
        ...(input.menuImageUrl !== undefined && { menuImageUrl: input.menuImageUrl }),
      })
      .where(eq(scenarios.id, id))
      .returning();

    return NextResponse.json({ scenario: data });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "このURLは既に他のシナリオで使用されています" }, { status: 409 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  try {
    const db = await getDb();
    await db.delete(scenarios).where(eq(scenarios.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
