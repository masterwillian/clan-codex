-- Clan Codex v5.8.5
-- Permite confirmar uma entrega pendente mesmo que o destinatário tenha
-- sincronizado o depósito/Codex depois que a entrega foi criada.
--
-- Regra:
--   - create_trade continua validando se o destinatário realmente precisa do item.
--   - depois que a entrega está "pending", a confirmação do destinatário é a
--     confirmação explícita de que a entrega aconteceu.
--   - mudanças posteriores no "Preciso", depósito ou Codex do destinatário
--     não bloqueiam mais a confirmação.
--   - a proteção do estoque/Codex do doador continua sendo validada.

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
  v_protected integer;
begin
  if v_user is null then
    raise exception 'Você precisa estar logado.';
  end if;

  select *
    into v_trade
  from public.trades
  where id = p_trade_id
  for update;

  if not found then
    raise exception 'Entrega não encontrada.';
  end if;

  if v_trade.receiver_id <> v_user then
    raise exception 'Somente o destinatário pode confirmar.';
  end if;

  if v_trade.status <> 'pending' then
    raise exception 'Esta entrega não está pendente.';
  end if;

  -- Na confirmação, revalida somente o lado do doador.
  -- O estado do destinatário pode ter mudado por uma sincronização feita
  -- depois da criação da entrega e isso não invalida uma entrega já pendente.
  for v_item in
    select *
    from public.trade_items
    where trade_id = p_trade_id
    order by id
  loop
    v_available := 0;

    select coalesce(i.available_quantity, i.quantity, 0)
      into v_available
    from public.inventory i
    where i.user_id = v_trade.sender_id
      and i.pokemon_id = v_item.pokemon_id
      and i.rarity = v_item.rarity
    for update;

    v_available := coalesce(v_available, 0);

    select coalesce(c.completed, false)
      into v_sender_completed
    from public.codex_progress c
    where c.user_id = v_trade.sender_id
      and c.pokemon_id = v_item.pokemon_id
      and c.rarity = v_item.rarity;

    v_sender_completed := coalesce(v_sender_completed, false);
    v_protected := case
      when v_available > 0 and not v_sender_completed then 1
      else 0
    end;

    if (v_available - v_item.quantity) < v_protected then
      raise exception 'O doador precisa manter uma das unidades selecionadas protegida para o próprio Codex.';
    end if;
  end loop;

  -- Efetiva a saída do estoque do doador e encerra qualquer necessidade
  -- ainda existente no destinatário. Não altera o estoque do destinatário:
  -- ele continua sendo representado pelo depósito real/importado pelo usuário.
  for v_item in
    select *
    from public.trade_items
    where trade_id = p_trade_id
    order by id
  loop
    update public.inventory
    set available_quantity = coalesce(available_quantity, quantity, 0) - v_item.quantity,
        quantity = coalesce(available_quantity, quantity, 0) - v_item.quantity
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

grant execute on function public.confirm_trade(uuid) to authenticated;
