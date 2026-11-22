// Aides à la décision : ordre de draft, bans conseillés, historique des parties,
// champions à travailler et partage Discord. Uniquement des calculs (aucun affichage).
import { ROLES, ROLE_LABEL, allChamps, champ } from './data.js';
import { champStats, mainRole, unpack } from './playerstats.js';
import { TIER_VALUE } from './optimizer.js';

// ── Ordre de draft (draft de tournoi, utilisée en Clash) ───────────────────
// B = côté bleu, R = côté rouge.
const ORDER = [
  ['B', 'ban', 1], ['R', 'ban', 1], ['B', 'ban', 1], ['R', 'ban', 1], ['B', 'ban', 1], ['R', 'ban', 1],
  ['B', 'pick', 1], ['R', 'pick', 1], ['R', 'pick', 1], ['B', 'pick', 1], ['B', 'pick', 1], ['R', 'pick', 1],
  ['R', 'ban', 2], ['B', 'ban', 2], ['R', 'ban', 2], ['B', 'ban', 2],
  ['R', 'pick', 2], ['B', 'pick', 2], ['B', 'pick', 2], ['R', 'pick', 2],
];
export const DRAFT_STEPS = ORDER.length;

/**
 * Étape actuelle de la draft d'après ce qui est déjà rempli.
 * filled = { ourBans, ourPicks, enemyBans, enemyPicks } (nombres)
 * → { index, ours, kind, group, phase, count (actions d'affilée pour la même équipe) } ou null si terminé.
 */
export function draftStep(side, filled) {
  const used = { ourBans: 0, ourPicks: 0, enemyBans: 0, enemyPicks: 0 };
  const us = side === 'red' ? 'R' : 'B';
  const groupOf = ([team, kind]) => (team === us ? (kind === 'ban' ? 'ourBans' : 'ourPicks') : (kind === 'ban' ? 'enemyBans' : 'enemyPicks'));
  for (let i = 0; i < ORDER.length; i++) {
    const g = groupOf(ORDER[i]);
    if (used[g] < (filled[g] || 0)) { used[g]++; continue; }
    let count = 1;
    while (i + count < ORDER.length && groupOf(ORDER[i + count]) === g) count++;
    return { index: i, ours: ORDER[i][0] === us, kind: ORDER[i][1], group: g, phase: ORDER[i][2], count };
  }
  return null;
}

// ── Bans conseillés ─────────────────────────────────────────────────────────
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** Menace d'un joueur adverse sur un champion (0..~14). */
function threatOf(st, totalGames) {
  if (!st || st.games < 5) return 0;
  const exp = Math.min(1, Math.log(1 + st.games) / Math.log(51));
  const wrS = (st.wins + 10) / (st.games + 20);
  let t = 10 * exp * (0.7 + clamp((wrS - 0.5) * 4, -0.3, 0.45));
  if (totalGames && st.games / totalGames >= 0.35) t *= 1.4; // one-trick
  return t;
}

/** Champions les plus joués d'un adversaire, avec un indicateur « one-trick ». */
export function scoutTop(ps, n = 5) {
  const total = unpack(ps?.total)?.games || 0;
  return Object.entries(ps?.champs || {})
    .map(([id, byRole]) => {
      const st = unpack(byRole.all);
      const role = ROLES.map((r) => [r, unpack(byRole[r])?.games || 0]).sort((a, b) => b[1] - a[1])[0]?.[0];
      return { id, st, role, share: total ? st.games / total : 0, oneTrick: total > 0 && st.games >= 20 && st.games / total >= 0.35, threat: threatOf(st, total) };
    })
    .filter((x) => x.st?.games)
    .sort((a, b) => b.st.games - a.st.games)
    .slice(0, n);
}

/**
 * Bans conseillés.
 * - scouts : [{ name, ps }] adversaires repérés (stats DeepLoL)
 * - comp : meilleure compo actuelle ; counterOf(champId) → stats U.GG du champion (vs adversaires)
 * - unavailable : champions déjà bannis / pris ; protect : champions qu'on veut jouer (pas de ban)
 * → [{ champ, score, reasons: [texte] }]
 */
export function banSuggestions({ scouts = [], comp = null, counterOf = () => null, unavailable = new Set(), protect = new Set(), limit = 8, meta = null }) {
  const acc = new Map();
  const add = (id, pts, reason) => {
    if (!id || unavailable.has(id) || protect.has(id) || pts <= 0) return;
    const e = acc.get(id) || { champ: id, score: 0, reasons: [] };
    e.score += pts;
    e.reasons.push({ pts, text: reason });
    acc.set(id, e);
  };
  for (const s of scouts) {
    for (const x of scoutTop(s.ps, 4)) {
      add(x.id, x.threat, `${x.oneTrick ? 'One-trick de' : 'Joué par'} ${s.name} (${x.st.games} p., ${Math.round(x.st.wr * 100)} %)`);
    }
  }
  for (const slot of comp?.slots || []) {
    const data = counterOf(slot.champ);
    const vs = data?.roles?.[slot.role]?.vs;
    if (!vs) continue;
    const list = Object.entries(vs)
      .map(([opp, [oppWins, games]]) => ({ opp, games, wrS: (oppWins + 30) / (games + 60), wr: games ? oppWins / games : 0 }))
      .filter((x) => x.games >= 150 && x.wrS > 0.515)
      .sort((a, b) => b.wrS - a.wrS)
      .slice(0, 3);
    for (const x of list) {
      add(x.opp, (x.wrS - 0.5) * 100 * 1.1, `Contre notre ${champ(slot.champ).name} (${ROLE_LABEL[slot.role]}) : ${Math.round(x.wr * 1000) / 10} %`.replace('.', ','));
    }
  }
  for (const x of metaTop(meta, 8)) {
    add(x.champ, x.score * 0.6, `OP du patch en ${ROLE_LABEL[x.role]} : ${String(Math.round(x.wr * 1000) / 10).replace('.', ',')} %`);
  }
  return [...acc.values()]
    .map((e) => ({ ...e, reasons: e.reasons.sort((a, b) => b.pts - a.pts).map((r) => r.text) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── Historique des parties ─────────────────────────────────────────────────
export const compSignature = (slots) => ROLES.map((r) => `${slots?.[r]?.champ}:${slots?.[r]?.player}`).join('|');

/** Bilan : global, par joueur, par compo (signature) et par champion de chaque joueur. */
export function historyStats(games) {
  const out = { wins: 0, losses: 0, byPlayer: {}, bySig: {}, byChamp: {} };
  for (const g of games) {
    const win = !!g.win;
    if (win) out.wins++; else out.losses++;
    const sig = compSignature(g.slots);
    const s = out.bySig[sig] || (out.bySig[sig] = { w: 0, l: 0 });
    if (win) s.w++; else s.l++;
    for (const role of ROLES) {
      const sl = g.slots?.[role];
      if (!sl?.player) continue;
      const p = out.byPlayer[sl.player] || (out.byPlayer[sl.player] = { w: 0, l: 0, roles: {}, name: sl.name });
      if (win) p.w++; else p.l++;
      p.roles[role] = (p.roles[role] || 0) + 1;
      const ck = `${sl.player}|${sl.champ}`;
      const c = out.byChamp[ck] || (out.byChamp[ck] = { w: 0, l: 0, champ: sl.champ, player: sl.player });
      if (win) c.w++; else c.l++;
    }
  }
  return out;
}
export const recordTxt = (r) => (r ? `${r.w}V · ${r.l}D` : '');

// ── Champions à travailler ─────────────────────────────────────────────────
// Champions réputés simples à prendre en main (pour combler un trou rapidement).
const EASY = new Set([
  'Garen', 'Malphite', 'Darius', 'Nasus', 'Sett', 'Mordekaiser', 'Ornn', 'DrMundo', 'Volibear', 'Shen',
  'Amumu', 'Warwick', 'Vi', 'MasterYi', 'Sejuani', 'Zac', 'JarvanIV', 'Nunu', 'Maokai', 'Rammus',
  'Annie', 'Malzahar', 'Lux', 'Galio', 'Veigar', 'Brand', 'Viktor', 'Orianna',
  'MissFortune', 'Ashe', 'Caitlyn', 'Jinx', 'Sivir', 'Ezreal',
  'Leona', 'Nautilus', 'Alistar', 'Braum', 'Morgana', 'Sona', 'Soraka', 'Janna', 'Taric', 'Rell',
]);

/**
 * Trous dans les pools des joueurs disponibles → [{ key, text, role, player, suggestions: [champId] }]
 * statsOf(player) → stats du joueur (ou null).
 */
export function poolGaps(players, statsOf, meta = null) {
  const gaps = [];
  if (players.length < 2) return gaps;
  const tierIn = (p, id, r) => p.pool?.[id]?.[r] || 0;
  const confident = (p, r) => Object.keys(p.pool || {}).filter((id) => tierIn(p, id, r) >= 2);
  // Joueur le plus naturel pour un rôle : celui qui y a le plus de champions, sinon dont c'est le rôle principal.
  const ownerOf = (r) => players
    .map((p) => ({ p, n: confident(p, r).length, main: mainRole(statsOf(p))?.role === r }))
    .sort((a, b) => (b.main - a.main) || (b.n - a.n))[0]?.p || players[0];

  const suggest = (p, r, need) => {
    const ps = statsOf(p);
    return allChamps()
      .filter((c) => c.roles.includes(r) && !p.pool?.[c.id]?.[r] && need(c))
      .map((c) => {
        const played = champStats(ps, c.id, 'all')?.games || 0;
        const easy = EASY.has(c.id) || (c.info?.difficulty || 10) <= 3;
        return { id: c.id, score: Math.min(played, 40) + (easy ? 12 : 0) + metaScore(meta, c.id, r) * 3 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.id);
  };

  for (const r of ROLES) {
    const deep = players.filter((p) => confident(p, r).length >= 2);
    if (deep.length === 0) {
      const p = ownerOf(r);
      gaps.push({ key: `role-${r}`, role: r, player: p, text: `Peu de choix en ${ROLE_LABEL[r]} : personne n’a 2 champions solides (B ou mieux).`, suggestions: suggest(p, r, () => true) });
    }
  }
  const champsAt = (pred) => {
    let n = 0;
    for (const p of players) for (const r of ROLES) for (const id of confident(p, r)) if (pred(champ(id), r)) n++;
    return n;
  };
  const checks = [
    { key: 'engage', min: 3, pred: (c) => c.engage, roles: ['support', 'jungle', 'top'], text: 'Peu d’engage : il vous manque des champions pour lancer les combats.' },
    { key: 'front', min: 3, pred: (c) => c.front, roles: ['top', 'support', 'jungle'], text: 'Peu de frontline : pas assez de champions qui encaissent.' },
    { key: 'ap', min: 3, pred: (c, r) => c.dmg === 'M' && r !== 'support', roles: ['mid', 'jungle', 'top'], text: 'Peu de dégâts magiques (AP) : risque de compos full AD.' },
  ];
  for (const ch of checks) {
    if (champsAt(ch.pred) >= ch.min) continue;
    const r = ch.roles.find((x) => !gaps.some((g) => g.role === x)) || ch.roles[0];
    const p = ownerOf(r);
    gaps.push({ key: ch.key, role: r, player: p, text: ch.text, suggestions: suggest(p, r, (c) => ch.pred(c, r)) });
  }
  return gaps.slice(0, 5);
}

/** Niveau proposé pour un champion ajouté depuis « à travailler ». */
export const PRACTICE_TIER = 1;
export const tierValue = (t) => TIER_VALUE[t] || 0;

// ── Partage Discord ─────────────────────────────────────────────────────────
/** Texte prêt à coller sur Discord pour une compo. */
export function discordText({ title, rating, slots, note }) {
  const lines = [`**${title}**${rating != null ? ` (${rating}/100)` : ''}`];
  for (const r of ROLES) {
    const s = slots[r];
    if (s) lines.push(`> **${ROLE_LABEL[r]}** · ${champ(s.champ).name} — ${s.name || '?'}`);
  }
  if (note) lines.push(note);
  return lines.join('\n');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Copie ce texte :', text);
    return false;
  }
}

// ── Profil d'une compo et plan de jeu ──────────────────────────────────────
// Puissance selon le moment de la partie (repères généraux, à ajuster si besoin).
const EARLY = new Set([
  'Draven', 'LeeSin', 'Elise', 'Renekton', 'Pantheon', 'Lucian', 'Kalista', 'RekSai', 'XinZhao', 'Nidalee', 'Jayce',
  'Kled', 'Olaf', 'Darius', 'Graves', 'Udyr', 'Taliyah', 'Leblanc', 'Talon', 'Qiyana', 'Rengar', 'Kindred', 'Shaco',
  'Blitzcrank', 'Leona', 'Nautilus', 'Pyke', 'Rell', 'Alistar', 'Tristana', 'Samira', 'MissFortune', 'Caitlyn',
  'JarvanIV', 'Trundle', 'Volibear', 'Warwick', 'Ivern', 'Sett', 'Irelia', 'Riven', 'Camille', 'Aatrox', 'Kennen',
  'MonkeyKing', 'Zed', 'Sylas', 'Yone', 'Akali', 'Nocturne', 'Hecarim', 'Briar', 'Ambessa',
]);
const LATE = new Set([
  'Kassadin', 'Kayle', 'Vayne', 'Jinx', 'KogMaw', 'Veigar', 'Nasus', 'Azir', 'Ryze', 'Smolder', 'AurelionSol',
  'Cassiopeia', 'Senna', 'Jax', 'Gangplank', 'Viktor', 'Twitch', 'Aphelios', 'Zeri', 'MasterYi', 'Belveth', 'Ornn',
  'Seraphine', 'Yuumi', 'Sona', 'Kayn', 'Karthus', 'Anivia', 'Orianna', 'Vladimir', 'Sion', 'Chogath', 'Mordekaiser',
  'Gwen', 'Fiora', 'Yasuo', 'Hwei', 'Xerath', 'Ziggs', 'Jhin', 'Ezreal', 'Sivir', 'Xayah', 'Nilah', 'Mel', 'Aurora',
]);
const POKE = new Set([
  'Xerath', 'Ziggs', 'Jayce', 'Varus', 'Ezreal', 'Zoe', 'Lux', 'Velkoz', 'Karma', 'Nidalee', 'Corki', 'Hwei',
  'Caitlyn', 'Jhin', 'Kennen', 'Zyra', 'Brand', 'Seraphine', 'Mel', 'Senna', 'Syndra', 'Heimerdinger', 'Teemo', 'Smolder',
]);

/** Profil d'une liste de champions : dégâts, frontline, engage, poke, assassins, moment fort. */
export function compProfile(ids) {
  const list = ids.filter(Boolean).map((id) => champ(id));
  let ad = 0, ap = 0, front = 0, engage = 0, poke = 0, assassins = 0, early = 0, late = 0;
  for (const c of list) {
    if (c.dmg === 'P') ad++; else if (c.dmg === 'M') ap++; else { ad += 0.5; ap += 0.5; }
    if (c.front) front++;
    if (c.engage) engage++;
    if (POKE.has(c.id)) poke++;
    if ((c.tags || []).includes('Assassin')) assassins++;
    if (EARLY.has(c.id)) early++;
    if (LATE.has(c.id)) late++;
  }
  const n = list.length;
  const d = early - late;
  const timing = !n ? null : d >= 2 ? 'early' : d <= -2 ? 'late' : d === 1 ? 'mid-early' : d === -1 ? 'mid-late' : 'mid';
  const styles = [];
  if (engage >= 2) styles.push('Engage');
  if (poke >= 2) styles.push('Poke');
  if (assassins >= 2) styles.push('Assassins');
  if (front >= 2) styles.push('Frontline solide');
  if (!styles.length && n >= 3) styles.push('Équilibrée');
  return { n, ad, ap, front, engage, poke, assassins, early, late, timing, styles };
}
export const TIMING_LABEL = {
  early: 'Fort en early', 'mid-early': 'Plutôt early', mid: 'Milieu de partie', 'mid-late': 'Plutôt late', late: 'Scale en late',
};

/** Conseils de jeu à partir de notre compo et de celle d'en face (picks connus). */
export function gamePlan(ourIds, theirIds) {
  const us = compProfile(ourIds);
  const them = compProfile(theirIds);
  const tips = [];
  if (them.n >= 2) {
    if (them.ad >= Math.max(3, them.n - 1)) tips.push('Ils sont quasi full AD : achetez de l’armure (bottes Ninja, Plaque du mort, Cœur gelé…).');
    else if (them.ap >= Math.max(3, them.n - 1)) tips.push('Ils sont quasi full AP : résistance magique (Sandales de Mercure, Force de la nature…).');
    if (them.engage >= 2) tips.push(`Beaucoup d’engage en face (${them.engage}) : restez groupés, gardez Flash et vos sorts de désengage.`);
    if (them.poke >= 2) tips.push('Compo poke en face : ne subissez pas le siège, engagez vite ou contournez.');
    if (them.assassins >= 2) tips.push('Plusieurs assassins en face : protégez vos carries, wardez les flancs, ne farmez pas seul.');
    if (them.n >= 4 && them.front === 0) tips.push('Aucune frontline en face : plongez directement sur leurs carries.');
  }
  if (us.n >= 3) {
    const ourScore = us.early - us.late;
    const theirScore = them.n ? them.early - them.late : 0;
    if (ourScore - theirScore >= 2) tips.push('Vous êtes plus forts en early : jouez les drakes et le Héraut, cherchez à finir avant 25-30 min.');
    else if (theirScore - ourScore >= 2) tips.push('Eux sont plus forts en early : jouez safe, farmez, vous gagnez les fights tardifs.');
    else if (us.late >= 3) tips.push('Votre compo scale bien : pas de prise de risque, le temps joue pour vous.');
    if (us.front === 0) tips.push('Pas de frontline chez nous : jouez à distance, évitez les fights frontaux.');
    if (us.engage === 0) tips.push('Pas d’engage chez nous : jouez la contre-attaque (on désengage puis on punit).');
    if (us.poke >= 2) tips.push('Vous avez de la poke : affaiblissez-les avant chaque objectif, puis engagez.');
  }
  if (!tips.length && us.n >= 3) {
    tips.push('Rapport de force équilibré : jouez autour de vos meilleurs matchups de lane (ci-dessous) et des objectifs neutres.');
  }
  return { us, them, tips: tips.slice(0, 6) };
}

// ── Flex picks et sécurité en blind ────────────────────────────────────────
/** Champions de nos pools jouables à plusieurs postes (niveau B ou mieux). */
export function flexPicks(players, unavailable = new Set()) {
  const map = new Map();
  for (const p of players) {
    for (const [id, roles] of Object.entries(p.pool || {})) {
      if (unavailable.has(id)) continue;
      for (const [r, t] of Object.entries(roles || {})) {
        if (!t || t < 2) continue;
        const e = map.get(id) || { champ: id, roles: new Set(), who: new Set() };
        e.roles.add(r);
        e.who.add(p.name);
        map.set(id, e);
      }
    }
  }
  return [...map.values()]
    .filter((e) => e.roles.size >= 2)
    .map((e) => ({ champ: e.champ, roles: ROLES.filter((r) => e.roles.has(r)), who: [...e.who] }))
    .sort((a, b) => b.roles.length - a.roles.length || b.who.length - a.who.length);
}

/**
 * Sécurité d'un pick en blind : nombre de vrais contres (U.GG) dans ce rôle.
 * data = stats U.GG du champion → { level: 'safe' | 'ok' | 'risky', counters: [{ opp, wr }] } ou null.
 */
export function blindSafety(data, role) {
  const vs = data?.roles?.[role]?.vs;
  if (!vs) return null;
  const counters = Object.entries(vs)
    .map(([opp, [oppWins, games]]) => ({ opp, games, wrS: (oppWins + 30) / (games + 60), wr: games ? oppWins / games : 0 }))
    .filter((x) => x.games >= 200 && x.wrS >= 0.54)
    .sort((a, b) => b.wrS - a.wrS);
  const hard = counters.filter((x) => x.wrS >= 0.565).length;
  const level = counters.length <= 2 && !hard ? 'safe' : hard >= 3 || counters.length >= 6 ? 'risky' : 'ok';
  return { level, counters: counters.slice(0, 3) };
}
export const SAFETY_LABEL = { safe: 'Blind sûr', ok: 'Blind possible', risky: 'Risqué en blind' };

// ── Méta du patch ───────────────────────────────────────────────────────────
/** Champions les plus forts du patch : meta = { role: [{ champ, wins, games, pick }] } → triés par force. */
export function metaTop(meta, n = 8) {
  const out = [];
  for (const [role, list] of Object.entries(meta || {})) {
    for (const x of list) {
      if (x.pick < 0.02) continue; // champions vraiment joués à ce rôle
      const wrS = (x.wins + 500) / (x.games + 1000);
      out.push({ ...x, role, wr: x.games ? x.wins / x.games : 0, score: (wrS - 0.5) * 100 + Math.min(x.pick * 100, 10) * 0.18 });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}
/** Force méta d'un champion à un rôle (0 si inconnu). */
export function metaScore(meta, id, role) {
  const x = (meta?.[role] || []).find((m) => m.champ === id);
  if (!x || x.pick < 0.01) return 0;
  const wrS = (x.wins + 500) / (x.games + 1000);
  return Math.max(0, (wrS - 0.5) * 100 + Math.min(x.pick * 100, 10) * 0.18);
}
