// Onglet « Adversaires » : repérage de l'équipe adverse à partir de ses Riot ID.
import { html, useState } from './vendor.js';
import { cx, plural, timeAgo } from './util.js';
import { ROLE_LABEL, champ } from './data.js';
import { pct, wrClass } from './stats.js';
import { DEFAULT_PLATFORM, PLATFORMS, bestRank, kdaTxt, mainRole, parseRiotId, profileUrl, rankLabel, tierClass, unpack } from './playerstats.js';
import { scoutTop } from './insights.js';
import { ChampIcon, ConfirmButton, Icon, RoleIcon, toast } from './ui.js';

/**
 * scouts : [{ id, riot, ps, status: { status, message, code } }]
 * bans : bans conseillés (d'après le repérage seul)
 */
export function ScoutView({ scouts, team, actions, unavailable, bans, onRefresh }) {
  const [text, setText] = useState('');
  const [platform, setPlatform] = useState(DEFAULT_PLATFORM);
  const parts = text.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  const parsed = parts.map(parseRiotId);
  const valid = parsed.filter(Boolean);
  const submit = (e) => {
    e.preventDefault();
    if (!valid.length) { toast({ text: 'Format attendu : Pseudo#TAG (plusieurs possibles, séparés par des virgules).', type: 'warn' }); return; }
    const n = actions.addScouts(valid.map((r) => ({ ...r, platform })));
    if (!n) toast({ text: 'Ces joueurs sont déjà dans la liste.', type: 'warn' });
    if (valid.length < parts.length) toast({ text: `${parts.length - valid.length} pseudo(s) ignoré(s) : il manque le #TAG.`, type: 'warn' });
    setText('');
  };
  const ban = (id) => {
    if (actions.banNext(id)) toast({ text: `${champ(id).name} ajouté à nos bans`, type: 'ok', champ: id });
    else toast({ text: 'Nos 5 bans sont déjà pris.', type: 'warn' });
  };

  return html`<div class="scout-view">
    <div class="view-head">
      <div>
        <h1>Adversaires</h1>
        <p class="muted">Colle les Riot ID de l’équipe adverse (visibles dans le lobby Clash) pour voir leurs mains et quoi bannir.</p>
      </div>
      ${scouts.length > 0 && html`<div class="row-gap">
        <button type="button" class="btn btn-ghost btn-sm" onClick=${onRefresh}><${Icon} name="refresh" size=${15} /> Recharger</button>
        <${ConfirmButton} class="btn btn-ghost btn-sm danger" onConfirm=${actions.clearScouts} confirmLabel="Tout effacer ?" title="Vider le repérage (nouvel adversaire)">
          <${Icon} name="trash" size=${15} /> Nouvel adversaire
        <//>
      </div>`}
    </div>

    <form class="scout-form panel" onSubmit=${submit}>
      <input class="input" value=${team || ''} placeholder="Nom de l’équipe adverse" maxlength="32" aria-label="Nom de l’équipe adverse"
        onChange=${(e) => { const v = e.currentTarget.value.trim(); if (v !== (team || '')) actions.setScoutTeam(v); }} />
      <input class="input scout-ids" value=${text} placeholder="Pseudo#TAG, Pseudo#TAG, … (jusqu’à 5 d’un coup)" spellcheck="false" autocomplete="off"
        aria-label="Riot ID des adversaires" onInput=${(e) => setText(e.currentTarget.value)} />
      <select value=${platform} onChange=${(e) => setPlatform(e.currentTarget.value)} aria-label="Région">
        ${PLATFORMS.map(([v, label]) => html`<option value=${v}>${label}</option>`)}
      </select>
      <button type="submit" class="btn btn-gold" disabled=${!valid.length}><${Icon} name="plus" size=${16} /> Ajouter${valid.length > 1 ? ` (${valid.length})` : ''}</button>
    </form>

    ${bans.length > 0 && html`<section class="ban-strip">
      <h3><${Icon} name="ban" size=${16} /> À bannir en priorité</h3>
      <div class="ban-strip-list">
        ${bans.slice(0, 6).map((b) => html`<div class="ban-chip" key=${b.champ} title=${b.reasons.join('\n')}>
          <${ChampIcon} id=${b.champ} size=${36} />
          <div class="ban-chip-txt"><b>${champ(b.champ).name}</b><span class="muted tiny">${b.reasons[0]}</span></div>
          <button type="button" class="btn btn-ghost btn-xs" onClick=${() => ban(b.champ)}>Bannir</button>
        </div>`)}
      </div>
    </section>`}

    ${scouts.length === 0
      ? html`<div class="scout-empty muted">
          <${Icon} name="target" size=${28} />
          <p>Aucun adversaire pour l’instant. Ajoute leurs Riot ID ci-dessus : leurs champions les plus joués, leur rang et leurs one-tricks s’afficheront ici.</p>
        </div>`
      : html`<div class="scout-grid">
          ${scouts.map((s) => html`<${ScoutCard} key=${s.id} s=${s} actions=${actions} unavailable=${unavailable} onBan=${ban} />`)}
        </div>`}
  </div>`;
}

function ScoutCard({ s, actions, unavailable, onBan }) {
  const { riot, ps, status } = s;
  const total = ps ? unpack(ps.total) : null;
  const main = ps ? mainRole(ps) : null;
  const rank = ps ? bestRank(ps) : null;
  const top = ps ? scoutTop(ps, 6) : [];
  return html`<article class="scard">
    <header class="scard-head">
      <div class="scard-id">
        <a href=${profileUrl(riot)} target="_blank" rel="noopener" title="Profil DeepLoL"><b>${riot.name}</b><span class="muted">#${riot.tag}</span></a>
        ${rank && html`<span class=${cx('rank', tierClass(rank))}>${rankLabel(rank)}</span>`}
      </div>
      <${ConfirmButton} class="icon-btn icon-btn-sm" onConfirm=${() => actions.removeScout(s.id)} confirmLabel=${html`<${Icon} name="check" size=${13} />`} title="Retirer">
        <${Icon} name="x" size=${14} />
      <//>
    </header>
    ${status.status === 'loading' && !ps && html`<p class="muted small scard-msg">Chargement…</p>`}
    ${status.status === 'error' && html`<p class="riot-msg warn tiny scard-msg"><${Icon} name="alert" size=${13} /> ${status.message}</p>`}
    ${total && html`<div class="scard-stats">
      ${main && html`<span class="rs"><b class="rs-role"><${RoleIcon} role=${main.role} size=${14} />${ROLE_LABEL[main.role]}</b><small>${pct(main.share, 0)} des parties</small></span>`}
      <span class="rs"><b>${total.games}</b><small>parties</small></span>
      <span class="rs"><b class=${wrClass(total.wr)}>${pct(total.wr, 0)}</b><small>winrate</small></span>
      <span class="rs"><b>${kdaTxt(total.kda)}</b><small>KDA</small></span>
    </div>`}
    ${top.length > 0 && html`<ul class="scard-champs">
      ${top.map((x) => {
        const gone = unavailable.has(x.id);
        return html`<li key=${x.id} class=${cx(gone && 'is-gone')}>
          <${ChampIcon} id=${x.id} size=${32} banned=${gone} />
          <span class="sc-cname"><b>${champ(x.id).name}</b>
            ${x.oneTrick && html`<span class="tag tag-ot" title=${`${pct(x.share, 0)} de ses parties`}>One-trick</span>`}
            <small class="muted">${x.role ? ROLE_LABEL[x.role] : ''}</small>
          </span>
          <span class="sc-cstat">${x.st.games} p. · <b class=${wrClass(x.st.wr)}>${pct(x.st.wr, 0)}</b></span>
          ${gone
            ? html`<span class="muted tiny sc-gone">${'indispo'}</span>`
            : html`<button type="button" class="icon-btn icon-btn-sm sc-ban" onClick=${() => onBan(x.id)} title=${`Bannir ${champ(x.id).name}`} aria-label=${`Bannir ${champ(x.id).name}`}><${Icon} name="ban" size=${15} /></button>`}
        </li>`;
      })}
    </ul>`}
    ${ps && html`<footer class="scard-foot muted tiny">${plural(Object.keys(ps.champs || {}).length, 'champion')} joués cette saison · ${timeAgo(ps.ts)}</footer>`}
  </article>`;
}
