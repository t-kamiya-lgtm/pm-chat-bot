"use client";

import { useEffect, useState } from "react";
import { InquiryForm } from "@/components/chat/InquiryForm";

interface Faq {
  id: string;
  question: string;
  answer: string;
}

export function FaqPanel({
  productId,
  productName,
  onClose,
}: {
  productId: string;
  productName?: string;
  onClose: () => void;
}) {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [selected, setSelected] = useState<Faq | null>(null);
  const [showInquiry, setShowInquiry] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);

  useEffect(() => {
    fetch(`/api/widget/faqs?productId=${productId}`)
      .then((res) => res.json())
      .then((body) => setFaqs(body.faqs ?? []));
  }, [productId]);

  return (
    <div className="max-w-[90%] space-y-3 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">よくあるご質問</p>
        <button type="button" onClick={onClose} className="text-xs text-neutral-400 hover:text-neutral-600">
          閉じる
        </button>
      </div>

      {inquirySent ? (
        <p className="text-sm text-neutral-600">
          お問い合わせを受け付けました。担当者よりご連絡いたします。
        </p>
      ) : showInquiry ? (
        <InquiryForm productName={productName} onSent={() => setInquirySent(true)} />
      ) : selected ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">{selected.question}</p>
          <p className="text-neutral-600">{selected.answer}</p>
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs text-blue-600 hover:underline"
          >
            質問一覧に戻る
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {faqs.map((faq) => (
            <button
              key={faq.id}
              type="button"
              onClick={() => setSelected(faq)}
              className="rounded-md border border-neutral-200 px-3 py-2 text-left text-sm hover:bg-neutral-50"
            >
              {faq.question}
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
