"use client";

import { useMemo, useState } from "react";
import type { Player, PokemonEntry, Rarity } from "@/types";
import {
  parseCodexHtml,
  type CodexImportPokemon,
  type CodexImportResult,
  type CodexImportRarity,
} from "@/lib/codexImporter";
import styles from "./DepositImporter.module.css";

type Props = {
  player: Player;
  onPokemonChange: (pokemon: PokemonEntry) => void;
  onClose: () => void;
  embedded?: boolean;
};

const TRACKED: Rarity[] = ["uncommon", "rare", "epic", "legendary"];

const LEVEL: Record<CodexImportRarity, number> = {
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const LABEL: Record<CodexImportRarity, string> = {
  uncommon: "Incomum",
  rare: "Rara",
  epic: "Épica",
  legendary: "Lendária",
};

function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function rarityCompleted(highest: CodexImportRarity | null, rarity: Rarity) {
  if (!highest) return false;
  const rarityLevel =
    rarity === "uncommon" ? 1 :
    rarity === "rare" ? 2 :
    rarity === "epic" ? 3 :
    rarity === "legendary" ? 4 :
    99;

  return rarityLevel <= LEVEL[highest];
}

export default function CodexImporter({ player, onPokemonChange, onClose, embedded = false }: Props) {
  const [html, setHtml] = useState("");
  const [result, setResult] = useState<CodexImportResult | null>(null);
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"error" | "success">("error");

  const catalog = useMemo(
    () => player.groups.flatMap((group) => group.pokemon),
    [player.groups],
  );

  const resolution = useMemo(() => {
    if (!result) return null;

    const byId = new Map(catalog.map((pokemon) => [pokemon.id, pokemon]));
    const byName = new Map(catalog.map((pokemon) => [normalizeName(pokemon.name), pokemon]));
    const matched = new Map<number, CodexImportPokemon>();
    const unmatched: CodexImportPokemon[] = [];

    for (const imported of result.pokemon) {
      const pokemon =
        (imported.pokemonId != null ? byId.get(imported.pokemonId) : undefined) ??
        byName.get(normalizeName(imported.name));

      if (pokemon) matched.set(pokemon.id, imported);
      else unmatched.push(imported);
    }

    return { matched, unmatched };
  }, [catalog, result]);

  const analyze = () => {
    try {
      setMessage("");
      setResult(parseCodexHtml(html));
    } catch (caught) {
      setResult(null);
      setMessageKind("error");
      setMessage(caught instanceof Error ? caught.message : "Não foi possível analisar o Codex.");
    }
  };

  const applyProgress = () => {
    if (!result || !resolution) return;

    let changed = 0;

    // Intencionalmente atualizamos SOMENTE os cards presentes no HTML.
    // Isso torna uma cópia parcial segura: grupos escondidos não são zerados.
    for (const [pokemonId, imported] of resolution.matched) {
      const pokemon = catalog.find((entry) => entry.id === pokemonId);
      if (!pokemon) continue;

      const nextCodex = { ...pokemon.codex };
      const nextNeed = { ...pokemon.need };
      let pokemonChanged = false;

      for (const rarity of TRACKED) {
        const nextValue = rarityCompleted(imported.highestRarity, rarity);
        if (nextCodex[rarity] !== nextValue) {
          nextCodex[rarity] = nextValue;
          pokemonChanged = true;
        }

        // Se o Pokémon já foi concluído nessa raridade, ele deixa de ser uma
        // necessidade automaticamente. Assim o Codex vira a fonte de verdade.
        if (nextValue && nextNeed[rarity]) {
          nextNeed[rarity] = false;
          pokemonChanged = true;
        }
      }

      if (!pokemonChanged) continue;

      changed += 1;
      onPokemonChange({
        ...pokemon,
        codex: nextCodex,
        need: nextNeed,
      });
    }

    setMessageKind("success");
    setMessage(
      changed === 0
        ? "O progresso importado já é igual ao rascunho atual."
        : `${changed} Pokémon tiveram o progresso do Codex atualizado no rascunho. Clique em “Salvar alterações” para enviar ao servidor.`,
    );
  };

  return (
    <section className={styles.panel}>
      <div className={styles.header}>
        <div>
          <b>Importar Codex</b>
          <span>
            Cole o HTML do Codex. O importador lê o maior nível atingido por cada Pokémon e reconstrói I / R / E / L.
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
          setMessage("");
        }}
        placeholder="Cole aqui o HTML do Codex…"
        spellCheck={false}
      />

      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={analyze} disabled={!html.trim()}>
          Analisar Codex
        </button>
        <span>{html.length ? `${html.length.toLocaleString("pt-BR")} caracteres colados` : "Nenhum HTML colado"}</span>
      </div>

      {result && resolution ? (
        <>
          <div className={styles.summary}>
            <div><b>{result.groupsFound}</b><span>grupos encontrados</span></div>
            <div><b>{result.cardsFound}</b><span>Pokémon lidos</span></div>
            <div><b>{result.startedPokemon}</b><span>iniciados</span></div>
            <div><b>{result.completedRegistrations}</b><span>níveis concluídos</span></div>
          </div>

          {result.isPartial ? (
            <p className={styles.warning}>
              HTML parcial: ainda existem {result.remainingGroups} grupo(s) escondido(s) em “Mais atributos”.
              Este import é seguro e só altera os {result.cardsFound} Pokémon presentes aqui. Para atualizar tudo de uma vez,
              abra todos os atributos no jogo antes de copiar o HTML.
            </p>
          ) : (
            <p className={styles.success}>
              Nenhum grupo adicional foi detectado como oculto. Confira a prévia antes de aplicar.
            </p>
          )}

          <div className={styles.meta}>
            {resolution.matched.size} Pokémon reconhecidos no catálogo
            {resolution.unmatched.length ? ` · ${resolution.unmatched.length} não mapeado(s)` : ""}
            {" · "}o depósito não será alterado; “Preciso” é removido automaticamente nas raridades já concluídas
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Pokémon</th>
                  <th>Grupo</th>
                  <th>Maior nível</th>
                  <th>I</th>
                  <th>R</th>
                  <th>E</th>
                  <th>L</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {result.pokemon.map((row, index) => {
                  const matched = row.pokemonId != null
                    ? resolution.matched.get(row.pokemonId) === row
                    : Array.from(resolution.matched.values()).includes(row);

                  return (
                    <tr key={`${row.groupId ?? "g"}-${row.pokemonId ?? row.name}-${index}`}>
                      <td>
                        <b>{row.name}</b>
                        {row.pokemonId != null ? <small> #{row.pokemonId}</small> : null}
                      </td>
                      <td>{row.groupId ?? "—"}</td>
                      <td>{row.highestRarity ? LABEL[row.highestRarity] : "Não iniciado"}</td>
                      {TRACKED.map((rarity) => (
                        <td key={rarity}>{rarityCompleted(row.highestRarity, rarity) ? "✓" : "—"}</td>
                      ))}
                      <td className={matched ? styles.ok : styles.warn}>{matched ? "OK" : "Não mapeado"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {resolution.unmatched.length > 0 ? (
            <p className={styles.warning}>
              Não serão aplicados: {resolution.unmatched.map((row) => row.name).join(", ")}.
            </p>
          ) : null}

          <div className={styles.applyBox}>
            <div>
              <b>Aplicar progresso ao rascunho</b>
              <span>
                Ex.: “Épica” vira Incomum ✓, Rara ✓, Épica ✓, Lendária —.
                Raridades concluídas deixam de ser “Preciso” automaticamente; “Não iniciado” zera I/R/E/L somente para aquele Pokémon presente no HTML.
              </span>
            </div>
            <button type="button" className={styles.apply} onClick={applyProgress}>
              Aplicar ao rascunho
            </button>
          </div>
        </>
      ) : null}

      {message ? (
        <p className={messageKind === "success" ? styles.success : styles.error}>{message}</p>
      ) : null}
    </section>
  );
}
