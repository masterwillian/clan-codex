/**
 * Supabase Auth aceita senha com e-mail/telefone, mas o Clan Codex usa apenas
 * nickname + senha na interface. O nickname é convertido deterministicamente
 * em um e-mail técnico que nunca é exibido ao usuário.
 *
 * Importante: o nickname funciona como nome de login e deve ser tratado como
 * imutável nesta versão. Uma futura troca de nickname deve preservar o login
 * original ou atualizar também o identificador do Auth.
 */
export function normalizeLoginNickname(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
}

export async function nicknameToAuthEmail(nickname: string) {
  const normalized = normalizeLoginNickname(nickname);
  const bytes = new TextEncoder().encode(`clan-codex:${normalized}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  // 160 bits já são mais do que suficientes para evitar colisões no contexto
  // do app, e mantém o local-part confortavelmente abaixo de 64 caracteres.
  return `u${hash.slice(0, 40)}@auth.clancodex.invalid`;
}
