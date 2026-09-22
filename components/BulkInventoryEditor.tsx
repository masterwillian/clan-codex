"use client";

import { useMemo, useState } from "react";
import { rarities } from "@/lib/mockData";
import { canRequestRarity, codexProtectedQuantity } from "@/lib/tradeRules";
import type { Player, PokemonEntry, Rarity } from "@/types";

type Props = {
  player: Player;
  onPokemonChange: (pokemon: PokemonEntry) => void;
  onClose: () => void;
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function BulkInventoryEditor({ player, onPokemonChange, onClose }: Props) {
  const [search, setSearch] = useState("");

  const pokemon = useMemo(() => {
    const q = normalize(search.trim());
    const rows = player.groups.flatMap((group) => group.pokemon);
    return q ? rows.filter((entry) => normalize(entry.name).includes(q)) : rows;
  }, [player.groups, search]);

  const setAvailable = (entry: PokemonEntry, rarity: Rarity, value: number) => {
    const normalized = Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
    onPokemonChange({ ...entry, available: { ...entry.available, [rarity]: normalized } });
  };

  const toggleNeed = (entry: PokemonEntry, rarity: Rarity) => {
    if (!canRequestRarity(entry, rarity)) return;
    onPokemonChange({ ...entry, need: { ...entry.need, [rarity]: !entry.need[rarity] } });
  };

  const fillAllNeeds = () => {
    const rows = player.groups.flatMap((group) => group.pokemon);

    for (const entry of rows) {
      const nextNeed = { ...entry.need };
      let changed = false;

      for (const rarity of rarities) {
        const shouldNeed = canRequestRarity(entry, rarity.key);
        if (nextNeed[rarity.key] !== shouldNeed) {
          nextNeed[rarity.key] = shouldNeed;
          changed = true;
        }
      }

      if (changed) {
        onPokemonChange({ ...entry, need: nextNeed });
      }
    }
  };

  return (
    <section className="bulk-editor">
      <div className="bulk-editor-head">
        <div>
          <span>Edição rápida</span>
          <h2>Depósito e necessidades</h2>
          <p>Atualize o estoque total e as necessidades sem abrir grupo por grupo. Nada é enviado enquanto você edita; confirme tudo no botão “Salvar alterações”.</p>
        </div>
        <div className="bulk-editor-head-actions">
          <button type="button" className="bulk-fill-needs-button" onClick={fillAllNeeds}>
            Preencher todos que eu preciso
          </button>
          <button type="button" className="bulk-close-button" onClick={onClose}>Fechar ×</button>
        </div>
      </div>

      <div className="bulk-search">
        <span>⌕</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar Pokémon…" autoFocus />
        <b>{pokemon.length}</b>
      </div>

      <div className="bulk-table-wrap">
        <table className="bulk-table">
          <thead>
            <tr>
              <th>Pokémon</th>
              {rarities.map((rarity) => <th key={rarity.key} style={{ "--rarity": rarity.color } as React.CSSProperties}>{rarity.short} depósito</th>)}
              {rarities.map((rarity) => <th key={`need-${rarity.key}`} style={{ "--rarity": rarity.color } as React.CSSProperties}>{rarity.short} preciso</th>)}
            </tr>
          </thead>
          <tbody>
            {pokemon.map((entry) => (
              <tr key={entry.id}>
                <td><img src={entry.sprite} alt="" width={34} height={34} /><b>{entry.name}</b></td>
                {rarities.map((rarity) => {
                  const protectedForCodex = codexProtectedQuantity(entry, rarity.key);
                  return (
                    <td key={rarity.key}>
                      <div className="bulk-counter">
                        <button type="button" onClick={() => setAvailable(entry, rarity.key, entry.available[rarity.key] - 1)}>−</button>
                        <input type="number" min={0} value={entry.available[rarity.key]} onChange={(event) => setAvailable(entry, rarity.key, Number(event.target.value))} />
                        <button type="button" onClick={() => setAvailable(entry, rarity.key, entry.available[rarity.key] + 1)}>+</button>
                      </div>
                      {protectedForCodex ? <small className="bulk-protected-note">🔒 1 p/ Codex</small> : null}
                    </td>
                  );
                })}
                {rarities.map((rarity) => {
                  const completed = entry.codex[rarity.key];
                  const owned = !completed && entry.available[rarity.key] > 0;
                  const locked = completed || owned;
                  const title = completed
                    ? `${rarity.label} já está concluído no Codex.`
                    : owned
                      ? `Você já possui ${entry.available[rarity.key]} no depósito; 1 unidade está protegida para o Codex.`
                      : undefined;
                  return (
                    <td key={`need-${rarity.key}`}>
                      <label
                        className={`bulk-need ${!locked && entry.need[rarity.key] ? "bulk-need--on" : ""} ${locked ? "bulk-need--locked" : ""}`}
                        style={{ "--rarity": rarity.color } as React.CSSProperties}
                        title={title}
                      >
                        <input type="checkbox" checked={!locked && entry.need[rarity.key]} disabled={locked} onChange={() => toggleNeed(entry, rarity.key)} />
                        <span>{locked ? "🔒" : entry.need[rarity.key] ? "✓" : ""}</span>
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
