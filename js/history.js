// Onglet « Historique » : parties jouées, bilan de l'équipe, des joueurs et des compos.
import { html } from './vendor.js';
import { cx, plural } from './util.js';
import { ROLES, ROLE_LABEL, champ } from './data.js';
import { compSignature, recordTxt } from './insights.js';
import { ChampIcon, ConfirmButton, Icon } from './ui.js';

const wr = (r) => (r.w + r.l ? Math.round((r.w / (r.w + r.l)) * 100) : 0);
const wrCls = (r) => { const x = wr(r); return x >= 60 ? 'wr-good' : x >= 50 ? 'wr-ok' : x >= 40 ? 'wr-meh' : 'wr-bad'; };
const dateTxt = (ts) => new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

/** games : [{ id, ...partie }] (récentes d'abord) ; stats : historyStats(games) ; players : tous les joueurs */
export function HistoryView({ games, stats, players, saved, actions, onGoDraft }) {
  const total = { w: stats.wins, l: stats.losses };
  const nameOf = (pid, fallback) => players.find((p) => p.id === pid)?.name || fallback || 'Ancien joueur';
  const colorOf = (pid) => players.find((p) => p.id === pid)?.color || 'var(--text-3)';
  const people = Object.entries(stats.byPlayer).sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l));
  const savedRecords = saved
    .map(({ id, item }) => ({ id, item, r: stats.bySig[compSignature(item.slots)] }))
    .filter((x) => x.r);

  if (!games.length) {
    return html`<div class="history-view">
      <div class="view-head"><div><h1>Historique</h1><p class="muted">Le bilan de vos parties de Clash.</p></div></div>
      <div class="scout-empty muted">
        <${Icon} name="crown" size=${28} />
        <p>Aucune partie notée. À la fin d’une partie, clique sur <b>Victoire</b> ou <b>Défaite</b> en bas de la colonne Draft : la compo jouée est enregistrée ici, avec le bilan de chaque joueur et de chaque compo.</p>
        <button type="button" class="btn btn-ghost btn-sm" onClick=${onGoDraft}><${Icon} name="swords" size=${15} /> Aller à la draft</button>
      </div>
    </div>`;
  }

  return html`<div class="history-view">
    <div class="view-head"><div><h1>Historique</h1><p class="muted">Le bilan de vos parties de Clash.</p></div></div>

    <section class="hist-summary">
      <div class="hist-total">
        <span class=${cx('hist-wr', wrCls(total))}>${wr(total)} %</span>
        <span class="muted">${plural(total.w + total.l, 'partie')} · <b class="wr-good">${total.w} V</b> · <b class="wr-bad">${total.l} D</b></span>
      </div>
      <div class="hist-players">
        ${people.map(([pid, r]) => {
          const roles = Object.entries(r.roles).sort((a, b) => b[1] - a[1]);
          const champs = Object.values(stats.byChamp).filter((c) => c.player === pid).sort((a, b) => (b.w + b.l) - (a.w + a.l) || b.w - a.w).slice(0, 4);
          return html`<div class="hist-player" key=${pid} style=${{ '--pc': colorOf(pid) }}>
            <div class="hp-head"><span class="dot"></span><b>${nameOf(pid, r.name)}</b><span class=${cx('hp-wr', wrCls(r))}>${wr(r)} %</span></div>
            <span class="muted tiny">${recordTxt(r)}${roles[0] ? ` · surtout ${ROLE_LABEL[roles[0][0]]}` : ''}</span>
            <div class="hp-champs">
              ${champs.map((c) => html`<${ChampIcon} key=${c.champ} id=${c.champ} size=${28} title=${`${champ(c.champ).name} : ${recordTxt(c)}`}>
                <span class=${cx('champ-wr', wrCls(c))}>${c.w}-${c.l}</span>
              <//>`)}
            </div>
          </div>`;
        })}
      </div>
    </section>

    ${savedRecords.length > 0 && html`<section class="hist-saved">
      <h3>Compos gardées jouées</h3>
      <div class="hist-saved-list">
        ${savedRecords.map(({ id, item, r }) => html`<div class="hist-saved-item" key=${id}>
          <b>${item.name}</b>
          <div class="saved-slots">${ROLES.map((role) => item.slots?.[role] && html`<${ChampIcon} key=${role} id=${item.slots[role].champ} size=${26} />`)}</div>
          <span class=${cx('hp-wr', wrCls(r))}>${recordTxt(r)}</span>
        </div>`)}
      </div>
    </section>`}

    <section class="hist-games">
      <h3>Parties</h3>
      <ul class="games">
        ${games.map((g) => html`<li class=${cx('game', g.win ? 'is-win' : 'is-loss')} key=${g.id}>
          <div class="game-res"><b>${g.win ? 'Victoire' : 'Défaite'}</b><span class="muted tiny">${dateTxt(g.ts)}${g.opponent ? ` · contre ${g.opponent}` : ''}</span></div>
          <div class="game-team">
            ${ROLES.map((role) => {
              const s = g.slots?.[role];
              return s ? html`<div class="game-slot" key=${role} title=${`${ROLE_LABEL[role]} : ${champ(s.champ).name} (${nameOf(s.player, s.name)})`}>
                <${ChampIcon} id=${s.champ} size=${34} title="" />
                <span class="tiny" style=${{ color: colorOf(s.player) }}>${nameOf(s.player, s.name)}</span>
              </div>` : null;
            })}
          </div>
          <span class="game-vs muted tiny">${(g.enemy || []).some(Boolean) ? 'vs' : ''}</span>
          <div class="game-enemy">
            ${(g.enemy || []).filter(Boolean).map((e, i) => html`<${ChampIcon} key=${i} id=${e.champ} size=${28} title=${`${champ(e.champ).name}${e.role ? ` (${ROLE_LABEL[e.role]})` : ''}`} />`)}
          </div>
          <${ConfirmButton} class="icon-btn icon-btn-sm" onConfirm=${() => actions.removeGame(g.id)} confirmLabel=${html`<${Icon} name="check" size=${13} />`} title="Supprimer cette partie">
            <${Icon} name="trash" size=${14} />
          <//>
        </li>`)}
      </ul>
    </section>
  </div>`;
}

