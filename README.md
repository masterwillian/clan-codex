# Clan Codex v5.7 — projeto completo

Esta versão parte da **v5.3 hotfix completa** e incorpora os importadores automáticos de **Depósito** e **Codex**.

## Importar Codex

Abra `Importar → Sincronizar Codex` na navegação e cole o HTML do Codex do jogo. O parser lê:

- ID do grupo;
- Pokémon e ID pelo `/sprites/NN.png`;
- `não iniciado`;
- maior raridade registrada: Incomum, Rara, Épica ou Lendária.

O progresso é cumulativo:

- Não iniciado = I — / R — / E — / L —
- Incomum = I ✓
- Rara = I ✓ / R ✓
- Épica = I ✓ / R ✓ / E ✓
- Lendária = I ✓ / R ✓ / E ✓ / L ✓

### HTML parcial do Codex

O jogo pode renderizar somente parte dos grupos e mostrar algo como `Mais atributos +32`.
Quando isso acontecer, o importador **não zera Pokémon ausentes**: ele altera somente os cards realmente presentes no HTML.

Para atualizar tudo de uma vez, expanda todos os atributos no jogo e depois copie o HTML.

## Importar Depósito

Abra `Importar → Sincronizar depósito` na navegação e cole o HTML inteiro do depósito. O parser reconhece os dois formatos testados:

1. cards `.mkt-slab`, com nome em `.mkt-name` e raridade textual/CSS;
2. grade com `button[title="Pokemon NvX"]` e raridade pelo indicador CSS.

O navegador conta Fraca, Comum, Incomum, Rara, Épica e Lendária. O app aplica ao perfil as quantidades usadas pelo Clan Codex: **I / R / E / L**.

O ID do sprite é a chave principal e o nome é fallback. A importação do depósito funciona como snapshot: para os Pokémon do catálogo, I/R/E/L refletem o depósito atual.

## Salvamento seguro

Os dois importadores modificam somente o **rascunho local**. Nada é enviado ao Supabase enquanto o usuário não clicar em **Salvar alterações**.

O salvamento da v5.3 continua em lote: um write de `inventory` e um write de `codex_progress`, independentemente de quantos campos foram alterados.

## Recursos já presentes

- Perfil, Clã, Aliados e Central de Entregas;
- quantidades disponíveis e marcações `Preciso`;
- matches automáticos entre membros;
- histórico de entregas e exportação CSV;
- administração do clã;
- troca de nickname e senha;
- reset de senha pelo Owner;
- salvamento manual com rascunho, descarte e proteção contra sobrescrita;
- paginação do Supabase acima de 1.000 linhas;
- edição rápida em massa;
- filtros `Preciso` e `Disponível`;
- atualização em realtime quando não existem alterações locais pendentes.

## Variáveis de ambiente

O arquivo `.env.local` **não é incluído no ZIP**, porque contém as suas chaves. Copie o `.env.local` da instalação anterior ou crie um baseado em `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
```

`SUPABASE_SERVICE_ROLE_KEY` é somente de servidor. Nunca use prefixo `NEXT_PUBLIC_` nela e não publique essa chave no GitHub.

## Instalar e rodar

```bash
npm install
npm run build
npm run dev
```

Depois abra `http://localhost:3000`.

## Banco já existente

Se você já estava usando a v5.3/v5.4/v5.5/v5.6 com o mesmo Supabase, mantenha o mesmo `.env.local` e rode **somente uma vez**:

`supabase/migration_v5_7.sql`

Essa migration limpa necessidades incompatíveis com o Codex e cria proteções para que elas não voltem.

## Projeto novo do zero

Em um Supabase novo, rode nesta ordem:

1. `supabase/schema.sql`
2. `supabase/seed_kanto.sql`
3. `supabase/migration_v5.sql`
4. `supabase/migration_v5_2.sql`
5. `supabase/migration_v5_7.sql`
6. Em Authentication → Email, deixe cadastro ligado e `Confirm Email` desligado.
7. Configure `.env.local`.

A v5.7 adiciona `migration_v5_7.sql`, que garante no banco que raridades já concluídas no Codex não podem permanecer marcadas como “Preciso”. Em um Supabase que já estava na v5.6, rode somente esse arquivo novo uma vez.

## Estrutura principal

```text
app/
  page.tsx
  globals.css
  layout.tsx
  api/
components/
  AccountSettings.tsx
  AuthScreen.tsx
  BulkInventoryEditor.tsx
  ClanAdminPanel.tsx
  ClanOnboarding.tsx
  CodexBonusPanel.tsx
  CodexGroup.tsx
  CodexImporter.tsx
  DeliveriesHub.tsx
  DepositImporter.tsx
  DepositImporter.module.css
  PendingTradesPanel.tsx
  PokemonCard.tsx
  TradeHistoryPanel.tsx
  TradeSummary.tsx
lib/
  authUsername.ts
  codexImporter.ts
  codexUtils.ts
  depositImporter.ts
  kanto-extracted.json
  mockData.ts
  playerData.ts
  supabase.ts
supabase/
  schema.sql
  seed_kanto.sql
  migration_v5.sql
  migration_v5_2.sql
  migration_v5_7.sql
types/
  index.ts
```


## v5.6 — reorganização da interface

- Os importadores de Depósito e Codex saíram da aba Perfil e agora ficam no botão **Sincronizar** no topo.
- A lateral **Matches atuais** agora agrupa os matches por jogador, em vez de listar Pokémon por Pokémon.
- A Central de Entregas usa navegação **jogador → detalhes**: primeiro mostra cards compactos dos aliados e só abre a lista completa de Pokémon quando o jogador é selecionado.
- Ao clicar num jogador em **Matches atuais**, a aba Entregas abre diretamente nos detalhes daquele aliado.
- Os contadores das abas Entregar/Receber continuam representando o total de matches, não apenas o número de jogadores.


## v5.7 — interface de trocas

- `Importar` agora fica como primeiro item da navegação: Importar | Perfil | Clã | Aliados | Entregas.
- Em Entregas, cada Pokémon aparece uma única vez e contém quatro botões de raridade.
- Raridades já concluídas pelo destinatário aparecem com cadeado e não podem ser selecionadas.
- Uma raridade concluída no Codex não pode ser marcada como `Preciso`; necessidades antigas são limpas automaticamente.
- Para atualizar um projeto v5.6 existente, rode `supabase/migration_v5_7.sql` uma vez no SQL Editor do Supabase.


## v5.8 — proteção do Codex
O estoque importado é total. Para cada Pokémon/raridade ainda não registrado no Codex, 1 unidade fica reservada e não pode ser trocada. Também não é possível pedir uma raridade que já exista no depósito. Em projetos atualizados, rode `supabase/migration_v5_8.sql` uma vez.
