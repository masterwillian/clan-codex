"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  nickname: string;
  onDone: () => Promise<void> | void;
  onLogout: () => Promise<void> | void;
};

export default function ClanOnboarding({ nickname, onDone, onLogout }: Props) {
  const [clanName, setClanName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState("");

  const createClan = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy("create");
    setError("");
    const { error: rpcError } = await supabase.rpc("create_clan", { p_name: clanName.trim() });
    if (rpcError) setError(rpcError.message);
    else await onDone();
    setBusy(null);
  };

  const joinClan = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy("join");
    setError("");
    const { error: rpcError } = await supabase.rpc("join_clan", { p_invite_code: inviteCode.trim().toUpperCase() });
    if (rpcError) setError(rpcError.message);
    else await onDone();
    setBusy(null);
  };

  return (
    <main className="auth-page">
      <section className="onboarding-card">
        <div className="auth-brand">CLAN <span>CODEX</span></div>
        <p className="auth-eyebrow">Bem-vindo, {nickname}</p>
        <h1>Entre no seu clã</h1>
        <p className="auth-copy">A primeira pessoa cria o clã e compartilha o código. Os outros membros usam o mesmo código para entrar. Cada conta continua com um Codex totalmente separado.</p>

        {error && <div className="form-message form-message--error">{error}</div>}

        <div className="onboarding-grid">
          <form className="onboarding-panel" onSubmit={createClan}>
            <span className="onboarding-number">01</span>
            <h2>Criar o clã</h2>
            <p>Use apenas uma vez. O site gera automaticamente um código privado que você vai mandar no WhatsApp.</p>
            <label>
              Nome do clã
              <input value={clanName} onChange={(event) => setClanName(event.target.value)} placeholder="Ex.: Team Rocket" minLength={2} required />
            </label>
            <button className="primary-action" disabled={busy !== null}>{busy === "create" ? "Criando…" : "Criar clã"}</button>
          </form>

          <form className="onboarding-panel" onSubmit={joinClan}>
            <span className="onboarding-number">02</span>
            <h2>Entrar com código</h2>
            <p>Se alguém do grupo já criou o clã, cole aqui o código privado compartilhado por essa pessoa.</p>
            <label>
              Código do clã
              <input className="invite-input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="A1B2C3D4E5F6" minLength={12} maxLength={12} required />
            </label>
            <button className="primary-action primary-action--cyan" disabled={busy !== null}>{busy === "join" ? "Entrando…" : "Entrar no clã"}</button>
          </form>
        </div>

        <button className="link-button" onClick={() => void onLogout()}>Sair desta conta</button>
      </section>
    </main>
  );
}
