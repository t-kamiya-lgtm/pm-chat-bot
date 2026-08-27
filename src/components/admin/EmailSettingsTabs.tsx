"use client";

import { useState } from "react";
import { EmailTemplatesForm } from "@/components/admin/EmailTemplatesForm";
import { EmailAddressesTable, type ScenarioEmailRow } from "@/components/admin/EmailAddressesTable";

type TemplatesFormProps = React.ComponentProps<typeof EmailTemplatesForm>;

const TABS = [
  { key: "templates", label: "自動メール設定" },
  { key: "addresses", label: "メールアドレス管理" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 自動メール設定・メールアドレス管理を1画面にまとめ、タブで切り替える。 */
export function EmailSettingsTabs({
  templatesProps,
  scenarios,
}: {
  templatesProps: TemplatesFormProps;
  scenarios: ScenarioEmailRow[];
}) {
  const [tab, setTab] = useState<TabKey>("templates");

  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-neutral-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "templates" ? (
        <EmailTemplatesForm {...templatesProps} />
      ) : (
        <EmailAddressesTable scenarios={scenarios} />
      )}
    </div>
  );
}
