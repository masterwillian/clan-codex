"use client";

export type DepositRarity =
  | "weak"
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export type DepositFormat = "market-cards" | "team-grid";

export type DepositSpeciesRow = {
  pokemonId: number | null;
  name: string;
  counts: Record<DepositRarity, number>;
  total: number;
};

export type DepositImportResult = {
  format: DepositFormat;
  totalPokemon: number;
  totalSpecies: number;
  totals: Record<DepositRarity, number>;
  species: DepositSpeciesRow[];
  skippedCards: number;
};

const EMPTY_COUNTS = (): Record<DepositRarity, number> => ({
  weak: 0,
  common: 0,
  uncommon: 0,
  rare: 0,
  epic: 0,
  legendary: 0,
});

const TEXT_RARITIES: Array<[string, DepositRarity]> = [
  ["Lendária", "legendary"],
  ["Lendaria", "legendary"],
  ["Épica", "epic"],
  ["Epica", "epic"],
  ["Incomum", "uncommon"],
  ["Rara", "rare"],
  ["Comum", "common"],
  ["Fraca", "weak"],
];

function spriteIdFromCard(card: Element) {
  const sprite = card.querySelector('img[src*="/sprites/"]');
  const src = sprite?.getAttribute("src") ?? "";
  const match = src.match(/\/sprites\/(\d+)\.png/i);
  return match ? Number(match[1]) : null;
}

function rarityFromMarketCard(card: Element): DepositRarity | null {
  const text = card.textContent ?? "";
  for (const [label, rarity] of TEXT_RARITIES) {
    if (text.includes(label)) return rarity;
  }

  // Fallback caso o jogo altere o texto, mas preserve as CSS vars.
  return rarityFromGridCard(card);
}

function rarityFromGridCard(card: Element): DepositRarity | null {
  const html = card.innerHTML;

  if (html.includes("var(--rarity-legendary)")) return "legendary";
  if (html.includes("var(--rarity-epic)")) return "epic";
  if (html.includes("var(--rarity-rare)")) return "rare";
  if (html.includes("var(--rarity-uncommon)")) return "uncommon";
  if (html.includes("var(--rarity-common)")) return "common";

  // No segundo formato, "Fraca" usa a cor cinza diretamente em vez de CSS var.
  if (/rgb\(\s*126\s*,\s*136\s*,\s*154\s*\)/i.test(html)) return "weak";

  return null;
}

function pushCard(
  rows: Map<string, DepositSpeciesRow>,
  name: string,
  pokemonId: number | null,
  rarity: DepositRarity,
) {
  const cleanName = name.trim();
  const key = pokemonId != null ? `id:${pokemonId}` : `name:${cleanName.toLocaleLowerCase("pt-BR")}`;
  const existing = rows.get(key) ?? {
    pokemonId,
    name: cleanName,
    counts: EMPTY_COUNTS(),
    total: 0,
  };

  existing.counts[rarity] += 1;
  existing.total += 1;
  rows.set(key, existing);
}

export function parseDepositHtml(rawHtml: string): DepositImportResult {
  const html = rawHtml.trim();
  if (!html) throw new Error("Cole o HTML do depósito antes de analisar.");

  const document = new DOMParser().parseFromString(html, "text/html");
  const rows = new Map<string, DepositSpeciesRow>();
  let skippedCards = 0;

  const marketCards = Array.from(document.querySelectorAll("button.mkt-slab"));
  let format: DepositFormat;

  if (marketCards.length > 0) {
    format = "market-cards";

    for (const card of marketCards) {
      const name = card.querySelector(".mkt-name")?.textContent?.trim() ?? "";
      const rarity = rarityFromMarketCard(card);

      if (!name || !rarity) {
        skippedCards += 1;
        continue;
      }

      pushCard(rows, name, spriteIdFromCard(card), rarity);
    }
  } else {
    format = "team-grid";

    // O STORAGE do jogo também pode renderizar os Pokémon do time acima do Box.
    // Quando .team-boxscroll existe, limitamos a leitura ao Box para não contar
    // o mesmo Pokémon duas vezes. Versões/idiomas diferentes usam Nv ou Lv.
    const gridScope = document.querySelector(".team-boxscroll") ?? document;
    const gridCards = Array.from(gridScope.querySelectorAll('button[title]')).filter((card) => {
      const title = card.getAttribute("title") ?? "";
      return /\s(?:Nv|Lv)\.?\s*\d+\s*$/i.test(title) && Boolean(card.querySelector('img[src*="/sprites/"]'));
    });

    if (gridCards.length === 0) {
      throw new Error(
        "Não reconheci esse HTML como um depósito suportado. Copie o bloco completo do depósito e tente novamente.",
      );
    }

    for (const card of gridCards) {
      const title = card.getAttribute("title") ?? "";
      const match = title.match(/^(.*?)\s+(?:Nv|Lv)\.?\s*\d+\s*$/i);
      const name = match?.[1]?.trim() ?? "";
      const rarity = rarityFromGridCard(card);

      if (!name || !rarity) {
        skippedCards += 1;
        continue;
      }

      pushCard(rows, name, spriteIdFromCard(card), rarity);
    }
  }

  const species = Array.from(rows.values()).sort(
    (a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"),
  );

  const totals = EMPTY_COUNTS();
  for (const row of species) {
    (Object.keys(totals) as DepositRarity[]).forEach((rarity) => {
      totals[rarity] += row.counts[rarity];
    });
  }

  const totalPokemon = Object.values(totals).reduce((sum, value) => sum + value, 0);

  if (totalPokemon === 0) {
    throw new Error("O HTML foi reconhecido, mas nenhum Pokémon com raridade válida foi encontrado.");
  }

  return {
    format,
    totalPokemon,
    totalSpecies: species.length,
    totals,
    species,
    skippedCards,
  };
}
