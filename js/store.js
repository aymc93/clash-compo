// Couche de synchro.
//  • Firebase Realtime Database (si config.js est rempli) → tout le monde voit tout en direct.
//  • Sinon mode local : localStorage (+ synchro entre onglets du même navigateur).
//
// Structure dans la base :
//   rooms/{room}/state     → données partagées (joueurs, pools, draft, réglages…)
//   rooms/{room}/presence  → qui est connecté
//   rooms/{room}/activity  → journal des modifications
import { uid, lsGet, lsSet } from './util.js';

const FIREBASE_VERSION = '11.0.2';
const ACTIVITY_LIMIT = 40;
const COALESCE_MS = 15000;

/** Supprime les valeurs vides (comme le fait Firebase) et refuse `undefined`. */
function clean(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') return value;
  const res = {};
  for (const [k, v] of Object.entries(value)) {
    const c = clean(v);
    if (c !== null) res[k] = c;
  }
  return Object.keys(res).length ? res : null;
}

/** Écriture immuable à un chemin "a/b/c" (null = suppression, parents vides supprimés). */
function setIn(obj, parts, value) {
  if (!parts.length) return value == null ? {} : value;
  const [key, ...rest] = parts;
  const base = obj && typeof obj === 'object' ? obj : {};
  const next = rest.length ? setIn(base[key], rest, value) : value;
  const copy = { ...base };
  if (next == null || (typeof next === 'object' && Object.keys(next).length === 0)) delete copy[key];
  else copy[key] = next;
  return copy;
}

function explainError(err) {
  const msg = String(err?.message || err || '');
  if (/permission/i.test(msg)) {
    return 'Firebase refuse l’accès : vérifie que les règles de la base sont bien celles du fichier database.rules.json (voir README).';
  }
  return 'Erreur Firebase : ' + msg;
}

export async function createStore({ roomId, firebaseConfig }) {
  // clientId : un par onglet (présence) · deviceId : stable pour ce navigateur (journal « moi »).
  const clientId = uid('c');
  let deviceId = lsGet('cc.device');
  if (!deviceId) {
    deviceId = uid('d');
    lsSet('cc.device', deviceId);
  }
  let snapshot = {
    state: {}, presence: {}, activity: [], status: 'connecting', mode: 'local', loaded: false, error: null,
  };
  const subs = new Set();
  const emit = (patch) => {
    snapshot = { ...snapshot, ...patch };
    subs.forEach((fn) => fn(snapshot));
  };

  let backend = null;
  if (firebaseConfig?.databaseURL) {
    try {
      backend = await connectFirebase(roomId, firebaseConfig, clientId, emit);
      emit({ mode: 'firebase' });
    } catch (err) {
      console.error(err);
      emit({ error: 'Connexion à Firebase impossible (' + (err?.message || err) + '). Passage en mode local.' });
    }
  }
  if (!backend) {
    backend = connectLocal(roomId, clientId, emit);
    emit({ mode: 'local' });
  }

  // Regroupe les modifs successives d'un même élément dans une seule ligne du journal.
  let last = null;
  return {
    clientId,
    deviceId,
    roomId,
    getSnapshot: () => snapshot,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    /** Écrit une valeur à un chemin relatif à l'état partagé (null = suppression). */
    set: (path, value) => backend.set(path, clean(value)),
    /** Plusieurs écritures atomiques : { 'players/x/name': 'Bob', 'draft/ourPicks/0': null } */
    update: (values) => {
      const cleaned = {};
      for (const [k, v] of Object.entries(values)) cleaned[k] = clean(v);
      return backend.update(cleaned);
    },
    log(entry, coalesceKey = null) {
      const now = Date.now();
      if (coalesceKey && last && last.key === coalesceKey && now - last.at < COALESCE_MS) {
        last.at = now;
        backend.replaceLog(last.id, entry);
        return;
      }
      const id = backend.log(entry);
      last = coalesceKey ? { key: coalesceKey, id, at: now } : null;
    },
    setPresence: (info) => backend.setPresence(clean(info) || {}),
  };
}

async function connectFirebase(roomId, config, clientId, emit) {
  const cdn = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, D] = await Promise.all([
    import(`${cdn}/firebase-app.js`),
    import(`${cdn}/firebase-database.js`),
  ]);
  const app = initializeApp(config, 'clash-compo');
  const db = D.getDatabase(app);
  const root = `rooms/${roomId}`;
  const stateRef = D.ref(db, `${root}/state`);
  const activityRef = D.ref(db, `${root}/activity`);
  const presenceRef = D.ref(db, `${root}/presence/${clientId}`);
  const at = (path) => (path ? D.ref(db, `${root}/state/${path}`) : stateRef);
  const onError = (err) => {
    console.error(err);
    emit({ error: explainError(err) });
  };

  D.onValue(stateRef, (snap) => emit({ state: snap.val() || {}, loaded: true, error: null }), onError);
  D.onValue(D.ref(db, `${root}/presence`), (snap) => emit({ presence: snap.val() || {} }), onError);
  D.onValue(
    D.query(activityRef, D.limitToLast(ACTIVITY_LIMIT)),
    (snap) => {
      const items = [];
      snap.forEach((child) => {
        items.push({ id: child.key, ...child.val() });
      });
      emit({ activity: items.reverse() });
    },
    onError,
  );

  let presence = null;
  let connected = false;
  const writePresence = () => {
    D.onDisconnect(presenceRef).remove().catch(() => {});
    D.set(presenceRef, { ...presence, since: D.serverTimestamp() }).catch(() => {});
  };
  D.onValue(D.ref(db, '.info/connected'), (snap) => {
    connected = snap.val() === true;
    emit({ status: connected ? 'live' : 'connecting' });
    if (connected && presence) writePresence();
  });

  return {
    set: (path, value) => D.set(at(path), value).catch(onError),
    update: (values) => D.update(stateRef, values).catch(onError),
    log(entry) {
      const ref = D.push(activityRef);
      D.set(ref, { ...entry, ts: D.serverTimestamp() }).catch(() => {});
      return ref.key;
    },
    replaceLog(id, entry) {
      D.set(D.ref(db, `${root}/activity/${id}`), { ...entry, ts: D.serverTimestamp() }).catch(() => {});
    },
    setPresence(info) {
      presence = info;
      if (connected) writePresence();
    },
  };
}

function connectLocal(roomId, clientId, emit) {
  const KEY = `cc.local.${roomId}`;
  const read = () => lsGet(KEY, { state: {}, activity: [] }) || { state: {}, activity: [] };
  let data = read();
  const persist = () => lsSet(KEY, data);

  // Un autre onglet a modifié les données → on recharge.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    data = read();
    emit({ state: data.state || {}, activity: data.activity || [] });
  });

  emit({ state: data.state || {}, activity: data.activity || [], status: 'local', loaded: true });
  const apply = (path, value) => {
    data.state = setIn(data.state || {}, path ? path.split('/') : [], value);
  };

  return {
    set(path, value) {
      apply(path, value);
      persist();
      emit({ state: data.state });
    },
    update(values) {
      for (const [path, value] of Object.entries(values)) apply(path, value);
      persist();
      emit({ state: data.state });
    },
    log(entry) {
      const id = uid('a');
      data.activity = [{ id, ...entry, ts: Date.now() }, ...(data.activity || [])].slice(0, ACTIVITY_LIMIT);
      persist();
      emit({ activity: data.activity });
      return id;
    },
    replaceLog(id, entry) {
      data.activity = (data.activity || []).map((a) => (a.id === id ? { id, ...entry, ts: Date.now() } : a));
      persist();
      emit({ activity: data.activity });
    },
    setPresence(info) {
      emit({ presence: { [clientId]: { ...info, since: Date.now() } } });
    },
  };
}
