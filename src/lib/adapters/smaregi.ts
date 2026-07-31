import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Address, Order, Product } from "@/lib/types";

export interface SmaregiMember {
  id: string;
  email: string;
  name: string;
}

export interface MemberInput {
  email: string;
  name: string;
  phone: string | null;
  address: Address | null;
}

export interface SmaregiOrderInput {
  order: Order;
  product: Product;
}

export interface SmaregiProduct {
  id: string;
  name: string;
  price: number;
}

/**
 * docs/requirements.md 6.1 スマレジ連携アダプタ(スマレジEC・リピートAPI)
 * 連携先は「スマレジEC・リピートAPI」。契約・アプリ登録は確認済みだが、
 * API仕様の詳細確認が済むまではモック実装で進める。
 */
export interface SmaregiAdapter {
  findMemberByEmail(email: string): Promise<SmaregiMember | null>;
  createMember(input: MemberInput): Promise<SmaregiMember>;
  syncOrder(memberId: string, input: SmaregiOrderInput): Promise<void>;
  getProduct(smaregiProductId: string): Promise<SmaregiProduct | null>;
}

/**
 * MVP用のモック実装。実際のスマレジEC・リピートAPI呼び出しは行わず、
 * 送信内容を smaregi_sync_logs に記録するのみ。
 * 本番接続時は同インターフェースを満たす SmaregiApiAdapter に差し替える。
 */
export class MockSmaregiAdapter implements SmaregiAdapter {
  async findMemberByEmail(email: string): Promise<SmaregiMember | null> {
    // モックでは常に未登録として扱い、新規会員作成のフローに倒す
    void email;
    return null;
  }

  async createMember(input: MemberInput): Promise<SmaregiMember> {
    return {
      id: `mock-member-${Buffer.from(input.email).toString("hex").slice(0, 12)}`,
      email: input.email,
      name: input.name,
    };
  }

  async syncOrder(memberId: string, input: SmaregiOrderInput): Promise<void> {
    const supabase = createSupabaseAdminClient();
    await supabase.from("smaregi_sync_logs").insert({
      order_id: input.order.id,
      payload: {
        memberId,
        order: input.order,
        product: { id: input.product.id, name: input.product.name },
      },
      status: "ok",
    });
  }

  async getProduct(smaregiProductId: string): Promise<SmaregiProduct | null> {
    void smaregiProductId;
    return null;
  }
}

export function getSmaregiAdapter(): SmaregiAdapter {
  // TODO: スマレジEC・リピートAPIのクライアントID/シークレット発行後、
  // 環境変数で本実装(SmaregiApiAdapter)に切り替える
  return new MockSmaregiAdapter();
}
