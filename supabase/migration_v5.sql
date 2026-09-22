-- Clan Codex v5 - MIGRAÇÃO da v4 para v5
-- Rode este arquivo UMA VEZ no SQL Editor do projeto Supabase que já usa a v4.
-- Ele preserva contas, clãs, Codex e dados existentes.

create extension if not exists pgcrypto;

-- 1) Necessidade passa a ser booleana (sempre no máximo 1 unidade).
alter table public.inventory
  add column if not exists wanted boolean not null default false;

update public.inventory
set wanted = (wanted_quantity > 0),
    wanted_quantity = case when wanted_quantity > 0 then 1 else 0 end,
    -- Na v5 o número de cima é a quantidade DISPONÍVEL para o clã.
    -- Preserva o que cada pessoa digitou anteriormente no campo principal.
    available_quantity = quantity;

-- Mantém as colunas antigas espelhadas por compatibilidade, mas limita wanted_quantity a 0/1.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_wanted_quantity_boolean_check'
      and conrelid = 'public.inventory'::regclass
  ) then
    alter table public.inventory
      add constraint inventory_wanted_quantity_boolean_check
      check (wanted_quantity in (0,1));
  end if;
end $$;

-- Corrige também a função de criação de clã para projetos em que pgcrypto está em extensions.
create or replace function public.create_clan(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
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
    v_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12));
    exit when not exists (select 1 from public.clans where invite_code = v_code);
  end loop;

  insert into public.clans (name, owner_id, invite_code)
  values (trim(p_name), v_user, v_code)
  returning id into v_clan;

  update public.profiles set clan_id = v_clan where id = v_user;
  return v_clan;
end;
$$;

-- 2) Cria uma entrega pendente. Cada necessidade vale exatamente 1 unidade.
-- Quantidades já comprometidas em outras entregas pendentes são reservadas.
create or replace function public.create_trade(p_receiver_id uuid, p_items jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_clan uuid;
  v_trade uuid;
  v_item jsonb;
  v_pokemon_id integer;
  v_rarity public.rarity;
  v_qty integer;
  v_available integer;
  v_committed integer;
  v_needed boolean;
  v_count integer;
  v_distinct_count integer;
begin
  if v_sender is null then raise exception 'Você precisa estar logado.'; end if;
  if p_receiver_id is null or p_receiver_id = v_sender then raise exception 'Destinatário inválido.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Selecione pelo menos um Pokémon.';
  end if;

  select clan_id into v_clan from public.profiles where id = v_sender;
  if v_clan is null then raise exception 'Você não pertence a um clã.'; end if;

  if not exists (select 1 from public.profiles where id = p_receiver_id and clan_id = v_clan) then
    raise exception 'O destinatário não pertence ao seu clã.';
  end if;

  select count(*) into v_count from jsonb_array_elements(p_items);
  select count(*) into v_distinct_count
  from (
    select distinct
      (x.value->>'pokemon_id')::integer as pokemon_id,
      x.value->>'rarity' as rarity
    from jsonb_array_elements(p_items) as x(value)
  ) d;
  if v_count <> v_distinct_count then
    raise exception 'A entrega contém itens duplicados.';
  end if;

  -- Valida e reserva logicamente a disponibilidade antes de criar a entrega.
  for v_item in select value from jsonb_array_elements(p_items) as x(value)
  loop
    begin
      v_pokemon_id := (v_item->>'pokemon_id')::integer;
      v_rarity := (v_item->>'rarity')::public.rarity;
      v_qty := coalesce((v_item->>'quantity')::integer, 1);
    exception when others then
      raise exception 'Item de entrega inválido.';
    end;

    if v_qty <> 1 then
      raise exception 'Cada necessidade aceita exatamente 1 unidade.';
    end if;

    v_available := 0;
    select i.available_quantity into v_available
    from public.inventory i
    where i.user_id = v_sender
      and i.pokemon_id = v_pokemon_id
      and i.rarity = v_rarity
    for update;
    v_available := coalesce(v_available, 0);

    select coalesce(sum(ti.quantity), 0)::integer into v_committed
    from public.trade_items ti
    join public.trades t on t.id = ti.trade_id
    where t.sender_id = v_sender
      and t.status = 'pending'
      and ti.pokemon_id = v_pokemon_id
      and ti.rarity = v_rarity;

    if (v_available - v_committed) < 1 then
      raise exception 'Você não possui unidade livre suficiente para uma das entregas selecionadas.';
    end if;

    v_needed := false;
    select coalesce(i.wanted, false) into v_needed
    from public.inventory i
    where i.user_id = p_receiver_id
      and i.pokemon_id = v_pokemon_id
      and i.rarity = v_rarity;

    if not coalesce(v_needed, false) then
      raise exception 'O destinatário não precisa mais de um dos Pokémon selecionados.';
    end if;
  end loop;

  insert into public.trades (clan_id, sender_id, receiver_id, status)
  values (v_clan, v_sender, p_receiver_id, 'pending')
  returning id into v_trade;

  for v_item in select value from jsonb_array_elements(p_items) as x(value)
  loop
    insert into public.trade_items (trade_id, pokemon_id, rarity, quantity)
    values (
      v_trade,
      (v_item->>'pokemon_id')::integer,
      (v_item->>'rarity')::public.rarity,
      1
    );
  end loop;

  return v_trade;
end;
$$;

-- 3) Confirma recebimento de forma atômica:
--    - desconta 1 do disponível do doador
--    - desmarca "Preciso" do destinatário
--    - finaliza a entrega e alimenta o histórico/estatísticas.
create or replace function public.confirm_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_trade public.trades%rowtype;
  v_item public.trade_items%rowtype;
  v_available integer;
begin
  if v_user is null then raise exception 'Você precisa estar logado.'; end if;

  select * into v_trade
  from public.trades
  where id = p_trade_id
  for update;

  if not found then raise exception 'Entrega não encontrada.'; end if;
  if v_trade.receiver_id <> v_user then raise exception 'Somente o destinatário pode confirmar.'; end if;
  if v_trade.status <> 'pending' then raise exception 'Esta entrega não está pendente.'; end if;

  for v_item in select * from public.trade_items where trade_id = p_trade_id order by id
  loop
    v_available := 0;
    select i.available_quantity into v_available
    from public.inventory i
    where i.user_id = v_trade.sender_id
      and i.pokemon_id = v_item.pokemon_id
      and i.rarity = v_item.rarity
    for update;

    if coalesce(v_available, 0) < v_item.quantity then
      raise exception 'O doador não possui mais quantidade disponível suficiente.';
    end if;
  end loop;

  for v_item in select * from public.trade_items where trade_id = p_trade_id order by id
  loop
    update public.inventory
    set available_quantity = available_quantity - v_item.quantity,
        quantity = available_quantity - v_item.quantity
    where user_id = v_trade.sender_id
      and pokemon_id = v_item.pokemon_id
      and rarity = v_item.rarity;

    update public.inventory
    set wanted = false,
        wanted_quantity = 0
    where user_id = v_trade.receiver_id
      and pokemon_id = v_item.pokemon_id
      and rarity = v_item.rarity;
  end loop;

  update public.trades
  set status = 'completed'
  where id = p_trade_id;
end;
$$;

create or replace function public.reject_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_trade public.trades%rowtype;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  if v_trade.receiver_id <> v_user then raise exception 'Somente o destinatário pode recusar.'; end if;
  if v_trade.status <> 'pending' then raise exception 'Esta entrega não está pendente.'; end if;
  update public.trades set status = 'cancelled' where id = p_trade_id;
end;
$$;

create or replace function public.cancel_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_trade public.trades%rowtype;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  if v_trade.sender_id <> v_user then raise exception 'Somente o doador pode cancelar.'; end if;
  if v_trade.status <> 'pending' then raise exception 'Esta entrega não está pendente.'; end if;
  update public.trades set status = 'cancelled' where id = p_trade_id;
end;
$$;

-- 4) Administração do clã.
create or replace function public.regenerate_clan_invite_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_clan uuid;
  v_code text;
begin
  select id into v_clan from public.clans where owner_id = v_user;
  if v_clan is null then raise exception 'Somente o owner pode gerar um novo código.'; end if;

  loop
    v_code := upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12));
    exit when not exists (select 1 from public.clans where invite_code = v_code);
  end loop;

  update public.clans set invite_code = v_code where id = v_clan;
  return v_code;
end;
$$;

create or replace function public.remove_clan_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_clan uuid;
begin
  select id into v_clan from public.clans where owner_id = v_owner;
  if v_clan is null then raise exception 'Somente o owner pode remover membros.'; end if;
  if p_user_id = v_owner then raise exception 'Transfira a propriedade antes de remover o owner.'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id and clan_id = v_clan) then
    raise exception 'Este usuário não pertence ao seu clã.';
  end if;

  update public.trades
  set status = 'cancelled'
  where clan_id = v_clan
    and status = 'pending'
    and (sender_id = p_user_id or receiver_id = p_user_id);

  update public.profiles set clan_id = null where id = p_user_id;
end;
$$;

create or replace function public.transfer_clan_ownership(p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := auth.uid();
  v_clan uuid;
begin
  select id into v_clan from public.clans where owner_id = v_owner;
  if v_clan is null then raise exception 'Somente o owner pode transferir a propriedade.'; end if;
  if p_new_owner_id = v_owner then return; end if;
  if not exists (select 1 from public.profiles where id = p_new_owner_id and clan_id = v_clan) then
    raise exception 'O novo owner precisa pertencer ao clã.';
  end if;

  update public.clans set owner_id = p_new_owner_id where id = v_clan;
end;
$$;

grant execute on function public.create_trade(uuid, jsonb) to authenticated;
grant execute on function public.confirm_trade(uuid) to authenticated;
grant execute on function public.reject_trade(uuid) to authenticated;
grant execute on function public.cancel_trade(uuid) to authenticated;
grant execute on function public.regenerate_clan_invite_code() to authenticated;
grant execute on function public.remove_clan_member(uuid) to authenticated;
grant execute on function public.transfer_clan_ownership(uuid) to authenticated;

-- A atualização de status agora passa somente pelas RPCs acima.
drop policy if exists "trade create sender" on public.trades;
drop policy if exists "trade update participants" on public.trades;
drop policy if exists "trade items insert sender" on public.trade_items;

-- Realtime: trades, itens e mudanças administrativas também atualizam a tela.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trades') then
    alter publication supabase_realtime add table public.trades;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trade_items') then
    alter publication supabase_realtime add table public.trade_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clans') then
    alter publication supabase_realtime add table public.clans;
  end if;
end $$;
