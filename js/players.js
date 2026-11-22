// Onglet « Joueurs » : pseudos, pools de champions par rôle, couverture des rôles.
import { html, useEffect, useRef, useState } from './vendor.js';
import { cx, plural, timeAgo } from './util.js';
import { ROLES, ROLE_LABEL, TIER_LETTER, TIER_NAME, champ, centeredUrl, splashUrl } from './data.js';
import { pct, wrClass } from './stats.js';
import { DEFAULT_PLATFORM, PLATFORMS, champStats, kdaTxt, mainRole, parseRiotId, profileUrl, riotKey, topChamps, unpack } from './playerstats.js';
import { Avatar, ChampIcon, ConfirmButton, EditableText, Icon, Modal, RoleIcon, Switch, TierPicker, TierPill, toast } from './ui.js';

const byTier = (a, b) => b.tier - a.tier || champ(a.id).name.localeCompare(champ(b.id).name, 'fr');

export function PlayersView({ players, actions, meId, onlineIds, unavailable, onAdd, onEdit, onAddPlayer, pstats }) {
  const active = players.filter((p) => p.active !== false);
  const [importing, setImporting] = useState(null); // id du joueur
  const importPlayer = importing ? players.find((p) => p.id === importing) : null;
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
        online=${onlineIds.has(p.id)} unavailable=${unavailable} onAdd=${onAdd} onEdit=${onEdit}
        ps=${pstats.statsOf(p)} accounts=${pstats.accountsStatus(p)} onRefresh=${() => pstats.refresh(p)} onImport=${() => setImporting(p.id)} />`)}
      <button type="button" class="pcard pcard-add" onClick=${onAddPlayer}>
        <${Icon} name="userPlus" size=${26} />
        <span>Ajouter un joueur</span>
        <small class="muted">Un remplaçant ? Ajoute-le aussi : le moteur choisit les 5 meilleurs titulaires.</small>
      </button>
    </div>

    <${TierLegend} />
    <${ImportModal} player=${importPlayer} ps=${importPlayer ? pstats.statsOf(importPlayer) : null} actions=${actions} onClose=${() => setImporting(null)} />
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

function PlayerCard({ p, actions, isMe, online, unavailable, onAdd, onEdit, ps, accounts, onRefresh, onImport }) {
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

    <${RiotPanel} p=${p} ps=${ps} accounts=${accounts} actions=${actions} onRefresh=${onRefresh} onImport=${onImport} />

    <div class="pcard-roles">
      ${rows.map(({ r, list }) => html`<div class=${cx('role-row', p.forcedRole === r && 'is-forced')} key=${r}>
        <div class="role-label" title=${ROLE_LABEL[r]}><${RoleIcon} role=${r} size=${18} /><span>${ROLE_LABEL[r]}</span></div>
        <div class="role-champs">
          ${list.map(({ id, tier }) => {
            const st = ps ? champStats(ps, id, r) : null;
            return html`<${ChampIcon} key=${id} id=${id} size=${40} tier=${tier} banned=${unavailable.has(id)}
              onClick=${() => onEdit(p.id, id)}
              title=${`${champ(id).name} · ${TIER_LETTER[tier]} (${TIER_NAME[tier]})${st ? ` — ${statLine(st)} en ${ROLE_LABEL[r]}` : ps ? ` — aucune partie classée en ${ROLE_LABEL[r]} cette saison` : ''}${unavailable.has(id) ? ' — indisponible dans la draft' : ''}`}>
              ${st && html`<span class=${cx('champ-wr', wrClass(st.wr))}>${Math.round(st.wr * 100)}</span>`}
            <//>`;
          })}
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

const statLine = (st) => `${plural(st.games, 'partie')} · ${pct(st.wr, 0)} · KDA ${kdaTxt(st.kda)}`;

/** Comptes Riot du joueur (plusieurs possibles) + résumé de ses stats cumulées de la saison. */
function RiotPanel({ p, ps, accounts, actions, onRefresh, onImport }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState(DEFAULT_PLATFORM);
  const parsed = parseRiotId(text);
  const showForm = adding || accounts.length === 0;
  const inputRef = useRef(null);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);
  const submit = (e) => {
    e.preventDefault();
    if (!parsed) { toast({ text: 'Format attendu : Pseudo#TAG (ex. Faker#KR1)', type: 'warn' }); return; }
    if (accounts.some((a) => riotKey(a.acc) === riotKey({ ...parsed, platform }))) {
      toast({ text: 'Ce compte est déjà lié à ce joueur.', type: 'warn' });
      return;
    }
    actions.addAccount(p.id, { ...parsed, platform });
    setText('');
    setAdding(false);
  };
  const loading = accounts.some((a) => a.status === 'loading');
  const total = ps ? unpack(ps.total) : null;
  const main = ps ? mainRole(ps) : null;
  const region = (pf) => (pf === DEFAULT_PLATFORM ? '' : ` · ${(PLATFORMS.find((x) => x[0] === pf) || [, pf])[1]}`);

  return html`<div class="riot-panel">
    ${accounts.length > 0 && html`<div class="riot-head">
      <span class="riot-title">${accounts.length > 1 ? `${accounts.length} comptes Riot` : 'Compte Riot'}</span>
      <div class="riot-actions">
        ${ps && html`<span class="muted tiny" title=${`Saison ${ps.season} · stats mises à jour ${timeAgo(ps.ts)}`}>${timeAgo(ps.ts)}</span>`}
        <button type="button" class=${cx('icon-btn icon-btn-sm', loading && 'is-spinning')} onClick=${onRefresh}
          disabled=${loading} title="Recharger les stats de tous ses comptes" aria-label="Recharger les stats">
          <${Icon} name="refresh" size=${14} />
        </button>
      </div>
    </div>`}

    ${accounts.length > 0 && html`<ul class="acc-list">
      ${accounts.map(({ acc, status, ps: aps, message, code }) => {
        const t = aps ? unpack(aps.total) : null;
        return html`<li key=${acc.id} class=${cx('acc', status === 'error' && 'is-error')}>
          <div class="acc-row">
            <a class="acc-id" href=${profileUrl(acc)} target="_blank" rel="noopener" title="Voir le profil sur DeepLoL">
              <b>${acc.name}</b><span class="muted">#${acc.tag}${region(acc.platform)}</span>
            </a>
            <span class="acc-stat">
              ${status === 'loading' && !t && html`<span class="muted">chargement…</span>`}
              ${status === 'error' && html`<span class="warn" title=${message}><${Icon} name="alert" size=${13} /> ${code === 'notfound' ? 'introuvable' : code === 'nodata' ? 'aucune partie' : 'erreur'}</span>`}
              ${t && status !== 'error' && html`<b>${t.games}</b> p. · <b class=${wrClass(t.wr)}>${pct(t.wr, 0)}</b>`}
            </span>
            <${ConfirmButton} class="icon-btn icon-btn-sm" onConfirm=${() => actions.removeAccount(p.id, acc.id)}
              confirmLabel=${html`<${Icon} name="check" size=${13} />`} title=${`Retirer le compte ${acc.name}#${acc.tag}`}>
              <${Icon} name="x" size=${13} />
            <//>
          </div>
          ${status === 'error' && html`<p class="riot-msg warn tiny">${message}
            ${code === 'nodata' && html` <a href=${profileUrl(acc)} target="_blank" rel="noopener">Ouvre le profil sur DeepLoL</a>, clique sur « Mettre à jour », puis recharge ici.`}</p>`}
        </li>`;
      })}
    </ul>`}

    ${showForm
      ? html`<form class="riot-form" onSubmit=${submit}>
          <label class="riot-input">
            <input ref=${inputRef} class="input input-sm" value=${text} placeholder=${accounts.length ? 'Autre compte : Pseudo#TAG' : 'Riot ID : Pseudo#TAG'} maxlength="24"
              spellcheck="false" autocomplete="off" aria-label=${`Ajouter un compte Riot à ${p.name}`}
              onInput=${(e) => setText(e.currentTarget.value)} onKeyDown=${(e) => { if (e.key === 'Escape') { setText(''); setAdding(false); } }} />
          </label>
          <select class="mini-select" value=${platform} onChange=${(e) => setPlatform(e.currentTarget.value)} aria-label="Région du compte">
            ${PLATFORMS.map(([v, label]) => html`<option value=${v}>${label}</option>`)}
          </select>
          <button type="submit" class="btn btn-ghost btn-sm" disabled=${!parsed}>Lier</button>
          ${accounts.length > 0 && html`<button type="button" class="icon-btn icon-btn-sm" onClick=${() => { setText(''); setAdding(false); }} aria-label="Annuler"><${Icon} name="x" size=${14} /></button>`}
        </form>`
      : html`<button type="button" class="link-btn acc-add" onClick=${() => setAdding(true)}><${Icon} name="plus" size=${13} /> Ajouter un compte (smurf…)</button>`}

    ${total && html`<div class="riot-sum">
      ${ps.accounts > 1 && html`<span class="riot-sum-label">Total des ${ps.accounts} comptes</span>`}
      <div class="riot-stats">
        <span class="rs"><b>${total.games}</b><small>parties</small></span>
        <span class="rs"><b class=${wrClass(total.wr)}>${pct(total.wr, 0)}</b><small>winrate</small></span>
        <span class="rs" title=${`${kdaTxt(total.k)} / ${kdaTxt(total.d)} / ${kdaTxt(total.a)} en moyenne`}><b>${kdaTxt(total.kda)}</b><small>KDA</small></span>
        <span class="rs"><b>${kdaTxt(total.cs)}</b><small>CS/min</small></span>
        ${main && html`<span class="rs"><b class="rs-role"><${RoleIcon} role=${main.role} size=${14} />${ROLE_LABEL[main.role]}</b><small>${pct(main.share, 0)} des parties</small></span>`}
      </div>
      <button type="button" class="btn btn-ghost btn-xs riot-import" onClick=${onImport} title="Ajouter ses champions les plus joués au pool (tous comptes confondus)">
        <${Icon} name="download" size=${13} /> Importer ses champions
      </button>
    </div>`}
  </div>`;
}

/** Ajout au pool des champions les plus joués (niveau proposé d'après les stats). */
function ImportModal({ player, ps, actions, onClose }) {
  const [minGames, setMinGames] = useState(5);
  if (!player || !ps) return null;
  const pool = player.pool || {};
  const shown = topChamps(ps, { minGames });
  const missing = shown.filter((x) => !pool[x.id]?.[x.role]);
  const add = (items) => {
    actions.importPool(player.id, items.map(({ id, role, tier }) => ({ id, role, tier })));
    toast({ text: `${plural(items.length, 'champion')} ajouté${items.length > 1 ? 's' : ''} au pool de ${player.name}`, type: 'ok' });
  };
  return html`<${Modal} open=${true} onClose=${onClose} title=${`Champions de ${player.name}`}
    subtitle=${`Parties classées de la saison${ps.accounts > 1 ? `, ${ps.accounts} comptes cumulés` : ''}. Le niveau proposé dépend du nombre de parties, du winrate et du KDA.`}
    footer=${html`
      <button type="button" class="btn btn-ghost" onClick=${onClose}>Fermer</button>
      <button type="button" class="btn btn-gold" disabled=${!missing.length} onClick=${() => add(missing)}>
        <${Icon} name="download" size=${15} /> Tout ajouter${missing.length ? ` (${missing.length})` : ''}
      </button>`}>
    <div class="import-tools">
      <span class="muted small">Au moins</span>
      <div class="seg seg-sm" role="group" aria-label="Nombre minimum de parties">
        ${[2, 5, 10, 20].map((n) => html`<button type="button" class=${cx(minGames === n && 'on')} onClick=${() => setMinGames(n)}>${n} parties</button>`)}
      </div>
    </div>
    ${shown.length === 0
      ? html`<p class="muted">Aucun champion avec autant de parties.</p>`
      : html`<ul class="import-list">
        ${shown.map((x) => {
          const inPool = pool[x.id]?.[x.role];
          return html`<li key=${x.id + x.role} class=${cx(inPool && 'is-in')}>
            <${ChampIcon} id=${x.id} size=${34} />
            <span class="il-name"><b>${champ(x.id).name}</b><span class="muted tiny"><${RoleIcon} role=${x.role} size=${12} /> ${ROLE_LABEL[x.role]}</span></span>
            <span class="il-stat">${x.st.games}<small> p.</small></span>
            <span class=${cx('il-stat', wrClass(x.st.wr))}>${pct(x.st.wr, 0)}</span>
            <span class="il-stat">${kdaTxt(x.st.kda)}<small> KDA</small></span>
            ${inPool
              ? html`<span class="il-in" title="Déjà dans le pool"><${TierPill} tier=${inPool} /><${Icon} name="check" size=${14} /></span>`
              : html`<button type="button" class="btn btn-ghost btn-xs" onClick=${() => add([x])} title=${`Ajouter en ${ROLE_LABEL[x.role]} · ${TIER_LETTER[x.tier]}`}>
                  <${TierPill} tier=${x.tier} /> Ajouter
                </button>`}
          </li>`;
        })}
      </ul>`}
  <//>`;
}
