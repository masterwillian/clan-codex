import type { Rarity } from "@/types";

export const RARITY_MULTIPLIERS: Record<Rarity, number> = {
  uncommon: 1,
  rare: 1.85,
  epic: 2.12,
  legendary: 2.81,
};

export function calculateRankPoints(price: number, rarity: Rarity, quantity = 1) {
  const base = Math.max(0, price) / 1000;
  return base * RARITY_MULTIPLIERS[rarity] * Math.max(0, quantity);
}

export function formatRankPoints(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}
