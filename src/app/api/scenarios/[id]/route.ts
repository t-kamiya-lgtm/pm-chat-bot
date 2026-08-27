import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  couponCodeFieldEnabled: z.boolean().optional(),
  menuLayoutKey: z.enum(MENU_LAYOUT_KEYS).optional(),
  menuImageUrl: z.string().nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const [{ data: scenario, error: scenarioError }, { data: nodes, error: nodesError }] =
    await Promise.all([
      supabase.from("scenarios").select("*").eq("id", id).maybeSingle(),
      supabase.from("scenario_nodes").select("*").eq("scenario_id", id),
    ]);

  if (scenarioError) return NextResponse.json({ error: scenarioError.message }, { status: 500 });
  if (!scenario) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (nodesError) return NextResponse.json({ error: nodesError.message }, { status: 500 });

  return NextResponse.json({ scenario, nodes });
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

  const supabase = createSupabaseAdminClient();

  if (input.orderCode) {
    const { data: duplicate } = await supabase
      .from("scenarios")
      .select("id")
      .ilike("order_code", input.orderCode)
      .neq("id", id)
      .maybeSingle();
    if (duplicate) {
      return NextResponse.json(
        { error: "このシナリオコードは既に別のシナリオで使用されています" },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase
    .from("scenarios")
    .update({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.displayOrder !== undefined && { display_order: input.displayOrder }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.orderCode !== undefined && { order_code: input.orderCode }),
      ...(input.chatBackgroundColor !== undefined && { chat_background_color: input.chatBackgroundColor }),
      ...(input.menuBackgroundColor !== undefined && { menu_background_color: input.menuBackgroundColor }),
      ...(input.messageBackgroundColor !== undefined && {
        message_background_color: input.messageBackgroundColor,
      }),
      ...(input.userMessageBackgroundColor !== undefined && {
        user_message_background_color: input.userMessageBackgroundColor,
      }),
      ...(input.headerMode !== undefined && { header_mode: input.headerMode }),
      ...(input.headerImageUrl !== undefined && { header_image_url: input.headerImageUrl }),
      ...(input.headerTitle !== undefined && { header_title: input.headerTitle }),
      ...(input.headerBackgroundColor !== undefined && {
        header_background_color: input.headerBackgroundColor,
      }),
      ...(input.headerTextColor !== undefined && { header_text_color: input.headerTextColor }),
      ...(input.messageTextColor !== undefined && { message_text_color: input.messageTextColor }),
      ...(input.userMessageTextColor !== undefined && {
        user_message_text_color: input.userMessageTextColor,
      }),
      ...(input.menuTextColor !== undefined && { menu_text_color: input.menuTextColor }),
      ...(input.adTag !== undefined && { ad_tag: input.adTag }),
      ...(input.conversionTag !== undefined && { conversion_tag: input.conversionTag }),
      ...(input.emailFromAddress !== undefined && { email_from_address: input.emailFromAddress }),
      ...(input.inquiryReceiveEmail !== undefined && { inquiry_receive_email: input.inquiryReceiveEmail }),
      ...(input.inquiryAutoReplyFrom !== undefined && { inquiry_auto_reply_from: input.inquiryAutoReplyFrom }),
      ...(input.orderConfirmationFrom !== undefined && {
        order_confirmation_from: input.orderConfirmationFrom,
      }),
      ...(input.abandonedReminderFrom !== undefined && {
        abandoned_reminder_from: input.abandonedReminderFrom,
      }),
      ...(input.cancellationFrom !== undefined && { cancellation_from: input.cancellationFrom }),
      ...(input.shipmentCompleteFrom !== undefined && {
        shipment_complete_from: input.shipmentCompleteFrom,
      }),
      ...(input.popupIconUrl !== undefined && { popup_icon_url: input.popupIconUrl }),
      ...(input.popupPosition !== undefined && { popup_position: input.popupPosition }),
      ...(input.couponCodeFieldEnabled !== undefined && {
        coupon_code_field_enabled: input.couponCodeFieldEnabled,
      }),
      ...(input.menuLayoutKey !== undefined && { menu_layout_key: input.menuLayoutKey }),
      ...(input.menuImageUrl !== undefined && { menu_image_url: input.menuImageUrl }),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "このURLは既に他のシナリオで使用されています" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ scenario: data });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const roleCheck = await requireCatalogRole();
  if (!roleCheck.ok) return roleCheck.response;
  const { id } = await params;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("scenarios").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
