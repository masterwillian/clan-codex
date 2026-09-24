"use client";

import { useMemo, useState } from "react";
import { formatRankPoints } from "@/lib/rank";
import type { Player, Rarity, TradeView } from "@/types";
import styles from "./RankPanel.module.css";

type Props = {
  players: Player[];
  trades: TradeView[];
};

type DetailRow = {
  pokemonId: number;
  pokemon: string;
  rarity: Rarity;
  rarityLabel: string;
  donated: number;
  received: number;
  donatedPoints: number;
  receivedPoints: number;
};

const rarityOrder: Rarity[] = ["uncommon", "rare", "epic", "legendary"];

export default function RankPanel({ players, trades }: Props) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const completed = useMemo(
    () => trades.filter((trade) => trade.status === "completed"),
    [trades],
  );

  const ranking = useMemo(() => {
    return players
      .map((player) => {
        let donatedPoints = 0;
        let receivedPoints = 0;
        let donatedUnits = 0;
        let receivedUnits = 0;

        for (const trade of completed) {
          const points = trade.items.reduce((sum, item) => sum + (item.rankPoints ?? 0), 0);
          const units = trade.items.reduce((sum, item) => sum + item.quantity, 0);

          if (trade.sender_id === player.id) {
            donatedPoints += points;
            donatedUnits += units;
          }
          if (trade.receiver_id === player.id) {
            receivedPoints += points;
            receivedUnits += units;
          }
        }

        return {
          player,
          donatedPoints,
          receivedPoints,
          balance: donatedPoints - receivedPoints,
          donatedUnits,
          receivedUnits,
        };
      })
      .sort((a, b) => b.balance - a.balance || b.donatedPoints - a.donatedPoints || a.player.nickname.localeCompare(b.player.nickname, "pt-BR"));
  }, [players, completed]);

  const selected = ranking.find((entry) => entry.player.id === selectedPlayerId) ?? null;

  const details = useMemo(() => {
    if (!selected) return [] as DetailRow[];

    const grouped = new Map<string, DetailRow>();

    for (const trade of completed) {
      const isDonor = trade.sender_id === selected.player.id;
      const isReceiver = trade.receiver_id === selected.player.id;
      if (!isDonor && !isReceiver) continue;

      for (const item of trade.items) {
        const key = `${item.pokemonId}:${item.rarity}`;
        const current = grouped.get(key) ?? {
          pokemonId: item.pokemonId,
          pokemon: item.pokemon,
          rarity: item.rarity,
          rarityLabel: item.rarityLabel,
          donated: 0,
          received: 0,
          donatedPoints: 0,
          receivedPoints: 0,
        };

        if (isDonor) {
          current.donated += item.quantity;
          current.donatedPoints += item.rankPoints ?? 0;
        }
        if (isReceiver) {
          current.received += item.quantity;
          current.receivedPoints += item.rankPoints ?? 0;
        }

        grouped.set(key, current);
      }
    }

    return [...grouped.values()].sort((a, b) =>
      a.pokemon.localeCompare(b.pokemon, "pt-BR") ||
      rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity)
    );
  }, [selected, completed]);

  const rarityTotals = useMemo(() => {
    const initial: Record<Rarity, { donated: number; received: number }> = {
      uncommon: { donated: 0, received: 0 },
      rare: { donated: 0, received: 0 },
      epic: { donated: 0, received: 0 },
      legendary: { donated: 0, received: 0 },
    };
    for (const row of details) {
      initial[row.rarity].donated += row.donated;
      initial[row.rarity].received += row.received;
    }
    return initial;
  }, [details]);

  return (
    <section className={styles.shell}>
      <div className={styles.intro}>
        <div>
          <span>CONTRIBUIÇÃO DO CLÃ</span>
          <h2>Rank de doações</h2>
          <p>O saldo aumenta quando você doa e diminui quando recebe. A pontuação usa o valor fixo do Pokémon e o multiplicador da raridade gravados no momento da troca.</p>
        </div>
        <div className={styles.formula}>
          <small>Fórmula</small>
          <b>(valor ÷ 1.000) × raridade</b>
          <span>I 1× · R 1,85× · E 2,12× · L 2,81×</span>
        </div>
      </div>

      <div className={styles.rankList}>
        {ranking.map((entry, index) => (
          <button
            type="button"
            key={entry.player.id}
            className={`${styles.rankRow} ${selectedPlayerId === entry.player.id ? styles.active : ""}`}
            onClick={() => setSelectedPlayerId(entry.player.id)}
          >
            <span className={styles.position}>#{index + 1}</span>
            <span className={styles.avatar}>{entry.player.nickname.slice(0, 1).toUpperCase()}</span>
            <span className={styles.name}>
              <b>{entry.player.nickname}</b>
              <small>{entry.donatedUnits} doados · {entry.receivedUnits} recebidos</small>
            </span>
            <span className={styles.metric}>
              <small>Doou</small>
              <b>+{formatRankPoints(entry.donatedPoints)}</b>
            </span>
            <span className={styles.metric}>
              <small>Recebeu</small>
              <b>-{formatRankPoints(entry.receivedPoints)}</b>
            </span>
            <span className={`${styles.balance} ${entry.balance < 0 ? styles.negative : ""}`}>
              <small>Saldo</small>
              <b>{entry.balance >= 0 ? "+" : ""}{formatRankPoints(entry.balance)}</b>
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <section className={styles.profile}>
          <header>
            <div>
              <small>Histórico de contribuição</small>
              <h3>{selected.player.nickname}</h3>
            </div>
            <button type="button" onClick={() => setSelectedPlayerId(null)}>Fechar</button>
          </header>

          <div className={styles.rarityGrid}>
            {rarityOrder.map((rarity) => (
              <article key={rarity}>
                <b>{rarity === "uncommon" ? "Incomum" : rarity === "rare" ? "Raro" : rarity === "epic" ? "Épico" : "Lendário"}</b>
                <span>Doou {rarityTotals[rarity].donated}</span>
                <span>Recebeu {rarityTotals[rarity].received}</span>
              </article>
            ))}
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Pokémon</th>
                  <th>Raridade</th>
                  <th>Doou</th>
                  <th>Recebeu</th>
                  <th>Pontos doados</th>
                  <th>Pontos recebidos</th>
                </tr>
              </thead>
              <tbody>
                {details.map((row) => (
                  <tr key={`${row.pokemonId}:${row.rarity}`}>
                    <td><b>{row.pokemon}</b></td>
                    <td>{row.rarityLabel}</td>
                    <td>{row.donated}</td>
                    <td>{row.received}</td>
                    <td>{row.donated ? `+${formatRankPoints(row.donatedPoints)}` : "—"}</td>
                    <td>{row.received ? `-${formatRankPoints(row.receivedPoints)}` : "—"}</td>
                  </tr>
                ))}
                {!details.length && (
                  <tr><td colSpan={6}>Nenhuma troca concluída para este jogador.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
