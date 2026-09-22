"use client";

import { useEffect, useMemo, useState } from "react";
import PendingTradesPanel from "@/components/PendingTradesPanel";
import TradeHistoryPanel from "@/components/TradeHistoryPanel";
import { rarities } from "@/lib/mockData";
import type { MatchItem, Player, PokemonEntry, Rarity, TradeView } from "@/types";

type DeliveryGroup = {
  player: Player;
  matches: MatchItem[];
};

type Props = {
  me: Player;
  giveGroups: DeliveryGroup[];
  receiveGroups: DeliveryGroup[];
  trades: TradeView[];
  busyId: string;
  focusPlayerId?: string;
  onCreateTrade: (receiverId: string, items: MatchItem[]) => Promise<void>;
  onConfirm: (tradeId: string) => Promise<void>;
  onReject: (tradeId: string) => Promise<void>;
  onCancel: (tradeId: string) => Promise<void>;
};

type Section = "give" | "receive" | "confirm" | "history";

type PokemonMatchGroup = {
  pokemonId: number;
  pokemon: string;
  matches: MatchItem[];
};

function matchKey(item: MatchItem) {
  return `${item.pokemonId}:${item.rarity}`;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function filterGroups(groups: DeliveryGroup[], search: string) {
  const q = normalize(search.trim());
  if (!q) return groups;
  return groups
    .map((group) => ({
      ...group,
      matches: group.matches.filter((item) => normalize(`${group.player.nickname} ${item.pokemon} ${item.rarityLabel}`).includes(q)),
    }))
    .filter((group) => group.matches.length > 0);
}

function findPokemon(player: Player, pokemonId: number): PokemonEntry | null {
  for (const group of player.groups) {
    const pokemon = group.pokemon.find((entry) => entry.id === pokemonId);
    if (pokemon) return pokemon;
  }
  return null;
}

function groupMatchesByPokemon(matches: MatchItem[]): PokemonMatchGroup[] {
  const grouped = new Map<number, PokemonMatchGroup>();

  for (const item of matches) {
    const current = grouped.get(item.pokemonId) ?? {
      pokemonId: item.pokemonId,
      pokemon: item.pokemon,
      matches: [],
    };
    current.matches.push(item);
    grouped.set(item.pokemonId, current);
  }

  return Array.from(grouped.values()).sort((a, b) => a.pokemon.localeCompare(b.pokemon, "pt-BR"));
}

function PersonSummaryCard({
  group,
  mode,
  onOpen,
}: {
  group: DeliveryGroup;
  mode: "give" | "receive";
  onOpen: () => void;
}) {
  const pokemonCount = groupMatchesByPokemon(group.matches).length;

  return (
    <button type="button" className={`delivery-person-summary ${mode === "receive" ? "delivery-person-summary--receive" : ""}`} onClick={onOpen}>
      <div className="delivery-person-summary-main">
        <span className="delivery-person-avatar">{group.player.nickname.slice(0, 1).toUpperCase()}</span>
        <div>
          <b>{group.player.nickname}</b>
          <span>
            {mode === "give"
              ? `${pokemonCount} Pokémon · ${group.matches.length} raridade${group.matches.length === 1 ? "" : "s"} para entregar`
              : `${pokemonCount} Pokémon · ${group.matches.length} raridade${group.matches.length === 1 ? "" : "s"} para receber`}
          </span>
        </div>
      </div>
      <div className="delivery-person-summary-action">
        <small>{mode === "give" ? "Ver Pokémon" : "Ver o que pode receber"}</small>
        <em>→</em>
      </div>
    </button>
  );
}

function RarityOption({
  rarity,
  match,
  receiverCompleted,
  receiverHasInventory,
  requested,
  senderTotal,
  senderProtected,
  selected,
  readonly = false,
  onToggle,
}: {
  rarity: (typeof rarities)[number];
  match: MatchItem | null;
  receiverCompleted: boolean;
  receiverHasInventory: boolean;
  requested: boolean;
  senderTotal: number;
  senderProtected: boolean;
  selected: boolean;
  readonly?: boolean;
  onToggle?: () => void;
}) {
  const receiverLocked = receiverCompleted || receiverHasInventory;
  const active = Boolean(match) && !receiverLocked;
  const unavailable = requested && !match && !receiverLocked;
  const className = [
    "delivery-rarity-option",
    receiverLocked ? "delivery-rarity-option--locked" : "",
    active ? "delivery-rarity-option--active" : "",
    selected ? "delivery-rarity-option--selected" : "",
    !receiverLocked && !active ? "delivery-rarity-option--inactive" : "",
  ].filter(Boolean).join(" ");

  const title = receiverCompleted
    ? `${rarity.label}: o destinatário já concluiu esta raridade no Codex.`
    : receiverHasInventory
      ? `${rarity.label}: o destinatário já possui uma cópia no depósito e deve usá-la no Codex antes de pedir outra.`
      : active
        ? `${rarity.label}: ${match?.available ?? senderTotal} no depósito do doador · ${match?.freeAvailable ?? 0} realmente livre(s).${senderProtected ? " 1 unidade está protegida para o Codex do doador." : ""}`
        : unavailable
          ? senderProtected && senderTotal === 1
            ? `${rarity.label}: a única unidade do doador está protegida para o próprio Codex.`
            : `${rarity.label}: foi pedido, mas não há unidade realmente livre para entregar agora.`
          : `${rarity.label}: não foi marcado como “Preciso”.`;

  const status = receiverCompleted
    ? "Codex completo"
    : receiverHasInventory
      ? "Já no depósito"
      : match
        ? `${match.available} depósito · ${match.freeAvailable} livre${match.freeAvailable === 1 ? "" : "s"}`
        : unavailable
          ? senderProtected && senderTotal === 1 ? "Protegido p/ Codex" : "Sem livre"
          : "Não pediu";

  return (
    <button
      type="button"
      className={className}
      style={{ "--rarity": rarity.color } as React.CSSProperties}
      disabled={readonly || !active}
      onClick={active && !readonly ? onToggle : undefined}
      title={title}
    >
      <span className="delivery-rarity-option-top">
        <b>{rarity.short}</b>
        {receiverLocked ? <em aria-label="Bloqueado">🔒</em> : active && selected ? <em>✓</em> : null}
      </span>
      <strong>{rarity.label}</strong>
      <small>{status}</small>
      {match && senderProtected ? <i className="delivery-protected-badge">1 protegido</i> : null}
    </button>
  );
}

function GiveDetails({ me, group, onCreateTrade, onBack }: { me: Player; group: DeliveryGroup; onCreateTrade: Props["onCreateTrade"]; onBack: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(group.matches.map(matchKey)));
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pokemonGroups = useMemo(() => groupMatchesByPokemon(group.matches), [group.matches]);

  useEffect(() => {
    setSelected(new Set(group.matches.map(matchKey)));
  }, [group.player.id, group.matches]);

  const selectedItems = useMemo(
    () => group.matches.filter((item) => selected.has(matchKey(item))),
    [group.matches, selected],
  );

  const toggle = (item: MatchItem) => {
    const key = matchKey(item);
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const register = async () => {
    if (!selectedItems.length) return;
    const list = selectedItems.map((item) => `• 1× ${item.pokemon} ${item.rarityLabel}`).join("\n");
    if (!confirm(`Registrar entrega para ${group.player.nickname}?\n\n${list}\n\nOs itens ficarão reservados até a confirmação do destinatário.`)) return;
    setBusy(true);
    try {
      await onCreateTrade(group.player.id, selectedItems);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const lines = [
      `Posso entregar para ${group.player.nickname}:`,
      ...group.matches.map((item) => `• 1× ${item.pokemon} ${item.rarityLabel}`),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <article className="delivery-detail-card">
      <header className="delivery-detail-head">
        <button type="button" className="delivery-back-button" onClick={onBack}>← Voltar</button>
        <div>
          <small>Entregar para</small>
          <b>{group.player.nickname}</b>
          <span>{pokemonGroups.length} Pokémon · {group.matches.length} raridades disponíveis para troca</span>
        </div>
        <button type="button" className="delivery-copy-button" onClick={() => void copy()}>{copied ? "✓ Copiado" : "Copiar lista"}</button>
      </header>

      <div className="delivery-pokemon-grid">
        {pokemonGroups.map((pokemonGroup) => {
          const receiverPokemon = findPokemon(group.player, pokemonGroup.pokemonId);
          const mine = findPokemon(me, pokemonGroup.pokemonId);
          const byRarity = new Map<Rarity, MatchItem>(pokemonGroup.matches.map((item) => [item.rarity, item]));

          return (
            <article className="delivery-pokemon-card" key={pokemonGroup.pokemonId}>
              <div className="delivery-pokemon-card-head">
                <div className="delivery-pokemon-art">
                  {mine?.sprite ? <img src={mine.sprite} alt={pokemonGroup.pokemon} width={54} height={54} /> : null}
                </div>
                <div>
                  <b>{pokemonGroup.pokemon}</b>
                  <span>{pokemonGroup.matches.length} raridade{pokemonGroup.matches.length === 1 ? "" : "s"} pedida{pokemonGroup.matches.length === 1 ? "" : "s"}</span>
                </div>
              </div>

              <div className="delivery-rarity-grid">
                {rarities.map((rarity) => {
                  const match = byRarity.get(rarity.key) ?? null;
                  const receiverCompleted = Boolean(receiverPokemon?.codex[rarity.key]);
                  const receiverHasInventory = !receiverCompleted && (receiverPokemon?.available[rarity.key] ?? 0) > 0;
                  const requested = Boolean(receiverPokemon?.need[rarity.key]);
                  const senderTotal = mine?.available[rarity.key] ?? 0;
                  const senderProtected = Boolean(mine && !mine.codex[rarity.key] && senderTotal > 0);
                  return (
                    <RarityOption
                      key={rarity.key}
                      rarity={rarity}
                      match={match}
                      receiverCompleted={receiverCompleted}
                      receiverHasInventory={receiverHasInventory}
                      requested={requested}
                      senderTotal={senderTotal}
                      senderProtected={senderProtected}
                      selected={Boolean(match && selected.has(matchKey(match)))}
                      onToggle={match ? () => toggle(match) : undefined}
                    />
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      <button className="delivery-register" type="button" disabled={!selectedItems.length || busy} onClick={() => void register()}>
        {busy ? "Registrando…" : `Registrar entrega${selectedItems.length ? ` (${selectedItems.length})` : ""}`}
      </button>
    </article>
  );
}

function ReceiveDetails({ me, group, onBack }: { me: Player; group: DeliveryGroup; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const pokemonGroups = useMemo(() => groupMatchesByPokemon(group.matches), [group.matches]);

  const copy = async () => {
    const lines = [
      `${group.player.nickname} pode me entregar:`,
      ...group.matches.map((item) => `• 1× ${item.pokemon} ${item.rarityLabel}`),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <article className="delivery-detail-card delivery-detail-card--receive">
      <header className="delivery-detail-head">
        <button type="button" className="delivery-back-button" onClick={onBack}>← Voltar</button>
        <div>
          <small>Receber de</small>
          <b>{group.player.nickname}</b>
          <span>{pokemonGroups.length} Pokémon · {group.matches.length} raridades que essa pessoa pode te entregar</span>
        </div>
        <button type="button" className="delivery-copy-button" onClick={() => void copy()}>{copied ? "✓ Copiado" : "Copiar lista"}</button>
      </header>

      <div className="delivery-pokemon-grid">
        {pokemonGroups.map((pokemonGroup) => {
          const mine = findPokemon(me, pokemonGroup.pokemonId);
          const senderPokemon = findPokemon(group.player, pokemonGroup.pokemonId);
          const byRarity = new Map<Rarity, MatchItem>(pokemonGroup.matches.map((item) => [item.rarity, item]));

          return (
            <article className="delivery-pokemon-card delivery-pokemon-card--receive" key={pokemonGroup.pokemonId}>
              <div className="delivery-pokemon-card-head">
                <div className="delivery-pokemon-art">
                  {(senderPokemon?.sprite ?? mine?.sprite) ? <img src={senderPokemon?.sprite ?? mine?.sprite} alt={pokemonGroup.pokemon} width={54} height={54} /> : null}
                </div>
                <div>
                  <b>{pokemonGroup.pokemon}</b>
                  <span>{pokemonGroup.matches.length} raridade{pokemonGroup.matches.length === 1 ? "" : "s"} disponível{pokemonGroup.matches.length === 1 ? "" : "is"}</span>
                </div>
              </div>

              <div className="delivery-rarity-grid">
                {rarities.map((rarity) => {
                  const match = byRarity.get(rarity.key) ?? null;
                  const receiverCompleted = Boolean(mine?.codex[rarity.key]);
                  const receiverHasInventory = !receiverCompleted && (mine?.available[rarity.key] ?? 0) > 0;
                  const requested = Boolean(mine?.need[rarity.key]);
                  const senderTotal = senderPokemon?.available[rarity.key] ?? 0;
                  const senderProtected = Boolean(senderPokemon && !senderPokemon.codex[rarity.key] && senderTotal > 0);
                  return (
                    <RarityOption
                      key={rarity.key}
                      rarity={rarity}
                      match={match}
                      receiverCompleted={receiverCompleted}
                      receiverHasInventory={receiverHasInventory}
                      requested={requested}
                      senderTotal={senderTotal}
                      senderProtected={senderProtected}
                      selected={Boolean(match)}
                      readonly
                    />
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
      <p className="delivery-note">A entrega é registrada por quem está doando. Cadeados aparecem tanto para raridades já concluídas quanto para cópias que você já possui no depósito. Do lado do doador, 1 unidade de cada raridade ainda não registrada fica protegida para o próprio Codex.</p>
    </article>
  );
}

export default function DeliveriesHub({ me, giveGroups, receiveGroups, trades, busyId, focusPlayerId, onCreateTrade, onConfirm, onReject, onCancel }: Props) {
  const [section, setSection] = useState<Section>("give");
  const [search, setSearch] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(focusPlayerId ?? null);
  const pendingIncoming = trades.filter((trade) => trade.status === "pending" && trade.receiver_id === me.id).length;
  const pendingOutgoing = trades.filter((trade) => trade.status === "pending" && trade.sender_id === me.id).length;
  const giveCount = giveGroups.reduce((sum, group) => sum + group.matches.length, 0);
  const receiveCount = receiveGroups.reduce((sum, group) => sum + group.matches.length, 0);
  const filteredGive = useMemo(() => filterGroups(giveGroups, search), [giveGroups, search]);
  const filteredReceive = useMemo(() => filterGroups(receiveGroups, search), [receiveGroups, search]);

  useEffect(() => {
    if (focusPlayerId) {
      setSection("give");
      setSearch("");
      setSelectedPlayerId(focusPlayerId);
      return;
    }
    setSelectedPlayerId(null);
  }, [focusPlayerId]);

  const changeSection = (next: Section) => {
    setSection(next);
    setSelectedPlayerId(null);
    setSearch("");
  };

  const selectedGive = selectedPlayerId ? filteredGive.find((group) => group.player.id === selectedPlayerId) ?? null : null;
  const selectedReceive = selectedPlayerId ? filteredReceive.find((group) => group.player.id === selectedPlayerId) ?? null : null;

  return (
    <section className="deliveries-hub">
      {pendingIncoming > 0 && (
        <div className="delivery-alert">
          <b>{pendingIncoming}</b>
          <div><strong>{pendingIncoming === 1 ? "1 entrega está" : `${pendingIncoming} entregas estão`} aguardando sua confirmação.</strong><span>Abra “Confirmar” para aceitar ou recusar.</span></div>
          <button type="button" onClick={() => changeSection("confirm")}>Ver agora</button>
        </div>
      )}

      <div className="delivery-tabs" role="tablist" aria-label="Central de entregas">
        <button className={section === "give" ? "active" : ""} onClick={() => changeSection("give")}>Entregar <span>{giveCount}</span></button>
        <button className={section === "receive" ? "active" : ""} onClick={() => changeSection("receive")}>Receber <span>{receiveCount}</span></button>
        <button className={section === "confirm" ? "active" : ""} onClick={() => changeSection("confirm")}>Confirmar <span>{pendingIncoming + pendingOutgoing}</span></button>
        <button className={section === "history" ? "active" : ""} onClick={() => changeSection("history")}>Histórico</button>
      </div>

      {(section === "give" || section === "receive") && (
        <label className="delivery-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar jogador, Pokémon ou raridade…" /><button type="button" onClick={() => setSearch("")}>×</button></label>
      )}

      {section === "give" && (
        <div className="delivery-section">
          <div className="delivery-section-head">
            <div>
              <h2>Você pode entregar</h2>
              <p>{selectedGive ? `Escolha as raridades que ${selectedGive.player.nickname} ainda precisa e registre a entrega.` : "Escolha um aliado para ver os Pokémon que você pode entregar. Itens pendentes já ficam reservados."}</p>
              {!selectedGive && filteredGive.length > 0 ? <span className="delivery-player-count">{filteredGive.length} aliado{filteredGive.length === 1 ? "" : "s"} com troca disponível</span> : null}
            </div>
            <strong>{selectedGive ? selectedGive.matches.length : filteredGive.reduce((sum, group) => sum + group.matches.length, 0)}</strong>
          </div>

          {selectedGive ? (
            <GiveDetails me={me} group={selectedGive} onCreateTrade={onCreateTrade} onBack={() => setSelectedPlayerId(null)} />
          ) : filteredGive.length ? (
            <div className="delivery-person-summary-grid">
              {filteredGive.map((group) => <PersonSummaryCard key={group.player.id} group={group} mode="give" onOpen={() => setSelectedPlayerId(group.player.id)} />)}
            </div>
          ) : (
            <div className="delivery-empty">Nenhum match encontrado com esse filtro.</div>
          )}
        </div>
      )}

      {section === "receive" && (
        <div className="delivery-section">
          <div className="delivery-section-head">
            <div>
              <h2>Você pode receber</h2>
              <p>{selectedReceive ? `Veja por Pokémon quais raridades ${selectedReceive.player.nickname} pode te entregar.` : "Escolha um aliado para ver quem tem disponível exatamente o que você marcou como “Preciso”."}</p>
              {!selectedReceive && filteredReceive.length > 0 ? <span className="delivery-player-count">{filteredReceive.length} aliado{filteredReceive.length === 1 ? "" : "s"} pode{filteredReceive.length === 1 ? "" : "m"} te ajudar</span> : null}
            </div>
            <strong>{selectedReceive ? selectedReceive.matches.length : filteredReceive.reduce((sum, group) => sum + group.matches.length, 0)}</strong>
          </div>

          {selectedReceive ? (
            <ReceiveDetails me={me} group={selectedReceive} onBack={() => setSelectedPlayerId(null)} />
          ) : filteredReceive.length ? (
            <div className="delivery-person-summary-grid">
              {filteredReceive.map((group) => <PersonSummaryCard key={group.player.id} group={group} mode="receive" onOpen={() => setSelectedPlayerId(group.player.id)} />)}
            </div>
          ) : (
            <div className="delivery-empty">Nenhum aliado corresponde ao filtro atual.</div>
          )}
        </div>
      )}

      {section === "confirm" && (
        <div className="delivery-section">
          <div className="delivery-section-head">
            <div><h2>Confirmar trocas</h2><p>Recebidas precisam da sua confirmação. As que você enviou ficam aqui até o outro jogador confirmar ou você cancelar.</p></div>
            <strong>{pendingIncoming + pendingOutgoing}</strong>
          </div>
          <PendingTradesPanel userId={me.id} trades={trades} busyId={busyId} onConfirm={onConfirm} onReject={onReject} onCancel={onCancel} />
        </div>
      )}

      {section === "history" && (
        <div className="delivery-section">
          <TradeHistoryPanel trades={trades.filter((trade) => trade.sender_id === me.id || trade.receiver_id === me.id)} limit={100} currentUserId={me.id} />
        </div>
      )}
    </section>
  );
}
