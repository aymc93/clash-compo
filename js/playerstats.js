// Stats des joueurs à partir de leur Riot ID (source : DeepLoL, données publiques de leur site).
// Pour chaque joueur : parties, winrate, KDA et CS/min de la saison, champion par champion et rôle par rôle.
// Le résumé (léger) est enregistré dans l'équipe : tout le monde voit les mêmes stats sans tout retélécharger.
import { ROLES, champByKey } from './data.js';

const API = 'https://b2c-api-cdn.deeplol.gg';
const LANES = { Top: 'top', Jungle: 'jungle', Middle: 'mid', Bot: 'adc', Supporter: 'support' };

export const PLATFORMS = [
  ['EUW1', 'EUW', 'euw'], ['EUN1', 'EUNE', 'eune'], ['NA1', 'NA', 'na'], ['KR', 'KR', 'kr'],
  ['TR1', 'TR', 'tr'], ['BR1', 'BR', 'br'], ['LA1', 'LAN', 'lan'], ['LA2', 'LAS', 'las'],
  ['OC1', 'OCE', 'oce'], ['JP1', 'JP', 'jp'],
];
export const DEFAULT_PLATFORM = 'EUW1';
/** Les stats enregistrées sont rafraîchies au bout de ce délai. */
export const STATS_TTL = 6 * 3600 * 1000;

/** « Pseudo#TAG » → { name, tag } (ou null si invalide). */
export function parseRiotId(text) {
  const m = String(text || '').trim().match(/^(.{2,16}?)\s*#\s*([^\s#]{2,5})$/u);
  return m ? { name: m[1].trim(), tag: m[2].trim() } : null;
}
export const riotKey = (riot) => (riot ? `${riot.name}#${riot.tag}|${riot.platform || DEFAULT_PLATFORM}`.toLowerCase() : '');

/** Lien vers le profil DeepLoL (pour mettre à jour les stats sur leur site). */
export function profileUrl(riot) {
  const slug = (PLATFORMS.find((p) => p[0] === (riot.platform || DEFAULT_PLATFORM)) || PLATFORMS[0])[2];
  return `https://www.deeplol.gg/summoner/${slug}/${encodeURIComponent(`${riot.name}-${riot.tag}`)}`;
}

class StatsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

async function getJson(url) {
  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new StatsError('network', 'Impossible de joindre le service de stats.');
  }
  let data = null;
  try { data = await res.json(); } catch { /* corps vide */ }
  if (!res.ok && !data) throw new StatsError('network', `Service de stats indisponible (HTTP ${res.status}).`);
  return data || {};
}

let seasonPromise = null;
function currentSeason() {
  if (!seasonPromise) {
    seasonPromise = getJson(`${API}/common/season-list`)
      .then((d) => Math.max(...(d.season_list || [])))
      .then((s) => { if (!Number.isFinite(s)) throw new StatsError('network', 'Saison inconnue.'); return s; })
      .catch((e) => { seasonPromise = null; throw e; });
  }
  return seasonPromise;
}

const round = (x, d = 2) => Math.round((x || 0) * 10 ** d) / 10 ** d;
/** Ligne compacte : [parties, victoires, kda, kills, morts, assists, cs/min]. */
const row = (e) => [e.games || 0, e.wins || 0, round(e.kda), round(e.kills, 1), round(e.deaths, 1), round(e.assists, 1), round(e.cs_per_min, 1)];
export const unpack = (r) => (r ? { games: r[0], wins: r[1], wr: r[0] ? r[1] / r[0] : 0, kda: r[2], k: r[3], d: r[4], a: r[5], cs: r[6] } : null);

/**
 * Télécharge et résume les stats d'un joueur.
 * → { riot, season, ts, level, total: row, roles: { role: row }, champs: { champId: { all: row, top: row, … } } }
 */
export async function fetchPlayerStats(riot) {
  const platform = riot.platform || DEFAULT_PLATFORM;
  const q = new URLSearchParams({ riot_id_name: riot.name, riot_id_tag_line: riot.tag, platform_id: platform });
  const acc = await getJson(`${API}/summoner/summoner?${q}`);
  const info = acc.summoner_basic_info_dict;
  if (!info?.puu_id) {
    if (acc.msg && /라이엇|riot/i.test(acc.msg)) throw new StatsError('network', 'Le service de Riot ne répond pas, réessaie dans un moment.');
    throw new StatsError('notfound', 'Compte introuvable : vérifie le pseudo, le #tag et la région.');
  }
  const season = await currentSeason();
  const cs = await getJson(`${API}/summoner/champion-stat?${new URLSearchParams({ puu_id: info.puu_id, season, platform_id: platform })}`);
  const src = cs.counter_champion_stats?.total;
  const lists = src?.enemy_champion_stats;
  const all = lists?.All || [];
  const totalRow = all.find((e) => e.champion_id === 0);
  if (!totalRow?.games) {
    throw new StatsError('nodata', 'Aucune partie classée trouvée cette saison (ou profil jamais analysé par DeepLoL).');
  }

  const champs = {};
  const add = (lane, e) => {
    if (!e.champion_id || !e.games) return;
    const c = champByKey(String(e.champion_id));
    if (!c) return;
    (champs[c.id] || (champs[c.id] = {}))[lane] = row(e);
  };
  for (const e of all) add('all', e);
  const roles = {};
  for (const [lane, role] of Object.entries(LANES)) {
    for (const e of lists[lane] || []) add(role, e);
    const pr = src.position_rate?.[lane];
    if (pr?.games) roles[role] = [pr.games, pr.wins || 0];
  }
  return {
    riot: { name: info.riot_id_name || riot.name, tag: info.riot_id_tag_line || riot.tag, platform },
    season, ts: Date.now(), level: info.level || 0,
    total: row(totalRow), roles, champs,
  };
}

/** Rôle le plus joué → { role, share }. */
export function mainRole(ps) {
  const entries = Object.entries(ps?.roles || {});
  const total = entries.reduce((s, [, r]) => s + r[0], 0);
  if (!total) return null;
  const [role, r] = entries.sort((a, b) => b[1][0] - a[1][0])[0];
  return { role, share: r[0] / total };
}

/** Stats d'un champion pour ce joueur, à un rôle (ou 'all'). */
export const champStats = (ps, id, role = 'all') => unpack(ps?.champs?.[id]?.[role]);

/**
 * Note de performance d'un joueur sur un champion à un rôle, sur la même échelle que les niveaux
 * (C 3 · B 6 · A 8 · S 10) : expérience (nombre de parties) + winrate lissé + petit bonus de KDA.
 */
export function perfValue(st) {
  if (!st || !st.games) return 0;
  const exp = Math.min(1, Math.log(1 + st.games) / Math.log(41)); // 40 parties = expérience max
  const wrS = (st.wins + 5) / (st.games + 10); // peu de parties → ramené vers 50 %
  const wrPts = Math.max(-3, Math.min(3, (wrS - 0.5) * 100 * 0.3));
  const kdaPts = Math.max(-1, Math.min(1, (st.kda - 2.5) * 0.5));
  return Math.max(0, Math.min(10, 2 + 6 * exp + wrPts + kdaPts));
}

/** Niveau conseillé (S/A/B/C → 4..1) d'après les stats, pour remplir un pool. */
export function suggestTier(st) {
  const v = perfValue(st);
  return v >= 9 ? 4 : v >= 7 ? 3 : v >= 5 ? 2 : 1;
}

/** Champions les plus joués à chaque rôle (pour l'import dans le pool). */
export function topChamps(ps, { minGames = 2 } = {}) {
  const out = [];
  for (const [id, byRole] of Object.entries(ps?.champs || {})) {
    for (const role of ROLES) {
      const st = unpack(byRole[role]);
      if (st && st.games >= minGames) out.push({ id, role, st, tier: suggestTier(st) });
    }
  }
  return out.sort((a, b) => b.st.games - a.st.games);
}

export const kdaTxt = (x) => (x || 0).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
