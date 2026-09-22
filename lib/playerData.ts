import { baseGroups, rarities } from "@/lib/mockData";
import { CodexGroup, CodexProgressRow, InventoryRow, Player, ProfileRow, RarityFlags, RarityNumbers } from "@/types";

const zeroNumbers = (): RarityNumbers => ({ uncommon: 0, rare: 0, epic: 0, legendary: 0 });
const zeroFlags = (): RarityFlags => ({ uncommon: false, rare: false, epic: false, legendary: false });

export function blankGroups(): CodexGroup[] {
  const groups = structuredClone(baseGroups);
  for (const group of groups) {
    for (const pokemon of group.pokemon) {
      pokemon.available = zeroNumbers();
      pokemon.need = zeroFlags();
      pokemon.codex = zeroFlags();
    }
  }
  return groups;
}

function newestTimestamp(values: string[]) {
  return values.reduce((latest, current) => {
    if (!latest) return current;
    return new Date(current).getTime() > new Date(latest).getTime() ? current : latest;
  }, "");
}

export function hydratePlayer(
  profile: ProfileRow,
  inventoryRows: InventoryRow[],
  progressRows: CodexProgressRow[],
): Player {
  const groups = blankGroups();
  const ownInventory = inventoryRows.filter((row) => row.user_id === profile.id);
  const ownProgress = progressRows.filter((row) => row.user_id === profile.id);
  const inventoryMap = new Map(ownInventory.map((row) => [`${row.pokemon_id}:${row.rarity}`, row]));
  const progressMap = new Map(ownProgress.map((row) => [`${row.pokemon_id}:${row.rarity}`, row]));

  for (const group of groups) {
    for (const pokemon of group.pokemon) {
      for (const rarity of rarities) {
        const inventory = inventoryMap.get(`${pokemon.id}:${rarity.key}`);
        if (inventory) {
          pokemon.available[rarity.key] = inventory.available_quantity;
          pokemon.need[rarity.key] = Boolean(inventory.wanted);
        }
        const progress = progressMap.get(`${pokemon.id}:${rarity.key}`);
        pokemon.codex[rarity.key] = Boolean(progress?.completed);
        if (pokemon.codex[rarity.key]) pokemon.need[rarity.key] = false;
      }
    }
  }

  const updatedAt = newestTimestamp([
    profile.updated_at,
    ...ownInventory.map((row) => row.updated_at),
    ...ownProgress.map((row) => row.updated_at),
  ]) || profile.updated_at;

  return { id: profile.id, nickname: profile.nickname, groups, updatedAt };
}
