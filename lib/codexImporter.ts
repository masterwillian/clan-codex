"use client";

export type CodexImportRarity = "uncommon" | "rare" | "epic" | "legendary";

export type CodexImportPokemon = {
  pokemonId: number | null;
  name: string;
  groupId: number | null;
  groupAttribute: string;
  highestRarity: CodexImportRarity | null;
  completedLevels: number;
};

export type CodexImportResult = {
  groupsFound: number;
  remainingGroups: number;
  cardsFound: number;
  startedPokemon: number;
  completedRegistrations: number;
  isPartial: boolean;
  pokemon: CodexImportPokemon[];
};

const RARITY_LEVEL: Record<CodexImportRarity, number> = {
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

function parseRarity(title: string): CodexImportRarity | null {
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("nao iniciado")) return null;
  if (normalized.includes("lendaria")) return "legendary";
  if (normalized.includes("epica")) return "epic";
  if (normalized.includes("rara")) return "rare";
  if (normalized.includes("incomum")) return "uncommon";

  return null;
}

function spriteId(card: Element) {
  const src = card.querySelector('img[src*="/sprites/"]')?.getAttribute("src") ?? "";
  const match = src.match(/\/sprites\/(\d+)\.png/i);
  return match ? Number(match[1]) : null;
}

function groupInfo(row: Element) {
  const title = row.getAttribute("title") ?? "";
  const titleMatch = title.match(/grupo\s+(\d+)\s*[—-]\s*(.+)$/i);

  const idText = row.querySelector(".cx-row__id")?.textContent ?? "";
  const idMatch = idText.match(/\[(\d+)\]/);

  const groupId = titleMatch?.[1]
    ? Number(titleMatch[1])
    : idMatch?.[1]
      ? Number(idMatch[1])
      : null;

  const attribute =
    titleMatch?.[2]?.trim() ??
    row.querySelector(".cx-row__t")?.childNodes?.[0]?.textContent?.trim() ??
    "";

  return { groupId, attribute };
}

export function parseCodexHtml(rawHtml: string): CodexImportResult {
  const html = rawHtml.trim();
  if (!html) throw new Error("Cole o HTML do Codex antes de analisar.");

  const document = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(document.querySelectorAll("button.cx-row"));

  if (rows.length === 0) {
    throw new Error(
      "Não reconheci esse HTML como o Codex do jogo. Copie o bloco que contém as linhas de atributos e tente novamente.",
    );
  }

  const pokemon: CodexImportPokemon[] = [];

  for (const row of rows) {
    const { groupId, attribute } = groupInfo(row);
    const cards = Array.from(row.querySelectorAll(".cx-card"));

    for (const card of cards) {
      const name =
        card.querySelector(".cx-card__nm")?.textContent?.trim() ??
        card.querySelector('img[src*="/sprites/"]')?.getAttribute("alt")?.trim() ??
        "";

      if (!name) continue;

      const title = card.getAttribute("title") ?? "";
      const highestRarity = parseRarity(title);

      pokemon.push({
        pokemonId: spriteId(card),
        name,
        groupId,
        groupAttribute: attribute,
        highestRarity,
        completedLevels: highestRarity ? RARITY_LEVEL[highestRarity] : 0,
      });
    }
  }

  const moreButton = document.querySelector(".cx-more");
  const moreText = moreButton?.textContent ?? "";
  const remainingMatch = moreText.match(/\+(\d+)/);
  const remainingGroups = remainingMatch ? Number(remainingMatch[1]) : 0;

  return {
    groupsFound: rows.length,
    remainingGroups,
    cardsFound: pokemon.length,
    startedPokemon: pokemon.filter((entry) => entry.highestRarity !== null).length,
    completedRegistrations: pokemon.reduce((sum, entry) => sum + entry.completedLevels, 0),
    isPartial: remainingGroups > 0,
    pokemon,
  };
}
