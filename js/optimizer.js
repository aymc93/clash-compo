// Moteur de compos.
// Les joueurs n'ont pas de rôle fixe : on cherche la meilleure répartition
// joueur → rôle → champion, en respectant les bans, les picks adverses et nos
// picks déjà verrouillés. Recherche exhaustive avec élagage (branch & bound).
import { ROLES, ROLE_LABEL, champ } from './data.js';

// Points de confort par niveau (S / A / B / C).
export const TIER_VALUE = { 4: 10, 3: 8, 2: 6, 1: 3 };
// Champion verrouillé qui n'est dans le pool de personne.
export const OFFPOOL_VALUE = 4;
export const MAX_COMFORT = 5 * TIER_VALUE[4];
// Bonus max d'équilibre : dégâts mixtes (+2), 2 frontlines (+1,5), 2 engages (+1).
export const MAX_BALANCE = 4.5;

const dmgPoints = (low) => (low >= 2 ? 2 : low >= 1.5 ? 1 : low >= 1 ? 0 : low >= 0.5 ? -2.5 : -5);
const frontPoints = (n) => (n === 0 ? -4 : n === 1 ? 0 : 1.5);
const engagePoints = (n) => (n === 0 ? -3 : n === 1 ? 0 : 1);

/** Analyse d'équilibre d'une liste de profils champions. */
export function balanceOf(metas) {
  let ad = 0, ap = 0, front = 0, engage = 0;
  for (const m of metas) {
    if (m.dmg === 'P') ad += 1;
    else if (m.dmg === 'M') ap += 1;
    else { ad += 0.5; ap += 0.5; }
    if (m.front) front++;
    if (m.engage) engage++;
  }
  const low = Math.min(ad, ap);
  const parts = { dmg: dmgPoints(low), front: frontPoints(front), engage: engagePoints(engage) };
  const warnings = [];
  if (low < 1) warnings.push(`${low === 0 ? 'Full' : 'Quasi full'} ${ad > ap ? 'AD' : 'AP'}`);
  if (front === 0) warnings.push('Pas de frontline');
  if (engage === 0) warnings.push('Pas d’engage');
  return { ad, ap, front, engage, parts, total: parts.dmg + parts.front + parts.engage, warnings };
}

// Version rapide (sans allocation) utilisée dans la boucle de recherche.
function quickBalance(picks) {
  let ad = 0, ap = 0, front = 0, engage = 0;
  for (let i = 0; i < 5; i++) {
    const m = picks[i].meta;
    if (m.dmg === 'P') ad += 1;
    else if (m.dmg === 'M') ap += 1;
    else { ad += 0.5; ap += 0.5; }
    if (m.front) front++;
    if (m.engage) engage++;
  }
  return dmgPoints(Math.min(ad, ap)) + frontPoints(front) + engagePoints(engage);
}

export const maxScore = (weight) => MAX_COMFORT + MAX_BALANCE * weight;

/** Score brut → note sur 100. */
export function rating(score, weight) {
  return Math.max(0, Math.min(100, Math.round((score / maxScore(weight)) * 100)));
}

/**
 * @param players  joueurs actifs : [{ id, name, color, pool: { champId: { role: tier } }, forcedRole }]
 * @param opts     { unavailable: Set<champId>, locks: [{ champ, player|null }], weight, limit, matchup }
 *   matchup(champId, role) → { points, wr, wrS, games, vs } | null : bonus/malus contre le pick adverse du rôle
 * @returns { players, cands, comps, reason, truncated }
 *   comps : meilleure compo pour chaque répartition des rôles, triées par score.
 */
export function solve(players, opts = {}) {
  const { unavailable = new Set(), locks = [], weight = 1, limit = 8, matchup = null } = opts;
  const muCache = new Map();
  const mu = (id, role) => {
    if (!matchup) return null;
    const k = id + '|' + role;
    if (!muCache.has(k)) muCache.set(k, matchup(id, role));
    return muCache.get(k);
  };
  const out = { players, cands: ROLES.map(() => []), comps: [], reason: null, truncated: false };
  if (players.length < 5) {
    out.reason = { type: 'players', count: players.length };
    return out;
  }

  // Contraintes de nos picks verrouillés.
  const lockChamp = new Map(); // champ -> index joueur (-1 = n'importe qui)
  const lockPlayer = new Map(); // index joueur -> champ
  for (const l of locks) {
    if (!l || !l.champ) continue;
    const pi = l.player ? players.findIndex((p) => p.id === l.player) : -1;
    lockChamp.set(l.champ, pi);
    if (pi >= 0) lockPlayer.set(pi, l.champ);
  }

  // Candidats par rôle.
  const cands = out.cands;
  players.forEach((p, pi) => {
    const forced = p.forcedRole || null;
    const mine = lockPlayer.get(pi);
    const pool = p.pool || {};
    for (const id of Object.keys(pool)) {
      if (unavailable.has(id)) continue;
      if (mine && mine !== id) continue;
      const owner = lockChamp.get(id);
      if (owner !== undefined && owner >= 0 && owner !== pi) continue;
      const roles = pool[id] || {};
      const meta = champ(id);
      ROLES.forEach((r, ri) => {
        const tier = roles[r];
        if (!TIER_VALUE[tier]) return;
        if (forced && forced !== r) return;
        const m = mu(id, r);
        cands[ri].push({ pi, champ: id, ri, tier, base: TIER_VALUE[tier], value: TIER_VALUE[tier] + (m?.points || 0), mu: m, meta, off: false });
      });
    }
  });

  // Pick verrouillé absent des pools : on l'autorise quand même (hors pool).
  for (const [id, owner] of lockChamp) {
    if (cands.some((list) => list.some((c) => c.champ === id))) continue;
    const meta = champ(id);
    const roles = meta.roles.length ? meta.roles : ROLES;
    const eligible = owner >= 0 ? [owner] : players.map((_, i) => i).filter((i) => !lockPlayer.has(i));
    for (const pi of eligible) {
      const forced = players[pi].forcedRole || null;
      for (const r of roles) {
        if (forced && forced !== r) continue;
        const ri = ROLES.indexOf(r);
        const m = mu(id, r);
        cands[ri].push({ pi, champ: id, ri, tier: 0, base: OFFPOOL_VALUE, value: OFFPOOL_VALUE + (m?.points || 0), mu: m, meta, off: true });
      }
    }
  }

  for (const list of cands) list.sort((a, b) => b.value - a.value);
  const emptyRoles = ROLES.filter((_, ri) => cands[ri].length === 0);
  if (emptyRoles.length) {
    out.reason = { type: 'roles', roles: emptyRoles, allEmpty: emptyRoles.length === 5 };
    return out;
  }

  // Recherche : rôles les plus contraints d'abord.
  const order = [0, 1, 2, 3, 4].sort((a, b) => cands[a].length - cands[b].length);
  const suffix = new Array(6).fill(0);
  for (let d = 4; d >= 0; d--) suffix[d] = suffix[d + 1] + cands[order[d]][0].value;
  const maxBonus = Math.max(0, MAX_BALANCE * weight);
  const lockCount = lockChamp.size;

  const top = []; // meilleures compos (une par répartition), triées
  const byKey = new Map();
  let threshold = -Infinity;
  const picks = new Array(5);
  const usedChamps = new Set();
  let usedPlayers = 0;
  let leaves = 0;
  const LEAF_CAP = 1_500_000;

  const dfs = (d, sum, locksMet) => {
    if (d === 5) {
      if (locksMet < lockCount) return;
      if (++leaves > LEAF_CAP) { out.truncated = true; return; }
      const score = sum + quickBalance(picks) * weight;
      if (score <= threshold) return;
      let key = '';
      for (let r = 0; r < 5; r++) key += picks[r].pi + '.';
      const prev = byKey.get(key);
      if (prev && prev.score >= score) return;
      if (prev) top.splice(top.indexOf(prev), 1);
      const entry = { key, score, comfort: sum, picks: picks.slice() };
      let i = top.length;
      while (i > 0 && top[i - 1].score < score) i--;
      top.splice(i, 0, entry);
      byKey.set(key, entry);
      if (top.length > limit) byKey.delete(top.pop().key);
      if (top.length === limit) threshold = top[limit - 1].score;
      return;
    }
    if (lockCount - locksMet > 5 - d) return;
    const ri = order[d];
    const list = cands[ri];
    for (let k = 0; k < list.length; k++) {
      const c = list[k];
      if (sum + c.value + suffix[d + 1] + maxBonus <= threshold) break; // liste triée : inutile d'aller plus loin
      const bit = 1 << c.pi;
      if (usedPlayers & bit || usedChamps.has(c.champ)) continue;
      usedPlayers |= bit;
      usedChamps.add(c.champ);
      picks[ri] = c;
      dfs(d + 1, sum + c.value, locksMet + (lockChamp.has(c.champ) ? 1 : 0));
      usedPlayers &= ~bit;
      usedChamps.delete(c.champ);
      if (out.truncated) return;
    }
  };
  dfs(0, 0, 0);

  if (!top.length) {
    out.reason = { type: 'conflict', locks: lockCount };
    return out;
  }

  out.comps = top.map((t) => {
    const used = new Set(t.picks.map((p) => p.pi));
    const comfort = t.picks.reduce((s, p) => s + p.base, 0);
    return {
      key: t.key,
      score: t.score,
      comfort,
      matchup: t.comfort - comfort,
      hasMatchups: t.picks.some((p) => p.mu),
      balance: balanceOf(t.picks.map((p) => p.meta)),
      slots: t.picks.map((p) => ({
        role: ROLES[p.ri], ri: p.ri, pi: p.pi, player: players[p.pi],
        champ: p.champ, tier: p.tier, value: p.value, off: p.off, mu: p.mu,
      })),
      bench: players.filter((_, i) => !used.has(i)),
    };
  });
  return out;
}

/** Autres champions que le joueur de ce slot peut jouer dans ce rôle. */
export function alternatives(result, comp, ri, max = 4) {
  const slot = comp.slots[ri];
  const used = new Set(comp.slots.map((s) => s.champ));
  const res = [];
  for (const c of result.cands[ri]) {
    if (c.pi !== slot.pi || c.off || used.has(c.champ)) continue;
    res.push(c);
    if (res.length >= max) break;
  }
  return res;
}

/**
 * Priorités de pick : pour chaque champion de la meilleure compo, combien on perd
 * s'il est banni / pris par l'adversaire (en points sur 100).
 */
export function pickPriority(players, opts, result) {
  const best = result.comps[0];
  if (!best) return [];
  const weight = opts.weight ?? 1;
  const locked = new Set((opts.locks || []).map((l) => l.champ));
  return best.slots
    .filter((s) => !locked.has(s.champ))
    .map((s) => {
      const unavailable = new Set(opts.unavailable || []);
      unavailable.add(s.champ);
      const alt = solve(players, { ...opts, unavailable, limit: 1 }).comps[0];
      const loss = alt ? Math.max(0, best.score - alt.score) : Infinity;
      return {
        champ: s.champ,
        role: s.role,
        player: s.player,
        loss,
        points: alt ? Math.round((loss / maxScore(weight)) * 100) : Infinity,
        replacement: alt ? alt.slots.find((x) => x.role === s.role) : null,
      };
    })
    .sort((a, b) => b.loss - a.loss);
}

/**
 * Évalue une compo enregistrée avec les pools et la draft actuels.
 * `players` = joueurs titulaires (actifs).
 */
export function evaluateSaved(saved, players, { unavailable, enemyPicks, locks, weight = 1, matchup = null }) {
  const reasons = [];
  const metas = [];
  let comfort = 0;
  const champsIn = new Set();
  for (const role of ROLES) {
    const slot = saved.slots?.[role];
    if (!slot) { reasons.push(`Pas de ${ROLE_LABEL[role]}`); continue; }
    champsIn.add(slot.champ);
    const c = champ(slot.champ);
    metas.push(c);
    if (unavailable.has(slot.champ)) {
      reasons.push(`${c.name} ${enemyPicks.has(slot.champ) ? 'pris par l’adversaire' : 'banni'}`);
    }
    const p = players.find((x) => x.id === slot.player);
    if (!p) reasons.push(`${slot.name || 'Un joueur'} n’est pas titulaire`);
    const tier = p?.pool?.[slot.champ]?.[role];
    comfort += (TIER_VALUE[tier] || OFFPOOL_VALUE) + (matchup?.(slot.champ, role)?.points || 0);
  }
  for (const l of locks) {
    if (!champsIn.has(l.champ)) reasons.push(`Incompatible avec notre pick ${champ(l.champ).name}`);
  }
  const balance = balanceOf(metas);
  const score = comfort + balance.total * weight;
  return { ok: reasons.length === 0, reasons, score, rating: rating(score, weight), balance };
}
