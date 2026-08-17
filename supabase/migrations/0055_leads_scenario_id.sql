-- 離脱者フォローメールに「元のチャットに戻るリンク」を載せるため、
-- どのシナリオ(=どのチャットURL)経由の離脱だったかをleadsにも記録する。
alter table leads add column if not exists scenario_id uuid references scenarios (id) on delete set null;
