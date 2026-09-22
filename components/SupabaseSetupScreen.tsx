export default function SupabaseSetupScreen() {
  return (
    <main className="auth-page">
      <section className="auth-card setup-card">
        <div className="auth-brand">CLAN <span>CODEX</span></div>
        <h1>Conecte o Supabase</h1>
        <p className="auth-copy">Configure as variáveis abaixo em <code>.env.local</code> e reinicie o servidor.</p>
        <pre>{`NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}</pre>
        <p className="setup-note">Se você veio da v4, rode primeiro <b>supabase/migration_v5.sql</b>. Em um projeto novo, rode <b>schema.sql</b>, <b>seed_kanto.sql</b> e depois <b>migration_v5.sql</b>.</p>
      </section>
    </main>
  );
}
