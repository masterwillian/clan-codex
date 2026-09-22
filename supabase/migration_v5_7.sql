-- Clan Codex v5.7
-- Regra geral: uma raridade já concluída no Codex não pode continuar marcada
-- como "Preciso". Rode este arquivo UMA VEZ em projetos que já usam v5/v5.6.

-- 1) Limpa necessidades antigas que já contradizem o Codex.
update public.inventory i
set wanted = false,
    wanted_quantity = 0
where (coalesce(i.wanted, false) or i.wanted_quantity > 0)
  and exists (
    select 1
    from public.codex_progress c
    where c.user_id = i.user_id
      and c.pokemon_id = i.pokemon_id
      and c.rarity = i.rarity
      and c.completed = true
  );

-- 2) Impede que uma necessidade seja ligada novamente se o Codex já estiver concluído.
create or replace function public.block_need_for_completed_codex()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.wanted, false) or coalesce(new.wanted_quantity, 0) > 0 then
    if exists (
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
      -- Mantém as duas colunas antigas espelhadas e booleanas.
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
before insert or update of wanted, wanted_quantity on public.inventory
for each row execute procedure public.block_need_for_completed_codex();

-- 3) Se o jogador conclui uma raridade depois de já tê-la pedido, remove o pedido
-- automaticamente na mesma transação.
create or replace function public.clear_need_when_codex_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed = true then
    update public.inventory
    set wanted = false,
        wanted_quantity = 0
    where user_id = new.user_id
      and pokemon_id = new.pokemon_id
      and rarity = new.rarity
      and (coalesce(wanted, false) or wanted_quantity > 0);
  end if;

  return new;
end;
$$;

drop trigger if exists codex_clear_completed_need on public.codex_progress;
create trigger codex_clear_completed_need
after insert or update of completed on public.codex_progress
for each row execute procedure public.clear_need_when_codex_completed();
