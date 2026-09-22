import type { PokemonEntry, Rarity } from "@/types";

/**
 * Enquanto uma raridade existe no depósito mas ainda não foi registrada no Codex,
 * exatamente 1 unidade é protegida para o próprio jogador.
 */
export function codexProtectedQuantity(pokemon: PokemonEntry, rarity: Rarity) {
  return !pokemon.codex[rarity] && pokemon.available[rarity] > 0 ? 1 : 0;
}

/** O jogador só deve pedir uma raridade que ainda não concluiu e da qual não possui cópia no depósito. */
export function canRequestRarity(pokemon: PokemonEntry, rarity: Rarity) {
  return !pokemon.codex[rarity] && pokemon.available[rarity] <= 0;
}

/** Quantidade potencialmente doável antes de descontar entregas pendentes. */
export function locallyTradeableQuantity(pokemon: PokemonEntry, rarity: Rarity) {
  return Math.max(0, pokemon.available[rarity] - codexProtectedQuantity(pokemon, rarity));
}
