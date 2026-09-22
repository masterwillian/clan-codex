import extracted from "@/lib/kanto-extracted.json";
import { CodexGroup, Rarity, RarityFlags, RarityNumbers } from "@/types";

export const rarities: { key: Rarity; label: string; short: string; color: string }[] = [
  { key: "uncommon", label: "Incomum", short: "I", color: "#27d978" },
  { key: "rare", label: "Raro", short: "R", color: "#4f8cff" },
  { key: "epic", label: "Épico", short: "E", color: "#b45cff" },
  { key: "legendary", label: "Lendário", short: "L", color: "#ffb52e" },
];

const zeroNumbers = (): RarityNumbers => ({ uncommon: 0, rare: 0, epic: 0, legendary: 0 });
const zeroFlags = (): RarityFlags => ({ uncommon: false, rare: false, epic: false, legendary: false });

export const baseGroups: CodexGroup[] = extracted.map((group) => ({
  ...group,
  attribute: group.attribute as CodexGroup["attribute"],
  pokemon: group.pokemon.map((pokemon) => ({
    id: pokemon.id,
    name: pokemon.name,
    sprite: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.id}.png`,
    available: zeroNumbers(),
    need: zeroFlags(),
    codex: zeroFlags(),
  })),
}));
