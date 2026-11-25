create extension if not exists pgcrypto;

create sequence if not exists player_code_seq start 1;

create table players (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique default ('P' || lpad(nextval('player_code_seq')::text, 3, '0')),
  display_name text not null check (length(trim(display_name)) > 0),
  gender text not null check (gender in ('M', 'F')),
  is_active boolean not null default true,
  is_court_owner boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index players_single_court_owner on players ((true)) where is_court_owner;

create table admins (
  email text primary key check (email = lower(email)),
  player_id uuid references players(id),
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null,
  title text,
  status text not null default 'draft' check (status in ('draft', 'closed')),
  female_mode text not null default 'discount' check (female_mode in ('discount', 'fixed')),
  female_value bigint not null default 0 check (female_value >= 0),
  override_male bigint,
  override_female bigint,
  override_reason text,
  male_share bigint,
  female_share bigint,
  is_manual_override boolean not null default false,
  shared_total bigint not null default 0,
  total_due bigint not null default 0,
  rounding_diff bigint not null default 0,
  explanation text[] not null default '{}',
  court_owner_id uuid references players(id),
  internal_note text,
  created_by text,
  closed_by text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_status_date on sessions (status, session_date);

create table session_participants (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  pkey text not null,
  player_id uuid references players(id),
  host_player_id uuid references players(id),
  guest_label text,
  gender text not null check (gender in ('M', 'F')),
  share_amount bigint,
  unique (session_id, pkey),
  check (player_id is not null or host_player_id is not null),
  check (player_id is null or host_player_id is null)
);
create unique index session_participants_one_per_player
  on session_participants (session_id, player_id) where player_id is not null;

create table session_items (
  id bigint generated always as identity primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  position int not null default 0,
  kind text not null check (kind in ('shared', 'group', 'personal')),
  label text not null,
  amount bigint not null,
  paid_by_player_id uuid references players(id),
  member_keys text[] not null default '{}',
  target_player_id uuid references players(id),
  per_person bigint,
  check (kind <> 'personal' or target_player_id is not null),
  check (kind = 'personal' or amount >= 0)
);

create table transactions (
  id bigint generated always as identity primary key,
  client_request_id text not null unique,
  player_id uuid not null references players(id),
  kind text not null check (kind in ('payment', 'refund', 'opening')),
  label text,
  amount bigint not null,
  counterparty_player_id uuid references players(id),
  txn_date date not null,
  bank_ref text,
  group_ref text,
  public_note text,
  internal_note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by text,
  void_reason text,
  check (kind = 'opening' or amount > 0),
  check (counterparty_player_id is null or counterparty_player_id <> player_id)
);
create index transactions_player on transactions (player_id);
create index transactions_counterparty on transactions (counterparty_player_id);

create table audit_log (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id text not null,
  action text not null,
  before jsonb,
  after jsonb,
  reason text,
  actor text,
  at timestamptz not null default now()
);

create table settings (
  key text primary key,
  value text,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table players enable row level security;
alter table admins enable row level security;
alter table sessions enable row level security;
alter table session_participants enable row level security;
alter table session_items enable row level security;
alter table transactions enable row level security;
alter table audit_log enable row level security;
alter table settings enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function session_snapshot(p_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'session', (select to_jsonb(s) from sessions s where s.id = p_id),
    'participants', coalesce((select jsonb_agg(to_jsonb(sp) order by sp.id) from session_participants sp where sp.session_id = p_id), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(to_jsonb(si) order by si.position, si.id) from session_items si where si.session_id = p_id), '[]'::jsonb)
  );
$$;

create or replace function save_session(p jsonb, p_actor text, p_close boolean) returns uuid
language plpgsql as $$
declare
  v_id uuid;
  v_status text;
  v_owner uuid;
  r jsonb;
begin
  if p ? 'id' and nullif(p->>'id', '') is not null then
    v_id := (p->>'id')::uuid;
    select status into v_status from sessions where id = v_id for update;
    if not found then
      raise exception 'Không tìm thấy buổi';
    end if;
    if v_status = 'closed' then
      raise exception 'Buổi đã chốt, cần mở lại trước khi sửa';
    end if;
  else
    insert into sessions (session_date, created_by) values ((p->>'session_date')::date, p_actor) returning id into v_id;
  end if;

  update sessions set
    session_date = (p->>'session_date')::date,
    title = nullif(trim(p->>'title'), ''),
    female_mode = coalesce(p->>'female_mode', 'discount'),
    female_value = coalesce((p->>'female_value')::bigint, 0),
    override_male = (p->>'override_male')::bigint,
    override_female = (p->>'override_female')::bigint,
    override_reason = nullif(trim(p->>'override_reason'), ''),
    internal_note = nullif(p->>'internal_note', ''),
    updated_at = now()
  where id = v_id;

  delete from session_participants where session_id = v_id;
  delete from session_items where session_id = v_id;

  for r in select * from jsonb_array_elements(coalesce(p->'participants', '[]'::jsonb)) loop
    insert into session_participants (session_id, pkey, player_id, host_player_id, guest_label, gender, share_amount)
    values (
      v_id,
      r->>'pkey',
      nullif(r->>'player_id', '')::uuid,
      nullif(r->>'host_player_id', '')::uuid,
      nullif(r->>'guest_label', ''),
      r->>'gender',
      (r->>'share_amount')::bigint
    );
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    insert into session_items (session_id, position, kind, label, amount, paid_by_player_id, member_keys, target_player_id, per_person)
    values (
      v_id,
      coalesce((r->>'position')::int, 0),
      r->>'kind',
      r->>'label',
      (r->>'amount')::bigint,
      nullif(r->>'paid_by_player_id', '')::uuid,
      coalesce(array(select jsonb_array_elements_text(r->'member_keys')), '{}'),
      nullif(r->>'target_player_id', '')::uuid,
      (r->>'per_person')::bigint
    );
  end loop;

  if p_close then
    select id into v_owner from players where is_court_owner limit 1;
    update sessions set
      status = 'closed',
      male_share = (p->'result'->>'male_share')::bigint,
      female_share = (p->'result'->>'female_share')::bigint,
      is_manual_override = coalesce((p->'result'->>'is_manual_override')::boolean, false),
      shared_total = coalesce((p->'result'->>'shared_total')::bigint, 0),
      total_due = coalesce((p->'result'->>'total_due')::bigint, 0),
      rounding_diff = coalesce((p->'result'->>'rounding_diff')::bigint, 0),
      explanation = coalesce(array(select jsonb_array_elements_text(p->'result'->'explanation')), '{}'),
      court_owner_id = v_owner,
      closed_by = p_actor,
      closed_at = now()
    where id = v_id;
    insert into audit_log (entity, entity_id, action, after, actor)
    values ('session', v_id::text, 'close', session_snapshot(v_id), p_actor);
  end if;

  return v_id;
end;
$$;

create or replace function reopen_session(p_id uuid, p_reason text, p_actor text) returns void
language plpgsql as $$
declare
  v_status text;
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Cần nhập lý do mở lại';
  end if;
  select status into v_status from sessions where id = p_id for update;
  if v_status is distinct from 'closed' then
    raise exception 'Buổi chưa chốt';
  end if;
  insert into audit_log (entity, entity_id, action, before, reason, actor)
  values ('session', p_id::text, 'reopen', session_snapshot(p_id), p_reason, p_actor);
  update sessions set status = 'draft', closed_at = null, closed_by = null, updated_at = now() where id = p_id;
end;
$$;

create or replace function record_transactions(p_rows jsonb, p_actor text) returns setof transactions
language plpgsql as $$
declare
  v_ids text[];
begin
  select array_agg(r->>'client_request_id') into v_ids from jsonb_array_elements(p_rows) r;
  insert into transactions (client_request_id, player_id, kind, label, amount, counterparty_player_id, txn_date, bank_ref, group_ref, public_note, internal_note, created_by)
  select
    r->>'client_request_id',
    (r->>'player_id')::uuid,
    r->>'kind',
    nullif(r->>'label', ''),
    (r->>'amount')::bigint,
    nullif(r->>'counterparty_player_id', '')::uuid,
    (r->>'txn_date')::date,
    nullif(r->>'bank_ref', ''),
    nullif(r->>'group_ref', ''),
    nullif(r->>'public_note', ''),
    nullif(r->>'internal_note', ''),
    p_actor
  from jsonb_array_elements(p_rows) r
  on conflict (client_request_id) do nothing;
  return query select * from transactions where client_request_id = any(v_ids) order by id;
end;
$$;

create or replace function void_transaction(p_id bigint, p_reason text, p_actor text) returns void
language plpgsql as $$
begin
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Cần nhập lý do huỷ';
  end if;
  insert into audit_log (entity, entity_id, action, before, reason, actor)
  select 'transaction', p_id::text, 'void', to_jsonb(t), p_reason, p_actor from transactions t where t.id = p_id and t.voided_at is null;
  if not found then
    raise exception 'Giao dịch không tồn tại hoặc đã huỷ';
  end if;
  update transactions set voided_at = now(), voided_by = p_actor, void_reason = p_reason where id = p_id;
end;
$$;

create or replace function set_court_owner(p_player uuid, p_actor text) returns void
language plpgsql as $$
begin
  insert into audit_log (entity, entity_id, action, before, after, actor)
  values ('player', p_player::text, 'set_court_owner',
    (select to_jsonb(array_agg(id)) from players where is_court_owner),
    to_jsonb(p_player), p_actor);
  update players set is_court_owner = false, updated_at = now() where is_court_owner and id <> p_player;
  update players set is_court_owner = true, updated_at = now() where id = p_player;
end;
$$;

revoke all on function session_snapshot(uuid) from public, anon, authenticated;
revoke all on function save_session(jsonb, text, boolean) from public, anon, authenticated;
revoke all on function reopen_session(uuid, text, text) from public, anon, authenticated;
revoke all on function record_transactions(jsonb, text) from public, anon, authenticated;
revoke all on function void_transaction(bigint, text, text) from public, anon, authenticated;
revoke all on function set_court_owner(uuid, text) from public, anon, authenticated;
grant execute on function session_snapshot(uuid) to service_role;
grant execute on function save_session(jsonb, text, boolean) to service_role;
grant execute on function reopen_session(uuid, text, text) to service_role;
grant execute on function record_transactions(jsonb, text) to service_role;
grant execute on function void_transaction(bigint, text, text) to service_role;
grant execute on function set_court_owner(uuid, text) to service_role;
