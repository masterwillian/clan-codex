"use client";

import { useState } from "react";
import CodexImporter from "@/components/CodexImporter";
import DepositImporter from "@/components/DepositImporter";
import type { Player, PokemonEntry } from "@/types";

type Mode = "deposit" | "codex" | null;

type Props = {
  player: Player;
  onPokemonChange: (pokemon: PokemonEntry) => void;
  onClose: () => void;
};

export default function SyncCenter({ player, onPokemonChange, onClose }: Props) {
  const [mode, setMode] = useState<Mode>(null);

  return (
    <div
      className="sync-center-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="sync-center-modal" role="dialog" aria-modal="true" aria-label="Importar dados">
        <header className="sync-center-head">
          <div>
            <span>Importação</span>
            <h2>{mode === "deposit" ? "Depósito" : mode === "codex" ? "Codex" : "Importar dados do jogo"}</h2>
            <p>
              {mode
                ? "Cole o HTML do jogo, confira a prévia e aplique ao rascunho antes de salvar."
                : "Escolha o que você quer atualizar. O HTML é processado localmente no navegador."}
            </p>
          </div>
          <div className="sync-center-head-actions">
            {mode ? <button type="button" onClick={() => setMode(null)}>← Voltar</button> : null}
            <button type="button" onClick={onClose} aria-label="Fechar sincronização">×</button>
          </div>
        </header>

        {mode === null ? (
          <div className="sync-choice-grid">
            <button type="button" className="sync-choice-card" onClick={() => setMode("deposit")}>
              <span className="sync-choice-icon">D</span>
              <div>
                <b>Sincronizar depósito</b>
                <p>Atualiza automaticamente suas quantidades disponíveis de Incomum, Rara, Épica e Lendária.</p>
                <small>Colar HTML do depósito → revisar contagens → aplicar</small>
              </div>
              <em>→</em>
            </button>

            <button type="button" className="sync-choice-card sync-choice-card--codex" onClick={() => setMode("codex")}>
              <span className="sync-choice-icon">C</span>
              <div>
                <b>Sincronizar Codex</b>
                <p>Atualiza automaticamente o progresso I / R / E / L registrado no seu Codex.</p>
                <small>Colar HTML do Codex → revisar progresso → aplicar</small>
              </div>
              <em>→</em>
            </button>
          </div>
        ) : null}

        {mode === "deposit" ? (
          <DepositImporter
            player={player}
            onPokemonChange={onPokemonChange}
            onClose={() => setMode(null)}
            embedded
          />
        ) : null}

        {mode === "codex" ? (
          <CodexImporter
            player={player}
            onPokemonChange={onPokemonChange}
            onClose={() => setMode(null)}
            embedded
          />
        ) : null}

        {mode === null ? (
          <div className="sync-center-note">
            <b>Depois de aplicar</b>
            <span>As mudanças ficam somente no rascunho até você clicar em “Salvar alterações”.</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}
