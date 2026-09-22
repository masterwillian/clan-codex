"use client";

import { TradeView } from "@/types";

type Props = {
  userId: string;
  trades: TradeView[];
  busyId: string;
  onConfirm: (tradeId: string) => Promise<void>;
  onReject: (tradeId: string) => Promise<void>;
  onCancel: (tradeId: string) => Promise<void>;
};

export default function PendingTradesPanel({ userId, trades, busyId, onConfirm, onReject, onCancel }: Props) {
  const pending = trades.filter((trade) => trade.status === "pending" && (trade.sender_id === userId || trade.receiver_id === userId));

  return (
    <div className="side-panel pending-panel">
      <h2>Entregas pendentes</h2>
      {!pending.length && <p className="muted">Nenhuma entrega aguardando confirmação.</p>}
      {pending.map((trade) => {
        const incoming = trade.receiver_id === userId;
        const summary = trade.items.map((item) => `${item.quantity}× ${item.pokemon} ${item.rarityLabel}`).join("\n");
        return (
          <article className="pending-trade" key={trade.id}>
            <div className="pending-trade-title">
              <b>{incoming ? `${trade.senderNickname} → você` : `você → ${trade.receiverNickname}`}</b>
              <small>{trade.items.length} Pokémon</small>
            </div>
            <div className="pending-items">
              {trade.items.map((item, index) => <span key={`${trade.id}-${index}`}>{item.quantity}× {item.pokemon} · {item.rarityLabel}</span>)}
            </div>
            <div className="pending-actions">
              {incoming ? (
                <>
                  <button
                    className="confirm"
                    disabled={busyId === trade.id}
                    onClick={() => {
                      if (confirm(`Confirmar que você recebeu esta entrega?\n\n${summary}\n\nIsso descontará o disponível do doador e removerá seu \"Preciso\" automaticamente.`)) {
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
