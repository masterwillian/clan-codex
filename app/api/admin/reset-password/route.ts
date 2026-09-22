import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const admin = adminClient();
  if (!admin) {
    return NextResponse.json({ error: "Configure SUPABASE_SERVICE_ROLE_KEY no servidor/Vercel para resetar senhas." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sessão ausente." }, { status: 401 });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const targetId = typeof body.userId === "string" ? body.userId : "";
  if (!targetId || targetId === userData.user.id) {
    return NextResponse.json({ error: "Escolha outro membro. Para sua própria senha use Configurações." }, { status: 400 });
  }

  const { data: requester, error: requesterError } = await admin
    .from("profiles")
    .select("id,clan_id")
    .eq("id", userData.user.id)
    .single();
  if (requesterError || !requester?.clan_id) return NextResponse.json({ error: "Você não pertence a um clã." }, { status: 403 });

  const { data: clan, error: clanError } = await admin
    .from("clans")
    .select("id,owner_id")
    .eq("id", requester.clan_id)
    .single();
  if (clanError || clan?.owner_id !== userData.user.id) return NextResponse.json({ error: "Somente o owner pode resetar senha de membros." }, { status: 403 });

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id,nickname,clan_id")
    .eq("id", targetId)
    .single();
  if (targetError || target?.clan_id !== requester.clan_id) return NextResponse.json({ error: "Esse jogador não pertence ao seu clã." }, { status: 404 });

  const temporaryPassword = `CC-${randomBytes(6).toString("base64url")}-9a!`;
  const { error: resetError } = await admin.auth.admin.updateUserById(targetId, { password: temporaryPassword });
  if (resetError) return NextResponse.json({ error: resetError.message }, { status: 400 });

  return NextResponse.json({ ok: true, nickname: target.nickname, temporaryPassword });
}
