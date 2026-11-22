// Application principale : en-tête, onglets, présence, activité, réglages.
import { html, useCallback, useEffect, useMemo, useRef, useState } from './vendor.js';
import { cx, lsGet, lsSet, plural, timeAgo } from './util.js';
import { ROLES, ROLE_LABEL, champ, patchLabel } from './data.js';
import { evaluateSaved, pickPriority, solve, TIER_VALUE, OFFPOOL_VALUE } from './optimizer.js';
import { makeActions, GROUP_LABEL, slotValues } from './actions.js';
import { Avatar, Icon, Logo, Modal, ToastHost, TierPicker, toast } from './ui.js';
import { ChampionPicker } from './picker.js';
import { PlayersView, PoolEditor } from './players.js';
import { DraftBoard } from './draft.js';
import { CompsView } from './comps.js';
import { DEFAULT_STATS, STAT_RANKS, STAT_REGIONS, loadChampionStats, loadMeta, matchup, matchupPoints } from './stats.js';
import { STATS_TTL, accountsOf, fetchPlayerStats, mergeStats, riotKey } from './playerstats.js';
import { banSuggestions, blindSafety, compSignature, flexPicks, gamePlan, historyStats } from './insights.js';
import { checkCode, protectRoom, rememberCode, unprotectRoom, changeCode } from './protect.js';
import { firebaseConfig } from '../config.js';
import { isWebhook, postDiscord, voteKey } from './actions.js';
import { ScoutView } from './scout.js';
import { HistoryView } from './history.js';
import { dispoOf } from './players.js';

/**
 * Stats DeepLoL des joueurs, cumulées sur tous leurs comptes Riot.
 * Chaque compte est enregistré dans l'équipe (accstats/{joueur}/{compte}) : un seul membre le
 * télécharge, tout le monde le voit. Rafraîchi automatiquement au bout de STATS_TTL.
 */
function usePlayerStats(players, accstats, save, loaded) {
  const [local, setLocal] = useState({}); // `${pid}/${aid}` → { status: 'loading' | 'error', code, message, key }
  const inflight = useRef(new Set());
  const merged = useRef(new Map()); // pid → { sig, value }
  const entryOf = (p, acc) => {
    const e = accstats?.[p.id]?.[acc.id];
    return e && e.key === riotKey(acc) ? e : null;
  };
  const load = (p, acc, force = false) => {
    const key = riotKey(acc);
    const lk = `${p.id}/${acc.id}`;
    if (inflight.current.has(lk)) return;
    if (!force && local[lk]?.status === 'error' && local[lk].key === key) return;
    inflight.current.add(lk);
    setLocal((m) => ({ ...m, [lk]: { status: 'loading', key } }));
    fetchPlayerStats(acc).then(
      (data) => {
        save(p.id, acc.id, { ...data, key });
        setLocal((m) => ({ ...m, [lk]: null }));
      },
      (err) => setLocal((m) => ({ ...m, [lk]: { status: 'error', code: err.code || 'network', message: err.message, key } })),
    ).finally(() => inflight.current.delete(lk));
  };
  useEffect(() => {
    if (!loaded) return;
    for (const p of players) {
      for (const acc of accountsOf(p)) {
        const e = entryOf(p, acc);
        if (!e || !e.puuid || Date.now() - (e.ts || 0) > STATS_TTL) load(p, acc);
      }
    }
  }, [loaded, players, accstats]);

  const accountStatus = (p, acc) => {
    const l = local[`${p.id}/${acc.id}`];
    const e = entryOf(p, acc);
    if (l && l.key === riotKey(acc) && (l.status === 'error' || !e)) return { ...l, ps: e };
    return e ? { status: 'ok', ps: e } : { status: 'loading' };
  };
  return {
    /** Stats cumulées de tous les comptes du joueur (ou null). */
    statsOf: (p) => {
      const list = accountsOf(p).map((acc) => entryOf(p, acc)).filter(Boolean);
      if (!list.length) return null;
      const sig = list.map((e) => `${e.key}@${e.ts}`).join(',');
      const hit = merged.current.get(p.id);
      if (hit && hit.sig === sig) return hit.value;
      const value = mergeStats(list);
      merged.current.set(p.id, { sig, value });
      return value;
    },
    /** État de chaque compte : [{ acc, status, ps, message, code }]. */
    accountsStatus: (p) => accountsOf(p).map((acc) => ({ acc, ...accountStatus(p, acc) })),
    refresh: (p) => accountsOf(p).forEach((acc) => load(p, acc, true)),
  };
}

/** Charge (et garde en mémoire) les stats U.GG des champions demandés. */
function useChampionStats(ids, cfg) {
  const [map, setMap] = useState({});
  const cfgKey = `${cfg.region}|${cfg.rank}`;
  useEffect(() => {
    let alive = true;
    for (const id of ids) {
      const k = `${id}|${cfgKey}`;
      if (map[k]) continue;
      setMap((m) => ({ ...m, [k]: { status: 'loading' } }));
      loadChampionStats(id, cfg).then(
        (data) => alive && setMap((m) => ({ ...m, [k]: { status: 'ok', data } })),
        () => alive && setMap((m) => ({ ...m, [k]: { status: 'error' } })),
      );
    }
    return () => { alive = false; };
  }, [ids.join(','), cfgKey]);
  return (id) => map[`${id}|${cfgKey}`] || { status: 'idle' };
}

/** Rôle de chaque pick adverse : celui choisi, sinon le plus probable parmi les rôles libres. */
function assignEnemyRoles(picks, explicit, statsOf) {
  const taken = new Set(explicit.filter((r, i) => r && picks[i]));
  return picks.map((id, i) => {
    if (!id) return null;
    if (explicit[i]) return { role: explicit[i], auto: false };
    const st = statsOf(id);
    let order = champ(id).roles;
    if (st.status === 'ok') {
      const byGames = Object.entries(st.data.roles).sort((a, b) => b[1].games - a[1].games).map(([r]) => r);
      order = byGames.length ? byGames : order;
    }
    const role = [...order, ...ROLES].find((r) => !taken.has(r)) || null;
    if (role) taken.add(role);
    return { role, auto: true };
  });
}

/** Méta du patch (U.GG), rechargée si le rang ou la région des stats change. */
function useMeta(cfg) {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    let alive = true;
    loadMeta(cfg).then((m) => alive && setMeta(m), () => alive && setMeta(null));
    return () => { alive = false; };
  }, [cfg.rank, cfg.region]);
  return meta;
}

function useSnapshot(store) {
  const [snap, setSnap] = useState(store.getSnapshot());
  useEffect(() => {
    const unsubscribe = store.subscribe(setSnap);
    // Un événement a pu arriver entre le premier rendu et l'abonnement : on se resynchronise.
    setSnap(store.getSnapshot());
    return unsubscribe;
  }, [store]);
  return snap;
}

const sortPlayers = (players) =>
  Object.entries(players || {})
    .map(([id, p]) => ({ id, ...p, name: p.name || 'Joueur' }))
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name, 'fr'));

export function App({ store, room, secured = false }) {
  const snap = useSnapshot(store);
  const state = snap.state || {};
  const players = useMemo(() => sortPlayers(state.players), [state.players]);
  const active = useMemo(() => players.filter((p) => dispoOf(p) !== 'no'), [players]);

  // ── Identité locale (qui suis-je dans cette équipe ?) ──────────────────
  const [me, setMeRaw] = useState(() => lsGet(`cc.me.${room}`));
  const setMe = (v) => { setMeRaw(v); lsSet(`cc.me.${room}`, v); if (v?.name) lsSet('cc.lastName', v.name); };
  const myPlayer = me?.playerId ? players.find((p) => p.id === me.playerId) : null;
  const meInfo = {
    name: myPlayer?.name || me?.name || 'Anonyme',
    color: myPlayer?.color || me?.color || '#d4b26a',
    playerId: myPlayer ? myPlayer.id : null,
  };

  const ctx = useRef({});
  ctx.current = { state, me: meInfo };
  const actions = useMemo(() => makeActions(store, ctx), [store]);

  // Présence : on annonce qui on est.
  useEffect(() => {
    if (me) store.setPresence({ name: meInfo.name, color: meInfo.color, playerId: meInfo.playerId });
  }, [me, meInfo.name, meInfo.color, meInfo.playerId]);

  // ── Interface ───────────────────────────────────────────────────────────
  const [tab, setTabRaw] = useState(() => lsGet('cc.tab', 'draft'));
  const setTab = (t) => { setTabRaw(t); lsSet('cc.tab', t); };
  const [picker, setPicker] = useState(null); // { mode: 'pool', playerId, role } | { mode: 'draft', group, idx }
  const [addTier, setAddTier] = useState(2);
  const [editing, setEditing] = useState(null); // { playerId, champId }
  const [showSettings, setShowSettings] = useState(false);
  const [showIdentity, setShowIdentity] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const quickRef = useRef(null);

  // ── Draft & moteur ──────────────────────────────────────────────────────
  const draft = state.draft || {};
  const settings = state.settings || {};
  const weight = typeof settings.weight === 'number' ? settings.weight : 1;
  const limit = typeof settings.count === 'number' ? settings.count : 8;

  const enemyPicks = useMemo(() => new Set(slotValues(draft.enemyPicks).filter(Boolean)), [draft]);
  const unavailable = useMemo(() => new Set([
    ...slotValues(draft.enemyBans), ...slotValues(draft.ourBans), ...slotValues(draft.enemyPicks),
  ].filter(Boolean)), [draft]);
  const locks = useMemo(() => slotValues(draft.ourPicks).filter((v) => v?.champ).map((v) => ({ champ: v.champ, player: v.player || null })), [draft]);
  const lockedChamps = useMemo(() => new Set(locks.map((l) => l.champ)), [locks]);
  const usedAll = useMemo(() => new Set([...unavailable, ...lockedChamps]), [unavailable, lockedChamps]);

  // Picks adverses : rôle + stats de winrate.
  const statsCfg = { rank: settings.statsRank || DEFAULT_STATS.rank, region: settings.statsRegion || DEFAULT_STATS.region };
  const matchupWeight = typeof settings.matchupWeight === 'number' ? settings.matchupWeight : 1;
  const enemyIds = slotValues(draft.enemyPicks);
  const statsOf = useChampionStats(enemyIds.filter(Boolean), statsCfg);
  const enemyRoles = assignEnemyRoles(enemyIds, slotValues(draft.enemyRoles), statsOf);
  const enemies = enemyIds.map((id, idx) => (id ? { idx, champ: id, ...enemyRoles[idx], stats: statsOf(id) } : null));
  const enemyByRole = {};
  for (const e of enemies) if (e?.role && !enemyByRole[e.role]) enemyByRole[e.role] = e;
  const muRaw = (id, role) => {
    const e = enemyByRole[role];
    if (!e || e.stats.status !== 'ok') return null;
    const m = matchup(e.stats.data, role, id);
    return m ? { ...m, vs: e.champ } : null;
  };
  const muFn = matchupWeight > 0
    ? (id, role) => {
      const m = muRaw(id, role);
      return m ? { ...m, points: matchupPoints(m, matchupWeight) } : null;
    }
    : null;
  const muKey = Object.entries(enemyByRole).map(([r, e]) => `${r}:${e.champ}:${e.stats.status}`).join(',');

  // Stats des joueurs (Riot ID) et mode de calcul des compos.
  const pstatsApi = usePlayerStats(players, state.accstats || {}, actions.storeAccountStats, snap.loaded);
  // Repérage adverse : mêmes stats, pour les Riot ID de l'équipe d'en face.
  const scoutEntities = useMemo(() => Object.entries(state.scout?.players || {})
    .map(([id, x]) => ({ id, order: x.order || 0, riot: { name: x.name, tag: x.tag, platform: x.platform } }))
    .filter((x) => x.riot.name && x.riot.tag)
    .sort((a, b) => a.order - b.order), [state.scout]);
  const scoutApi = usePlayerStats(scoutEntities, state.scoutstats || {}, actions.storeScoutStats, snap.loaded);
  const [compMode, setCompModeRaw] = useState(() => lsGet('cc.compMode', 'tiers'));
  const setCompMode = (m) => { setCompModeRaw(m); lsSet('cc.compMode', m); setSelectedKey(null); };
  const statsMode = compMode === 'stats';
  const withStats = active.filter((p) => pstatsApi.statsOf(p)).length;
  const statsFn = statsMode ? pstatsApi.statsOf : null;
  const pstatsKey = active.map((p) => { const e = pstatsApi.statsOf(p); return e ? `${p.id}:${e.ts}:${e.accounts}:${e.total?.[0]}` : ''; }).join(',');

  const engineKey = JSON.stringify([
    active.map((p) => [p.id, p.name, p.color, p.pool || {}, p.forcedRole || null]),
    [...unavailable].sort(), locks, weight, limit, muKey, matchupWeight, statsCfg, compMode, statsMode ? pstatsKey : '',
  ]);
  const opts = useMemo(() => ({ unavailable, locks, weight, limit, matchup: muFn, stats: statsFn }), [engineKey]);
  const result = useMemo(() => solve(active, opts), [engineKey]);

  // Comp affichée en grand (on garde la même répartition si elle existe encore).
  const [selectedKey, setSelectedKey] = useState(null);
  const selectedIndex = Math.max(0, result.comps.findIndex((c) => c.key === selectedKey));

  // Priorités calculées juste après l'affichage.
  const [priority, setPriority] = useState(null);
  useEffect(() => {
    setPriority(null);
    if (!result.comps.length) return undefined;
    const t = setTimeout(() => setPriority(pickPriority(active, opts, result)), 30);
    return () => clearTimeout(t);
  }, [result]);

  const owners = useCallback((id) => active.filter((p) => p.pool?.[id]).map((p) => p.name).join(', '), [active]);
  const autoPlayer = useCallback((id) => result.comps[0]?.slots.find((s) => s.champ === id)?.player || null, [result]);

  const saved = useMemo(() => Object.entries(state.saved || {})
    .map(([id, item]) => ({ id, item, ev: evaluateSaved(item, active, {
      unavailable, enemyPicks, locks, weight, matchup: muFn, stats: item.mode === 'stats' ? pstatsApi.statsOf : null,
    }) }))
    .sort((a, b) => (b.ev.ok - a.ev.ok) || b.ev.score - a.ev.score), [state.saved, engineKey, pstatsKey]);

  // ── Historique ──────────────────────────────────────────────────────────
  const games = useMemo(() => Object.entries(state.games || {})
    .map(([id, g]) => ({ id, ...g }))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0)), [state.games]);
  const hist = useMemo(() => historyStats(games), [games]);
  const records = useMemo(() => Object.fromEntries(saved
    .map(({ id, item }) => [id, hist.bySig[compSignature(item.slots)]])
    .filter(([, r]) => r)), [saved, hist]);

  // ── Bans conseillés ─────────────────────────────────────────────────────
  const best = result.comps[0] || null;
  const bestIds = best ? best.slots.map((s) => s.champ) : [];
  const counterStats = useChampionStats(bestIds, statsCfg);
  const scoutData = scoutEntities.map((e) => ({ name: e.riot.name, ps: scoutApi.statsOf(e) })).filter((x) => x.ps);
  const scoutKey = scoutData.map((x) => `${x.name}:${x.ps.ts}`).join(',');
  const counterKey = bestIds.map((id) => `${id}:${counterStats(id).status}`).join(',');
  const meta = useMeta(statsCfg);
  const bans = useMemo(() => banSuggestions({
    meta: meta?.roles,
    scouts: scoutData,
    comp: best,
    counterOf: (id) => { const st = counterStats(id); return st.status === 'ok' ? st.data : null; },
    unavailable: usedAll,
    protect: new Set(bestIds),
  }), [scoutKey, counterKey, best?.key, [...usedAll].join(','), meta?.patch]);
  const scoutBans = useMemo(() => banSuggestions({ scouts: scoutData, unavailable: usedAll, limit: 6 }), [scoutKey, [...usedAll].join(',')]);

  // Analyse de la draft : plan de jeu, flex picks, sécurité en blind, votes.
  const plan = useMemo(() => gamePlan(best ? best.slots.map((x) => x.champ) : [], enemies.filter(Boolean).map((e) => e.champ)),
    [best?.key, enemies.map((e) => e?.champ).join(',')]);
  const flex = useMemo(() => flexPicks(active, usedAll), [active, [...usedAll].join(',')]);
  const safetyOf = (id, role) => { const st = counterStats(id); return st.status === 'ok' ? blindSafety(st.data, role) : null; };
  const votes = state.votes || {};
  const votesOf = (comp) => {
    const slots = Object.fromEntries(comp.slots.map((x) => [x.role, { champ: x.champ, player: x.player.id }]));
    const v = votes[voteKey(slots)] || {};
    const vals = Object.entries(v);
    const meId = meInfo.playerId || store.deviceId;
    return { up: vals.filter(([, x]) => x > 0).length, down: vals.filter(([, x]) => x < 0).length, mine: v[meId] || 0, slots };
  };

  // Conseil de l'étape de draft en cours.
  const draftSuggest = {
    ban: bans[0] ? { champ: bans[0].champ, why: bans[0].reasons[0], act: () => actions.banNext(bans[0].champ) } : null,
    pick: (() => {
      const top = (priority || []).find((x) => !lockedChamps.has(x.champ));
      const slot = top || best?.slots.find((x) => !lockedChamps.has(x.champ));
      if (!slot) return null;
      const safe = safetyOf(slot.champ, slot.role);
      const isFlex = flex.some((f) => f.champ === slot.champ);
      const extra = [isFlex ? 'flex' : null, safe?.level === 'safe' ? 'blind sûr' : safe?.level === 'risky' ? 'risqué en blind' : null].filter(Boolean).join(', ');
      return { champ: slot.champ, why: `${slot.player.name} · ${ROLE_LABEL[slot.role]}${extra ? ` · ${extra}` : ''}${top && top.points > 0 ? ` · −${top.points === Infinity ? '∞' : top.points} si perdu` : ''}`, act: () => actions.toggleLock(slot.champ, slot.player.id) };
    })(),
  };
  const recordGame = (win) => {
    if (!best) { toast({ text: 'Il faut une compo complète pour noter le résultat.', type: 'warn' }); return; }
    const slots = Object.fromEntries(best.slots.map((x) => [x.role, { champ: x.champ, player: x.player.id, name: x.player.name }]));
    const enemy = enemies.filter(Boolean).map((e) => ({ champ: e.champ, role: e.role || null }));
    actions.recordGame({ win, slots, enemy, opponent: state.scout?.team || null, mode: compMode });
    actions.resetDraft();
    toast({ text: `${win ? 'Victoire' : 'Défaite'} notée dans l’historique. La draft est vidée pour la suite.`, type: 'ok' });
  };

  // ── Présence & activité ─────────────────────────────────────────────────
  const onlineList = useMemo(() => {
    const seen = new Map();
    for (const [cid, p] of Object.entries(snap.presence || {})) {
      const key = p.playerId || p.name;
      if (!seen.has(key) || cid === store.clientId) seen.set(key, { cid, ...p });
    }
    return [...seen.values()];
  }, [snap.presence]);
  const onlineIds = useMemo(() => new Set(onlineList.map((p) => p.playerId).filter(Boolean)), [onlineList]);

  const startedAt = useRef(Date.now());
  const seenActivity = useRef(new Set());
  useEffect(() => {
    for (const a of snap.activity || []) {
      if (seenActivity.current.has(a.id)) continue;
      seenActivity.current.add(a.id);
      const fresh = (a.ts || 0) > startedAt.current - 1500;
      if (fresh && a.cid !== store.deviceId && (a.kind === 'draft' || a.kind === 'join')) {
        toast({ who: a.by, color: a.color, text: a.text });
      }
    }
  }, [snap.activity]);

  const [lastSeen, setLastSeen] = useState(() => lsGet(`cc.seen.${room}`, 0));
  const unread = (snap.activity || []).filter((a) => a.cid !== store.deviceId && (a.ts || 0) > lastSeen).length;
  const openActivity = () => {
    setShowActivity(true);
    const now = Date.now();
    setLastSeen(now);
    lsSet(`cc.seen.${room}`, now);
  };

  // Raccourci clavier « / » pour l'ajout rapide pendant la draft.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (document.querySelector('.modal-backdrop')) return;
      e.preventDefault();
      setTab('draft');
      setTimeout(() => quickRef.current?.focus(), 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const inviteUrl = `${location.origin}${location.pathname}?room=${encodeURIComponent(room)}`;
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast({ text: 'Lien d’invitation copié : envoie-le à ton équipe !', type: 'ok' });
    } catch {
      window.prompt('Copie ce lien et envoie-le à ton équipe :', inviteUrl);
    }
  };

  // ── Sélecteurs de champions ─────────────────────────────────────────────
  const pickerPlayer = picker?.mode === 'pool' ? players.find((p) => p.id === picker.playerId) : null;
  const pickerProps = (() => {
    if (!picker) return null;
    if (picker.mode === 'pool') {
      if (!pickerPlayer) return null;
      const pool = pickerPlayer.pool || {};
      const role = picker.role;
      return {
        title: `Pool de ${pickerPlayer.name}`,
        subtitle: role
          ? `Rôle ${ROLE_LABEL[role]} — clique pour ajouter ou retirer un champion.`
          : 'Clique pour ajouter un champion (dans son rôle habituel) ou le retirer.',
        initialRole: role || 'all',
        multi: true,
        isSelected: (id) => (role ? !!pool[id]?.[role] : !!pool[id]),
        onPick: (id) => {
          if (role) actions.setTier(pickerPlayer.id, id, role, pool[id]?.[role] ? 0 : addTier);
          else if (pool[id]) actions.removeChamp(pickerPlayer.id, id);
          else actions.setTier(pickerPlayer.id, id, champ(id).roles[0] || 'mid', addTier);
        },
        toolbar: html`<div class="add-tier"><span class="muted small">Niveau ajouté :</span>
          <${TierPicker} value=${addTier} onChange=${setAddTier} allowNone=${false} size="sm" /></div>`,
      };
    }
    const { group, idx } = picker;
    const current = group === 'ourPicks' ? draft.ourPicks?.[idx]?.champ : draft[group]?.[idx];
    return {
      title: `${GROUP_LABEL[group]} n°${idx + 1}`,
      subtitle: group === 'ourPicks'
        ? 'Le champion qu’on vient de verrouiller.'
        : 'Les champions avec un badge sont dans nos pools (le chiffre = nombre de joueurs).',
      initialRole: 'all',
      multi: false,
      isDisabled: (id) => usedAll.has(id) && id !== current,
      hint: (id) => active.filter((p) => p.pool?.[id]).length || null,
      hintTitle: (id) => `Dans le pool de ${owners(id)}`,
      onPick: (id) => {
        if (group === 'ourPicks') actions.setOurPick(idx, { champ: id, player: draft.ourPicks?.[idx]?.player || null });
        else actions.setSlot(group, idx, id);
        setPicker(null);
      },
    };
  })();

  const editingPlayer = editing ? players.find((p) => p.id === editing.playerId) : null;

  // ── Rendu ───────────────────────────────────────────────────────────────
  const teamName = state.meta?.name || 'Mon équipe';
  const needIdentity = snap.loaded && (!me || showIdentity);

  return html`<div class="app">
    <header class="topbar">
      <div class="brand">
        <${Logo} size=${36} />
        <div class="brand-txt">
          <span class="brand-name">Clash Compo</span>
          <${TeamName} value=${teamName} onCommit=${actions.setTeamName} />
        </div>
      </div>
      <nav class="tabs" role="tablist" aria-label="Sections">
        <button type="button" role="tab" aria-selected=${tab === 'draft'} class=${cx('tab', tab === 'draft' && 'on')} onClick=${() => setTab('draft')}>
          <${Icon} name="swords" size=${17} /> Draft & compos
        </button>
        <button type="button" role="tab" aria-selected=${tab === 'scout'} class=${cx('tab', tab === 'scout' && 'on')} onClick=${() => setTab('scout')}>
          <${Icon} name="target" size=${17} /> Adversaires ${scoutEntities.length > 0 && html`<span class="tab-count">${scoutEntities.length}</span>`}
        </button>
        <button type="button" role="tab" aria-selected=${tab === 'history'} class=${cx('tab', tab === 'history' && 'on')} onClick=${() => setTab('history')}>
          <${Icon} name="crown" size=${17} /> Historique ${games.length > 0 && html`<span class="tab-count">${hist.wins}-${hist.losses}</span>`}
        </button>
        <button type="button" role="tab" aria-selected=${tab === 'team'} class=${cx('tab', tab === 'team' && 'on')} onClick=${() => setTab('team')}>
          <${Icon} name="users" size=${17} /> Joueurs <span class="tab-count">${players.length}</span>
        </button>
      </nav>
      <div class="topbar-right">
        <${StatusPill} mode=${snap.mode} status=${snap.status} />
        <${PresenceStack} list=${onlineList} myCid=${store.clientId} />
        <button type="button" class="icon-btn has-badge" onClick=${openActivity} aria-label="Activité de l’équipe" title="Activité de l’équipe">
          <${Icon} name="bell" size=${18} />
          ${unread > 0 && html`<span class="badge">${unread > 9 ? '9+' : unread}</span>`}
        </button>
        <button type="button" class="icon-btn" onClick=${() => setShowSettings(true)} aria-label="Réglages" title="Réglages">
          <${Icon} name="sliders" size=${18} />
        </button>
        <button type="button" class="btn btn-gold btn-sm invite" onClick=${copyInvite} title="Copier le lien de l’équipe">
          <${Icon} name="link" size=${15} /> <span>Inviter</span>
        </button>
        <button type="button" class="me-chip" onClick=${() => setShowIdentity(true)} title="Changer de pseudo / d’identité">
          <${Avatar} name=${meInfo.name} color=${meInfo.color} size=${26} />
          <span>${meInfo.name}</span>
        </button>
      </div>
    </header>

    ${snap.mode === 'local' && html`<div class="banner banner-local">
      <${Icon} name="info" size=${16} />
      <span><b>Mode local</b> : les modifications restent dans ce navigateur. Pour éditer à plusieurs en direct, colle l’URL de ta base Firebase dans <code>config.js</code> (2 minutes, voir README).</span>
    </div>`}
    ${snap.loaded && state.meta?.protected && !secured && html`<${CodeGate} room=${room} />`}
    ${snap.error && html`<div class="banner banner-error"><${Icon} name="alert" size=${16} /><span>${snap.error}</span></div>`}

    <main class=${cx('main', snap.loaded && tab === 'draft' && 'is-workspace')}>
      ${!snap.loaded
        ? html`<div class="loading-room"><span class="spinner"></span><p class="muted">Connexion à l’équipe…</p></div>`
        : tab === 'draft'
        ? html`<div class="workspace">
          <aside class="col col-draft" aria-label="Draft">
            <${DraftBoard} draft=${draft} players=${active} actions=${actions} usedAll=${usedAll} owners=${owners}
              autoPlayer=${autoPlayer} openSlot=${(group, idx) => setPicker({ mode: 'draft', group, idx })} quickRef=${quickRef}
              enemies=${enemies} suggest=${draftSuggest} />
          </aside>
          <${CompsView} result=${result} weight=${weight} selected=${selectedIndex}
            onSelect=${(i) => setSelectedKey(result.comps[i]?.key)} lockedChamps=${lockedChamps} actions=${actions}
            priority=${priority} saved=${saved} onGoPlayers=${() => setTab('team')} playersCount=${players.length}
            enemies=${enemies} players=${active} unavailable=${usedAll} muRaw=${muRaw}
            mode=${compMode} onMode=${setCompMode} withStats=${withStats} bans=${bans} records=${records} teamName=${teamName} onRecord=${recordGame}
            plan=${plan} flex=${flex} safetyOf=${safetyOf} votesOf=${votesOf} meta=${meta} />
        </div>`
        : tab === 'scout'
        ? html`<${ScoutView} team=${state.scout?.team || ''} actions=${actions} unavailable=${usedAll} bans=${scoutBans}
            onRefresh=${() => scoutEntities.forEach((e) => scoutApi.refresh(e))}
            scouts=${scoutEntities.map((e) => ({ id: e.id, riot: e.riot, ps: scoutApi.statsOf(e), status: scoutApi.accountsStatus(e)[0] || { status: 'loading' } }))} />`
        : tab === 'history'
        ? html`<${HistoryView} games=${games} stats=${hist} players=${players} saved=${saved} actions=${actions} onGoDraft=${() => setTab('draft')}
            tournament=${state.tournament || {}} opponent=${state.scout?.team || ''} />`
        : html`<${PlayersView} players=${players} actions=${actions} meId=${meInfo.playerId} onlineIds=${onlineIds} pstats=${pstatsApi} clashDate=${state.meta?.clashDate || ''} meta=${meta?.roles}
            unavailable=${unavailable} onAdd=${(playerId, role) => setPicker({ mode: 'pool', playerId, role })}
            onEdit=${(playerId, champId) => setEditing({ playerId, champId })} onAddPlayer=${() => setAddingPlayer(true)} />`}
    </main>


    ${pickerProps && html`<${ChampionPicker} open=${true} onClose=${() => setPicker(null)} ...${pickerProps} />`}
    <${PoolEditor} open=${!!editingPlayer} player=${editingPlayer} champId=${editing?.champId} onClose=${() => setEditing(null)} actions=${actions} />
    <${AddPlayerModal} open=${addingPlayer} onClose=${() => setAddingPlayer(false)} onAdd=${(name) => actions.addPlayer(name)} />
    <${SettingsModal} open=${showSettings} onClose=${() => setShowSettings(false)} state=${state} weight=${weight} limit=${limit}
      actions=${actions} room=${room} mode=${snap.mode} status=${snap.status} secured=${secured} onIdentity=${() => { setShowSettings(false); setShowIdentity(true); }} />
    <${ActivityDrawer} open=${showActivity} onClose=${() => setShowActivity(false)} items=${snap.activity || []} myCid=${store.deviceId} />
    ${needIdentity && html`<${IdentityModal} teamName=${teamName} players=${players} onlineIds=${onlineIds} current=${me}
      canClose=${!!me} onClose=${() => setShowIdentity(false)}
      onChoose=${(identity) => { setMe(identity); setShowIdentity(false); }}
      onCreate=${(name) => { const p = actions.addPlayer(name, { self: true }); setMe({ name: p.name, playerId: p.id, color: p.color }); setShowIdentity(false); setTab('team'); }} />`}
    <${ToastHost} />
  </div>`;
}

function TeamName({ value, onCommit }) {
  const [v, setV] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setV(value); }, [value, editing]);
  return html`<input class="team-name" value=${v} maxlength="32" aria-label="Nom de l’équipe" title="Nom de l’équipe (modifiable)" spellcheck="false"
    onFocus=${() => setEditing(true)} onInput=${(e) => setV(e.currentTarget.value)}
    onBlur=${() => { setEditing(false); const t = v.trim(); if (t && t !== value) onCommit(t); else setV(value); }}
    onKeyDown=${(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />`;
}

function StatusPill({ mode, status }) {
  const s = mode === 'local'
    ? { cls: 'local', txt: 'Local', tip: 'Mode local : rien n’est partagé' }
    : status === 'live'
      ? { cls: 'live', txt: 'En direct', tip: 'Synchronisé en temps réel avec l’équipe' }
      : { cls: 'wait', txt: 'Connexion…', tip: 'Connexion au serveur en cours' };
  return html`<span class=${cx('status-pill', s.cls)} title=${s.tip}><span class="pulse"></span>${s.txt}</span>`;
}

function PresenceStack({ list, myCid }) {
  const shown = list.slice(0, 5);
  const more = list.length - shown.length;
  return html`<div class="presence" title=${list.map((p) => p.name).join(', ')} aria-label=${`${list.length} en ligne`}>
    ${shown.map((p) => html`<${Avatar} key=${p.cid} name=${p.name} color=${p.color} size=${28} online
      title=${`${p.name}${p.cid === myCid ? ' (toi)' : ''} — en ligne`} />`)}
    ${more > 0 && html`<span class="avatar more" style=${{ '--s': '28px' }}>+${more}</span>`}
  </div>`;
}

function ActivityDrawer({ open, onClose, items, myCid }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  return html`<div class="drawer-backdrop" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside class="drawer" role="dialog" aria-label="Activité de l’équipe">
      <header class="drawer-head">
        <h2><${Icon} name="bell" size=${18} /> Activité</h2>
        <button type="button" class="icon-btn" onClick=${onClose} aria-label="Fermer"><${Icon} name="x" /></button>
      </header>
      ${items.length === 0
        ? html`<p class="muted small drawer-empty">Rien pour l’instant. Chaque modification de l’équipe apparaîtra ici.</p>`
        : html`<ul class="feed">
          ${items.map((a) => html`<li class=${cx('feed-item', a.kind === 'draft' && 'is-draft', a.cid === myCid && 'is-mine')} key=${a.id}>
            <span class="feed-dot" style=${{ background: a.color || '#8b95a7' }}></span>
            <div>
              <p><b>${a.by}</b> ${a.text}</p>
              <time class="muted tiny">${timeAgo(a.ts)}</time>
            </div>
          </li>`)}
        </ul>`}
    </aside>
  </div>`;
}

function IdentityModal({ teamName, players, onlineIds, current, canClose, onClose, onChoose, onCreate }) {
  const [name, setName] = useState(() => (current?.playerId ? '' : current?.name) || lsGet('cc.lastName', '') || '');
  const trimmed = name.trim();
  const clash = players.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  return html`<${Modal} open=${true} onClose=${canClose ? onClose : undefined} title=${`Bienvenue dans « ${teamName} »`}
    subtitle="Ton pseudo sert à afficher qui modifie quoi, en direct." size="sm">
    ${players.length > 0 && html`<div class="id-section">
      <h4>C’est moi :</h4>
      <div class="id-players">
        ${players.map((p) => html`<button type="button" key=${p.id} class=${cx('id-player', current?.playerId === p.id && 'on')}
          onClick=${() => onChoose({ name: p.name, playerId: p.id, color: p.color })}>
          <${Avatar} name=${p.name} color=${p.color} size=${30} online=${onlineIds.has(p.id)} />
          <span>${p.name}</span>
        </button>`)}
      </div>
    </div>`}
    <form class="id-section" onSubmit=${(e) => { e.preventDefault(); if (!trimmed) return; if (clash) onChoose({ name: clash.name, playerId: clash.id, color: clash.color }); else onCreate(trimmed); }}>
      <h4>${players.length ? 'Ou nouveau joueur :' : 'Ton pseudo :'}</h4>
      <div class="id-row">
        <input data-autofocus class="input" value=${name} maxlength="28" placeholder="Ton pseudo (ex : Faker#EUW)"
          onInput=${(e) => setName(e.currentTarget.value)} aria-label="Ton pseudo" />
        <button type="submit" class="btn btn-gold" disabled=${!trimmed}>${clash ? 'C’est moi' : 'Rejoindre'}</button>
      </div>
      <button type="button" class="link-btn" disabled=${!trimmed} onClick=${() => trimmed && onChoose({ name: trimmed, playerId: null, color: '#8b95a7' })}>
        Juste regarder (sans être dans l’équipe)
      </button>
    </form>
  <//>`;
}

function AddPlayerModal({ open, onClose, onAdd }) {
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);
  const submit = (e) => {
    e.preventDefault();
    const t = name.trim();
    if (!t) return;
    onAdd(t);
    setName('');
    toast({ text: `${t.split('#')[0].trim()} ajouté à l’équipe`, type: 'ok' });
  };
  return html`<${Modal} open=${open} onClose=${onClose} title="Ajouter un joueur" subtitle="Ajoute autant de joueurs que tu veux (remplaçants compris)." size="sm">
    <form class="id-row" onSubmit=${submit}>
      <input data-autofocus class="input" value=${name} maxlength="28" placeholder="Pseudo ou Riot ID (Pseudo#TAG)" onInput=${(e) => setName(e.currentTarget.value)} aria-label="Pseudo" />
      <button type="submit" class="btn btn-gold" disabled=${!name.trim()}>Ajouter</button>
    </form>
    <p class="muted small">Avec le Riot ID (ex. <b>Faker#KR1</b>), ses stats de la saison sont chargées automatiquement. Chaque pote peut aussi s’ajouter tout seul avec le lien d’invitation.</p>
  <//>`;
}

function SettingsModal({ open, onClose, state, weight, limit, actions, room, mode, status, onIdentity, secured }) {
  const fileRef = useRef(null);
  if (!open) return null;
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'clash-compo', version: 1, exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clash-compo-${room}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importData = async (file) => {
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'clash-compo' || typeof data.state !== 'object') throw new Error('format');
      if (!window.confirm('Remplacer toutes les données de l’équipe par cette sauvegarde ? (visible par tous)')) return;
      actions.importState(data.state);
      toast({ text: 'Sauvegarde importée', type: 'ok' });
      onClose();
    } catch {
      toast({ text: 'Fichier invalide : ce n’est pas une sauvegarde Clash Compo.', type: 'warn' });
    }
  };
  const weights = [[0, 'Ignorer'], [0.5, 'Léger'], [1, 'Normal'], [1.5, 'Fort'], [2, 'Très fort']];
  const counts = [4, 6, 8, 12];
  return html`<${Modal} open=${open} onClose=${onClose} title="Réglages" subtitle="Partagés avec toute l’équipe." size="md">
    <div class="settings">
      <section>
        <h4>Équilibre de la compo</h4>
        <p class="muted small">Poids des bonus/malus d’équilibre (dégâts AD/AP, frontline, engage) par rapport au confort des joueurs.</p>
        <div class="seg seg-wide">
          ${weights.map(([w, label]) => html`<button type="button" class=${cx(weight === w && 'on')} onClick=${() => actions.setSetting('weight', w)}>${label}</button>`)}
        </div>
      </section>
      <section>
        <h4>Nombre d’options proposées</h4>
        <div class="seg">
          ${counts.map((n) => html`<button type="button" class=${cx(limit === n && 'on')} onClick=${() => actions.setSetting('count', n)}>${n}</button>`)}
        </div>
      </section>
      <section>
        <h4>Winrates des matchups</h4>
        <p class="muted small">Notre winrate contre le pick adverse de la même lane (source : U.GG, patch en cours, ranked solo/duo).</p>
        <div class="settings-row"><span class="muted small">Importance</span>
          <div class="seg">
            ${[[0, 'Ignorer'], [0.5, 'Léger'], [1, 'Normal'], [2, 'Fort']].map(([w, label]) => html`<button type="button"
              class=${cx((state.settings?.matchupWeight ?? 1) === w && 'on')} onClick=${() => actions.setSetting('matchupWeight', w)}>${label}</button>`)}
          </div>
        </div>
        <div class="settings-row"><span class="muted small">Rang</span>
          <div class="seg">
            ${STAT_RANKS.map(([v, label]) => html`<button type="button" class=${cx((state.settings?.statsRank || DEFAULT_STATS.rank) === v && 'on')}
              onClick=${() => actions.setSetting('statsRank', v)}>${label}</button>`)}
          </div>
        </div>
        <div class="settings-row"><span class="muted small">Région</span>
          <div class="seg">
            ${STAT_REGIONS.map(([v, label]) => html`<button type="button" class=${cx((state.settings?.statsRegion || DEFAULT_STATS.region) === v && 'on')}
              onClick=${() => actions.setSetting('statsRegion', v)}>${label}</button>`)}
          </div>
        </div>
      </section>
      <section>
        <h4>Comment la note est calculée</h4>
        <ul class="scoring muted small">
          <li>Confort : S = ${TIER_VALUE[4]} pts, A = ${TIER_VALUE[3]}, B = ${TIER_VALUE[2]}, C = ${TIER_VALUE[1]} (pick verrouillé hors pool = ${OFFPOOL_VALUE}).</li>
          <li>Dégâts : +2 si bien mixte AD/AP, jusqu’à −5 si full AD ou full AP.</li>
          <li>Frontline : −4 s’il n’y en a aucune, +1,5 à partir de deux.</li>
          <li>Engage : −3 sans engage, +1 à partir de deux.</li>
          <li>Matchup : +0,5 pt par % de winrate au-dessus de 50 % contre le pick adverse de la lane (−0,5 en dessous), max ±4. Les matchups peu joués sont ramenés vers 50 %.</li>
          <li>Les rôles et profils des champions sont modifiables dans <code>js/data.js</code>.</li>
        </ul>
      </section>
      <section>
        <h4>Sauvegarde</h4>
        <div class="row-gap">
          <button type="button" class="btn btn-ghost" onClick=${exportData}><${Icon} name="download" size=${16} /> Exporter (JSON)</button>
          <button type="button" class="btn btn-ghost" onClick=${() => fileRef.current?.click()}><${Icon} name="upload" size=${16} /> Importer…</button>
          <input ref=${fileRef} type="file" accept="application/json,.json" hidden onChange=${(e) => { const f = e.currentTarget.files?.[0]; if (f) importData(f); e.currentTarget.value = ''; }} />
        </div>
      </section>
      ${mode === 'firebase' && html`<${AccessSettings} room=${room} secured=${secured} />`}
      <${DiscordSettings} settings=${state.settings || {}} actions=${actions} teamName=${state.meta?.name || 'Mon équipe'} />
      <${LcuSettings} room=${room} secured=${secured} />
      <section>
        <h4>Moi & connexion</h4>
        <div class="row-gap">
          <button type="button" class="btn btn-ghost" onClick=${onIdentity}><${Icon} name="user" size=${16} /> Changer de pseudo / d’identité</button>
        </div>
        <p class="muted small">Synchro : <b>${mode === 'firebase' ? (status === 'live' ? 'Firebase, en direct' : 'Firebase, connexion…') : 'locale (ce navigateur uniquement)'}</b> · Équipe : <code>${room}</code> · Patch ${patchLabel()}</p>
      </section>
      <section>
        <h4>À propos</h4>
        <p class="muted small">Winrates des matchups : U.GG. Stats des joueurs : DeepLoL. Images : Riot Data Dragon.</p>
        <p class="muted tiny legal">Clash Compo n’est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games ou de toute personne officiellement impliquée dans la production ou la gestion des propriétés de Riot Games. Riot Games et toutes les propriétés associées sont des marques commerciales ou des marques déposées de Riot Games, Inc.</p>
      </section>
    </div>
  <//>`;
}

// ── Équipe protégée par un code ───────────────────────────────────────────
/** Écran demandant le code d'une équipe protégée. onOk(path) ; sinon recharge la page. */
export function CodeGate({ room, onOk }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setErr('');
    try {
      const path = await checkCode(firebaseConfig.databaseURL, room, code);
      if (!path) { setErr('Code incorrect.'); setBusy(false); return; }
      rememberCode(room, code.trim());
      if (onOk) onOk(path); else location.reload();
    } catch {
      setErr('Connexion impossible, réessaie.');
      setBusy(false);
    }
  };
  return html`<div class="code-gate">
    <form class="code-box panel" onSubmit=${submit}>
      <${Logo} size=${48} />
      <h2>Équipe protégée</h2>
      <p class="muted">Entre le code de l’équipe pour y accéder. Demande-le à un pote de l’équipe.</p>
      <input class="input" type="password" value=${code} placeholder="Code de l’équipe" autocomplete="off" data-autofocus
        onInput=${(e) => setCode(e.currentTarget.value)} aria-label="Code de l’équipe" />
      ${err && html`<p class="riot-msg warn small">${err}</p>`}
      <button type="submit" class="btn btn-gold" disabled=${busy || !code.trim()}>${busy ? 'Vérification…' : 'Entrer'}</button>
    </form>
  </div>`;
}

function AccessSettings({ room, secured }) {
  const [code, setCode] = useState('');
  const [code2, setCode2] = useState('');
  const [busy, setBusy] = useState(false);
  const base = firebaseConfig.databaseURL;
  const run = async (fn, ok) => {
    setBusy(true);
    try { await fn(); toast({ text: ok, type: 'ok' }); setTimeout(() => location.reload(), 900); }
    catch (e) { toast({ text: e.message || 'Échec', type: 'warn' }); setBusy(false); }
  };
  if (!secured) {
    return html`<section>
      <h4>Accès à l’équipe</h4>
      <p class="muted small">Aujourd’hui, le lien d’invitation suffit pour entrer. Avec un code, il faudra en plus le code (à donner à part, par exemple en message privé).</p>
      <div class="row-gap">
        <input class="input input-sm" type="password" value=${code} placeholder="Nouveau code (6 caractères min.)" style=${{ maxWidth: '260px' }}
          onInput=${(e) => setCode(e.currentTarget.value)} autocomplete="new-password" />
        <button type="button" class="btn btn-ghost btn-sm" disabled=${busy || code.trim().length < 6}
          onClick=${() => window.confirm('Protéger l’équipe avec ce code ? Tout le monde devra le saisir une fois.') && run(() => protectRoom(base, room, code.trim()), 'Équipe protégée par un code.')}>
          <${Icon} name="lock" size=${14} /> Protéger
        </button>
      </div>
    </section>`;
  }
  return html`<section>
    <h4>Accès à l’équipe</h4>
    <p class="muted small"><${Icon} name="lock" size=${13} /> Équipe protégée : il faut le lien <b>et</b> le code pour entrer.</p>
    <div class="row-gap">
      <input class="input input-sm" type="password" value=${code} placeholder="Code actuel" style=${{ maxWidth: '180px' }} onInput=${(e) => setCode(e.currentTarget.value)} />
      <input class="input input-sm" type="password" value=${code2} placeholder="Nouveau code" style=${{ maxWidth: '180px' }} onInput=${(e) => setCode2(e.currentTarget.value)} />
      <button type="button" class="btn btn-ghost btn-sm" disabled=${busy || !code || code2.trim().length < 6}
        onClick=${() => run(() => changeCode(base, room, code, code2.trim()), 'Code changé.')}>Changer le code</button>
      <button type="button" class="btn btn-ghost btn-sm danger" disabled=${busy || !code}
        onClick=${() => window.confirm('Retirer le code ? Le lien suffira de nouveau pour entrer.') && run(() => unprotectRoom(base, room, code), 'Protection retirée.')}>Retirer le code</button>
    </div>
  </section>`;
}

function DiscordSettings({ settings, actions, teamName }) {
  const [hook, setHook] = useState(settings.discordWebhook || '');
  useEffect(() => { setHook(settings.discordWebhook || ''); }, [settings.discordWebhook]);
  const valid = isWebhook(hook);
  const save = () => {
    if (hook && !valid) { toast({ text: 'Ce n’est pas un lien de webhook Discord.', type: 'warn' }); return; }
    actions.setSetting('discordWebhook', hook.trim() || null);
    toast({ text: hook ? 'Salon Discord relié.' : 'Salon Discord retiré.', type: 'ok' });
  };
  const test = async () => {
    const ok = await postDiscord(hook, `👋 **Clash Compo** est relié à ce salon pour l’équipe « ${teamName} ».`);
    toast({ text: ok ? 'Message de test envoyé sur Discord.' : 'Échec de l’envoi : vérifie le lien.', type: ok ? 'ok' : 'warn' });
  };
  const auto = settings.discordAuto !== false;
  return html`<section>
    <h4>Discord</h4>
    <p class="muted small">Colle le lien d’un webhook (Discord › Paramètres du salon › Intégrations › Webhooks › Copier l’URL). Les compos validées et les résultats y seront postés automatiquement. Le lien est visible par toute personne qui a accès à l’équipe.</p>
    <div class="row-gap">
      <input class="input input-sm" value=${hook} placeholder="https://discord.com/api/webhooks/…" style=${{ flex: '1', minWidth: '260px' }}
        onInput=${(e) => setHook(e.currentTarget.value)} spellcheck="false" autocomplete="off" />
      <button type="button" class="btn btn-ghost btn-sm" onClick=${save} disabled=${hook === (settings.discordWebhook || '')}>Enregistrer</button>
      <button type="button" class="btn btn-ghost btn-sm" onClick=${test} disabled=${!valid}>Tester</button>
    </div>
    ${settings.discordWebhook && html`<label class="field-inline small">
      <input type="checkbox" checked=${auto} onChange=${(e) => actions.setSetting('discordAuto', e.currentTarget.checked)} />
      Poster automatiquement les compos validées et les résultats
    </label>`}
  </section>`;
}

function LcuSettings({ room, secured }) {
  const cmd = `python lcu_bridge.py --room ${room}${secured ? ' --code TON_CODE' : ''}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(cmd); toast({ text: 'Commande copiée.', type: 'ok' }); }
    catch { window.prompt('Copie cette commande :', cmd); }
  };
  return html`<section>
    <h4>Liaison avec le client LoL</h4>
    <p class="muted small">Un petit programme lancé sur le PC d’un joueur lit la sélection des champions en direct et remplit la draft du site tout seul (bans, picks, côté). Il faut Python installé. Télécharge
      <a href="https://raw.githubusercontent.com/aymc93/clash-compo/main/companion/lcu_bridge.py" target="_blank" rel="noopener" download>lcu_bridge.py</a>,
      puis lance dans le même dossier :</p>
    <div class="row-gap"><code class="cmd">${cmd}</code><button type="button" class="btn btn-ghost btn-sm" onClick=${copy}>Copier</button></div>
  </section>`;
}
