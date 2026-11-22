// Toutes les modifications de l'état partagé passent par ici :
// écriture dans la base + ligne dans le journal d'activité (visible par tous).
import { champ, ROLES, ROLE_LABEL, TIER_LETTER } from './data.js';
import { uid } from './util.js';
import { DEFAULT_PLATFORM, parseRiotId } from './playerstats.js';

export const PLAYER_COLORS = [
  '#f5b942', '#3ddc97', '#4c9dff', '#ff6b9a', '#a78bfa',
  '#ff8a4c', '#2dd4bf', '#f472b6', '#facc15', '#60a5fa',
];

export const DRAFT_GROUPS = ['enemyBans', 'ourBans', 'enemyPicks', 'ourPicks'];
export const GROUP_LABEL = {
  enemyBans: 'Ban adverse', ourBans: 'Notre ban', enemyPicks: 'Pick adverse', ourPicks: 'Notre pick',
};

export const slotValues = (group) => [0, 1, 2, 3, 4].map((i) => group?.[i] ?? null);

/**
 * @param store  store de synchro
 * @param ctx    ref dont `.current` = { state, me: { name, color, playerId } }
 */
export function makeActions(store, ctx) {
  const S = () => ctx.current.state || {};
  const me = () => ctx.current.me || { name: 'Quelqu’un', color: '#8b95a7' };
  const log = (text, kind = 'edit', coalesce = null) =>
    store.log({ by: me().name, color: me().color, cid: store.deviceId, text, kind }, coalesce);
  const pName = (pid) => S().players?.[pid]?.name || 'un joueur';
  const poolOf = (pid) => (me().playerId === pid ? 'son pool' : `le pool de ${pName(pid)}`);
  const cName = (id) => champ(id).name;

  const freeColor = () => {
    const used = new Set(Object.values(S().players || {}).map((p) => p.color));
    return PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[Object.keys(S().players || {}).length % PLAYER_COLORS.length];
  };

  const a = {
    // ── Équipe ────────────────────────────────────────────────────────────
    /** `name` peut être un Riot ID (« Pseudo#TAG ») : le pseudo et le compte sont alors remplis. */
    addPlayer(name, { self = false } = {}) {
      const id = uid('p');
      const color = freeColor();
      const riotId = parseRiotId(name);
      if (riotId) name = riotId.name;
      const accounts = riotId ? { [uid('a')]: { ...riotId, platform: DEFAULT_PLATFORM, order: Date.now() } } : null;
      store.set(`players/${id}`, { name, color, order: Date.now(), active: true, ...(accounts ? { accounts } : {}) });
      if (self) store.log({ by: name, color, cid: store.deviceId, text: 'a rejoint l’équipe', kind: 'join' });
      else log(`a ajouté ${name} à l’équipe`);
      return { id, color, name };
    },
    renamePlayer(pid, name) {
      const old = pName(pid);
      store.set(`players/${pid}/name`, name);
      log(`a renommé ${old} en ${name}`);
    },
    removePlayer(pid) {
      const name = pName(pid);
      const updates = { [`players/${pid}`]: null, [`accstats/${pid}`]: null, [`pstats/${pid}`]: null };
      slotValues(S().draft?.ourPicks).forEach((v, i) => {
        if (v?.player === pid) updates[`draft/ourPicks/${i}/player`] = null;
      });
      store.update(updates);
      log(`a retiré ${name} de l’équipe`);
    },
    setActive(pid, active) {
      store.set(`players/${pid}/active`, active);
      log(active ? `a remis ${pName(pid)} titulaire` : `a mis ${pName(pid)} remplaçant`);
    },
    /** Ajoute un compte Riot ({ name, tag, platform }) au joueur : ses stats seront chargées et cumulées. */
    addAccount(pid, riot) {
      const aid = uid('a');
      store.update({ [`players/${pid}/accounts/${aid}`]: { ...riot, order: Date.now() }, [`pstats/${pid}`]: null });
      log(`a ajouté le compte ${riot.name}#${riot.tag} à ${pName(pid)}`);
      return aid;
    },
    /** Retire un compte (aid = 'main' pour l'ancien compte unique). */
    removeAccount(pid, aid) {
      const p = S().players?.[pid];
      const acc = aid === 'main' ? p?.riot : p?.accounts?.[aid];
      store.update({
        [aid === 'main' ? `players/${pid}/riot` : `players/${pid}/accounts/${aid}`]: null,
        [`accstats/${pid}/${aid}`]: null,
        [`pstats/${pid}`]: null,
      });
      log(`a retiré le compte ${acc ? `${acc.name}#${acc.tag}` : 'Riot'} de ${pName(pid)}`);
    },
    /** Stats téléchargées d'un compte (pas de ligne dans le journal : c'est automatique). */
    storeAccountStats(pid, aid, data) {
      store.set(`accstats/${pid}/${aid}`, data);
    },
    setForcedRole(pid, role) {
      store.set(`players/${pid}/forcedRole`, role || null);
      log(role ? `a imposé le rôle ${ROLE_LABEL[role]} à ${pName(pid)}` : `a retiré le rôle imposé de ${pName(pid)}`);
    },

    // ── Pools ─────────────────────────────────────────────────────────────
    /** tier 0 = ne joue pas ce champion dans ce rôle. */
    setTier(pid, id, role, tier) {
      const had = S().players?.[pid]?.pool?.[id];
      store.set(`players/${pid}/pool/${id}/${role}`, tier || null);
      const key = `tier:${pid}:${id}`;
      if (!tier) log(`a retiré ${cName(id)} (${ROLE_LABEL[role]}) de ${poolOf(pid)}`, 'edit', key);
      else if (!had) log(`a ajouté ${cName(id)} (${ROLE_LABEL[role]} · ${TIER_LETTER[tier]}) à ${poolOf(pid)}`, 'edit', key);
      else log(`a mis ${cName(id)} en ${ROLE_LABEL[role]} · ${TIER_LETTER[tier]} dans ${poolOf(pid)}`, 'edit', key);
    },
    /** Ajoute plusieurs champions d'un coup : [{ id, role, tier }]. */
    importPool(pid, items) {
      if (!items.length) return;
      const updates = {};
      for (const it of items) updates[`players/${pid}/pool/${it.id}/${it.role}`] = it.tier;
      store.update(updates);
      log(`a importé ${items.length} champion${items.length > 1 ? 's' : ''} depuis les stats dans ${poolOf(pid)}`);
    },
    removeChamp(pid, id) {
      store.set(`players/${pid}/pool/${id}`, null);
      log(`a retiré ${cName(id)} de ${poolOf(pid)}`);
    },

    // ── Draft ─────────────────────────────────────────────────────────────
    setSlot(group, idx, id) {
      const prev = S().draft?.[group]?.[idx];
      if (group === 'enemyPicks') {
        // Nouveau champion (ou case vidée) : son rôle repasse en automatique.
        store.update({ [`draft/enemyPicks/${idx}`]: id || null, [`draft/enemyRoles/${idx}`]: null });
      } else {
        store.set(`draft/${group}/${idx}`, id || null);
      }
      const label = GROUP_LABEL[group].toLowerCase();
      if (id) log(`a ajouté ${cName(id)} en ${label}`, 'draft');
      else if (prev) log(`a retiré ${cName(prev)} des ${group.endsWith('Bans') ? 'bans' : 'picks adverses'}`, 'draft');
    },
    setOurPick(idx, value) {
      store.set(`draft/ourPicks/${idx}`, value);
      log(`a verrouillé ${cName(value.champ)}${value.player ? ` pour ${pName(value.player)}` : ''}`, 'draft');
    },
    clearOurPick(idx) {
      const prev = S().draft?.ourPicks?.[idx];
      store.set(`draft/ourPicks/${idx}`, null);
      if (prev?.champ) log(`a retiré notre pick ${cName(prev.champ)}`, 'draft');
    },
    setOurPickPlayer(idx, pid) {
      const cur = S().draft?.ourPicks?.[idx];
      if (!cur) return;
      store.set(`draft/ourPicks/${idx}/player`, pid || null);
      log(pid ? `a assigné ${cName(cur.champ)} à ${pName(pid)}` : `a remis ${cName(cur.champ)} en attribution auto`, 'draft');
    },
    /** Verrouille (ou déverrouille) un pick depuis une compo proposée. */
    toggleLock(id, pid) {
      const picks = slotValues(S().draft?.ourPicks);
      const at = picks.findIndex((v) => v?.champ === id);
      if (at >= 0) return a.clearOurPick(at);
      const free = picks.findIndex((v) => !v?.champ);
      if (free < 0) return false;
      a.setOurPick(free, { champ: id, player: pid || null });
      return true;
    },
    /** Rôle joué par un pick adverse (null = deviner automatiquement). */
    setEnemyRole(idx, role) {
      const id = S().draft?.enemyPicks?.[idx];
      store.set(`draft/enemyRoles/${idx}`, role || null);
      if (id) log(role ? `a placé ${cName(id)} (adverse) en ${ROLE_LABEL[role]}` : `a remis le rôle de ${cName(id)} (adverse) en auto`, 'draft');
    },
    setSide(side) {
      store.set('draft/side', side);
      log(`a placé l’équipe côté ${side === 'blue' ? 'bleu' : 'rouge'}`, 'draft');
    },
    resetDraft() {
      const side = S().draft?.side || 'blue';
      store.set('draft', { side });
      log('a réinitialisé la draft', 'draft');
    },

    // ── Compos enregistrées ───────────────────────────────────────────────
    /** Garde une compo proposée (mode 'stats' = proposée d'après les stats des joueurs). */
    saveComp(comp, mode = 'tiers') {
      const count = Object.keys(S().saved || {}).length;
      const id = uid('s');
      const slots = {};
      for (const s of comp.slots) slots[s.role] = { champ: s.champ, player: s.player.id, name: s.player.name };
      const name = `${mode === 'stats' ? 'Compo stats' : 'Compo'} ${count + 1}`;
      store.set(`saved/${id}`, { name, slots, by: me().name, ts: Date.now(), mode });
      log(`a validé et gardé « ${name} » (${ROLES.map((r) => cName(slots[r].champ)).join(', ')})`);
      return id;
    },
    renameSaved(id, name) {
      const old = S().saved?.[id]?.name;
      store.set(`saved/${id}/name`, name);
      log(`a renommé « ${old} » en « ${name} »`);
    },
    removeSaved(id) {
      const old = S().saved?.[id]?.name;
      store.set(`saved/${id}`, null);
      log(`a supprimé la compo « ${old} »`);
    },

    // ── Réglages ──────────────────────────────────────────────────────────
    setTeamName(name) {
      store.set('meta/name', name);
      log(`a renommé l’équipe en « ${name} »`);
    },
    setSetting(key, value) {
      store.set(`settings/${key}`, value);
      log('a modifié les réglages du moteur', 'edit', `settings:${key}`);
    },
    importState(state) {
      store.set('', state);
      log('a importé une sauvegarde');
    },
  };
  return a;
}
