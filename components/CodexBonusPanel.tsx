import { codexStats, formatNumber } from "@/lib/codexUtils";
import { CodexGroup } from "@/types";

const bonusOrder: { key: CodexGroup["attribute"]; icon: string }[] = [
  { key: "HP", icon: "♥" },
  { key: "Ataque", icon: "⚔" },
  { key: "Atq. Especial", icon: "✦" },
  { key: "Defesa", icon: "⬟" },
  { key: "Def. Especial", icon: "✥" },
  { key: "Velocidade", icon: "➤" },
];

const colors: Record<CodexGroup["attribute"], string> = {
  HP: "#27d978",
  Ataque: "#ff4e55",
  "Atq. Especial": "#ca68ff",
  Defesa: "#3eb9ff",
  "Def. Especial": "#f2b72f",
  Velocidade: "#16d7ff",
};

export default function CodexBonusPanel({ groups }: { groups: CodexGroup[] }) {
  const stats = codexStats(groups);
  return (
    <div className="bonus-panel">
      <div className="bonus-heading"><span />Bônus do Codex<span /></div>
      <div className="bonus-list">
        {bonusOrder.map(({ key, icon }) => (
          <div className="bonus-row" key={key} style={{ "--bonus": colors[key] } as React.CSSProperties}>
            <i>{icon}</i><span>{key}</span><b>+{formatNumber(stats.bonuses[key] ?? 0)}</b><small>/50</small>
          </div>
        ))}
      </div>
      <div className="bonus-heading"><span />Bônus especiais<span /></div>
      <div className="bonus-list">
        <div className="bonus-row" style={{ "--bonus": "#4f8cff" } as React.CSSProperties}><i>XP</i><span>XP</span><b>—</b></div>
        <div className="bonus-row" style={{ "--bonus": "#f2b72f" } as React.CSSProperties}><i>●</i><span>Loot</span><b>—</b></div>
        <div className="bonus-row" style={{ "--bonus": "#ca68ff" } as React.CSSProperties}><i>✦</i><span>Shiny</span><b>—</b></div>
      </div>
      <p className="bonus-note">ℹ O outerHTML informa os valores atuais, mas não contém a fórmula dos bônus especiais; por isso eles ficam sem cálculo no MVP.</p>
    </div>
  );
}
