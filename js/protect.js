// Équipe protégée par un code.
// Le lien d'invitation ne contient que le nom de l'équipe. Une fois protégée, ses données sont
// déplacées à une adresse calculée à partir du code (empreinte SHA-256) : sans le code, impossible
// de la trouver (les règles Firebase interdisent de lister les équipes). À l'ancienne adresse, il ne
// reste qu'un marqueur « protégée ».
import { lsGet, lsSet } from './util.js';

const enc = new TextEncoder();

/** Adresse des données d'une équipe protégée. */
export async function protectedPath(room, code) {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(`clash-compo:${room}:${String(code).trim()}`));
  const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${room}_k${hex.slice(0, 24)}`;
}

const url = (base, path) => `${base.replace(/\/$/, '')}/rooms/${path}.json`;

async function rest(base, path, method = 'GET', body) {
  const res = await fetch(url(base, path), {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Firebase : HTTP ${res.status}`);
  return res.json();
}

/** L'équipe est-elle protégée ? */
export async function isProtected(base, room) {
  return !!(await rest(base, `${room}/state/meta/protected`));
}

/** Le code est-il bon ? (les données existent à l'adresse calculée) */
export async function checkCode(base, room, code) {
  const path = await protectedPath(room, code);
  const ok = await rest(base, `${path}/state/meta/ok`);
  return ok ? path : null;
}

export const savedCode = (room) => lsGet(`cc.code.${room}`, '');
export const rememberCode = (room, code) => lsSet(`cc.code.${room}`, code || '');

/** Protège l'équipe : copie tout vers l'adresse secrète, ne laisse qu'un marqueur à l'ancienne. */
export async function protectRoom(base, room, code) {
  const data = (await rest(base, room)) || {};
  const path = await protectedPath(room, code);
  const state = data.state || {};
  const name = state.meta?.name || null;
  await rest(base, path, 'PUT', {
    state: { ...state, meta: { ...(state.meta || {}), ok: true, protected: null } },
    activity: data.activity || null,
  });
  await rest(base, room, 'PUT', { state: { meta: { protected: true, name } } });
  rememberCode(room, code);
  return path;
}

/** Retire la protection : les données reviennent à l'adresse normale. */
export async function unprotectRoom(base, room, code) {
  const path = await checkCode(base, room, code);
  if (!path) throw new Error('Code incorrect');
  const data = (await rest(base, path)) || {};
  const state = data.state || {};
  await rest(base, room, 'PUT', { state: { ...state, meta: { ...(state.meta || {}), ok: null, protected: null } }, activity: data.activity || null });
  await rest(base, path, 'DELETE');
  rememberCode(room, '');
}

/** Change le code (les données sont déplacées vers la nouvelle adresse). */
export async function changeCode(base, room, oldCode, newCode) {
  const oldPath = await checkCode(base, room, oldCode);
  if (!oldPath) throw new Error('Code actuel incorrect');
  const data = (await rest(base, oldPath)) || {};
  const path = await protectedPath(room, newCode);
  await rest(base, path, 'PUT', data);
  await rest(base, oldPath, 'DELETE');
  rememberCode(room, newCode);
}
