import type { Address } from "@/lib/types";

/** メールアドレスの先頭1文字以外を隠す(t***@example.com)。 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 1) || "*";
  return `${visible}***@${domain}`;
}

/** 電話番号の下4桁以外を隠す(***-****-1234)。 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.length <= 4) return "****";
  const last4 = digits.slice(-4);
  return `***-****-${last4}`;
}

/** 都道府県のみを残し、市区町村以下を隠す。 */
export function maskAddress(address: Address | null): Address | null {
  if (!address) return null;
  return { postalCode: "", prefecture: address.prefecture, city: "", line1: "", line2: undefined };
}
