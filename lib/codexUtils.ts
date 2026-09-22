import { CodexGroup, PokemonEntry, Rarity, RarityFlags } from "@/types";

export const rarityOrder: Rarity[] = ["uncommon", "rare", "epic", "legendary"];

export const rarityLabels: Record<Rarity, string> = {
  uncommon: "Incomum",
  rare: "Rara",
  epic: "Épica",
  legendary: "Lendária",
};

export function pokemonLevel(pokemon: PokemonEntry): number {
  let level = 0;
  for (const rarity of rarityOrder) {
    if (!pokemon.codex[rarity]) break;
    level += 1;
  }
  return level;
}

export function flagsForLevel(level: number): RarityFlags {
  return {
    uncommon: level >= 1,
    rare: level >= 2,
    epic: level >= 3,
    legendary: level >= 4,
  };
}

export function groupBonus(group: CodexGroup): number {
  if (!group.pokemon.length) return 0;
  return group.pokemon.reduce((sum, pokemon) => sum + pokemonLevel(pokemon), 0) / group.pokemon.length;
}

export function groupStage(group: CodexGroup) {
  const levels = group.pokemon.map(pokemonLevel);
  const minimum = Math.min(...levels);
  const targetLevel = minimum >= 4 ? 4 : minimum + 1;
  const count = levels.filter((level) => level >= targetLevel).length;

  return {
    count,
    total: group.pokemon.length,
    targetLevel,
    completed: minimum >= 4,
    label: minimum >= 4 ? "em Lendária" : targetLevel === 1 ? "descobertos" : `em ${rarityLabels[rarityOrder[targetLevel - 1]]}`,
  };
}

export function codexStats(groups: CodexGroup[]) {
  const registrations = groups.reduce(
    (total, group) => total + group.pokemon.reduce((sub, pokemon) => sub + pokemonLevel(pokemon), 0),
    0,
  );
  const maxRegistrations = groups.reduce((total, group) => total + group.pokemon.length * 4, 0);
  const levels = groups.reduce((total, group) => total + groupBonus(group), 0);
  const maxLevels = groups.length * 4;

  const bonuses = groups.reduce<Record<string, number>>((acc, group) => {
    acc[group.attribute] = (acc[group.attribute] ?? 0) + groupBonus(group);
    return acc;
  }, {});

  // O jogo calcula o anel de conclusão pelos níveis dos grupos (32,17 / 176),
  // não diretamente por 96 / 524. Mantemos a mesma regra visual.
  const completion = maxLevels ? (levels / maxLevels) * 100 : 0;

  return { registrations, maxRegistrations, completion, levels, maxLevels, bonuses };
}

export function formatNumber(value: number, decimals = 2) {
  return value.toFixed(decimals).replace(".", ",");
}
