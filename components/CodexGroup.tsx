"use client";

import PokemonCard from "@/components/PokemonCard";
import { groupBonus, groupStage } from "@/lib/codexUtils";
import { CodexGroup as CodexGroupType, PokemonEntry } from "@/types";

type Props = {
  group: CodexGroupType;
  editable?: boolean;
  onPokemonChange?: (pokemon: PokemonEntry) => void;
  compareGroup?: CodexGroupType;
};

const icons: Record<CodexGroupType["attribute"], string> = {
  Velocidade: "➤",
  Ataque: "⚔",
  "Atq. Especial": "✦",
  Defesa: "⬟",
  HP: "♥",
  "Def. Especial": "✥",
};

export default function CodexGroup({ group, editable, onPokemonChange, compareGroup }: Props) {
  const stage = groupStage(group);
  const bonus = groupBonus(group);
  const percent = Math.round((stage.count / stage.total) * 100);

  return (
    <section className={`codex-group ${stage.completed ? "codex-group--done" : ""}`} style={{ "--group": group.color } as React.CSSProperties}>
      <div className="group-meta">
        <div className="group-icon">{icons[group.attribute]}</div>
        <div>
          <div className="group-title">{group.attribute} <small>[{group.id}]</small></div>
          <div className="group-bonus">{group.short} +{bonus.toFixed(2).replace(".", ",")}</div>
          <div className="progress-track"><i style={{ width: `${percent}%` }} /></div>
        </div>
        <div className="group-count"><b>{stage.count}</b> / {stage.total}<span>{stage.label}</span></div>
      </div>
      <div className="group-pokemon">
        {group.pokemon.map((pokemon) => (
          <PokemonCard
            key={pokemon.id}
            pokemon={pokemon}
            editable={editable}
            onChange={onPokemonChange}
            helperPokemon={compareGroup?.pokemon.find((p) => p.id === pokemon.id) ?? null}
          />
        ))}
      </div>
    </section>
  );
}
