create table if not exists session_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  weekday smallint check (weekday between 0 and 6),
  female_mode text not null default 'discount' check (female_mode in ('discount', 'fixed')),
  female_value bigint not null default 0 check (female_value >= 0),
  player_ids uuid[] not null default '{}',
  items jsonb not null default '[]'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table sessions add column if not exists template_id uuid references session_templates(id) on delete set null;

alter table session_templates enable row level security;
revoke all on session_templates from anon, authenticated;
grant select, insert, update, delete on session_templates to service_role;

alter table transactions drop constraint if exists transactions_kind_check;
alter table transactions add constraint transactions_kind_check check (kind in ('payment', 'refund', 'opening', 'transfer'));
alter table transactions drop constraint if exists transactions_transfer_check;
alter table transactions add constraint transactions_transfer_check check (kind <> 'transfer' or counterparty_player_id is not null);
