import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function normalizeNickname(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("pt-BR");
}

function authEmailForNickname(value: string) {
  const normalized = normalizeNickname(value);
  const hash = createHash("sha256").update(`clan-codex:${normalized}`, "utf8").digest("hex");
  return `u${hash.slice(0, 40)}@auth.clancodex.invalid`;
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const admin = adminClient();
  if (!admin) {
    return NextResponse.json({ error: "Configure SUPABASE_SERVICE_ROLE_KEY no servidor/Vercel para alterar nickname." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sessão ausente." }, { status: 401 });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const nickname = typeof body.nickname === "string" ? body.nickname.normalize("NFKC").trim() : "";
  if (nickname.length < 2 || nickname.length > 32) {
    return NextResponse.json({ error: "O nickname precisa ter entre 2 e 32 caracteres." }, { status: 400 });
  }

  const userId = userData.user.id;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,nickname,clan_id")
    .eq("id", userId)
    .single();
  if (profileError || !profile) return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });

  if (profile.clan_id) {
    const { data: clanProfiles, error: conflictError } = await admin
      .from("profiles")
      .select("id,nickname")
      .eq("clan_id", profile.clan_id);
    if (conflictError) return NextResponse.json({ error: conflictError.message }, { status: 400 });
    const normalized = normalizeNickname(nickname);
    const conflict = (clanProfiles ?? []).some((entry) => entry.id !== userId && normalizeNickname(entry.nickname) === normalized);
    if (conflict) return NextResponse.json({ error: "Já existe alguém com esse nickname no clã." }, { status: 409 });
  }

  const newEmail = authEmailForNickname(nickname);
  const oldEmail = userData.user.email ?? undefined;
  const oldMetadata = userData.user.user_metadata ?? {};
  const { error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
    user_metadata: {
      ...oldMetadata,
      nickname,
      login_nickname: normalizeNickname(nickname),
    },
  });
  if (authError) {
    const friendly = /already|registered|exists/i.test(authError.message)
      ? "Esse nickname já está sendo usado por outra conta."
      : authError.message;
    return NextResponse.json({ error: friendly }, { status: 409 });
  }

  const { error: updateError } = await admin.from("profiles").update({ nickname }).eq("id", userId);
  if (updateError) {
    if (oldEmail) {
      await admin.auth.admin.updateUserById(userId, {
        email: oldEmail,
        email_confirm: true,
        user_metadata: oldMetadata,
      });
    }
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, nickname });
}
