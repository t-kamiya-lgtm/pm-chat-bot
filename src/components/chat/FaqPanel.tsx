"use client";

import { useEffect, useState } from "react";
import { InquiryForm } from "@/components/chat/InquiryForm";

interface Faq {
  id: string;
  question: string;
  answer: string;
}

interface FaqCategory {
  id: string;
  title: string;
  faqs: Faq[];
}

export function FaqPanel({
  productId,
  productName,
  onClose,
  onProceed,
}: {
  productId: string;
  productName?: string;
  onClose: () => void;
  /** 設定されている場合、Q&A表示中も常に「購入へ進む」ボタンを表示する。 */
  onProceed?: () => void;
}) {
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<FaqCategory | null>(null);
  const [selectedFaq, setSelectedFaq] = useState<Faq | null>(null);
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);

  useEffect(() => {
    fetch(`/api/widget/faqs?productId=${productId}`)
      .then((res) => res.json())
      .then((body) => setCategories(body.categories ?? []));
  }, [productId]);

  return (
    <div className="max-w-[90%] space-y-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">よくあるご質問</p>
        <button type="button" onClick={onClose} className="text-xs text-neutral-400 hover:text-neutral-600">
          閉じる
        </button>
      </div>

      {onProceed && (
        <button
          type="button"
          onClick={onProceed}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700"
        >
          購入へ進む
        </button>
      )}

      {inquirySent ? (
        <p className="text-sm text-neutral-600">
          お問い合わせを受け付けました。担当者よりご連絡いたします。
        </p>
      ) : showInquiry ? (
        <InquiryForm productName={productName} onSent={() => setInquirySent(true)} />
      ) : selectedFaq ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">{selectedFaq.question}</p>
          <p className="text-neutral-600">{selectedFaq.answer}</p>
          <button
            type="button"
            onClick={() => setSelectedFaq(null)}
            className="text-xs text-blue-600 hover:underline"
          >
            質問一覧に戻る
          </button>
        </div>
      ) : selectedCategory ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-neutral-500">{selectedCategory.title}</p>
          {selectedCategory.faqs.map((faq) => (
            <button
              key={faq.id}
              type="button"
              onClick={() => setSelectedFaq(faq)}
              className="rounded-md border border-neutral-200 px-3 py-2 text-left text-sm hover:bg-neutral-50"
            >
              {faq.question}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className="text-xs text-blue-600 hover:underline"
          >
            カテゴリ一覧に戻る
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setSelectedCategory(category)}
              className="rounded-md border border-neutral-200 px-3 py-2 text-left text-sm hover:bg-neutral-50"
            >
              {category.title}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowInquiry(true)}
            className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50"
          >
            その他のご質問はこちら
          </button>
        </div>
      )}
    </div>
  );
}
