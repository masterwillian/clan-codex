-- Clan Codex v5.2 - migração incremental da v5/v5.1 para v5.2
-- Rode UMA VEZ no SQL Editor. Preserva contas, clãs, Codex, inventários e histórico.

-- 1) Preserva o nome dos participantes no histórico mesmo se saírem do clã.
alter table public.trades
  add column if not exists sender_nickname text,
  add column if not exists receiver_nickname text;

update public.trades t
set sender_nickname = coalesce(t.sender_nickname, s.nickname),
    receiver_nickname = coalesce(t.receiver_nickname, r.nickname)
from public.profiles s, public.profiles r
where s.id = t.sender_id
  and r.id = t.receiver_id
  and (t.sender_nickname is null or t.receiver_nickname is null);

-- 2) Garante nickname único dentro do mesmo clã.
create unique index if not exists profiles_unique_nickname_per_clan
  on public.profiles (clan_id, lower(nickname))
  where clan_id is not null;

-- 3) Sair voluntariamente do clã sem apagar conta/Codex.
-- Se for owner e houver outros membros, precisa transferir a propriedade antes.
create or replace function public.leave_clan()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_clan uuid;
  v_owner uuid;
  v_other_members integer;
begin
  if v_user is null then raise exception 'Você precisa estar logado.'; end if;

  select clan_id into v_clan from public.profiles where id = v_user for update;
  if v_clan is null then return; end if;

  select owner_id into v_owner from public.clans where id = v_clan for update;

  if v_owner = v_user then
    select count(*)::integer into v_other_members
    from public.profiles
    where clan_id = v_clan and id <> v_user;

    if v_other_members > 0 then
      raise exception 'Transfira a propriedade do clã antes de sair.';
    end if;
  end if;

  update public.trades
  set status = 'cancelled'
  where clan_id = v_clan
    and status = 'pending'
    and (sender_id = v_user or receiver_id = v_user);

  update public.profiles set clan_id = null where id = v_user;

  -- Se era o único membro/owner, remove o clã vazio. O Codex do usuário permanece.
  if v_owner = v_user then
    delete from public.clans where id = v_clan;
  end if;
end;
$$;

grant execute on function public.leave_clan() to authenticated;

-- 4) create_trade com snapshot dos nicknames para o histórico.
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
  v_sender_nickname text;
  v_receiver_nickname text;
begin
  if v_sender is null then raise exception 'Você precisa estar logado.'; end if;
  if p_receiver_id is null or p_receiver_id = v_sender then raise exception 'Destinatário inválido.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Selecione pelo menos um Pokémon.';
  end if;

  select clan_id, nickname into v_clan, v_sender_nickname
  from public.profiles where id = v_sender;
  if v_clan is null then raise exception 'Você não pertence a um clã.'; end if;

  select nickname into v_receiver_nickname
  from public.profiles
  where id = p_receiver_id and clan_id = v_clan;
  if v_receiver_nickname is null then raise exception 'O destinatário não pertence ao seu clã.'; end if;

  select count(*) into v_count from jsonb_array_elements(p_items);
  select count(*) into v_distinct_count
  from (
    select distinct
      (x.value->>'pokemon_id')::integer as pokemon_id,
      x.value->>'rarity' as rarity
    from jsonb_array_elements(p_items) as x(value)
  ) d;
  if v_count <> v_distinct_count then raise exception 'A entrega contém itens duplicados.'; end if;

  for v_item in select value from jsonb_array_elements(p_items) as x(value)
  loop
    begin
      v_pokemon_id := (v_item->>'pokemon_id')::integer;
      v_rarity := (v_item->>'rarity')::public.rarity;
      v_qty := coalesce((v_item->>'quantity')::integer, 1);
    exception when others then
      raise exception 'Item de entrega inválido.';
    end;

    if v_qty <> 1 then raise exception 'Cada necessidade aceita exatamente 1 unidade.'; end if;

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

  insert into public.trades (
    clan_id, sender_id, receiver_id, sender_nickname, receiver_nickname, status
  ) values (
    v_clan, v_sender, p_receiver_id, v_sender_nickname, v_receiver_nickname, 'pending'
  ) returning id into v_trade;

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

grant execute on function public.create_trade(uuid, jsonb) to authenticated;
