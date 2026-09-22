export type Rarity = "uncommon" | "rare" | "epic" | "legendary";

export type RarityNumbers = Record<Rarity, number>;
export type RarityFlags = Record<Rarity, boolean>;

export type PokemonEntry = {
  id: number;
  name: string;
  sprite: string;
  /** Estoque total importado do depósito. A quantidade realmente trocável é calculada pelas regras do Codex e pelas trocas pendentes. */
  available: RarityNumbers;
  /** Necessidade derivada automaticamente: true quando falta no Codex e o depósito está zerado. */
  need: RarityFlags;
  codex: RarityFlags;
};

export type CodexGroup = {
  id: number;
  attribute: "Velocidade" | "Ataque" | "Atq. Especial" | "Defesa" | "HP" | "Def. Especial";
  short: string;
  bonus: number;
  color: string;
  pokemon: PokemonEntry[];
};

export type Player = {
  id: string;
  nickname: string;
  groups: CodexGroup[];
  updatedAt: string;
};

export type Clan = {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
};

export type ProfileRow = {
  id: string;
  nickname: string;
  avatar_url: string | null;
  clan_id: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryRow = {
  user_id: string;
  pokemon_id: number;
  rarity: Rarity;
  quantity: number;
  available_quantity: number;
  wanted_quantity: number;
  wanted: boolean;
  updated_at: string;
};

export type CodexProgressRow = {
  user_id: string;
  pokemon_id: number;
  rarity: Rarity;
  completed: boolean;
  updated_at: string;
};

export type TradeStatus = "pending" | "sent" | "completed" | "cancelled";

export type TradeRow = {
  id: string;
  clan_id: string;
  sender_id: string;
  receiver_id: string;
  sender_nickname: string | null;
  receiver_nickname: string | null;
  status: TradeStatus;
  created_at: string;
  updated_at: string;
};

export type TradeItemRow = {
  id: string;
  trade_id: string;
  pokemon_id: number;
  rarity: Rarity;
  quantity: number;
};

export type MatchItem = {
  playerId: string;
  nickname: string;
  pokemonId: number;
  pokemon: string;
  rarity: Rarity;
  rarityLabel: string;
  qty: 1;
  available: number;
  freeAvailable: number;
};

export type TradeDisplayItem = {
  pokemonId: number;
  pokemon: string;
  rarity: Rarity;
  rarityLabel: string;
  quantity: number;
};

export type TradeView = TradeRow & {
  senderNickname: string;
  receiverNickname: string;
  items: TradeDisplayItem[];
};
