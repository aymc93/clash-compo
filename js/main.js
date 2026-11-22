// Point d'entrée : charge les champions, se connecte à l'équipe, affiche l'app.
import { html, render } from './vendor.js';
import { lsGet, lsSet, uid } from './util.js';
import { loadChampions } from './data.js';
import { createStore } from './store.js';
import { firebaseConfig } from '../config.js';
import { App, CodeGate } from './app.js';
import { checkCode, isProtected, savedCode } from './protect.js';

const ROOM_RE = /^[A-Za-z0-9_-]{3,64}$/;

/** L'équipe (« room ») est dans l'URL : ?room=xxxx. Sinon on reprend la dernière, ou on en crée une. */
function resolveRoom() {
  const url = new URL(location.href);
  let room = url.searchParams.get('room');
  if (!room || !ROOM_RE.test(room)) {
    room = lsGet('cc.lastRoom');
    if (!room || !ROOM_RE.test(room)) room = `team-${uid().slice(0, 8)}`;
    url.searchParams.set('room', room);
    history.replaceState(null, '', url);
  }
  lsSet('cc.lastRoom', room);
  return room;
}

function showFatal(message) {
  const el = document.getElementById('boot-text');
  if (el) {
    el.textContent = message;
    el.classList.add('boot-error');
  }
}

/** Équipe protégée : retrouve l'adresse des données avec le code enregistré, sinon le demande. */
async function resolveDataPath(room, root) {
  const base = firebaseConfig?.databaseURL;
  if (!base) return room;
  let locked = false;
  try { locked = await isProtected(base, room); } catch { return room; }
  if (!locked) return room;
  const remembered = savedCode(room);
  if (remembered) {
    const path = await checkCode(base, room, remembered).catch(() => null);
    if (path) return path;
  }
  await loadChampions().catch(() => {});
  return new Promise((resolve) => {
    root.textContent = '';
    render(html`<${CodeGate} room=${room} onOk=${(path) => { render(null, root); resolve(path); }} />`, root);
  });
}

async function start() {
  const room = resolveRoom();
  const root = document.getElementById('app');
  const dataPath = await resolveDataPath(room, root);
  const [, store] = await Promise.all([loadChampions(), createStore({ roomId: dataPath, firebaseConfig })]);
  root.textContent = '';
  render(html`<${App} store=${store} room=${room} secured=${dataPath !== room} />`, root);
}

start().catch((err) => {
  console.error(err);
  showFatal(`${err?.message || err} — vérifie ta connexion puis recharge la page.`);
});
