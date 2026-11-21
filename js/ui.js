// Composants d'interface réutilisables : icônes, portraits, modales, toasts…
import { html, useEffect, useRef, useState } from './vendor.js';
import { cx } from './util.js';
import { champ, iconUrl, TIER_LETTER, TIER_NAME } from './data.js';

// ── Icônes (traits 24×24) ─────────────────────────────────────────────────
const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const rect = (x, y, w, h, r) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;

const ICONS = {
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  check: ['M20 6 9 17l-5-5'],
  lock: [rect(4, 11, 16, 10, 2), 'M8 11V7a4 4 0 0 1 8 0v4'],
  unlock: [rect(4, 11, 16, 10, 2), 'M8 11V7a4 4 0 0 1 7.7-1.5'],
  search: [circle(11, 11, 7), 'M20 20l-3.5-3.5'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0'],
  trash: ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  refresh: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'],
  bolt: ['M13 2 3 14h9l-1 8 10-12h-9l1-8z'],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', circle(9, 7, 4), 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  userPlus: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', circle(9, 7, 4), 'M19 8v6', 'M22 11h-6'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  bookmark: ['M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z'],
  target: [circle(12, 12, 9), circle(12, 12, 5), circle(12, 12, 1)],
  alert: ['M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z', 'M12 9v4', 'M12 17h.01'],
  info: [circle(12, 12, 9), 'M12 16v-4', 'M12 8h.01'],
  swords: ['M14.5 17.5 3 6V3h3l11.5 11.5', 'M13 19l6-6', 'M16 16l4 4', 'M19 21l2-2', 'M14.5 6.5 18 3h3v3l-3.5 3.5', 'M5 14l4 4', 'M7 17l-3 3', 'M3 19l2 2'],
  sparkles: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z'],
  crown: ['M3 7l4.5 4L12 5l4.5 6L21 7l-2 12H5z'],
  edit: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'],
  chevron: ['M6 9l6 6 6-6'],
  arrowRight: ['M5 12h14', 'M13 5l7 7-7 7'],
  ban: [circle(12, 12, 9), 'M5.6 5.6l12.8 12.8'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', circle(12, 7, 4)],
};

export function Icon({ name, size = 18, stroke = 2, class: cls }) {
  const paths = ICONS[name] || [];
  return html`<svg class=${cx('icon', cls)} width=${size} height=${size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width=${stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${paths.map((d) => html`<path d=${d} />`)}
  </svg>`;
}

// ── Icônes de rôle (mini-carte avec la voie en surbrillance) ─────────────
const ROLE_SHAPES = {
  top: () => html`
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5" />
    <path d="M3.5 15V6A2.5 2.5 0 0 1 6 3.5h9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    <rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" opacity=".35" />`,
  jungle: () => html`
    <path d="M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z" fill="currentColor" opacity=".2" />
    <path d="M5 19C5 10.5 10.5 5 19 5c0 8.5-5.5 14-14 14z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    <path d="M5 19 14 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />`,
  mid: () => html`
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5" />
    <path d="M6.5 17.5 17.5 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />`,
  adc: () => html`
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.5" />
    <path d="M20.5 9v9a2.5 2.5 0 0 1-2.5 2.5H9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    <rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" opacity=".35" />`,
  support: () => html`
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" fill="currentColor" opacity=".2" />
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    <path d="M12 8.5v6M9 11.5h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />`,
};

export function RoleIcon({ role, size = 18, class: cls }) {
  const shape = ROLE_SHAPES[role];
  return html`<svg class=${cx('role-icon', cls)} width=${size} height=${size} viewBox="0 0 24 24" aria-hidden="true">${shape ? shape() : null}</svg>`;
}

// ── Portrait de champion ──────────────────────────────────────────────────
export function ChampIcon({ id, size = 44, tier, banned, dim, title, onClick, badge, class: cls, children }) {
  const c = champ(id);
  const tip = title ?? c.name;
  const inner = html`
    <img src=${iconUrl(id)} alt=${c.name} loading="lazy" width=${size} height=${size} draggable="false" />
    ${tier ? html`<span class="tier-dot">${TIER_LETTER[tier]}</span>` : null}
    ${badge != null ? html`<span class="champ-badge">${badge}</span>` : null}
    ${children}`;
  const props = {
    class: cx('champ', tier && `t${tier}`, banned && 'is-banned', dim && 'is-dim', onClick && 'is-btn', cls),
    style: { '--s': `${size}px` },
    title: tip,
  };
  return onClick
    ? html`<button type="button" ...${props} onClick=${onClick} aria-label=${tip}>${inner}</button>`
    : html`<span ...${props}>${inner}</span>`;
}

export function TierPill({ tier, off }) {
  if (off) return html`<span class="tier-pill off" title="Pas dans son pool">Hors pool</span>`;
  return html`<span class=${cx('tier-pill', `t${tier}`)} title=${TIER_NAME[tier]}>${TIER_LETTER[tier]}</span>`;
}

/** Sélecteur de niveau : — / C / B / A / S */
export function TierPicker({ value = 0, onChange, allowNone = true, size = 'md' }) {
  return html`<div class=${cx('tier-picker', `tp-${size}`)} role="radiogroup">
    ${allowNone && html`<button type="button" role="radio" aria-checked=${!value} class=${cx('tp', !value && 'on')}
      onClick=${() => onChange(0)} title="Ne joue pas ce champion à ce rôle">—</button>`}
    ${[1, 2, 3, 4].map((t) => html`<button type="button" role="radio" aria-checked=${value === t}
      class=${cx('tp', `t${t}`, value === t && 'on')} onClick=${() => onChange(t)} title=${`${TIER_LETTER[t]} — ${TIER_NAME[t]}`}>${TIER_LETTER[t]}</button>`)}
  </div>`;
}

export function Avatar({ name = '?', color = '#8b95a7', size = 28, online, title }) {
  const initials = String(name).trim().split(/\s+/).map((w) => [...w][0] || '').join('').slice(0, 2).toUpperCase() || '?';
  return html`<span class=${cx('avatar', online && 'is-online')} style=${{ '--c': color, '--s': `${size}px` }} title=${title || name}>${initials}</span>`;
}

/** Texte modifiable en place (valide à la sortie du champ ou avec Entrée). */
export function EditableText({ value, onCommit, placeholder, class: cls, maxLength = 28, ariaLabel }) {
  const [draft, setDraft] = useState(value || '');
  const [editing, setEditing] = useState(false);
  const cancel = useRef(false);
  useEffect(() => {
    if (!editing) setDraft(value || '');
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    if (cancel.current) {
      cancel.current = false;
      setDraft(value || '');
      return;
    }
    const v = draft.trim();
    if (v && v !== value) onCommit(v);
    else setDraft(value || '');
  };
  return html`<input class=${cx('inline-input', cls)} value=${draft} placeholder=${placeholder} maxlength=${maxLength}
    aria-label=${ariaLabel} spellcheck="false"
    onInput=${(e) => setDraft(e.currentTarget.value)} onFocus=${() => setEditing(true)} onBlur=${commit}
    onKeyDown=${(e) => {
      if (e.key === 'Enter') e.currentTarget.blur();
      if (e.key === 'Escape') { e.stopPropagation(); cancel.current = true; e.currentTarget.blur(); }
    }} />`;
}

export function Switch({ checked, onChange, label }) {
  return html`<button type="button" role="switch" aria-checked=${!!checked} aria-label=${label} title=${label}
    class=${cx('switch', checked && 'on')} onClick=${() => onChange(!checked)}><span class="knob"></span></button>`;
}

/** Bouton à double clic de confirmation (pour les actions destructrices). */
export function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirmer ?', class: cls, title }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return html`<button type="button" class=${cx(cls, armed && 'is-armed')} title=${title}
    onClick=${() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>${armed ? confirmLabel : children}</button>`;
}

// ── Modale ────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, subtitle, children, size = 'md', footer, header }) {
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    const t = setTimeout(() => {
      const el = box.current?.querySelector('[data-autofocus]') || box.current;
      el?.focus();
    }, 40);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
      previous?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return html`<div class="modal-backdrop" onMouseDown=${(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div class=${cx('modal', `modal-${size}`)} role="dialog" aria-modal="true" aria-label=${title} ref=${box} tabindex="-1">
      ${header}
      <header class="modal-head">
        <div>
          <h2>${title}</h2>
          ${subtitle && html`<p>${subtitle}</p>`}
        </div>
        ${onClose && html`<button type="button" class="icon-btn modal-close" onClick=${onClose} aria-label="Fermer"><${Icon} name="x" /></button>`}
      </header>
      <div class="modal-body">${children}</div>
      ${footer && html`<footer class="modal-foot">${footer}</footer>`}
    </div>
  </div>`;
}

// ── Toasts ────────────────────────────────────────────────────────────────
const toastSubs = new Set();
let toastSeq = 0;
/** toast('texte') ou toast({ who, color, text, type }) */
export function toast(input) {
  const t = typeof input === 'string' ? { text: input } : input;
  const item = { id: ++toastSeq, ...t };
  toastSubs.forEach((fn) => fn(item));
}

export function ToastHost() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const onToast = (t) => {
      setItems((list) => [...list.slice(-3), t]);
      setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), t.duration || 4200);
    };
    toastSubs.add(onToast);
    return () => toastSubs.delete(onToast);
  }, []);
  return html`<div class="toasts" aria-live="polite">
    ${items.map((t) => html`<div class=${cx('toast', t.type && `toast-${t.type}`)} key=${t.id}>
      ${t.color && html`<span class="toast-dot" style=${{ background: t.color }}></span>`}
      ${t.champ && html`<img class="toast-champ" src=${iconUrl(t.champ)} alt="" />`}
      <span>${t.who && html`<b>${t.who}</b> `}${t.text}</span>
    </div>`)}
  </div>`;
}

export function Logo({ size = 34 }) {
  return html`<svg width=${size} height=${size} viewBox="0 0 64 64" aria-hidden="true" class="logo">
    <defs>
      <linearGradient id="lg-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f6e2a8" />
        <stop offset="1" stop-color="#a67b35" />
      </linearGradient>
    </defs>
    <path d="M32 3.5 56.7 17.75v28.5L32 60.5 7.3 46.25v-28.5z" fill="#0b1222" stroke="url(#lg-gold)" stroke-width="3.5" stroke-linejoin="round" />
    <g fill="none" stroke="url(#lg-gold)" stroke-width="3.6" stroke-linecap="round">
      <path d="M20 44 43 21" /><path d="M44 44 21 21" /><path d="M18.5 37.5l8 8" /><path d="M45.5 37.5l-8 8" />
      <path d="M17 47l-2 2" /><path d="M47 47l2 2" />
    </g>
  </svg>`;
}
