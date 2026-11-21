// Petits utilitaires sans dépendance (utilisables aussi dans Node pour les tests).

export const cx = (...parts) => parts.filter(Boolean).join(' ');

export function uid(prefix = '') {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(10));
  return prefix + Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function lsGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* stockage plein ou bloqué : on ignore */
  }
}

export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 45) return 'à l’instant';
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

/** Nombre signé avec une décimale max : +2,5 / −4 / 0 */
export function signed(n) {
  if (!Number.isFinite(n)) return '—';
  const r = Math.round(n * 10) / 10;
  if (r === 0) return '0';
  const txt = Math.abs(r).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return (r > 0 ? '+' : '−') + txt;
}

export const plural = (n, word, wordPlural = word + 's') => `${n} ${n > 1 ? wordPlural : word}`;
