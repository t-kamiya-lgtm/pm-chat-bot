-- スマレジEC・リピートAPIのOAuth2アクセストークン保管用(1行のみ)。
-- アクセストークンには有効期限・リフレッシュトークンが無い場合もあるため両方null許容とする。

create table if not exists smaregi_oauth_tokens (
  id smallint primary key default 1 check (id = 1),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table smaregi_oauth_tokens enable row level security;
