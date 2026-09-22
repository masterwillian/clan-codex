"use client";

import { useMemo, useState } from "react";
import type { Player, PokemonEntry } from "@/types";
import { parseDepositHtml, type DepositImportResult } from "@/lib/depositImporter";
import styles from "./DepositImporter.module.css";

type Props = {
  player: Player;
  onPokemonChange: (pokemon: PokemonEntry) => void;
  onClose: () => void;
  embedded?: boolean;
};

const TRACKED = [
  ["uncommon", "Incomum"],
  ["rare", "Rara"],
  ["epic", "Épica"],
  ["legendary", "Lendária"],
] as const;

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export default function DepositImporter({ player, onPokemonChange, onClose, embedded = false }: Props) {
  const [html, setHtml] = useState("");
  const [result, setResult] = useState<DepositImportResult | null>(null);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState(false);

  const catalog = useMemo(() => player.groups.flatMap((group) => group.pokemon), [player.groups]);

  const resolution = useMemo(() => {
    if (!result) return null;

    const byId = new Map<number, PokemonEntry>(
      catalog.map((pokemon): [number, PokemonEntry] => [pokemon.id, pokemon]),
    );
    const byName = new Map<string, PokemonEntry>(
      catalog.map((pokemon): [string, PokemonEntry] => [normalizeName(pokemon.name), pokemon]),
    );
    const matched = new Map<number, (typeof result.species)[number]>();
    const matchedRows = new Set<(typeof result.species)[number]>();
    const unmatched: typeof result.species = [];

    for (const imported of result.species) {
      const pokemon =
        (imported.pokemonId != null ? byId.get(imported.pokemonId) : undefined) ??
        byName.get(normalizeName(imported.name));

      if (pokemon) {
        matched.set(pokemon.id, imported);
        matchedRows.add(imported);
      } else {
        unmatched.push(imported);
      }
    }

    return { matched, matchedRows, unmatched };
  }, [catalog, result]);

  const analyze = () => {
    try {
      setError("");
      setApplied(false);
      setResult(parseDepositHtml(html));
    } catch (caught) {
      setResult(null);
      setError(caught instanceof Error ? caught.message : "Não foi possível analisar o depósito.");
    }
  };

  const applySnapshot = () => {
    if (!result || !resolution) return;

    let changed = 0;

    for (const pokemon of catalog) {
      const imported = resolution.matched.get(pokemon.id);
      const nextAvailable = { ...pokemon.available };
      const nextNeed = { ...pokemon.need };
      let pokemonChanged = false;

      for (const [rarity] of TRACKED) {
        const nextQuantity = imported?.counts[rarity] ?? 0;
        if (nextAvailable[rarity] !== nextQuantity) {
          nextAvailable[rarity] = nextQuantity;
          pokemonChanged = true;
        }
        if ((pokemon.codex[rarity] || nextQuantity > 0) && nextNeed[rarity]) {
          nextNeed[rarity] = false;
          pokemonChanged = true;
        }
      }

      if (!pokemonChanged) continue;

      changed += 1;
      onPokemonChange({
        ...pokemon,
        available: nextAvailable,
        need: nextNeed,
      });
    }

    setApplied(true);
    setError(
      changed === 0
        ? "O depósito já é igual ao rascunho atual."
        : `${changed} Pokémon foram atualizados no rascunho. Clique em “Salvar alterações” para enviar ao servidor.`,
    );
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <b>Importar depósito</b>
          <span>
            Cole o HTML inteiro. O navegador conta os Pokémon localmente; o HTML bruto não é enviado ao banco.
          </span>
        </div>
        {!embedded ? <button type="button" className={styles.close} onClick={onClose}>Fechar</button> : null}
      </div>

      <textarea
        className={styles.textarea}
        value={html}
        onChange={(event) => {
          setHtml(event.target.value);
          setResult(null);
          setApplied(false);
          setError("");
        }}
        placeholder="Cole aqui o HTML do depósito…"
        spellCheck={false}
      />

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={analyze} disabled={!html.trim()}>
          Analisar HTML
        </button>
        <span>{html.length ? `${html.length.toLocaleString("pt-BR")} caracteres colados` : "Nenhum HTML colado"}</span>
      </div>

      {result && resolution ? (
        <>
          <div className={styles.summary}>
            <div><b>{result.totalPokemon}</b><span>Pokémon</span></div>
            <div><b>{result.totalSpecies}</b><span>espécies</span></div>
            <div><b>{resolution.matched.size}</b><span>reconhecidas</span></div>
            <div><b>{resolution.unmatched.length}</b><span>fora do catálogo</span></div>
          </div>

          <div className={styles.meta}>
            Formato detectado: <b>{result.format === "market-cards" ? "Depósito / mercado" : "Grade do depósito"}</b>
            {" · "}Fraca {result.totals.weak}
            {" · "}Comum {result.totals.common}
            {" · "}Incomum {result.totals.uncommon}
            {" · "}Rara {result.totals.rare}
            {" · "}Épica {result.totals.epic}
            {" · "}Lendária {result.totals.legendary}
            {result.skippedCards ? ` · ${result.skippedCards} card(s) ignorado(s)` : ""}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Pokémon</th>
                  <th>I</th>
                  <th>R</th>
                  <th>E</th>
                  <th>L</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.species.map((row) => {
                  const matched = resolution.matchedRows.has(row);
                  return (
                    <tr key={`${row.pokemonId ?? "name"}-${row.name}`}>
                      <td><b>{row.name}</b>{row.pokemonId != null ? <small> #{row.pokemonId}</small> : null}</td>
                      <td>{row.counts.uncommon}</td>
                      <td>{row.counts.rare}</td>
                      <td>{row.counts.epic}</td>
                      <td>{row.counts.legendary}</td>
                      <td>{row.total}</td>
                      <td className={matched ? styles.ok : styles.warn}>{matched ? "OK" : "Não mapeado"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {resolution.unmatched.length > 0 ? (
            <p className={styles.warning}>
              {resolution.unmatched.length} espécie(s) não existem no catálogo atual e não serão aplicadas:
              {" "}{resolution.unmatched.map((row) => row.name).join(", ")}.
            </p>
          ) : null}

          <div className={styles.applyBox}>
            <div>
              <b>Aplicar como snapshot</b>
              <span>
                Substitui as quantidades I/R/E/L do rascunho atual. Espécies ausentes no HTML ficam com 0.
                O progresso do Codex não é alterado. Se uma raridade passar a ter estoque, “Preciso” será desligado automaticamente e 1 unidade ficará protegida até entrar no Codex.
              </span>
            </div>
            <button type="button" className={styles.apply} onClick={applySnapshot}>
              {applied ? "Aplicado ao rascunho" : "Aplicar ao rascunho"}
            </button>
          </div>
        </>
      ) : null}

      {error ? <p className={applied ? styles.success : styles.error}>{error}</p> : null}
    </section>
  );
}
