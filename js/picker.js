// Sélecteur de champion (pools et draft).
import { html, useEffect, useMemo, useRef, useState } from './vendor.js';
import { cx } from './util.js';
import { ROLES, ROLE_LABEL, iconUrl, searchChamps } from './data.js';
import { Icon, Modal, RoleIcon } from './ui.js';

/**
 * props :
 *  open, onClose, title, subtitle
 *  onPick(id)            clic sur un champion
 *  isSelected(id)        coche (mode pool)
 *  isDisabled(id)        grisé (déjà utilisé dans la draft…)
 *  hint(id)              petit badge (ex. nb de joueurs qui l'ont dans leur pool)
 *  hintTitle(id)         infobulle du badge
 *  initialRole           filtre de rôle au départ ('all' par défaut)
 *  multi                 reste ouvert après un clic
 *  toolbar               contenu additionnel (ex. sélecteur de niveau)
 */
export function ChampionPicker(props) {
  const { open, onClose, title, subtitle, onPick, isSelected, isDisabled, hint, hintTitle, initialRole = 'all', multi, toolbar } = props;
  const [query, setQuery] = useState('');
  const [role, setRole] = useState(initialRole);
  const input = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setRole(initialRole);
    }
  }, [open, initialRole]);

  const results = useMemo(() => {
    const list = searchChamps(query);
    return role === 'all' ? list : list.filter((c) => c.roles.includes(role));
  }, [query, role]);

  const pick = (c) => {
    if (isDisabled?.(c.id)) return;
    onPick(c.id);
    if (multi) {
      setQuery('');
      input.current?.focus();
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = results.find((c) => !isDisabled?.(c.id));
      if (first) pick(first);
    }
  };

  const footer = multi
    ? html`<span class="muted small">Astuce : tape un nom puis <kbd>Entrée</kbd> pour ajouter le premier résultat.</span>
        <button type="button" class="btn btn-gold" onClick=${onClose}>Terminé</button>`
    : null;

  return html`<${Modal} open=${open} onClose=${onClose} title=${title} subtitle=${subtitle} size="lg" footer=${footer}>
    <div class="picker-tools">
      <label class="search">
        <${Icon} name="search" size=${17} />
        <input data-autofocus ref=${input} value=${query} placeholder="Rechercher (ex : ahri, mf, j4, k6…)"
          onInput=${(e) => setQuery(e.currentTarget.value)} onKeyDown=${onKeyDown} aria-label="Rechercher un champion" />
      </label>
      <div class="chips" role="tablist" aria-label="Filtrer par rôle">
        ${['all', ...ROLES].map((r) => html`<button type="button" class=${cx('chip', role === r && 'on')} onClick=${() => setRole(r)}>
          ${r === 'all' ? 'Tous' : html`<${RoleIcon} role=${r} size=${14} /> ${ROLE_LABEL[r]}`}
        </button>`)}
      </div>
      ${toolbar}
    </div>
    <div class="picker-grid">
      ${results.map((c) => {
        const selected = isSelected?.(c.id);
        const disabled = isDisabled?.(c.id);
        const badge = hint?.(c.id);
        return html`<button type="button" key=${c.id} class=${cx('pick-tile', selected && 'is-selected', disabled && 'is-disabled')}
          onClick=${() => pick(c)} disabled=${disabled} title=${disabled ? `${c.name} (indisponible)` : c.name}>
          <span class="pick-img">
            <img src=${iconUrl(c.id)} alt="" loading="lazy" width="64" height="64" draggable="false" />
            ${selected && html`<span class="pick-check"><${Icon} name="check" size=${18} stroke=${3} /></span>`}
            ${badge ? html`<span class="pick-hint" title=${hintTitle?.(c.id)}>${badge}</span>` : null}
          </span>
          <span class="pick-name">${c.name}</span>
        </button>`;
      })}
      ${results.length === 0 && html`<p class="muted empty-line">Aucun champion ne correspond.</p>`}
    </div>
  <//>`;
}
