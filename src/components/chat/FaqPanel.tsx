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
  onProceed,
}: {
  productId: string;
  productName?: string;
  /**
   * 設定されている場合、「購入へ進む」ボタンを表示する。パネル自体は他のメッセージと同様に
   * スレッドに残り続け、購入へ進んだ後も操作(カテゴリ・質問の開閉)ができる。
   */
  onProceed?: () => void;
}) {
  const [categories, setCategories] = useState<FaqCategory[]>([]);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);

  useEffect(() => {
    fetch(`/api/widget/faqs?productId=${productId}`)
      .then((res) => res.json())
      .then((body) => setCategories(body.categories ?? []));
  }, [productId]);

  return (
    <div className="max-w-[90%] space-y-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-medium">よくあるご質問</p>

      {inquirySent ? (
        <p className="text-sm text-neutral-600">
          お問い合わせを受け付けました。担当者よりご連絡いたします。
        </p>
      ) : showInquiry ? (
        <InquiryForm productName={productName} onSent={() => setInquirySent(true)} />
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((category) => {
            const categoryOpen = openCategoryId === category.id;
            return (
              <div key={category.id} className="rounded-md border border-neutral-200">
                <button
                  type="button"
                  onClick={() => setOpenCategoryId(categoryOpen ? null : category.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  <span>{category.title}</span>
                  <span className="text-neutral-400">{categoryOpen ? "▲" : "▼"}</span>
                </button>
                {categoryOpen && (
                  <div className="divide-y divide-neutral-100 border-t border-neutral-200">
                    {category.faqs.map((faq) => {
                      const faqOpen = openFaqId === faq.id;
                      return (
                        <div key={faq.id}>
                          <button
                            type="button"
                            onClick={() => setOpenFaqId(faqOpen ? null : faq.id)}
                            className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50"
                          >
                            <span>{faq.question}</span>
                            <span className="shrink-0 text-neutral-400">{faqOpen ? "▲" : "▼"}</span>
                          </button>
                          {faqOpen && (
                            <p className="px-3 pb-2 text-sm text-neutral-600">{faq.answer}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => setShowInquiry(true)}
            className="rounded-md border border-dashed border-neutral-300 px-3 py-2 text-left text-sm text-neutral-500 hover:bg-neutral-50"
          >
            その他のご質問はこちら
          </button>
        </div>
      )}

      {onProceed && (
        <button
          type="button"
          onClick={onProceed}
          className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700"
        >
          購入へ進む
        </button>
      )}
    </div>
  );
}
