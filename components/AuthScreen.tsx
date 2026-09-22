"use client";

import { FormEvent, useState } from "react";
import { nicknameToAuthEmail, normalizeLoginNickname } from "@/lib/authUsername";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "signup";

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("login");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;

    setBusy(true);
    setMessage("");
    setError("");

    try {
      const cleanNickname = nickname.normalize("NFKC").trim();
      if (cleanNickname.length < 2) throw new Error("Use um nickname com pelo menos 2 caracteres.");
      if (cleanNickname.length > 32) throw new Error("O nickname pode ter no máximo 32 caracteres.");
      if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");

      // O Supabase Auth precisa de um identificador do tipo e-mail para senha.
      // Geramos um identificador técnico a partir do nickname e nunca o exibimos.
      const authEmail = await nicknameToAuthEmail(cleanNickname);

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: authEmail,
          password,
          options: {
            data: {
              nickname: cleanNickname,
              login_nickname: normalizeLoginNickname(cleanNickname),
            },
          },
        });

        if (signUpError) {
          // Supabase costuma retornar uma mensagem genérica quando o usuário já existe.
          if (/already|registered|exists/i.test(signUpError.message)) {
            throw new Error("Esse nickname já está em uso. Escolha outro.");
          }
          throw signUpError;
        }

        // Como o e-mail é técnico e não existe de verdade, confirmação de e-mail
        // precisa estar DESLIGADA no projeto Supabase.
        if (!data.session) {
          throw new Error("A conta foi criada, mas o Supabase está exigindo confirmação de e-mail. Desative 'Confirm email' no Supabase Auth e tente novamente com outro nickname ou remova esta conta de teste.");
        }

        setMessage("Conta criada. Agora entre no clã usando o código compartilhado no grupo.");
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password,
        });
        if (loginError) throw new Error("Nickname ou senha incorretos.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Não foi possível concluir a autenticação.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">CLAN <span>CODEX</span></div>
        <p className="auth-eyebrow">Codex colaborativo do clã</p>
        <h1>{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="auth-copy">
          Cada jogador tem seu próprio Codex, inventário, sobras e necessidades. Você só consegue editar os seus dados; os aliados do mesmo clã podem visualizar.
        </p>

        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Login</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); setMessage(""); }}>Cadastro</button>
        </div>

        <form onSubmit={submit} className="auth-form">
          <label>
            Nickname
            <input
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Seu nick no jogo"
              minLength={2}
              maxLength={32}
              required
              autoComplete="username"
              spellCheck={false}
            />
          </label>

          <label>
            Senha
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="mínimo 6 caracteres"
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {error && <div className="form-message form-message--error">{error}</div>}
          {message && <div className="form-message form-message--ok">{message}</div>}

          <button className="primary-action" type="submit" disabled={busy}>
            {busy ? "Aguarde…" : mode === "login" ? "Entrar no Clan Codex" : "Criar minha conta"}
          </button>
        </form>

        <p className="auth-footnote">
          Não usamos e-mail. Se você esquecer a senha, o owner do clã pode gerar uma senha temporária para você.
        </p>
      </section>
    </main>
  );
}
