import type { ProductSpec } from "@/lib/types";

export interface QaCandidate {
  question: string;
  answer: string;
}

/**
 * docs/requirements.md 6.3 商品QA生成(LLM連携)
 * 商品情報・仕様情報の登録/更新をトリガーに呼び出し、生成結果は product_faqs に
 * draft として保存する。管理画面でのレビューを経て published になったものだけ
 * チャットに表示する。
 */
export interface ProductQaGenerator {
  generateCandidates(
    productName: string,
    spec: Pick<ProductSpec, "ingredients" | "allergens" | "volume" | "usage" | "extra">,
  ): Promise<QaCandidate[]>;
}

const ANTHROPIC_MODEL = "claude-sonnet-5";

/**
 * Anthropic Messages API を使ってQ&A候補を生成する実装。
 * ANTHROPIC_API_KEY が未設定の場合は呼び出し元でテンプレート実装にフォールバックする。
 */
export class AnthropicProductQaGenerator implements ProductQaGenerator {
  async generateCandidates(
    productName: string,
    spec: Pick<ProductSpec, "ingredients" | "allergens" | "volume" | "usage" | "extra">,
  ): Promise<QaCandidate[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }

    const prompt = `あなたはECサイトの商品QA作成担当です。以下の商品情報から、購入検討中の顧客が
よく尋ねそうな質問と回答のペアを5件、JSON配列で出力してください。
出力は [{"question": "...", "answer": "..."}] の形式のみとし、それ以外の文章は含めないでください。

商品名: ${productName}
原材料: ${spec.ingredients ?? "情報なし"}
アレルギー: ${spec.allergens ?? "情報なし"}
容量: ${spec.volume ?? "情報なし"}
使い方: ${spec.usage ?? "情報なし"}
その他仕様: ${JSON.stringify(spec.extra ?? {})}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      content: { type: string; text?: string }[];
    };
    const text = data.content.find((block) => block.type === "text")?.text ?? "[]";
    const parsed = JSON.parse(extractJsonArray(text)) as QaCandidate[];
    return parsed;
  }
}

function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return "[]";
  return text.slice(start, end + 1);
}

/**
 * ANTHROPIC_API_KEY未設定時のフォールバック。
 * 登録済み仕様フィールドからテンプレートでQ&Aを組み立てる(開発環境で動作確認するため)。
 */
export class TemplateProductQaGenerator implements ProductQaGenerator {
  async generateCandidates(
    productName: string,
    spec: Pick<ProductSpec, "ingredients" | "allergens" | "volume" | "usage" | "extra">,
  ): Promise<QaCandidate[]> {
    const candidates: QaCandidate[] = [];

    if (spec.ingredients) {
      candidates.push({
        question: `${productName}の原材料を教えてください`,
        answer: spec.ingredients,
      });
    }
    if (spec.allergens) {
      candidates.push({
        question: `${productName}にアレルギー物質は含まれていますか？`,
        answer: spec.allergens,
      });
    }
    if (spec.volume) {
      candidates.push({
        question: `${productName}の容量はどれくらいですか？`,
        answer: spec.volume,
      });
    }
    if (spec.usage) {
      candidates.push({
        question: `${productName}の使い方を教えてください`,
        answer: spec.usage,
      });
    }

    return candidates;
  }
}

export function getProductQaGenerator(): ProductQaGenerator {
  return process.env.ANTHROPIC_API_KEY
    ? new AnthropicProductQaGenerator()
    : new TemplateProductQaGenerator();
}
