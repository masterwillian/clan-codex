"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthScreen from "@/components/AuthScreen";
import ClanOnboarding from "@/components/ClanOnboarding";
import CodexBonusPanel from "@/components/CodexBonusPanel";
import CodexGroup from "@/components/CodexGroup";
import SupabaseSetupScreen from "@/components/SupabaseSetupScreen";
import TradeHistoryPanel from "@/components/TradeHistoryPanel";
import DeliveriesHub from "@/components/DeliveriesHub";
import ClanAdminPanel from "@/components/ClanAdminPanel";
import AccountSettings from "@/components/AccountSettings";
import BulkInventoryEditor from "@/components/BulkInventoryEditor";
import SyncCenter from "@/components/SyncCenter";
import { codexStats, formatNumber } from "@/lib/codexUtils";
import { rarities } from "@/lib/mockData";
import { hydratePlayer } from "@/lib/playerData";
import { canRequestRarity, codexProtectedQuantity } from "@/lib/tradeRules";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import {
  Clan,
  CodexGroup as CodexGroupType,
  CodexProgressRow,
  InventoryRow,
  MatchItem,
  Player,
  PokemonEntry,
  ProfileRow,
  Rarity,
  RarityFlags,
  RarityNumbers,
  TradeItemRow,
  TradeRow,
  TradeView,
} from "@/types";

type Tab = "profile" | "clan" | "allies" | "deliveries";
type Filter = "all" | Rarity | "matches" | "helpme" | "needed" | "available";
type SyncState = "saved" | "dirty" | "saving" | "error";

const SUPABASE_PAGE_SIZE = 1000;

type PagedResult = {
  data: unknown[] | null;
  error: unknown;
};

async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PagedResult>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as T[];
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) break;
  }

  return rows;
}

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function groupMatchesSearch(group: CodexGroupType, search: string) {
  const q = normalize(search.trim());
  if (!q) return true;
  return normalize(`${group.attribute} ${group.short} ${group.id} ${group.pokemon.map((p) => p.name).join(" ")}`).includes(q);
}

function groupMatchesRarity(group: CodexGroupType, filter: Filter) {
  if (filter === "all" || filter === "matches" || filter === "helpme" || filter === "needed" || filter === "available") return true;
  return group.pokemon.some((pokemon) => pokemon.codex[filter]);
}

function allPokemon(groups: CodexGroupType[]) {
  return groups.flatMap((group) => group.pokemon);
}

function groupMatchesSpecial(group: CodexGroupType, filter: Filter) {
  if (filter === "needed") return group.pokemon.some((pokemon) => rarities.some((rarity) => pokemon.need[rarity.key] && canRequestRarity(pokemon, rarity.key)));
  if (filter === "available") return group.pokemon.some((pokemon) => rarities.some((rarity) => pokemon.available[rarity.key] > 0));
  return true;
}

function staleState(value: string) {
  const ageMs = Date.now() - new Date(value).getTime();
  const days = ageMs / 86_400_000;
  if (days >= 7) return "old";
  if (days >= 3) return "warn";
  return "fresh";
}

function timeAgo(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dia${days === 1 ? "" : "s"}`;
}

function LoadingScreen({ label = "Carregando seu Codex…" }: { label?: string }) {
  return (
    <main className="auth-page">
      <section className="loading-card">
        <div className="auth-brand">CLAN <span>CODEX</span></div>
        <div className="loading-orb" />
        <p>{label}</p>
      </section>
    </main>
  );
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [clan, setClan] = useState<Clan | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [tradeItems, setTradeItems] = useState<TradeItemRow[]>([]);
  const [tab, setTab] = useState<Tab>("profile");
  const [selectedAlly, setSelectedAlly] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [syncState, setSyncState] = useState<SyncState>("saved");
  const [appError, setAppError] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [tradeBusyId, setTradeBusyId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [syncCenterOpen, setSyncCenterOpen] = useState(false);
  const [deliveryFocusPlayerId, setDeliveryFocusPlayerId] = useState("");
  const [dirtyPokemonIds, setDirtyPokemonIds] = useState<number[]>([]);
  const dirtyPokemonIdsRef = useRef(new Set<number>());
  const realtimeRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeRefreshPendingRef = useRef(false);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      if (!nextSession) {
        dirtyPokemonIdsRef.current.clear();
        setDirtyPokemonIds([]);
        setSyncState("saved");
        setProfile(null);
        setClan(null);
        setPlayers([]);
        setTrades([]);
        setTradeItems([]);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const loadClanData = useCallback(async () => {
    const client = supabase;
    const userId = session?.user.id;
    if (!client || !userId) return;
    setLoadingData(true);
    setAppError("");

    try {
      const { data: ownProfile, error: profileError } = await client
        .from("profiles")
        .select("id,nickname,avatar_url,clan_id,created_at,updated_at")
        .eq("id", userId)
        .single();
      if (profileError) throw profileError;

      const typedProfile = ownProfile as ProfileRow;
      setProfile(typedProfile);

      const clanId = typedProfile.clan_id;
      if (!clanId) {
        setClan(null);
        setPlayers([]);
        setTrades([]);
        setTradeItems([]);
        return;
      }

      const [clanResult, profilesResult] = await Promise.all([
        client.from("clans").select("id,name,owner_id,invite_code").eq("id", clanId).single(),
        client.from("profiles").select("id,nickname,avatar_url,clan_id,created_at,updated_at").eq("clan_id", clanId).order("created_at", { ascending: true }),
      ]);
      if (clanResult.error) throw clanResult.error;
      if (profilesResult.error) throw profilesResult.error;

      const members = (profilesResult.data ?? []) as ProfileRow[];
      const memberIds = members.map((member) => member.id);

      // Supabase/PostgREST returns at most 1,000 rows per request by default.
      // A single fully-touched Codex can create 524 rows per table, so with
      // two or more members a non-paginated query silently truncates data.
      const [clanTrades, inventoryRows, progressRows] = await Promise.all([
        fetchAllPages<TradeRow>((from, to) =>
          client
            .from("trades")
            .select("id,clan_id,sender_id,receiver_id,sender_nickname,receiver_nickname,status,created_at,updated_at")
            .eq("clan_id", clanId)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(from, to),
        ),
        memberIds.length
          ? fetchAllPages<InventoryRow>((from, to) =>
              client
                .from("inventory")
                .select("user_id,pokemon_id,rarity,quantity,available_quantity,wanted_quantity,wanted,updated_at")
                .in("user_id", memberIds)
                .order("user_id", { ascending: true })
                .order("pokemon_id", { ascending: true })
                .order("rarity", { ascending: true })
                .range(from, to),
            )
          : Promise.resolve([] as InventoryRow[]),
        memberIds.length
          ? fetchAllPages<CodexProgressRow>((from, to) =>
              client
                .from("codex_progress")
                .select("user_id,pokemon_id,rarity,completed,updated_at")
                .in("user_id", memberIds)
                .order("user_id", { ascending: true })
                .order("pokemon_id", { ascending: true })
                .order("rarity", { ascending: true })
                .range(from, to),
            )
          : Promise.resolve([] as CodexProgressRow[]),
      ]);

      const tradeIds = clanTrades.map((trade) => trade.id);
      let itemRows: TradeItemRow[] = [];

      if (tradeIds.length) {
        const itemPages = await Promise.all(
          chunkValues(tradeIds, 100).map((tradeIdChunk) =>
            fetchAllPages<TradeItemRow>((from, to) =>
              client
                .from("trade_items")
                .select("id,trade_id,pokemon_id,rarity,quantity")
                .in("trade_id", tradeIdChunk)
                .order("trade_id", { ascending: true })
                .order("id", { ascending: true })
                .range(from, to),
            ),
          ),
        );
        itemRows = itemPages.flat();
      }

      const hydrated = members.map((member) => hydratePlayer(member, inventoryRows, progressRows));
      hydrated.sort((a, b) => (a.id === userId ? -1 : b.id === userId ? 1 : a.nickname.localeCompare(b.nickname)));

      // Se o usuário começou a editar enquanto esta leitura estava em voo,
      // preserva o rascunho local e adia a aplicação dos dados remotos.
      if (dirtyPokemonIdsRef.current.size > 0) {
        realtimeRefreshPendingRef.current = true;
        return;
      }

      setPlayers(hydrated);
      setTrades(clanTrades);
      setTradeItems(itemRows);
      setClan({
        id: clanResult.data.id,
        name: clanResult.data.name,
        inviteCode: clanResult.data.invite_code,
        ownerId: clanResult.data.owner_id,
      });

      setSelectedAlly((current) => {
        const allies = hydrated.filter((player) => player.id !== userId);
        if (current && allies.some((ally) => ally.id === current)) return current;
        return allies[0]?.id ?? "";
      });
    } catch (caught) {
      setAppError(caught instanceof Error ? caught.message : "Não foi possível carregar os dados do clã.");
    } finally {
      setLoadingData(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    if (session?.user.id) void loadClanData();
  }, [session?.user.id, loadClanData]);

  useEffect(() => {
    const client = supabase;
    if (!client || !session?.user.id || !profile?.clan_id) return;

    const queueRefresh = () => {
      // Não sobrescreve rascunhos locais com um refresh do Realtime.
      // Assim que o usuário salvar ou descartar, fazemos um reload completo.
      if (dirtyPokemonIdsRef.current.size > 0) {
        realtimeRefreshPendingRef.current = true;
        return;
      }
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      realtimeRefreshTimer.current = setTimeout(() => {
        if (dirtyPokemonIdsRef.current.size > 0) {
          realtimeRefreshPendingRef.current = true;
          return;
        }
        void loadClanData();
      }, 300);
    };

    const channel = client
      .channel(`clan-codex-v5-${profile.clan_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "codex_progress" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "trades" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "trade_items" }, queueRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "clans" }, queueRefresh)
      .subscribe();

    return () => {
      if (realtimeRefreshTimer.current) clearTimeout(realtimeRefreshTimer.current);
      void client.removeChannel(channel);
    };
  }, [session?.user.id, profile?.clan_id, loadClanData]);

  const updatePokemon = useCallback((next: PokemonEntry) => {
    const userId = session?.user.id;
    if (!userId) return;

    // Uma raridade já concluída no Codex nunca pode permanecer marcada como
    // “Preciso”. Isso vale para edição manual e para os importadores.
    const sanitized: PokemonEntry = {
      ...next,
      need: Object.fromEntries(
        rarities.map((rarity) => [rarity.key, canRequestRarity(next, rarity.key) ? next.need[rarity.key] : false]),
      ) as RarityFlags,
    };

    // A alteração acontece apenas no estado local. Nada é enviado ao Supabase
    // até o usuário clicar explicitamente em “Salvar alterações”.
    setPlayers((current) => current.map((player) => {
      if (player.id !== userId) return player;
      return {
        ...player,
        groups: player.groups.map((group) => ({
          ...group,
          pokemon: group.pokemon.map((pokemon) => pokemon.id === sanitized.id ? sanitized : pokemon),
        })),
      };
    }));

    dirtyPokemonIdsRef.current.add(sanitized.id);
    setDirtyPokemonIds(Array.from(dirtyPokemonIdsRef.current));
    setSyncState("dirty");
  }, [session?.user.id]);

  const savePendingChanges = useCallback(async () => {
    const client = supabase;
    const userId = session?.user.id;
    if (!client || !userId || dirtyPokemonIdsRef.current.size === 0) return;

    const meNow = players.find((player) => player.id === userId);
    if (!meNow) return;

    const changedIds = new Set(dirtyPokemonIdsRef.current);
    const changedPokemon = allPokemon(meNow.groups).filter((pokemon) => changedIds.has(pokemon.id));
    if (!changedPokemon.length) return;

    setSyncState("saving");
    setAppError("");

    // Um clique = somente dois writes em lote, independentemente de quantos
    // botões/campos o usuário modificou: um para inventário e um para Codex.
    const inventoryRows = changedPokemon.flatMap((pokemon) => rarities.map((rarity) => ({
      user_id: userId,
      pokemon_id: pokemon.id,
      rarity: rarity.key,
      quantity: pokemon.available[rarity.key],
      available_quantity: pokemon.available[rarity.key],
      wanted_quantity: pokemon.need[rarity.key] && canRequestRarity(pokemon, rarity.key) ? 1 : 0,
      wanted: pokemon.need[rarity.key] && canRequestRarity(pokemon, rarity.key),
    })));

    const progressRows = changedPokemon.flatMap((pokemon) => rarities.map((rarity) => ({
      user_id: userId,
      pokemon_id: pokemon.id,
      rarity: rarity.key,
      completed: pokemon.codex[rarity.key],
    })));

    const [{ error: inventoryError }, { error: progressError }] = await Promise.all([
      client.from("inventory").upsert(inventoryRows, { onConflict: "user_id,pokemon_id,rarity" }),
      client.from("codex_progress").upsert(progressRows, { onConflict: "user_id,pokemon_id,rarity" }),
    ]);

    if (inventoryError || progressError) {
      setSyncState("error");
      setAppError(inventoryError?.message ?? progressError?.message ?? "Erro ao salvar as alterações.");
      return;
    }

    dirtyPokemonIdsRef.current.clear();
    setDirtyPokemonIds([]);
    setSyncState("saved");
    realtimeRefreshPendingRef.current = false;
    await loadClanData();
  }, [session?.user.id, players, loadClanData]);

  const discardPendingChanges = useCallback(async () => {
    if (dirtyPokemonIdsRef.current.size === 0) return;
    if (!window.confirm(`Descartar as alterações não salvas de ${dirtyPokemonIdsRef.current.size} Pokémon?`)) return;

    dirtyPokemonIdsRef.current.clear();
    setDirtyPokemonIds([]);
    setSyncState("saved");
    realtimeRefreshPendingRef.current = false;
    await loadClanData();
  }, [loadClanData]);

  const refreshClanData = useCallback(async () => {
    if (dirtyPokemonIdsRef.current.size > 0) {
      if (!window.confirm("Existem alterações não salvas. Atualizar agora vai descartá-las. Continuar?")) return;
      dirtyPokemonIdsRef.current.clear();
      setDirtyPokemonIds([]);
      setSyncState("saved");
    }
    realtimeRefreshPendingRef.current = false;
    await loadClanData();
  }, [loadClanData]);

  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (dirtyPokemonIdsRef.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, []);

  const logout = async () => {
    if (!supabase) return;
    if (dirtyPokemonIdsRef.current.size > 0) {
      if (!window.confirm("Você tem alterações não salvas no Codex. Sair da conta e descartá-las?")) return;
      dirtyPokemonIdsRef.current.clear();
      setDirtyPokemonIds([]);
      setSyncState("saved");
    }
    await supabase.auth.signOut();
  };

  const copyInvite = async () => {
    if (!clan) return;
    await navigator.clipboard.writeText(clan.inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1400);
  };

  const runRpc = async (name: string, args: Record<string, unknown>, busyKey = name) => {
    if (!supabase) return false;
    if (dirtyPokemonIdsRef.current.size > 0) {
      setAppError("Salve ou descarte as alterações do Codex antes de realizar esta ação.");
      return false;
    }
    setTradeBusyId(busyKey);
    setAppError("");
    const { error } = await supabase.rpc(name, args);
    if (error) {
      setAppError(error.message);
      setTradeBusyId("");
      return false;
    }
    await loadClanData();
    setTradeBusyId("");
    return true;
  };

  if (!isSupabaseConfigured) return <SupabaseSetupScreen />;
  if (!authReady) return <LoadingScreen label="Abrindo o Clan Codex…" />;
  if (!session) return <AuthScreen />;
  if (loadingData && !profile) return <LoadingScreen />;
  if (profile && !profile.clan_id) return <ClanOnboarding nickname={profile.nickname} onDone={loadClanData} onLogout={logout} />;

  const me = players.find((player) => player.id === session.user.id);
  if (!me || !clan) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="auth-brand">CLAN <span>CODEX</span></div>
          <h1>Não foi possível abrir o clã</h1>
          <p className="auth-copy">{appError || "Seu perfil existe, mas os dados ainda não carregaram."}</p>
          <button className="primary-action" onClick={() => void loadClanData()}>Tentar novamente</button>
          <button className="link-button" onClick={() => void logout()}>Sair</button>
        </section>
      </main>
    );
  }

  const ally = players.find((player) => player.id === selectedAlly) ?? players.find((player) => player.id !== me.id) ?? null;
  const viewedPlayer = tab === "allies" && ally ? ally : me;
  const viewedStats = codexStats(viewedPlayer.groups);

  const pokemonCatalog = new Map<number, { name: string; sprite: string }>();
  me.groups.forEach((group) => group.pokemon.forEach((pokemon) => pokemonCatalog.set(pokemon.id, { name: pokemon.name, sprite: pokemon.sprite })));
  const playerName = new Map(players.map((player) => [player.id, player.nickname]));
  const rarityMeta = new Map<Rarity, (typeof rarities)[number]>(rarities.map((rarity) => [rarity.key, rarity] as const));

  const tradeViews: TradeView[] = trades.map((trade) => ({
    ...trade,
    senderNickname: playerName.get(trade.sender_id) ?? trade.sender_nickname ?? "Ex-membro",
    receiverNickname: playerName.get(trade.receiver_id) ?? trade.receiver_nickname ?? "Ex-membro",
    items: tradeItems.filter((item) => item.trade_id === trade.id).map((item) => ({
      pokemonId: item.pokemon_id,
      pokemon: pokemonCatalog.get(item.pokemon_id)?.name ?? `Pokémon #${item.pokemon_id}`,
      rarity: item.rarity,
      rarityLabel: rarityMeta.get(item.rarity)?.label ?? item.rarity,
      quantity: item.quantity,
    })),
  }));

  const committed = new Map<string, number>();
  for (const trade of tradeViews.filter((entry) => entry.status === "pending")) {
    for (const item of trade.items) {
      const key = `${trade.sender_id}:${item.pokemonId}:${item.rarity}`;
      committed.set(key, (committed.get(key) ?? 0) + item.quantity);
    }
  }

  const findPokemon = (player: Player, pokemonId: number) => {
    for (const group of player.groups) {
      const pokemon = group.pokemon.find((entry) => entry.id === pokemonId);
      if (pokemon) return pokemon;
    }
    return null;
  };

  const freeAvailable = (player: Player, pokemonId: number, rarity: Rarity) => {
    const pokemon = findPokemon(player, pokemonId);
    if (!pokemon) return 0;
    const pending = committed.get(`${player.id}:${pokemonId}:${rarity}`) ?? 0;
    const protectedForCodex = codexProtectedQuantity(pokemon, rarity);
    return Math.max(0, pokemon.available[rarity] - pending - protectedForCodex);
  };

  const matchesFor = (sender: Player, receiver: Player): MatchItem[] => {
    const out: MatchItem[] = [];
    for (const group of sender.groups) {
      const receiverGroup = receiver.groups.find((entry) => entry.id === group.id);
      if (!receiverGroup) continue;
      for (const mine of group.pokemon) {
        const theirs = receiverGroup.pokemon.find((entry) => entry.id === mine.id);
        if (!theirs) continue;
        for (const rarity of rarities) {
          const free = freeAvailable(sender, mine.id, rarity.key);
          if (free > 0 && theirs.need[rarity.key] && canRequestRarity(theirs, rarity.key)) {
            out.push({
              playerId: receiver.id,
              nickname: receiver.nickname,
              pokemonId: mine.id,
              pokemon: mine.name,
              rarity: rarity.key,
              rarityLabel: rarity.label,
              qty: 1,
              available: mine.available[rarity.key],
              freeAvailable: free,
            });
          }
        }
      }
    }
    return out;
  };

  const forwardMatches = ally ? matchesFor(me, ally) : [];
  const reverseMatches = ally ? matchesFor(ally, me) : [];
  const deliveryGiveGroups = players
    .filter((player) => player.id !== me.id)
    .map((player) => ({ player, matches: matchesFor(me, player) }))
    .filter((group) => group.matches.length > 0);
  const deliveryReceiveGroups = players
    .filter((player) => player.id !== me.id)
    .map((player) => ({ player, matches: matchesFor(player, me) }))
    .filter((group) => group.matches.length > 0);
  const pendingForMe = tradeViews.filter((trade) => trade.status === "pending" && (trade.sender_id === me.id || trade.receiver_id === me.id));

  const forwardGroupIds = new Set<number>();
  const reverseGroupIds = new Set<number>();
  if (ally) {
    for (const group of ally.groups) {
      if (group.pokemon.some((pokemon) => forwardMatches.some((match) => match.pokemonId === pokemon.id))) forwardGroupIds.add(group.id);
      if (group.pokemon.some((pokemon) => reverseMatches.some((match) => match.pokemonId === pokemon.id))) reverseGroupIds.add(group.id);
    }
  }

  const profileGroups = me.groups.filter((group) => groupMatchesSearch(group, search) && groupMatchesRarity(group, filter) && groupMatchesSpecial(group, filter));
  const allyGroups = ally ? ally.groups.filter((group) => {
    if (!groupMatchesSearch(group, search) || !groupMatchesRarity(group, filter)) return false;
    if (filter === "matches") return forwardGroupIds.has(group.id);
    if (filter === "helpme") return reverseGroupIds.has(group.id);
    return true;
  }) : [];

  const helperGroupWithFree = (groupId: number) => {
    const group = me.groups.find((entry) => entry.id === groupId);
    if (!group) return undefined;
    return {
      ...group,
      pokemon: group.pokemon.map((pokemon) => ({
        ...pokemon,
        available: Object.fromEntries(rarities.map((rarity) => [rarity.key, freeAvailable(me, pokemon.id, rarity.key)])) as RarityNumbers,
      })),
    };
  };

  const clanRows = [...pokemonCatalog.entries()].map(([id, data]) => ({
    id,
    ...data,
    rarities: rarities.map((rarity) => ({
      ...rarity,
      available: players.reduce((sum, player) => sum + freeAvailable(player, id, rarity.key), 0),
      needs: players.reduce((sum, player) => sum + (() => { const pokemon = findPokemon(player, id); return pokemon?.need[rarity.key] && canRequestRarity(pokemon, rarity.key) ? 1 : 0; })(), 0),
    })),
  })).filter((row) => normalize(row.name).includes(normalize(search)));

  const clanTotals = {
    available: players.reduce((sum, player) => sum + allPokemon(player.groups).reduce((pokemonSum, entry) => pokemonSum + rarities.reduce((raritySum, rarity) => raritySum + freeAvailable(player, entry.id, rarity.key), 0), 0), 0),
    needs: players.reduce((sum, player) => sum + allPokemon(player.groups).reduce((pokemonSum, entry) => pokemonSum + rarities.reduce((raritySum, rarity) => raritySum + (entry.need[rarity.key] && canRequestRarity(entry, rarity.key) ? 1 : 0), 0), 0), 0),
    completedTrades: tradeViews.filter((trade) => trade.status === "completed").length,
  };

  const memberStats = players.map((player) => {
    const donated = tradeViews.filter((trade) => trade.status === "completed" && trade.sender_id === player.id).reduce((sum, trade) => sum + trade.items.reduce((sub, item) => sub + item.quantity, 0), 0);
    const received = tradeViews.filter((trade) => trade.status === "completed" && trade.receiver_id === player.id).reduce((sum, trade) => sum + trade.items.reduce((sub, item) => sub + item.quantity, 0), 0);
    return { ...player, donated, received };
  }).sort((a, b) => b.donated - a.donated || a.nickname.localeCompare(b.nickname));

  const createTrade = async (receiverId: string, items: MatchItem[]) => {
    if (!receiverId || !items.length) return;
    const ok = await runRpc("create_trade", {
      p_receiver_id: receiverId,
      p_items: items.map((item) => ({ pokemon_id: item.pokemonId, rarity: item.rarity, quantity: 1 })),
    }, `create-trade-${receiverId}`);
    if (ok) setAppError("");
  };

  const confirmTrade = async (tradeId: string) => { await runRpc("confirm_trade", { p_trade_id: tradeId }, tradeId); };
  const rejectTrade = async (tradeId: string) => { await runRpc("reject_trade", { p_trade_id: tradeId }, tradeId); };
  const cancelTrade = async (tradeId: string) => { await runRpc("cancel_trade", { p_trade_id: tradeId }, tradeId); };

  const regenerateInvite = async () => { await runRpc("regenerate_clan_invite_code", {}, "admin"); };
  const removeMember = async (userId: string) => { await runRpc("remove_clan_member", { p_user_id: userId }, "admin"); };
  const transferOwner = async (userId: string) => { await runRpc("transfer_clan_ownership", { p_new_owner_id: userId }, "admin"); };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">CLAN <span>CODEX</span></div>
        <nav>
          <button className={syncCenterOpen ? "active nav-import" : "nav-import"} onClick={() => setSyncCenterOpen(true)}>Importar</button>
          <button className={tab === "profile" ? "active" : ""} onClick={() => { setTab("profile"); setFilter("all"); setDeliveryFocusPlayerId(""); }}>Perfil</button>
          <button className={tab === "clan" ? "active" : ""} onClick={() => { setTab("clan"); setFilter("all"); setDeliveryFocusPlayerId(""); }}>Clã</button>
          <button className={tab === "allies" ? "active" : ""} onClick={() => { setTab("allies"); setFilter("all"); setDeliveryFocusPlayerId(""); }}>Aliados</button>
          <button className={tab === "deliveries" ? "active" : ""} onClick={() => { setTab("deliveries"); setFilter("all"); setDeliveryFocusPlayerId(""); }}>Entregas{pendingForMe.length ? <span className="nav-badge">{pendingForMe.length}</span> : null}</button>
        </nav>
        <div className="account-zone">
          <span className={`sync-state sync-state--${syncState}`}>{syncState === "saving" ? "Salvando…" : syncState === "dirty" ? `${dirtyPokemonIds.length} não salvo${dirtyPokemonIds.length === 1 ? "" : "s"}` : syncState === "error" ? "Erro ao salvar" : "Salvo"}</span>
          <div className="account-menu">
            <button className="account-settings-button" type="button" onClick={() => {
              if (dirtyPokemonIdsRef.current.size > 0) {
                setAppError("Salve ou descarte as alterações do Codex antes de abrir as configurações.");
                return;
              }
              setSettingsOpen(true);
            }} title="Abrir configurações">
              <b>{me.nickname}</b><small>{clan.name}</small>
            </button>
            <button className="logout-button" onClick={() => void logout()} title="Sair">↪</button>
          </div>
        </div>
      </header>

      <section className="clan-invite-bar">
        <span><b>{players.length}</b> membro{players.length === 1 ? "" : "s"} conectado{players.length === 1 ? "" : "s"} ao clã</span>
        <span>Código para convidar: <strong>{clan.inviteCode}</strong></span>
        <button onClick={() => void copyInvite()}>{inviteCopied ? "✓ Copiado" : "Copiar código"}</button>
        <button onClick={() => void refreshClanData()} disabled={loadingData || syncState === "saving"}>{loadingData ? "Atualizando…" : "Atualizar"}</button>
      </section>

      {appError && <div className="app-error">{appError}<button onClick={() => setAppError("")}>×</button></div>}

      {dirtyPokemonIds.length > 0 && (
        <section className="codex-savebar" role="status" aria-live="polite">
          <div>
            <b>{dirtyPokemonIds.length} Pokémon com alterações não salvas</b>
            <span>Nada foi enviado ao servidor ainda. Revise tudo e confirme uma única vez.</span>
          </div>
          <div className="codex-savebar-actions">
            <button type="button" className="codex-discard-button" onClick={() => void discardPendingChanges()} disabled={syncState === "saving"}>Descartar</button>
            <button type="button" className="codex-confirm-button" onClick={() => void savePendingChanges()} disabled={syncState === "saving"}>{syncState === "saving" ? "Salvando…" : "Salvar alterações"}</button>
          </div>
        </section>
      )}

      {syncCenterOpen && (
        <SyncCenter
          player={me}
          onPokemonChange={updatePokemon}
          onClose={() => setSyncCenterOpen(false)}
        />
      )}

      {settingsOpen && (
        <AccountSettings
          nickname={me.nickname}
          clanName={clan.name}
          isOwner={me.id === clan.ownerId}
          memberCount={players.length}
          onClose={() => setSettingsOpen(false)}
          onReload={loadClanData}
          onLogout={logout}
        />
      )}

      <section className="hero codex-hero">
        <div className="hero-copy">
          <span className="hero-kicker">CODEX COLABORATIVO · {clan.name}</span>
          <h1>{tab === "profile" ? "Meu Codex" : tab === "clan" ? "Clã" : tab === "deliveries" ? "Central de entregas" : ally ? `Codex de ${ally.nickname}` : "Aliados"}</h1>
          <p>{tab === "profile"
            ? `Depósito mostra o estoque total. Se uma raridade ainda não está no Codex, 1 unidade fica protegida e não entra nas trocas. “Preciso” só pode ser marcado quando você não tem aquela raridade no depósito. Último salvamento ${timeAgo(me.updatedAt)}.`
            : tab === "clan"
              ? "Visão coletiva de disponíveis, necessidades, entregas confirmadas e administração do clã."
              : tab === "deliveries"
                ? "Entregue, veja o que pode receber, confirme trocas pendentes e consulte seu histórico em um único lugar."
                : ally
                  ? `Veja o Codex e os matches nos dois sentidos. ${ally.nickname} atualizou ${timeAgo(ally.updatedAt)}.`
                  : "Abra o Codex de outro membro e veja automaticamente o que vocês podem entregar um ao outro."}</p>
        </div>
        {tab === "clan" ? (
          <div className="clan-summary">
            <div><b>{players.length}</b><small>jogadores</small></div>
            <div><b>{clanTotals.available}</b><small>disponíveis</small></div>
            <div><b>{clanTotals.needs}</b><small>necessidades</small></div>
            <div><b>{clanTotals.completedTrades}</b><small>entregas</small></div>
          </div>
        ) : tab === "deliveries" ? (
          <div className="clan-summary delivery-summary">
            <div><b>{deliveryGiveGroups.reduce((sum, group) => sum + group.matches.length, 0)}</b><small>para entregar</small></div>
            <div><b>{deliveryReceiveGroups.reduce((sum, group) => sum + group.matches.length, 0)}</b><small>para receber</small></div>
            <div><b>{pendingForMe.length}</b><small>pendentes</small></div>
            <div><b>{tradeViews.filter((trade) => trade.status === "completed" && (trade.sender_id === me.id || trade.receiver_id === me.id)).length}</b><small>confirmadas</small></div>
          </div>
        ) : (
          <div className="hero-progress">
            <div className="collection"><small>Coleção</small><b>{viewedStats.registrations}</b><span>/ {viewedStats.maxRegistrations}</span><em>Pokémon registrados</em></div>
            <div className="progress-ring" style={{ "--pct": `${viewedStats.completion * 3.6}deg` } as React.CSSProperties}>
              <div><b>{formatNumber(viewedStats.completion)}%</b><small>completo</small></div>
            </div>
            <div className="levels">{formatNumber(viewedStats.levels)} / {viewedStats.maxLevels} níveis</div>
          </div>
        )}
      </section>

      {tab !== "deliveries" && (
        <section className="filterbar">
          <label className="searchbox"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar Pokémon ou atributo…" /></label>
          {tab !== "clan" && (
            <div className="filterchips">
              <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>Todos</button>
              {rarities.map((rarity) => <button key={rarity.key} className={filter === rarity.key ? "on" : ""} style={{ "--chip": rarity.color } as React.CSSProperties} onClick={() => setFilter(rarity.key)}>{rarity.label}</button>)}
              {tab === "profile" && <button className={filter === "needed" ? "on" : ""} style={{ "--chip": "#ffcf5a" } as React.CSSProperties} onClick={() => setFilter("needed")}>Preciso</button>}
              {tab === "profile" && <button className={filter === "available" ? "on" : ""} style={{ "--chip": "#56f6a1" } as React.CSSProperties} onClick={() => setFilter("available")}>Depósito</button>}
              {tab === "allies" && <button className={filter === "matches" ? "on" : ""} style={{ "--chip": "#56f6a1" } as React.CSSProperties} onClick={() => setFilter("matches")}>Posso ajudar</button>}
              {tab === "allies" && <button className={filter === "helpme" ? "on" : ""} style={{ "--chip": "#ffd05d" } as React.CSSProperties} onClick={() => setFilter("helpme")}>Pode me ajudar</button>}
            </div>
          )}
          <button className="reset-btn" onClick={() => { setSearch(""); setFilter("all"); }}>↻</button>
        </section>
      )}

      {tab === "profile" && (
        <div className="layout">
          <section className="codex-list">
            <div className="section-toolbar section-toolbar--actions">
              <div><b>Kanto · {profileGroups.length} grupos</b><span>I / R / E / L = estoque total do depósito. Quando ainda falta registrar a raridade no Codex, 1 unidade fica protegida; “Preciso” também é bloqueado se você já possui uma cópia.</span></div>
              <button type="button" className="quick-edit-button" onClick={() => setBulkEditOpen((value) => !value)}>
                {bulkEditOpen ? "Fechar edição rápida" : "Edição rápida"}
              </button>
            </div>
            {bulkEditOpen && <BulkInventoryEditor player={me} onPokemonChange={updatePokemon} onClose={() => setBulkEditOpen(false)} />}
            {profileGroups.map((group) => <CodexGroup key={group.id} group={group} editable onPokemonChange={updatePokemon} />)}
          </section>
          <aside className="side-stack">
            <CodexBonusPanel groups={me.groups} />
            <div className="side-panel">
              <div className="matches-panel-head">
                <h2>Matches atuais</h2>
                {deliveryGiveGroups.length ? <span>{deliveryGiveGroups.length} aliado{deliveryGiveGroups.length === 1 ? "" : "s"}</span> : null}
              </div>
              {deliveryGiveGroups.length ? deliveryGiveGroups.map((group) => (
                <button
                  className="match-person-card"
                  key={group.player.id}
                  onClick={() => {
                    setSelectedAlly(group.player.id);
                    setDeliveryFocusPlayerId(group.player.id);
                    setTab("deliveries");
                    setFilter("all");
                  }}
                >
                  <span className="match-person-avatar">{group.player.nickname.slice(0, 1).toUpperCase()}</span>
                  <span className="match-person-copy">
                    <b>{group.player.nickname}</b>
                    <small>{group.matches.length} troca{group.matches.length === 1 ? "" : "s"} {group.matches.length === 1 ? "disponível" : "disponíveis"}</small>
                  </span>
                  <em>→</em>
                </button>
              )) : <p className="muted">Nenhum aliado precisa de algo que você tenha disponível.</p>}
            </div>
          </aside>
        </div>
      )}

      {tab === "clan" && (
        <div className="clan-v5-layout">
          <div className="clan-main-column">
            <div className="clan-panel">
              <div className="section-toolbar"><b>Disponíveis do clã · {clanRows.length} Pokémon</b><span>Necessidade é sempre 1 por jogador/raridade. Quantidades pendentes já são reservadas.</span></div>
              <div className="clan-grid">
                {clanRows.map((row) => (
                  <article className="clan-row" key={row.id}>
                    <div className="clan-pokemon"><img src={row.sprite} alt="" width={42} height={42} /><strong>{row.name}</strong></div>
                    {row.rarities.map((rarity) => (
                      <div className="clan-rarity" key={rarity.key} style={{ "--rarity": rarity.color } as React.CSSProperties}>
                        <span>{rarity.short}</span><b>{rarity.available}</b>
                        <small>disponíveis · {rarity.needs} precisam</small>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            </div>
            <TradeHistoryPanel trades={tradeViews} />
          </div>

          <aside className="clan-side-column">
            <section className="contribution-panel">
              <div className="admin-heading"><h2>Contribuições</h2><span>Confirmadas</span></div>
              {memberStats.map((member) => (
                <div className="contribution-row" key={member.id}>
                  <div><b>{member.nickname}</b><small>Atualizado {timeAgo(member.updatedAt)}</small></div>
                  <span><b>{member.donated}</b><small>doados</small></span>
                  <span><b>{member.received}</b><small>recebidos</small></span>
                </div>
              ))}
            </section>
            <ClanAdminPanel meId={me.id} ownerId={clan.ownerId} inviteCode={clan.inviteCode} players={players} onRegenerate={regenerateInvite} onRemove={removeMember} onTransfer={transferOwner} />
          </aside>
        </div>
      )}

      {tab === "allies" && (
        <div className="layout allies-layout">
          <aside className="allies-list">
            <h2>Aliados · {Math.max(0, players.length - 1)}</h2>
            {players.filter((player) => player.id !== me.id).map((player) => {
              const forward = matchesFor(me, player).length;
              const reverse = matchesFor(player, me).length;
              return (
                <button key={player.id} className={`${ally?.id === player.id ? "selected" : ""} ally-freshness--${staleState(player.updatedAt)}`} onClick={() => { setSelectedAlly(player.id); setFilter("all"); }}>
                  <b>{player.nickname}</b>
                  <span>{forward} para ele · {reverse} para você</span>
                  <em>Atualizado {timeAgo(player.updatedAt)}{staleState(player.updatedAt) !== "fresh" ? " ⚠" : ""}</em>
                </button>
              );
            })}
            {!ally && <p className="muted ally-empty">Quando outras pessoas entrarem com o código do clã, elas aparecerão aqui.</p>}
            {ally && (
              <div className="ally-trade-shortcut">
                <b>{forwardMatches.length + reverseMatches.length} matches com {ally.nickname}</b>
                <span>{forwardMatches.length} para ele · {reverseMatches.length} para você</span>
                <button onClick={() => setTab("deliveries")}>Abrir central de entregas</button>
              </div>
            )}
          </aside>

          {ally ? (
            <section className="codex-list">
              <div className="section-toolbar"><b>{ally.nickname} · Kanto · {allyGroups.length} grupos</b><span>Somente {ally.nickname} pode editar esse Codex.</span></div>
              {allyGroups.map((group) => (
                <CodexGroup key={group.id} group={group} compareGroup={helperGroupWithFree(group.id)} />
              ))}
            </section>
          ) : (
            <section className="empty-allies">
              <h2>Você ainda está sozinho no clã</h2>
              <p>Compartilhe o código <b>{clan.inviteCode}</b> com o grupo. Assim que as outras contas entrarem, cada Codex aparecerá aqui separadamente.</p>
              <button className="primary-action" onClick={() => void copyInvite()}>{inviteCopied ? "✓ Código copiado" : "Copiar código do clã"}</button>
            </section>
          )}

          {ally && <aside className="allies-bonus"><CodexBonusPanel groups={ally.groups} /></aside>}
        </div>
      )}

      {tab === "deliveries" && (
        <DeliveriesHub
          me={me}
          giveGroups={deliveryGiveGroups}
          receiveGroups={deliveryReceiveGroups}
          trades={tradeViews}
          busyId={tradeBusyId}
          focusPlayerId={deliveryFocusPlayerId || undefined}
          onCreateTrade={createTrade}
          onConfirm={confirmTrade}
          onReject={rejectTrade}
          onCancel={cancelTrade}
        />
      )}
    </main>
  );
}
