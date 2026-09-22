-- Clan Codex v5.8
-- Rode UMA VEZ depois da migration_v5_7.sql.
-- Regra nova:
--   1) estoque > 0 + raridade ainda não concluída => 1 unidade protegida para o Codex;
--   2) quem já possui a raridade no depósito não pode marcá-la como "Preciso";
--   3) trocas só podem usar estoque excedente à unidade protegida e às entregas pendentes.

-- 1) Limpa necessidades incompatíveis: concluído no Codex OU já possui no depósito.
update public.inventory i
set wanted = false,
    wanted_quantity = 0
where (coalesce(i.wanted, false) or coalesce(i.wanted_quantity, 0) > 0)
  and (
    coalesce(i.available_quantity, i.quantity, 0) > 0
    or exists (
      select 1
      from public.codex_progress c
      where c.user_id = i.user_id
        and c.pokemon_id = i.pokemon_id
        and c.rarity = i.rarity
        and c.completed = true
    )
  );

-- 2) O próprio registro de inventário impede "Preciso" quando já há estoque.
-- Também mantém a proteção antiga para raridades concluídas no Codex.
create or replace function public.block_need_for_completed_codex()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.wanted, false) or coalesce(new.wanted_quantity, 0) > 0 then
    if coalesce(new.available_quantity, new.quantity, 0) > 0
       or exists (
         select 1
         from public.codex_progress c
         where c.user_id = new.user_id
           and c.pokemon_id = new.pokemon_id
           and c.rarity = new.rarity
           and c.completed = true
       ) then
      new.wanted := false;
      new.wanted_quantity := 0;
    else
      new.wanted := true;
      new.wanted_quantity := 1;
    end if;
  else
    new.wanted := false;
    new.wanted_quantity := 0;
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_block_completed_codex_need on public.inventory;
create trigger inventory_block_completed_codex_need
before insert or update of wanted, wanted_quantity, available_quantity, quantity on public.inventory
for each row execute procedure public.block_need_for_completed_codex();

-- 3) create_trade valida a reserva do doador e também o estado real do destinatário.
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
  v_protected integer;
  v_sender_completed boolean;
  v_receiver_completed boolean;
  v_receiver_inventory integer;
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
    select distinct (x.value->>'pokemon_id')::integer as pokemon_id, x.value->>'rarity' as rarity
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
    where i.user_id = v_sender and i.pokemon_id = v_pokemon_id and i.rarity = v_rarity
    for update;
    v_available := coalesce(v_available, 0);

    select coalesce(sum(ti.quantity), 0)::integer into v_committed
    from public.trade_items ti
    join public.trades t on t.id = ti.trade_id
    where t.sender_id = v_sender
      and t.status = 'pending'
      and ti.pokemon_id = v_pokemon_id
      and ti.rarity = v_rarity;

    select coalesce(c.completed, false) into v_sender_completed
    from public.codex_progress c
    where c.user_id = v_sender and c.pokemon_id = v_pokemon_id and c.rarity = v_rarity;
    v_sender_completed := coalesce(v_sender_completed, false);
    v_protected := case when v_available > 0 and not v_sender_completed then 1 else 0 end;

    if (v_available - v_committed - v_protected) < 1 then
      raise exception 'Uma das unidades selecionadas está reservada para o seu Codex ou para outra entrega pendente.';
    end if;

    select coalesce(i.wanted, false), coalesce(i.available_quantity, i.quantity, 0)
      into v_needed, v_receiver_inventory
    from public.inventory i
    where i.user_id = p_receiver_id and i.pokemon_id = v_pokemon_id and i.rarity = v_rarity;
    v_needed := coalesce(v_needed, false);
    v_receiver_inventory := coalesce(v_receiver_inventory, 0);

    select coalesce(c.completed, false) into v_receiver_completed
    from public.codex_progress c
    where c.user_id = p_receiver_id and c.pokemon_id = v_pokemon_id and c.rarity = v_rarity;
    v_receiver_completed := coalesce(v_receiver_completed, false);

    if v_receiver_completed then
      raise exception 'O destinatário já concluiu uma das raridades selecionadas no Codex.';
    end if;
    if v_receiver_inventory > 0 then
      raise exception 'O destinatário já possui uma das raridades selecionadas no depósito.';
    end if;
    if not v_needed then
      raise exception 'O destinatário não precisa mais de um dos Pokémon selecionados.';
    end if;
  end loop;

  insert into public.trades (clan_id, sender_id, receiver_id, sender_nickname, receiver_nickname, status)
  values (v_clan, v_sender, p_receiver_id, v_sender_nickname, v_receiver_nickname, 'pending')
  returning id into v_trade;

  for v_item in select value from jsonb_array_elements(p_items) as x(value)
  loop
    insert into public.trade_items (trade_id, pokemon_id, rarity, quantity)
    values (v_trade, (v_item->>'pokemon_id')::integer, (v_item->>'rarity')::public.rarity, 1);
  end loop;

  return v_trade;
end;
$$;

-- 4) Na confirmação, as duas proteções continuam valendo caso o estado mude
-- desde a criação da entrega: o doador precisa manter a cópia do Codex e o
-- destinatário ainda precisa realmente precisar daquela raridade.
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
  v_sender_completed boolean;
  v_receiver_completed boolean;
  v_receiver_inventory integer;
  v_receiver_needed boolean;
  v_protected integer;
begin
  if v_user is null then raise exception 'Você precisa estar logado.'; end if;

  select * into v_trade from public.trades where id = p_trade_id for update;
  if not found then raise exception 'Entrega não encontrada.'; end if;
  if v_trade.receiver_id <> v_user then raise exception 'Somente o destinatário pode confirmar.'; end if;
  if v_trade.status <> 'pending' then raise exception 'Esta entrega não está pendente.'; end if;

  for v_item in select * from public.trade_items where trade_id = p_trade_id order by id
  loop
    v_available := 0;
    select i.available_quantity into v_available
    from public.inventory i
    where i.user_id = v_trade.sender_id and i.pokemon_id = v_item.pokemon_id and i.rarity = v_item.rarity
    for update;
    v_available := coalesce(v_available, 0);

    select coalesce(c.completed, false) into v_sender_completed
    from public.codex_progress c
    where c.user_id = v_trade.sender_id and c.pokemon_id = v_item.pokemon_id and c.rarity = v_item.rarity;
    v_sender_completed := coalesce(v_sender_completed, false);
    v_protected := case when v_available > 0 and not v_sender_completed then 1 else 0 end;

    if (v_available - v_item.quantity) < v_protected then
      raise exception 'O doador precisa manter uma das unidades selecionadas protegida para o próprio Codex.';
    end if;

    select coalesce(i.wanted, false), coalesce(i.available_quantity, i.quantity, 0)
      into v_receiver_needed, v_receiver_inventory
    from public.inventory i
    where i.user_id = v_trade.receiver_id
      and i.pokemon_id = v_item.pokemon_id
      and i.rarity = v_item.rarity;
    v_receiver_needed := coalesce(v_receiver_needed, false);
    v_receiver_inventory := coalesce(v_receiver_inventory, 0);

    select coalesce(c.completed, false) into v_receiver_completed
    from public.codex_progress c
    where c.user_id = v_trade.receiver_id
      and c.pokemon_id = v_item.pokemon_id
      and c.rarity = v_item.rarity;
    v_receiver_completed := coalesce(v_receiver_completed, false);

    if v_receiver_completed or v_receiver_inventory > 0 or not v_receiver_needed then
      raise exception 'O destinatário não precisa mais de uma das unidades desta entrega.';
    end if;
  end loop;

  for v_item in select * from public.trade_items where trade_id = p_trade_id order by id
  loop
    update public.inventory
    set available_quantity = available_quantity - v_item.quantity,
        quantity = available_quantity - v_item.quantity
    where user_id = v_trade.sender_id and pokemon_id = v_item.pokemon_id and rarity = v_item.rarity;

    update public.inventory
    set wanted = false, wanted_quantity = 0
    where user_id = v_trade.receiver_id and pokemon_id = v_item.pokemon_id and rarity = v_item.rarity;
  end loop;

  update public.trades set status = 'completed' where id = p_trade_id;
end;
$$;

grant execute on function public.create_trade(uuid, jsonb) to authenticated;
grant execute on function public.confirm_trade(uuid) to authenticated;
