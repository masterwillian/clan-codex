"use client";

import { useEffect, useMemo, useState } from "react";
import { MatchItem } from "@/types";

type Props = {
  me: string;
  ally: string;
  forward: MatchItem[];
  reverse: MatchItem[];
  onCreateTrade: (items: MatchItem[]) => Promise<void>;
};

function matchKey(item: MatchItem) {
  return `${item.pokemonId}:${item.rarity}`;
}

export default function TradeSummary({ me, ally, forward, reverse, onCreateTrade }: Props) {
  const availableKeys = useMemo(() => new Set(forward.map(matchKey)), [forward]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSelected(new Set(forward.map(matchKey)));
  }, [ally, forward]);

  const selectedItems = forward.filter((item) => selected.has(matchKey(item)));

  const toggle = (item: MatchItem) => {
    const key = matchKey(item);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else if (availableKeys.has(key)) next.add(key);
      return next;
    });
  };

  const register = async () => {
    if (!selectedItems.length) return;
    setBusy(true);
    try {
      await onCreateTrade(selectedItems);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const copySummary = async () => {
    const lines = [
      `Trocas ${me} ↔ ${ally}`,
      "",
      `${me} → ${ally}`,
      ...(forward.length ? forward.map((item) => `• 1× ${item.pokemon} ${item.rarityLabel}`) : ["• Nenhuma"]),
      "",
      `${ally} → ${me}`,
      ...(reverse.length ? reverse.map((item) => `• 1× ${item.pokemon} ${item.rarityLabel}`) : ["• Nenhuma"]),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1300);
  };

  return (
    <div className="trade-summary-panel">
      <div className="trade-summary-head">
        <div>
          <h3>Resumo de trocas</h3>
          <span>{me} ↔ {ally}</span>
        </div>
        <button type="button" onClick={() => void copySummary()}>{copied ? "✓ Copiado" : "Copiar resumo"}</button>
      </div>

      <h4>Você → {ally}</h4>
      {forward.length ? (
        <div className="trade-summary-list">
          {forward.map((item) => (
            <label key={matchKey(item)} className="trade-summary-item">
              <input type="checkbox" checked={selected.has(matchKey(item))} onChange={() => toggle(item)} />
              <span><b>1×</b> {item.pokemon} · {item.rarityLabel}</span>
              <small>{item.freeAvailable} livre{item.freeAvailable === 1 ? "" : "s"}</small>
            </label>
          ))}
        </div>
      ) : <p className="muted">Nada que você possa entregar agora.</p>}

      <button type="button" className="trade-register-button" disabled={!selectedItems.length || busy} onClick={() => void register()}>
        {busy ? "Registrando…" : `Registrar entrega${selectedItems.length ? ` (${selectedItems.length})` : ""}`}
      </button>

      <h4>{ally} → Você</h4>
      {reverse.length ? (
        <div className="trade-summary-list trade-summary-list--reverse">
          {reverse.map((item) => (
            <div key={matchKey(item)} className="trade-summary-item trade-summary-item--readonly">
              <span><b>1×</b> {item.pokemon} · {item.rarityLabel}</span>
              <small>{item.freeAvailable} livre{item.freeAvailable === 1 ? "" : "s"}</small>
            </div>
          ))}
        </div>
      ) : <p className="muted">Nenhum match inverso.</p>}
    </div>
  );
}
