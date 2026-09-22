"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = {
  nickname: string;
  clanName: string;
  isOwner: boolean;
  memberCount: number;
  onClose: () => void;
  onReload: () => Promise<void> | void;
  onLogout: () => Promise<void> | void;
};

export default function AccountSettings({ nickname, clanName, isOwner, memberCount, onClose, onReload, onLogout }: Props) {
  const [nextNickname, setNextNickname] = useState(nickname);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const resetFeedback = () => { setMessage(""); setError(""); };

  const saveNickname = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    resetFeedback();
    const clean = nextNickname.normalize("NFKC").trim();
    if (clean.length < 2 || clean.length > 32) {
      setError("O nickname precisa ter entre 2 e 32 caracteres.");
      return;
    }
    if (clean === nickname) {
      setMessage("O nickname já está assim.");
      return;
    }
    setBusy("nickname");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
      const response = await fetch("/api/account/update-nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nickname: clean }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível alterar o nickname.");
      setMessage("Nickname alterado. Seu novo nickname também passa a ser o nome usado no login.");
      await onReload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível alterar o nickname.");
    } finally {
      setBusy("");
    }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    resetFeedback();
    if (password.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("As duas senhas não coincidem.");
      return;
    }
    setBusy("password");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else {
      setPassword("");
      setPassword2("");
      setMessage("Senha alterada com sucesso.");
    }
    setBusy("");
  };

  const leaveClan = async () => {
    if (!supabase) return;
    resetFeedback();
    if (isOwner && memberCount > 1) {
      setError("Você é o owner. Transfira a propriedade para outro membro antes de sair do clã.");
      return;
    }
    if (!confirm(`Sair do clã ${clanName}?\n\nSua conta e seu Codex serão preservados. Entregas pendentes envolvendo você serão canceladas.`)) return;
    setBusy("leave");
    const { error: rpcError } = await supabase.rpc("leave_clan");
    if (rpcError) setError(rpcError.message);
    else {
      setMessage("Você saiu do clã. Seu Codex continua salvo na sua conta.");
      await onReload();
      onClose();
    }
    setBusy("");
  };

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Configurações da conta">
        <header className="settings-head">
          <div><span>Configurações</span><h2>{nickname}</h2><p>{clanName}</p></div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        {(error || message) && <div className={error ? "form-message form-message--error" : "form-message form-message--ok"}>{error || message}</div>}

        <div className="settings-grid">
          <form className="settings-card" onSubmit={saveNickname}>
            <h3>Alterar nickname</h3>
            <p>O novo nickname passa a ser também seu nome de login.</p>
            <input value={nextNickname} onChange={(event) => setNextNickname(event.target.value)} minLength={2} maxLength={32} required />
            <button className="primary-action" disabled={Boolean(busy)}>{busy === "nickname" ? "Salvando…" : "Salvar nickname"}</button>
          </form>

          <form className="settings-card" onSubmit={savePassword}>
            <h3>Alterar senha</h3>
            <p>Use pelo menos 6 caracteres.</p>
            <input type="password" placeholder="Nova senha" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
            <input type="password" placeholder="Repita a nova senha" value={password2} onChange={(event) => setPassword2(event.target.value)} minLength={6} required />
            <button className="primary-action primary-action--cyan" disabled={Boolean(busy)}>{busy === "password" ? "Alterando…" : "Alterar senha"}</button>
          </form>
        </div>

        <div className="settings-danger">
          <div><b>Sair do clã</b><span>Não apaga sua conta, inventário nem progresso do Codex.</span></div>
          <button type="button" disabled={Boolean(busy)} onClick={() => void leaveClan()}>{busy === "leave" ? "Saindo…" : "Sair do clã"}</button>
        </div>

        <div className="settings-footer">
          <button type="button" onClick={() => void onLogout()}>Sair da conta</button>
          <button type="button" onClick={onClose}>Fechar</button>
        </div>
      </section>
    </div>
  );
}
