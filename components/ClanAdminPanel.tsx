"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Player } from "@/types";

type Props = {
  meId: string;
  ownerId: string;
  inviteCode: string;
  players: Player[];
  onRegenerate: () => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
  onTransfer: (userId: string) => Promise<void>;
};

export default function ClanAdminPanel({ meId, ownerId, inviteCode, players, onRegenerate, onRemove, onTransfer }: Props) {
  const isOwner = meId === ownerId;
  const [busy, setBusy] = useState("");
  const [tempPassword, setTempPassword] = useState<{ nickname: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  if (!isOwner) return null;

  const run = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setError("");
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível concluir a ação."); } finally { setBusy(""); }
  };

  const resetPassword = async (player: Player) => {
    if (!supabase) return;
    if (!confirm(`Gerar uma nova senha temporária para ${player.nickname}?\n\nA senha atual deixará de funcionar imediatamente.`)) return;
    setBusy(`password-${player.id}`);
    setError("");
    setTempPassword(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou.");
      const response = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: player.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível resetar a senha.");
      setTempPassword({ nickname: payload.nickname, password: payload.temporaryPassword });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível resetar a senha.");
    } finally {
      setBusy("");
    }
  };

  const copyTemp = async () => {
    if (!tempPassword) return;
    await navigator.clipboard.writeText(tempPassword.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <section className="admin-panel">
      <div className="admin-heading"><h2>Administração do clã</h2><span>Owner</span></div>
      {error && <div className="admin-error">{error}</div>}
      {tempPassword && (
        <div className="admin-temp-password">
          <small>Senha temporária de {tempPassword.nickname}</small>
          <b>{tempPassword.password}</b>
          <button type="button" onClick={() => void copyTemp()}>{copied ? "✓ Copiada" : "Copiar senha"}</button>
          <p>Envie pelo WhatsApp e peça para a pessoa trocar a senha em Configurações depois de entrar.</p>
        </div>
      )}
      <div className="admin-code">
        <small>Código atual</small><b>{inviteCode}</b>
        <button disabled={Boolean(busy)} onClick={() => {
          if (confirm("Gerar um novo código de convite?\n\nO código atual deixará de funcionar imediatamente.")) void run("code", onRegenerate);
        }}>Gerar novo código</button>
      </div>
      <div className="admin-members">
        {players.map((player) => (
          <div className="admin-member" key={player.id}>
            <span><b>{player.nickname}</b><small>{player.id === ownerId ? "Owner" : "Membro"}</small></span>
            {player.id !== meId && (
              <div>
                <button disabled={Boolean(busy)} onClick={() => void resetPassword(player)}>Resetar senha</button>
                <button disabled={Boolean(busy)} onClick={() => {
                  if (confirm(`Remover ${player.nickname} do clã?\n\nA conta e o Codex serão preservados, mas entregas pendentes serão canceladas.`)) void run(`remove-${player.id}`, () => onRemove(player.id));
                }}>Remover</button>
                <button disabled={Boolean(busy)} onClick={() => {
                  if (confirm(`Transferir a propriedade do clã para ${player.nickname}?\n\nVocê deixará de ser owner.`)) void run(`transfer-${player.id}`, () => onTransfer(player.id));
                }}>Tornar owner</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
