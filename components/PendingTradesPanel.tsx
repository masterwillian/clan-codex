"use client";

import { rarities } from "@/lib/mockData";
import type { TradeView } from "@/types";

type Props = {
  userId: string;
  trades: TradeView[];
  busyId: string;
  onConfirm: (tradeId: string) => Promise<void>;
  onReject: (tradeId: string) => Promise<void>;
  onCancel: (tradeId: string) => Promise<void>;
};

type TradeItem = TradeView["items"][number];

type GroupedTradeItem = {
  pokemonId: number;
  pokemon: string;
  items: TradeItem[];
};

const rarityOrder = new Map<string, number>(rarities.map((rarity, index) => [rarity.key, index]));

function groupTradeItems(items: TradeItem[]): GroupedTradeItem[] {
  const grouped = new Map<number, GroupedTradeItem>();

  for (const item of items) {
    const current = grouped.get(item.pokemonId) ?? {
      pokemonId: item.pokemonId,
      pokemon: item.pokemon,
      items: [],
    };

    current.items.push(item);
    grouped.set(item.pokemonId, current);
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort(
        (a, b) =>
          (rarityOrder.get(a.rarity) ?? Number.MAX_SAFE_INTEGER) -
          (rarityOrder.get(b.rarity) ?? Number.MAX_SAFE_INTEGER),
      ),
    }))
    .sort((a, b) => a.pokemon.localeCompare(b.pokemon, "pt-BR"));
}

function groupedItemLabel(group: GroupedTradeItem) {
  const quantities = new Set(group.items.map((item) => item.quantity));

  if (quantities.size === 1) {
    const quantity = group.items[0]?.quantity ?? 1;
    return `${quantity}× ${group.pokemon} · ${group.items.map((item) => item.rarityLabel).join(", ")}`;
  }

  return `${group.pokemon} · ${group.items.map((item) => `${item.quantity}× ${item.rarityLabel}`).join(", ")}`;
}

export default function PendingTradesPanel({ userId, trades, busyId, onConfirm, onReject, onCancel }: Props) {
  const pending = trades.filter((trade) => trade.status === "pending" && (trade.sender_id === userId || trade.receiver_id === userId));

  return (
    <div className="side-panel pending-panel">
      <h2>Entregas pendentes</h2>
      {!pending.length && <p className="muted">Nenhuma entrega aguardando confirmação.</p>}
      {pending.map((trade) => {
        const incoming = trade.receiver_id === userId;
        const groupedItems = groupTradeItems(trade.items);
        const summary = groupedItems.map((group) => groupedItemLabel(group)).join("\n");

        return (
          <article className="pending-trade" key={trade.id}>
            <div className="pending-trade-title">
              <b>{incoming ? `${trade.senderNickname} → você` : `você → ${trade.receiverNickname}`}</b>
              <small>
                {groupedItems.length} espécie{groupedItems.length === 1 ? "" : "s"} · {trade.items.length} Pokémon
              </small>
            </div>
            <div className="pending-items">
              {groupedItems.map((group) => (
                <span key={`${trade.id}-${group.pokemonId}`}>{groupedItemLabel(group)}</span>
              ))}
            </div>
            <div className="pending-actions">
              {incoming ? (
                <>
                  <button
                    className="confirm"
                    disabled={busyId === trade.id}
                    onClick={() => {
                      if (confirm(`Confirmar que você recebeu esta entrega?\n\n${summary}\n\nIsso descontará o disponível do doador e removerá seu "Preciso" automaticamente.`)) {
                        void onConfirm(trade.id);
                      }
                    }}
                  >Confirmar recebimento</button>
                  <button
                    disabled={busyId === trade.id}
                    onClick={() => {
                      if (confirm(`Recusar a entrega de ${trade.senderNickname}?\n\n${summary}`)) void onReject(trade.id);
                    }}
                  >Recusar</button>
                </>
              ) : (
                <button
                  disabled={busyId === trade.id}
                  onClick={() => {
                    if (confirm(`Cancelar a entrega para ${trade.receiverNickname}?\n\n${summary}`)) void onCancel(trade.id);
                  }}
                >Cancelar</button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
