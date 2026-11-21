// Statistiques de winrate (source : fichiers publics de U.GG, mis à jour à chaque patch).
// Pour un champion adverse, on télécharge ses matchups : victoires / parties contre
// chaque champion de la même lane. Notre winrate = 1 − le sien.
import { champ, champByKey } from './data.js';

const VERSIONS_URL = 'https://static.bigbrain.gg/assets/lol/riot_patch_update/prod/ugg/ugg-api-versions.json';
const BASE = 'https://stats2.u.gg/lol/1.5';
const UGG_ROLE = { 1: 'jungle', 2: 'support', 3: 'adc', 4: 'top', 5: 'mid' };

export const STAT_RANKS = [
  ['8', 'Tous rangs'], ['10', 'Platine+'], ['17', 'Émeraude+'], ['11', 'Diamant+'],
];
export const STAT_REGIONS = [['12', 'Monde'], ['2', 'EUW']];
export const DEFAULT_STATS = { rank: '17', region: '12' };

// Lissage : un matchup peu joué est ramené vers 50 % (équivaut à N parties nulles).
const PRIOR_GAMES = 60;
// Points de score par % de winrate au-dessus/en dessous de 50 %.
const POINTS_PER_PERCENT = 0.5;
const MAX_BONUS = 4;

let patchesPromise = null;
async function patches() {
  if (!patchesPromise) {
    patchesPromise = fetch(VERSIONS_URL)
      .then((r) => r.json())
      .then((v) => Object.keys(v)
        .filter((k) => v[k]?.matchups)
        .sort((a, b) => {
          const [a1, a2] = a.split('_').map(Number);
          const [b1, b2] = b.split('_').map(Number);
          return b1 - a1 || b2 - a2;
        }))
      .catch((err) => { patchesPromise = null; throw err; });
  }
  return patchesPromise;
}

async function fetchMatchups(patch, key) {
  const res = await fetch(`${BASE}/matchups/${patch}/ranked_solo_5x5/${key}/1.5.0.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Extrait { role: { wins, games, vs: { oppId: [victoiresAdversaire, parties] } } } pour une région / un rang.
 * Attention : dans les fichiers U.GG, chaque ligne [adversaire, victoires, parties] compte les
 * victoires de L'ADVERSAIRE (vérifié : la somme vaut parties − victoires du champion).
 */
function extract(raw, region, rank, into = {}) {
  const roles = raw?.[region]?.[rank] || {};
  for (const [r, payload] of Object.entries(roles)) {
    const role = UGG_ROLE[r];
    if (!role || !Array.isArray(payload?.[0])) continue;
    const slot = into[role] || (into[role] = { wins: 0, games: 0, vs: {} });
    for (const e of payload[0]) {
      const opp = champByKey(e[0]);
      if (!opp) continue;
      const [w, n] = [e[1] || 0, e[2] || 0];
      slot.wins += n - w; // victoires du champion du fichier
      slot.games += n;
      const cur = slot.vs[opp.id] || [0, 0];
      slot.vs[opp.id] = [cur[0] + w, cur[1] + n];
    }
  }
  return into;
}

const cache = new Map();
/**
 * Matchups d'un champion (point de vue de CE champion).
 * Si le patch actuel a encore peu de parties, on cumule avec le précédent.
 */
export function loadChampionStats(id, { rank = DEFAULT_STATS.rank, region = DEFAULT_STATS.region } = {}) {
  const ck = `${id}|${region}|${rank}`;
  if (!cache.has(ck)) {
    const p = (async () => {
      const key = champ(id).key;
      if (!key) throw new Error('champion inconnu');
      const list = await patches();
      const used = [];
      let data = {};
      for (const patch of list.slice(0, 3)) {
        try {
          data = extract(await fetchMatchups(patch, key), region, rank, data);
          used.push(patch.replace('_', '.'));
        } catch {
          continue;
        }
        const total = Object.values(data).reduce((s, r) => s + r.games, 0);
        if (total >= 3000) break;
      }
      if (!used.length) throw new Error('pas de données');
      return { roles: data, patches: used };
    })();
    p.catch(() => cache.delete(ck));
    cache.set(ck, p);
  }
  return cache.get(ck);
}

/** Winrate lissé (0..1) à partir de victoires / parties. */
export const smoothed = (wins, games) => (wins + PRIOR_GAMES / 2) / (games + PRIOR_GAMES);

/**
 * Notre winrate avec `ourId` contre l'adversaire `enemyStats` dans `role`.
 * → { wr (brut), wrS (lissé), games } ou null si inconnu.
 */
export function matchup(enemyStats, role, ourId) {
  const r = enemyStats?.roles?.[role];
  const e = r?.vs?.[ourId];
  if (!e || !e[1]) return null;
  const ourWins = e[0];
  return { wr: ourWins / e[1], wrS: smoothed(ourWins, e[1]), games: e[1] };
}

/** Winrate global de l'adversaire dans ce rôle. */
export function roleWinrate(stats, role) {
  const r = stats?.roles?.[role];
  if (!r || !r.games) return null;
  return { wr: r.wins / r.games, games: r.games };
}

/** Rôle où ce champion est le plus joué (d'après les stats). */
export function mainRole(stats) {
  let best = null;
  for (const [role, r] of Object.entries(stats?.roles || {})) if (!best || r.games > best.games) best = { role, games: r.games };
  return best?.role || null;
}

/** Bonus/malus de score pour un matchup (en points, même échelle que les niveaux). */
export function matchupPoints(m, weight = 1) {
  if (!m) return 0;
  const pts = (m.wrS - 0.5) * 100 * POINTS_PER_PERCENT;
  return Math.max(-MAX_BONUS, Math.min(MAX_BONUS, pts)) * weight;
}

export const pct = (x, digits = 1) => `${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
export const wrClass = (x) => (x >= 0.53 ? 'wr-good' : x >= 0.505 ? 'wr-ok' : x > 0.495 ? 'wr-even' : x > 0.47 ? 'wr-meh' : 'wr-bad');
