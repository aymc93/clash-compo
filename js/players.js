// Onglet « Joueurs » : pseudos, pools de champions par rôle, couverture des rôles.
import { html } from './vendor.js';
import { cx, plural } from './util.js';
import { ROLES, ROLE_LABEL, TIER_LETTER, TIER_NAME, champ, centeredUrl, splashUrl } from './data.js';
import { Avatar, ChampIcon, ConfirmButton, EditableText, Icon, Modal, RoleIcon, Switch, TierPicker } from './ui.js';

const byTier = (a, b) => b.tier - a.tier || champ(a.id).name.localeCompare(champ(b.id).name, 'fr');

export function PlayersView({ players, actions, meId, onlineIds, unavailable, onAdd, onEdit, onAddPlayer }) {
  const active = players.filter((p) => p.active !== false);
  return html`<div class="players-view">
    <div class="view-head">
      <div>
        <h1>Joueurs & pools</h1>
        <p class="muted">Chacun renseigne ses champions et son niveau <b>par rôle</b>. Personne n’a de rôle attitré : le moteur trouve la meilleure répartition.</p>
      </div>
      <button type="button" class="btn btn-gold" onClick=${onAddPlayer}><${Icon} name="userPlus" size=${17} /> Ajouter un joueur</button>
    </div>

    ${players.length > 0 && html`<${Coverage} players=${active} />`}

    <div class="player-grid">
      ${players.map((p) => html`<${PlayerCard} key=${p.id} p=${p} actions=${actions} isMe=${p.id === meId}
        online=${onlineIds.has(p.id)} unavailable=${unavailable} onAdd=${onAdd} onEdit=${onEdit} />`)}
      <button type="button" class="pcard pcard-add" onClick=${onAddPlayer}>
        <${Icon} name="userPlus" size=${26} />
        <span>Ajouter un joueur</span>
        <small class="muted">Un remplaçant ? Ajoute-le aussi : le moteur choisit les 5 meilleurs titulaires.</small>
      </button>
    </div>

    <${TierLegend} />
  </div>`;
}

function TierLegend() {
  return html`<div class="legend panel">
    <h3>Niveaux</h3>
    <ul>
      ${[4, 3, 2, 1].map((t) => html`<li><span class=${cx('tier-pill', `t${t}`)}>${TIER_LETTER[t]}</span> ${TIER_NAME[t]}</li>`)}
    </ul>
    <p class="muted small">Clique sur un champion pour changer son niveau ou ajouter un autre rôle (ex. Sett top <b>et</b> support).</p>
  </div>`;
}

function PlayerCard({ p, actions, isMe, online, unavailable, onAdd, onEdit }) {
  const pool = p.pool || {};
  const count = Object.keys(pool).length;
  const rows = ROLES.map((r) => ({
    r,
    list: Object.entries(pool)
      .filter(([, roles]) => roles?.[r])
      .map(([id, roles]) => ({ id, tier: roles[r] }))
      .sort(byTier),
  }));
  const bench = p.active === false;

  return html`<article class=${cx('pcard', bench && 'is-bench', isMe && 'is-me')} style=${{ '--pc': p.color }}>
    <header class="pcard-head">
      <${Avatar} name=${p.name} color=${p.color} size=${40} online=${online} />
      <div class="pcard-id">
        <${EditableText} value=${p.name} onCommit=${(v) => actions.renamePlayer(p.id, v)} class="pcard-name" ariaLabel="Pseudo du joueur" />
        <div class="pcard-sub">
          ${isMe && html`<span class="tag tag-gold">Toi</span>`}
          ${online && html`<span class="tag tag-green">En ligne</span>`}
          <span class="muted">${plural(count, 'champion')}</span>
        </div>
      </div>
      <div class="pcard-status">
        <${Switch} checked=${!bench} onChange=${(v) => actions.setActive(p.id, v)} label=${bench ? 'Remplaçant : cliquer pour le rendre titulaire' : 'Titulaire : cliquer pour le mettre remplaçant'} />
        <span class=${cx('status-txt', bench && 'muted')}>${bench ? 'Remplaçant' : 'Titulaire'}</span>
      </div>
    </header>

    <div class="pcard-roles">
      ${rows.map(({ r, list }) => html`<div class=${cx('role-row', p.forcedRole === r && 'is-forced')} key=${r}>
        <div class="role-label" title=${ROLE_LABEL[r]}><${RoleIcon} role=${r} size=${18} /><span>${ROLE_LABEL[r]}</span></div>
        <div class="role-champs">
          ${list.map(({ id, tier }) => html`<${ChampIcon} key=${id} id=${id} size=${40} tier=${tier} banned=${unavailable.has(id)}
            onClick=${() => onEdit(p.id, id)}
            title=${`${champ(id).name} · ${TIER_LETTER[tier]} (${TIER_NAME[tier]})${unavailable.has(id) ? ' — indisponible dans la draft' : ''}`} />`)}
          <button type="button" class="add-champ" onClick=${() => onAdd(p.id, r)} aria-label=${`Ajouter un champion en ${ROLE_LABEL[r]} pour ${p.name}`} title=${`Ajouter en ${ROLE_LABEL[r]}`}>
            <${Icon} name="plus" size=${16} />
          </button>
        </div>
      </div>`)}
    </div>

    <footer class="pcard-foot">
      <label class="field-inline">
        <span>Rôle imposé</span>
        <select value=${p.forcedRole || ''} onChange=${(e) => actions.setForcedRole(p.id, e.currentTarget.value || null)}>
          <option value="">Aucun (auto)</option>
          ${ROLES.map((r) => html`<option value=${r}>${ROLE_LABEL[r]}</option>`)}
        </select>
      </label>
      <div class="pcard-foot-actions">
        <button type="button" class="btn btn-ghost btn-sm" onClick=${() => onAdd(p.id, null)}><${Icon} name="plus" size=${15} /> Champions</button>
        <${ConfirmButton} class="btn btn-ghost btn-sm danger" onConfirm=${() => actions.removePlayer(p.id)} confirmLabel="Supprimer ?" title="Supprimer ce joueur">
          <${Icon} name="trash" size=${15} />
        <//>
      </div>
    </footer>
  </article>`;
}

function Coverage({ players }) {
  const cell = (p, r) => {
    const tiers = Object.values(p.pool || {}).map((roles) => roles?.[r]).filter(Boolean);
    return { best: tiers.length ? Math.max(...tiers) : 0, count: tiers.length };
  };
  const roleCount = (r) => players.filter((p) => cell(p, r).count > 0).length;
  return html`<section class="coverage panel">
    <div class="panel-head">
      <h3><${Icon} name="shield" size=${16} /> Couverture des rôles</h3>
      <span class="muted small">Meilleur niveau · nombre de champions (titulaires)</span>
    </div>
    <div class="cov-scroll">
      <div class="cov-table" style=${{ '--rows': players.length + 1 }}>
        <div class="cov-cell cov-corner"></div>
        ${ROLES.map((r) => {
          const n = roleCount(r);
          return html`<div class=${cx('cov-cell cov-h', n === 0 && 'is-empty')} title=${n === 0 ? 'Personne ne joue ce rôle !' : plural(n, 'joueur')}>
            <${RoleIcon} role=${r} size=${16} /><span>${ROLE_LABEL[r]}</span>${n === 0 && html`<${Icon} name="alert" size=${13} />`}
          </div>`;
        })}
        ${players.map((p) => html`
          <div class="cov-cell cov-p" key=${'n' + p.id}><span class="dot" style=${{ background: p.color }}></span>${p.name}</div>
          ${ROLES.map((r) => {
            const { best, count } = cell(p, r);
            return html`<div class=${cx('cov-cell cov-v', best && `t${best}`)} key=${p.id + r}>
              ${best ? html`<b>${TIER_LETTER[best]}</b><span>${count}</span>` : html`<span class="muted">—</span>`}
            </div>`;
          })}
        `)}
      </div>
    </div>
    ${players.length < 5 && html`<p class="hint warn"><${Icon} name="alert" size=${14} /> Il faut au moins 5 titulaires pour générer des compos (actuellement ${players.length}).</p>`}
  </section>`;
}

/** Fenêtre d'édition d'un champion dans le pool d'un joueur. */
export function PoolEditor({ open, player, champId, onClose, actions }) {
  if (!open || !player || !champId) return null;
  const c = champ(champId);
  const roles = player.pool?.[champId] || {};
  const header = html`<div class="pe-banner">
    <img src=${centeredUrl(champId)} alt="" onError=${(e) => { e.currentTarget.src = splashUrl(champId); }} />
    <div class="pe-banner-txt">
      <span class="eyebrow">${c.title}</span>
    </div>
  </div>`;
  return html`<${Modal} open=${open} onClose=${onClose} title=${c.name} subtitle=${`Pool de ${player.name}`} size="sm" header=${header}
    footer=${html`
      <button type="button" class="btn btn-ghost danger" onClick=${() => { actions.removeChamp(player.id, champId); onClose(); }}>
        <${Icon} name="trash" size=${15} /> Retirer du pool
      </button>
      <button type="button" class="btn btn-gold" onClick=${onClose}>OK</button>`}>
    <p class="muted small">Niveau de <b>${player.name}</b> sur ${c.name}, rôle par rôle :</p>
    <div class="pe-rows">
      ${ROLES.map((r) => html`<div class="pe-row" key=${r}>
        <span class="pe-role">
          <${RoleIcon} role=${r} size=${18} /> ${ROLE_LABEL[r]}
          ${c.roles.includes(r) && html`<span class="pe-usual" title="Rôle habituel de ce champion">habituel</span>`}
        </span>
        <${TierPicker} value=${roles[r] || 0} onChange=${(t) => actions.setTier(player.id, champId, r, t)} />
      </div>`)}
    </div>
  <//>`;
}
