/**
 * Postgresのエラーメッセージ(英語)を、管理画面にそのまま出さず、
 * 日本語の分かりやすい文言に変換する。特定のパターンに一致しない場合も、
 * 元のメッセージを併記した日本語文にする(デバッグ情報は残しつつ、必ず日本語で表示する)。
 */
export function toAdminErrorMessage(message: string): string {
  if (/duplicate key value/i.test(message)) {
    return `保存に失敗しました。同じ内容がすでに登録されています。(詳細: ${message})`;
  }
  if (/violates foreign key constraint/i.test(message)) {
    return `保存に失敗しました。関連するデータが見つかりません。(詳細: ${message})`;
  }
  return `保存に失敗しました。(詳細: ${message})`;
}
