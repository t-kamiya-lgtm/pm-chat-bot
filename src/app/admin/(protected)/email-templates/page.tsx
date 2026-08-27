import { redirect } from "next/navigation";

/** 自動メール設定・メールアドレス管理は統合し、/admin/email-settings に一本化した。 */
export default function EmailTemplatesPage() {
  redirect("/admin/email-settings");
}
