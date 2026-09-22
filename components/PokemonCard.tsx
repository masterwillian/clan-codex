"use client";

import { rarities } from "@/lib/mockData";
import { flagsForLevel, rarityOrder } from "@/lib/codexUtils";
import { canRequestRarity, codexProtectedQuantity } from "@/lib/tradeRules";
import { PokemonEntry, Rarity } from "@/types";

type Props = {
  pokemon: PokemonEntry;
  editable?: boolean;
  onChange?: (next: PokemonEntry) => void;
  helperPokemon?: PokemonEntry | null;
};

export default function PokemonCard({ pokemon, editable = false, onChange, helperPokemon }: Props) {
  const totalInventory = rarities.reduce((sum, rarity) => sum + pokemon.available[rarity.key], 0);
  const protectedTotal = rarities.reduce((sum, rarity) => sum + codexProtectedQuantity(pokemon, rarity.key), 0);

  const setAvailable = (rarity: Rarity, value: number) => {
    if (!editable || !onChange) return;
    const normalized = Math.max(0, Number.isFinite(value) ? Math.floor(value) : 0);
    onChange({ ...pokemon, available: { ...pokemon.available, [rarity]: normalized } });
  };

  const toggleNeed = (rarity: Rarity) => {
    if (!editable || !onChange || !canRequestRarity(pokemon, rarity)) return;
    onChange({ ...pokemon, need: { ...pokemon.need, [rarity]: !pokemon.need[rarity] } });
  };

  const toggleCodex = (rarity: Rarity) => {
    if (!editable || !onChange) return;
    const index = rarityOrder.indexOf(rarity);
    const turningOn = !pokemon.codex[rarity];
    const nextLevel = turningOn ? index + 1 : index;
    onChange({ ...pokemon, codex: flagsForLevel(nextLevel) });
  };

  const canHelp = helperPokemon
    ? rarities.some(({ key }) => helperPokemon.available[key] > 0 && pokemon.need[key] && canRequestRarity(pokemon, key))
    : false;

  return (
    <article className={`pokemon-card ${canHelp ? "pokemon-card--match" : ""}`}>
      <div className="rarity-strip" aria-label={`Estoque no depósito de ${pokemon.name}`}>
        {rarities.map((rarity) => {
          const protectedForCodex = codexProtectedQuantity(pokemon, rarity.key);
          return (
            <label
              key={rarity.key}
              className={`rarity-box ${protectedForCodex ? "rarity-box--protected" : ""}`}
              style={{ "--rarity": rarity.color } as React.CSSProperties}
              title={`${rarity.label}: ${pokemon.available[rarity.key]} no depósito${protectedForCodex ? " · 1 protegido para o Codex" : ""}`}
            >
              <span>{rarity.short}</span>
              {editable ? (
                <div className="quick-number">
                  <button type="button" onClick={() => setAvailable(rarity.key, pokemon.available[rarity.key] - 1)} aria-label={`Diminuir ${pokemon.name} ${rarity.label}`}>−</button>
                  <input
                    type="number"
                    min={0}
                    value={pokemon.available[rarity.key]}
                    onChange={(e) => setAvailable(rarity.key, Number(e.target.value))}
                    aria-label={`${pokemon.name} ${rarity.label} no depósito`}
                  />
                  <button type="button" onClick={() => setAvailable(rarity.key, pokemon.available[rarity.key] + 1)} aria-label={`Aumentar ${pokemon.name} ${rarity.label}`}>+</button>
                </div>
              ) : (
                <b>{pokemon.available[rarity.key]}</b>
              )}
              {protectedForCodex ? <small className="rarity-protected-note">🔒 1 p/ Codex</small> : null}
            </label>
          );
        })}
      </div>

      <div className="pokemon-art">
        <img src={pokemon.sprite} alt={pokemon.name} width={72} height={72} />
      </div>
      <strong className="pokemon-name">{pokemon.name}</strong>
      <div className="pokemon-inventory-summary">
        <span>Depósito <b>{totalInventory}</b></span>
        {protectedTotal > 0 ? <em>🔒 {protectedTotal} p/ Codex</em> : <em className="pokemon-inventory-summary--clear">sem reserva</em>}
      </div>

      <div className="codex-state" aria-label={`Progresso de Codex de ${pokemon.name}`}>
        {rarities.map((rarity) => (
          <button
            key={rarity.key}
            type="button"
            className={pokemon.codex[rarity.key] ? "codex-dot codex-dot--on" : "codex-dot"}
            style={{ "--rarity": rarity.color } as React.CSSProperties}
            onClick={() => toggleCodex(rarity.key)}
            disabled={!editable}
            title={`${rarity.label}: ${pokemon.codex[rarity.key] ? "concluído" : "não concluído"}`}
          >
            {pokemon.codex[rarity.key] ? "✓" : "·"}
          </button>
        ))}
      </div>

      {editable && (
        <details className="trade-editor">
          <summary>Trocas</summary>
          <div className="need-grid">
            {rarities.map((rarity) => {
              const completed = pokemon.codex[rarity.key];
              const owned = !completed && pokemon.available[rarity.key] > 0;
              const locked = completed || owned;
              const reason = completed ? "Já tem" : owned ? "No depósito" : "Preciso";
              const title = completed
                ? `${rarity.label} já está concluído no Codex.`
                : owned
                  ? `Você já possui ${pokemon.available[rarity.key]} ${rarity.label} no depósito. Use a cópia protegida no Codex antes de pedir outra.`
                  : undefined;
              return (
                <label
                  key={rarity.key}
                  className={`need-check ${!locked && pokemon.need[rarity.key] ? "need-check--on" : ""} ${locked ? "need-check--locked" : ""}`}
                  style={{ "--rarity": rarity.color } as React.CSSProperties}
                  title={title}
                >
                  <input type="checkbox" checked={!locked && pokemon.need[rarity.key]} disabled={locked} onChange={() => toggleNeed(rarity.key)} />
                  <b>{locked ? "🔒" : rarity.short}</b>
                  <span>{reason}</span>
                </label>
              );
            })}
          </div>
          <p className="trade-hint">Você só pode pedir uma raridade que ainda falta no Codex e que esteja zerada no seu depósito.</p>
        </details>
      )}

      {helperPokemon && canHelp && (
        <div className="match-note">
          Você pode ajudar: {rarities
            .filter(({ key }) => helperPokemon.available[key] > 0 && pokemon.need[key] && canRequestRarity(pokemon, key))
            .map(({ key, label }) => `1 ${label} (${helperPokemon.available[key]} livre${helperPokemon.available[key] === 1 ? "" : "s"})`)
            .join(" · ")}
        </div>
      )}
    </article>
  );
}
