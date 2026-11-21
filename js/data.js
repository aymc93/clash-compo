// Données champions : liste officielle (Riot Data Dragon, en français) + rôles et
// profil de chaque champion (utilisés pour proposer les rôles et équilibrer la compo).
import { lsGet, lsSet } from './util.js';

export const ROLES = ['top', 'jungle', 'mid', 'adc', 'support'];
export const ROLE_LABEL = { top: 'Top', jungle: 'Jungle', mid: 'Mid', adc: 'ADC', support: 'Support' };

// Niveau d'un joueur sur un champion, pour un rôle donné.
export const TIERS = [4, 3, 2, 1];
export const TIER_LETTER = { 4: 'S', 3: 'A', 2: 'B', 1: 'C' };
export const TIER_NAME = { 4: 'Main / OTP', 3: 'Très à l’aise', 2: 'Confort', 1: 'Dépannage' };

/*
 * Profil des champions : "rôles dégâts traits"
 *   rôles   : t = top, j = jungle, m = mid, a = adc, s = support (le 1er = rôle principal)
 *   dégâts  : P = physiques (AD), M = magiques (AP), H = mixtes
 *   traits  : F = frontline (encaisse), E = engage (lance les fights)
 * Un champion absent de la liste (nouveau champion) est déduit automatiquement
 * de ses tags Riot. N'hésite pas à ajuster selon votre façon de jouer.
 */
const META = {
  Aatrox: 't P F', Ahri: 'm M', Akali: 'mt M', Akshan: 'mt P', Alistar: 's M FE',
  Ambessa: 't P E', Amumu: 'js M FE', Anivia: 'm M', Annie: 'ms M E', Aphelios: 'a P',
  Ashe: 'as P E', AurelionSol: 'm M', Aurora: 'mt M', Azir: 'm M', Bard: 's M',
  Belveth: 'j P', Blitzcrank: 's M E', Brand: 'sjm M', Braum: 's M F', Briar: 'j P E',
  Caitlyn: 'a P', Camille: 't P', Cassiopeia: 'mt M', Chogath: 'tm M F', Corki: 'ma H',
  Darius: 't P F', Diana: 'jm M E', DrMundo: 'tj H F', Draven: 'a P', Ekko: 'jm M',
  Elise: 'j M', Evelynn: 'j M', Ezreal: 'a P', Fiddlesticks: 'j M E', Fiora: 't P',
  Fizz: 'm M', Galio: 'ms M FE', Gangplank: 't P', Garen: 't P F', Gnar: 't P FE',
  Gragas: 'jtm M FE', Graves: 'j P', Gwen: 'tj M', Hecarim: 'j P FE', Heimerdinger: 'mts M',
  Hwei: 'ms M', Illaoi: 't P F', Irelia: 'tm P', Ivern: 'j M', Janna: 's M',
  JarvanIV: 'j P FE', Jax: 'tj H F', Jayce: 'tm P', Jhin: 'a P', Jinx: 'a P',
  KSante: 't P FE', Kaisa: 'a H', Kalista: 'a P', Karma: 'smt M', Karthus: 'jm M',
  Kassadin: 'm M', Katarina: 'm M', Kayle: 'tm H', Kayn: 'j P', Kennen: 'tm M E',
  Khazix: 'j P', Kindred: 'j P', Kled: 't P FE', KogMaw: 'a H', Leblanc: 'm M',
  LeeSin: 'j P', Leona: 's M FE', Lillia: 'j M', Lissandra: 'm M E', Locke: 'mj M',
  Lucian: 'am P', Lulu: 's M', Lux: 'sm M', Malphite: 'tsm M FE', Malzahar: 'm M',
  Maokai: 'sjt M FE', MasterYi: 'j P', Mel: 'ms M', Milio: 's M', MissFortune: 'a P',
  MonkeyKing: 'jt P FE', Mordekaiser: 't M F', Morgana: 'sjm M', Naafiri: 'm P', Nami: 's M',
  Nasus: 't P F', Nautilus: 's M FE', Neeko: 'ms M E', Nidalee: 'j M', Nilah: 'a P',
  Nocturne: 'j P E', Nunu: 'j M FE', Olaf: 'tj P F', Orianna: 'm M', Ornn: 't H FE',
  Pantheon: 'tmsj P E', Poppy: 'tjs P F', Pyke: 's P', Qiyana: 'mj P', Quinn: 't P',
  Rakan: 's M E', Rammus: 'j M FE', RekSai: 'j P', Rell: 's M FE', Renata: 's M',
  Renekton: 't P F', Rengar: 'jt P', Riven: 't P', Rumble: 'tm M', Ryze: 'mt M',
  Samira: 'a P', Sejuani: 'j M FE', Senna: 'sa P', Seraphine: 'sma M', Sett: 'ts P FE',
  Shaco: 'js H', Shen: 'ts M FE', Shyvana: 'j H F', Singed: 't M F', Sion: 't P FE',
  Sivir: 'a P', Skarner: 'jt H FE', Smolder: 'amt P', Sona: 's M', Soraka: 's M',
  Swain: 'smat M F', Sylas: 'mj M', Syndra: 'm M', TahmKench: 'ts M F', Taliyah: 'jm M',
  Talon: 'mj P', Taric: 's M F', Teemo: 't M', Thresh: 's M E', Tristana: 'am P',
  Trundle: 'jt P F', Tryndamere: 't P', TwistedFate: 'm M', Twitch: 'aj P', Udyr: 'jt H F',
  Urgot: 't P F', Varus: 'am P', Vayne: 'at P', Veigar: 'ms M', Velkoz: 'sm M',
  Vex: 'm M', Vi: 'j P FE', Viego: 'j P', Viktor: 'm M', Vladimir: 'mt M',
  Volibear: 'tj H FE', Warwick: 'jt H FE', Xayah: 'a P', Xerath: 'sm M', XinZhao: 'j P E',
  Yasuo: 'mta P', Yone: 'mt H E', Yorick: 't P', Yunara: 'a P', Yuumi: 's M',
  Zaahen: 't P F', Zac: 'jts M FE', Zed: 'mj P', Zeri: 'a P', Ziggs: 'ma M',
  Zilean: 'sm M', Zoe: 'ms M', Zyra: 'sj M',
};

// Surnoms courants pour la recherche rapide pendant la draft.
const ALIASES = {
  mf: 'MissFortune', tf: 'TwistedFate', asol: 'AurelionSol', j4: 'JarvanIV', lb: 'Leblanc',
  ww: 'Warwick', gp: 'Gangplank', yi: 'MasterYi', mk: 'MonkeyKing', wk: 'MonkeyKing',
  k6: 'Khazix', kz: 'Khazix', tk: 'TahmKench', ks: 'KSante', mundo: 'DrMundo',
  raka: 'Soraka', heimer: 'Heimerdinger', velk: 'Velkoz', cho: 'Chogath', ez: 'Ezreal',
  cait: 'Caitlyn', naut: 'Nautilus', blitz: 'Blitzcrank', voli: 'Volibear', fid: 'Fiddlesticks',
};

const ROLE_CODE = { t: 'top', j: 'jungle', m: 'mid', a: 'adc', s: 'support' };
const DD = 'https://ddragon.leagueoflegends.com';

let version = null;
let list = [];
const byId = new Map();

export const norm = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function parseMeta(raw) {
  const [roles = '', dmg = 'H', traits = ''] = raw.split(' ');
  return {
    roles: [...roles].map((c) => ROLE_CODE[c]).filter(Boolean),
    dmg,
    front: traits.includes('F'),
    engage: traits.includes('E'),
  };
}

// Pour un champion inconnu de la table : on devine à partir des tags Riot.
function inferMeta(c) {
  const tags = c.tags || [];
  const info = c.info || {};
  const main = tags[0];
  const roles =
    main === 'Marksman' ? 'a' : main === 'Support' ? 's' : main === 'Tank' || main === 'Fighter' ? 't' : 'm';
  const dmg = (info.magic || 0) > (info.attack || 0) ? 'M' : 'P';
  const traits = tags.includes('Tank') ? 'F' : '';
  return parseMeta(`${roles} ${dmg} ${traits}`);
}

function enrich(c) {
  const raw = META[c.id];
  const meta = raw ? parseMeta(raw) : inferMeta(c);
  const words = c.name.split(/[\s'’.\-&]+/).map(norm).filter(Boolean);
  return { ...c, ...meta, guessed: !raw, n: norm(c.name), nid: norm(c.id), words };
}

/** Installe une liste de champions (déjà téléchargée ou en cache). */
export function setChampionData(payload) {
  version = payload.version;
  list = payload.list.map(enrich).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  byId.clear();
  for (const c of list) byId.set(c.id, c);
  return { version, count: list.length };
}

async function fetchJSON(url, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Télécharge la dernière version de la liste des champions (avec cache local). */
export async function loadChampions() {
  const cached = lsGet('cc.ddragon');
  let latest;
  try {
    latest = (await fetchJSON(`${DD}/api/versions.json`))[0];
  } catch (err) {
    if (cached?.list?.length) return setChampionData(cached);
    throw new Error('Impossible de joindre les serveurs de Riot (Data Dragon) pour charger les champions.');
  }
  if (cached?.version === latest && cached.list?.length) return setChampionData(cached);
  try {
    const data = await fetchJSON(`${DD}/cdn/${latest}/data/fr_FR/champion.json`);
    const champs = Object.values(data.data).map((c) => ({
      id: c.id,
      name: c.name,
      title: c.title,
      tags: c.tags,
      info: c.info,
      image: c.image.full,
    }));
    const payload = { version: latest, list: champs };
    lsSet('cc.ddragon', payload);
    return setChampionData(payload);
  } catch (err) {
    if (cached?.list?.length) return setChampionData(cached);
    throw err;
  }
}

export const allChamps = () => list;

const unknown = new Map();
/** Infos d'un champion par son id Riot (ex. "MonkeyKing" pour Wukong). */
export function champ(id) {
  const c = byId.get(id);
  if (c) return c;
  if (!unknown.has(id)) {
    unknown.set(id, {
      id, name: String(id), title: '', tags: [], image: `${id}.png`, roles: [], dmg: 'H',
      front: false, engage: false, guessed: true, missing: true, n: norm(id), nid: norm(id), words: [],
    });
  }
  return unknown.get(id);
}

export const iconUrl = (id) => `${DD}/cdn/${version}/img/champion/${champ(id).image}`;
export const loadingUrl = (id) => `${DD}/cdn/img/champion/loading/${id}_0.jpg`;
export const splashUrl = (id) => `${DD}/cdn/img/champion/splash/${id}_0.jpg`;
export const centeredUrl = (id) => `${DD}/cdn/img/champion/centered/${id}_0.jpg`;

/** "16.23.1" (Data Dragon) → "26.23" (nom du patch en jeu). */
export function patchLabel() {
  const [major, minor] = String(version || '').split('.').map(Number);
  if (!major) return '';
  return `${major >= 15 ? major + 10 : major}.${minor}`;
}

/** Recherche tolérante : accents, apostrophes, surnoms (mf, j4, tf…). */
export function searchChamps(query, source = list) {
  const q = norm(query);
  if (!q) return source;
  const alias = ALIASES[q];
  const scored = [];
  for (const c of source) {
    let s = 0;
    if (alias === c.id) s = 100;
    else if (c.n === q || c.nid === q) s = 90;
    else if (c.n.startsWith(q) || c.nid.startsWith(q)) s = 70;
    else if (c.words.some((w) => w.startsWith(q))) s = 55;
    else if (c.n.includes(q) || c.nid.includes(q)) s = 30;
    if (s) scored.push({ s, c });
  }
  scored.sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name, 'fr'));
  return scored.map((x) => x.c);
}
