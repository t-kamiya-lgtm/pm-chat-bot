"use client";

import { useState } from "react";
import type { SurveyQuestion } from "@/lib/types";
import { MessageBubble } from "@/components/chat/MessageBubble";

const OTHER_PREFIX = "その他: ";

function SurveyStepInput({
  question,
  value,
  onChange,
}: {
  question: SurveyQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const type = question.type ?? "text_short";
  const options = question.options ?? [];

  const [checkedOptions, setCheckedOptions] = useState<string[]>(() =>
    value.split("、").filter((v) => options.includes(v)),
  );
  const [otherText, setOtherText] = useState(() => {
    const otherEntry = value.split("、").find((v) => v.startsWith(OTHER_PREFIX));
    if (otherEntry) return otherEntry.slice(OTHER_PREFIX.length);
    if (type === "radio" && value && !options.includes(value)) return value;
    return "";
  });
  const [radioValue, setRadioValue] = useState(() => {
    if (value.startsWith(OTHER_PREFIX)) return "__other__";
    if (value && !options.includes(value)) return "__other__";
    return value;
  });

  if (type === "checkbox") {
    function commit(nextChecked: string[], nextOther: string) {
      const parts = [...nextChecked];
      if (question.allowOther && nextOther.trim()) parts.push(`${OTHER_PREFIX}${nextOther.trim()}`);
      onChange(parts.join("、"));
    }
    return (
      <div className="space-y-2">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checkedOptions.includes(option)}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...checkedOptions, option]
                  : checkedOptions.filter((o) => o !== option);
                setCheckedOptions(next);
                commit(next, otherText);
              }}
            />
            {option}
          </label>
        ))}
        {question.allowOther && (
          <label className="flex items-center gap-2 text-sm">
            <span className="shrink-0">その他:</span>
            <input
              className="input"
              value={otherText}
              onChange={(e) => {
                setOtherText(e.target.value);
                commit(checkedOptions, e.target.value);
              }}
            />
          </label>
        )}
      </div>
    );
  }

  if (type === "radio") {
    function commit(nextValue: string, nextOther: string) {
      if (nextValue === "__other__") onChange(nextOther.trim() ? `${OTHER_PREFIX}${nextOther.trim()}` : "");
      else onChange(nextValue);
    }
    return (
      <div className="space-y-2">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="survey-radio"
              checked={radioValue === option}
              onChange={() => {
                setRadioValue(option);
                commit(option, otherText);
              }}
            />
            {option}
          </label>
        ))}
        {question.allowOther && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="survey-radio"
              checked={radioValue === "__other__"}
              onChange={() => {
                setRadioValue("__other__");
                commit("__other__", otherText);
              }}
            />
            <span className="shrink-0">その他:</span>
            <input
              className="input"
              value={otherText}
              onChange={(e) => {
                setOtherText(e.target.value);
                setRadioValue("__other__");
                commit("__other__", e.target.value);
              }}
            />
          </label>
        )}
      </div>
    );
  }

  if (type === "date") {
    return <input autoFocus type="date" className="input" value={value} onChange={(e) => onChange(e.target.value)} />;
  }

  if (type === "text_long") {
    return (
      <textarea
        autoFocus
        className="input"
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return <textarea autoFocus className="input" rows={2} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function SurveyForm({
  questions,
  onSubmit,
  onSkip,
}: {
  questions: SurveyQuestion[];
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: (partialAnswers: Record<string, string>) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [values, setValues] = useState<string[]>(() => questions.map(() => ""));
  const [touched, setTouched] = useState(false);

  const step = questions[stepIndex];
  const isLastStep = stepIndex === questions.length - 1;
  const hasError = step.required && !values[stepIndex].trim();

  function collectAnswers(): Record<string, string> {
    const answers: Record<string, string> = {};
    questions.forEach((q, i) => {
      if (values[i].trim()) answers[q.label] = values[i].trim();
    });
    return answers;
  }

  function handleNext() {
    if (hasError) {
      setTouched(true);
      return;
    }
    if (isLastStep) {
      onSubmit(collectAnswers());
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
        <button
          type="button"
          onClick={() => onSkip(collectAnswers())}
          className="hover:text-neutral-600"
        >
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

      <div>
        <SurveyStepInput
          key={stepIndex}
          question={step}
          value={values[stepIndex]}
          onChange={(next) => {
            const nextValues = [...values];
            nextValues[stepIndex] = next;
            setValues(nextValues);
          }}
        />
        {touched && hasError && <p className="mt-1 text-xs text-red-600">この項目は回答が必須です</p>}
      </div>

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
