"use client";

import { useMemo, useState } from "react";
import { TradeView } from "@/types";

type Props = {
  trades: TradeView[];
  limit?: number;
  currentUserId?: string;
};

type Direction = "all" | "sent" | "received";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function csvEscape(value: string | number) {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  text = text.replace(/"/g, '""');
  return `"${text}"`;
}

export default function TradeHistoryPanel({ trades, limit = 16, currentUserId }: Props) {
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<Direction>("all");

  const completed = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return trades
      .filter((trade) => trade.status === "completed")
      .filter((trade) => {
        if (!currentUserId || direction === "all") return true;
        if (direction === "sent") return trade.sender_id === currentUserId;
        return trade.receiver_id === currentUserId;
      })
      .filter((trade) => {
        if (!q) return true;
        const haystack = [
          trade.senderNickname,
          trade.receiverNickname,
          ...trade.items.flatMap((item) => [item.pokemon, item.rarityLabel]),
        ].join(" ").toLocaleLowerCase("pt-BR");
        return haystack.includes(q);
      });
  }, [trades, search, direction, currentUserId]);

  const visible = completed.slice(0, limit);

  const exportCsv = () => {
    if (!completed.length) return;
    const rows = [["Data", "Doador", "Recebedor", "Pokemon", "Raridade", "Quantidade"]];
    for (const trade of completed) {
      for (const item of trade.items) {
        rows.push([
          new Date(trade.updated_at).toISOString(),
          trade.senderNickname,
          trade.receiverNickname,
          item.pokemon,
          item.rarityLabel,
          String(item.quantity),
        ]);
      }
    }
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clan-codex-historico-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="history-panel">
      <div className="history-heading">
        <div><h2>Histórico de entregas</h2><span>{completed.length} confirmadas no filtro atual</span></div>
        <button type="button" className="history-export" disabled={!completed.length} onClick={exportCsv}>Exportar CSV</button>
      </div>

      <div className="history-filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrar jogador, Pokémon ou raridade…" />
        {currentUserId && (
          <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>
            <option value="all">Todas</option>
            <option value="sent">Enviadas</option>
            <option value="received">Recebidas</option>
          </select>
        )}
      </div>

      {!visible.length && <p className="muted">Nenhuma entrega confirmada corresponde aos filtros.</p>}
      <div className="history-list">
        {visible.map((trade) => (
          <article key={trade.id} className="history-row">
            <div><b>{trade.senderNickname}</b><span>→</span><b>{trade.receiverNickname}</b></div>
            <small>{dateLabel(trade.updated_at)}</small>
            <p>{trade.items.map((item) => `${item.quantity}× ${item.pokemon} ${item.rarityLabel}`).join(" · ")}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
