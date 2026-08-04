"use client";

import { useState } from "react";
import type { SurveyQuestion } from "@/lib/types";
import { MessageBubble } from "@/components/chat/MessageBubble";

export function SurveyForm({
  questions,
  onSubmit,
  onSkip,
}: {
  questions: SurveyQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<string[]>(() => questions.map(() => ""));
  const [touched, setTouched] = useState(false);

  const step = questions[stepIndex];
  const isLastStep = stepIndex === questions.length - 1;
  const hasError = step.required && !values[stepIndex].trim();

  function handleNext() {
    if (hasError) {
      setTouched(true);
      return;
    }
    if (isLastStep) {
      const answers: Record<string, string> = {};
      questions.forEach((q, i) => {
        if (values[i].trim()) answers[q.label] = values[i].trim();
      });
      onSubmit(answers);
    } else {
      setTouched(false);
      setStepIndex((i) => i + 1);
    }
  }

  return (
    <div className="max-w-[95%] space-y-3 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-xs text-neutral-400">
        <span>
          アンケート {stepIndex + 1} / {questions.length}
        </span>
        <button type="button" onClick={onSkip} className="hover:text-neutral-600">
          スキップする
        </button>
      </div>

      <MessageBubble
        message={{
          id: "survey-q",
          from: "bot",
          kind: "text",
          text: `${step.label}${step.required ? "" : "(任意)"}`,
        }}
      />

      <label className="block">
        <textarea
          autoFocus
          className="input"
          rows={2}
          value={values[stepIndex]}
          onChange={(e) => {
            const next = [...values];
            next[stepIndex] = e.target.value;
            setValues(next);
          }}
        />
        {touched && hasError && <p className="mt-1 text-xs text-red-600">この項目は回答が必須です</p>}
      </label>

      <button
        type="button"
        onClick={handleNext}
        className="w-full rounded-md bg-neutral-900 py-2 text-sm text-white hover:bg-neutral-700"
      >
        {isLastStep ? "回答する" : "次へ"}
      </button>
    </div>
  );
}
