-- Clan Codex v4 - Supabase/Postgres
-- Rode este arquivo UMA VEZ em um projeto Supabase novo, depois rode seed_kanto.sql.

create extension if not exists pgcrypto;

create type public.rarity as enum ('uncommon','rare','epic','legendary');
create type public.trade_status as enum ('pending','sent','completed','cancelled');

create table public.clans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  owner_id uuid not null references auth.users(id) on delete cascade,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(trim(nickname)) between 2 and 32),
  avatar_url text,
  clan_id uuid references public.clans(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_unique_nickname_per_clan
  on public.profiles (clan_id, lower(nickname))
  where clan_id is not null;

create table public.pokemon (
  id integer primary key,
  name text not null unique,
  sprite_url text,
  region text not null default 'Kanto'
);

create table public.codex_groups (
  id integer primary key,
  region text not null,
  attribute text not null,
  short_attribute text not null,
  display_order integer not null
);

create table public.codex_group_members (
  group_id integer not null references public.codex_groups(id) on delete cascade,
  pokemon_id integer not null references public.pokemon(id) on delete cascade,
  position integer not null,
  primary key (group_id, pokemon_id)
);

create table public.inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  pokemon_id integer not null references public.pokemon(id) on delete cascade,
  rarity public.rarity not null,
  quantity integer not null default 0 check (quantity >= 0),
  available_quantity integer not null default 0 check (available_quantity >= 0),
  wanted_quantity integer not null default 0 check (wanted_quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, pokemon_id, rarity),
  check (available_quantity <= quantity)
);

create table public.codex_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  pokemon_id integer not null references public.pokemon(id) on delete cascade,
  rarity public.rarity not null,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, pokemon_id, rarity)
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  clan_id uuid not null references public.clans(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status public.trade_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_id <> receiver_id)
);

create table public.trade_items (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades(id) on delete cascade,
  pokemon_id integer not null references public.pokemon(id),
  rarity public.rarity not null,
  quantity integer not null check (quantity > 0)
);

-- Atualiza updated_at automaticamente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();
create trigger inventory_set_updated_at before update on public.inventory
for each row execute procedure public.set_updated_at();
create trigger codex_progress_set_updated_at before update on public.codex_progress
for each row execute procedure public.set_updated_at();
create trigger trades_set_updated_at before update on public.trades
for each row execute procedure public.set_updated_at();

-- Todo cadastro no Supabase Auth ganha automaticamente um profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''), split_part(coalesce(new.email, 'player'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Helpers de segurança.
create or replace function public.current_clan_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clan_id from public.profiles where id = auth.uid();
$$;

create or replace function public.same_clan(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles other
    where other.id = other_user
      and other.clan_id is not null
      and other.clan_id = public.current_clan_id()
  );
$$;

-- Gera código curto e cria o clã para o usuário logado.
create or replace function public.create_clan(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_clan uuid;
  v_code text;
  v_existing uuid;
begin
  if v_user is null then raise exception 'Você precisa estar logado.'; end if;
  if char_length(trim(p_name)) < 2 then raise exception 'Nome do clã muito curto.'; end if;

  select clan_id into v_existing from public.profiles where id = v_user;
  if v_existing is not null then raise exception 'Sua conta já pertence a um clã.'; end if;

  loop
    v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
    exit when not exists (select 1 from public.clans where invite_code = v_code);
  end loop;

  insert into public.clans (name, owner_id, invite_code)
  values (trim(p_name), v_user, v_code)
  returning id into v_clan;

  update public.profiles set clan_id = v_clan where id = v_user;
  return v_clan;
end;
$$;

-- Entra no clã por código. A mudança de clan_id só acontece dentro deste RPC.
create or replace function public.join_clan(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_existing uuid;
begin
  if v_user is null then raise exception 'Você precisa estar logado.'; end if;

  select id into v_target
  from public.clans
  where invite_code = upper(trim(p_invite_code));

  if v_target is null then raise exception 'Código de clã inválido.'; end if;

  select clan_id into v_existing from public.profiles where id = v_user;
  if v_existing is not null and v_existing <> v_target then
    raise exception 'Sua conta já pertence a outro clã.';
  end if;

  update public.profiles set clan_id = v_target where id = v_user;
  return v_target;
exception
  when unique_violation then
    raise exception 'Já existe alguém com esse nickname neste clã. Troque o nickname e tente novamente.';
end;
$$;

grant execute on function public.create_clan(text) to authenticated;
grant execute on function public.join_clan(text) to authenticated;
grant execute on function public.current_clan_id() to authenticated;
grant execute on function public.same_clan(uuid) to authenticated;

-- RLS: todos do mesmo clã podem LER; só o dono das linhas pode ALTERAR.
alter table public.clans enable row level security;
alter table public.profiles enable row level security;
alter table public.pokemon enable row level security;
alter table public.codex_groups enable row level security;
alter table public.codex_group_members enable row level security;
alter table public.inventory enable row level security;
alter table public.codex_progress enable row level security;
alter table public.trades enable row level security;
alter table public.trade_items enable row level security;

create policy "clans read own clan" on public.clans
for select using (id = public.current_clan_id());

create policy "pokemon authenticated read" on public.pokemon
for select to authenticated using (true);
create policy "codex groups authenticated read" on public.codex_groups
for select to authenticated using (true);
create policy "codex members authenticated read" on public.codex_group_members
for select to authenticated using (true);

create policy "profiles read self or same clan" on public.profiles
for select using (
  id = auth.uid()
  or (clan_id is not null and clan_id = public.current_clan_id())
);

create policy "inventory read same clan" on public.inventory
for select using (user_id = auth.uid() or public.same_clan(user_id));
create policy "inventory insert own" on public.inventory
for insert with check (user_id = auth.uid());
create policy "inventory update own" on public.inventory
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "inventory delete own" on public.inventory
for delete using (user_id = auth.uid());

create policy "codex read same clan" on public.codex_progress
for select using (user_id = auth.uid() or public.same_clan(user_id));
create policy "codex insert own" on public.codex_progress
for insert with check (user_id = auth.uid());
create policy "codex update own" on public.codex_progress
for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "codex delete own" on public.codex_progress
for delete using (user_id = auth.uid());

create policy "trade read clan" on public.trades
for select using (clan_id = public.current_clan_id());
create policy "trade create sender" on public.trades
for insert with check (
  sender_id = auth.uid()
  and clan_id = public.current_clan_id()
  and public.same_clan(receiver_id)
);
create policy "trade update participants" on public.trades
for update using (sender_id = auth.uid() or receiver_id = auth.uid());

create policy "trade items read via trade" on public.trade_items
for select using (
  exists (
    select 1 from public.trades t
    where t.id = trade_id and t.clan_id = public.current_clan_id()
  )
);
create policy "trade items insert sender" on public.trade_items
for insert with check (
  exists (
    select 1 from public.trades t
    where t.id = trade_id and t.sender_id = auth.uid()
  )
);

-- Realtime para os Codex/inventários mudarem sem recarregar a página.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory') then
    alter publication supabase_realtime add table public.inventory;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'codex_progress') then
    alter publication supabase_realtime add table public.codex_progress;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
