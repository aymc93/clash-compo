// Résultats : compo recommandée, alternatives, priorités de pick, compos enregistrées.
import { html } from './vendor.js';
import { cx, signed } from './util.js';
import { ROLES, ROLE_LABEL, TIER_LETTER, champ, iconUrl, loadingUrl, splashUrl } from './data.js';
import { pct, roleWinrate, wrClass } from './stats.js';
import { alternatives, MAX_COMFORT, rating } from './optimizer.js';
import { ChampIcon, ConfirmButton, EditableText, Icon, RoleIcon, TierPill } from './ui.js';

const scoreClass = (r) => (r >= 88 ? 's-gold' : r >= 75 ? 's-green' : r >= 60 ? 's-blue' : 's-grey');

export function CompsView({ result, weight, selected, onSelect, lockedChamps, actions, priority, saved, onGoPlayers, playersCount, enemies = [], players = [], unavailable, muRaw }) {
  const comps = result.comps;
  const matchups = html`<${MatchupPanel} enemies=${enemies} players=${players} unavailable=${unavailable} muRaw=${muRaw} />`;
  if (!comps.length) {
    return html`<div class="comps-layout">
      <${EmptyComps} reason=${result.reason} onGoPlayers=${onGoPlayers} playersCount=${playersCount} />
      <aside class="comps-side">${matchups}<${SavedPanel} saved=${saved} actions=${actions} /></aside>
    </div>`;
  }
  const current = comps[Math.min(selected, comps.length - 1)];
  const rank = comps.indexOf(current);
  return html`<div class="comps-layout">
    <div class="comps-main">
      <${CompHero} comp=${current} rank=${rank} result=${result} weight=${weight} lockedChamps=${lockedChamps} actions=${actions} />
      ${comps.length > 1 && html`<section class="comp-list">
        <div class="section-title">
          <h3>Toutes les options</h3>
          <span class="muted small">Une ligne = une répartition des rôles différente. Clique pour l’afficher en grand.</span>
        </div>
        <div class="mini-grid">
          ${comps.map((c, i) => html`<${CompMini} key=${c.key} comp=${c} rank=${i} active=${c === current} best=${comps[0].score}
            weight=${weight} onClick=${() => onSelect(i)} />`)}
        </div>
      </section>`}
      ${result.truncated && html`<p class="hint">Beaucoup de possibilités : recherche limitée, les résultats sont très bons mais peut-être pas parfaits.</p>`}
    </div>
    <aside class="comps-side">
      ${matchups}
      <${PriorityPanel} items=${priority} weight=${weight} />
      <${SavedPanel} saved=${saved} actions=${actions} />
    </aside>
  </div>`;
}

function EmptyComps({ reason, onGoPlayers, playersCount }) {
  let title = 'Aucune compo possible';
  let text = '';
  if (!reason || reason.type === 'players') {
    title = playersCount === 0 ? 'Commencez par créer l’équipe' : 'Il manque des titulaires';
    text = playersCount === 0
      ? 'Ajoutez les joueurs (même les remplaçants), puis chacun renseigne ses champions et son niveau par rôle.'
      : `Il faut au moins 5 joueurs titulaires pour former une compo (actuellement ${reason?.count ?? playersCount}).`;
  } else if (reason.type === 'roles') {
    title = reason.allEmpty ? 'Les pools sont vides' : `Personne pour jouer ${reason.roles.map((r) => ROLE_LABEL[r]).join(', ')}`;
    text = reason.allEmpty
      ? 'Ajoutez des champions dans les pools des joueurs pour voir apparaître les compos.'
      : 'Avec les bans, picks et rôles imposés actuels, aucun titulaire n’a de champion disponible pour ce rôle. Ajoutez des champions dans les pools ou retirez une contrainte.';
  } else if (reason.type === 'conflict') {
    text = reason.locks
      ? 'Nos picks verrouillés ne permettent pas de remplir les 5 rôles avec des joueurs différents. Vérifie les joueurs assignés aux picks.'
      : 'Chaque joueur ne peut occuper qu’un rôle : ajoutez des champions/rôles aux pools pour compléter la compo.';
  }
  return html`<div class="comps-main"><section class="empty panel">
    <div class="empty-icon"><${Icon} name="sparkles" size=${28} /></div>
    <h2>${title}</h2>
    <p class="muted">${text}</p>
    <button type="button" class="btn btn-gold" onClick=${onGoPlayers}><${Icon} name="users" size=${17} /> Gérer les joueurs et les pools</button>
    <ol class="steps">
      <li><b>1.</b> Ajoutez les joueurs et leurs champions (onglet Joueurs).</li>
      <li><b>2.</b> Pendant la draft, entrez les bans et les picks adverses.</li>
      <li><b>3.</b> Les meilleures compos s’affichent ici, en direct pour tout le monde.</li>
    </ol>
  </section></div>`;
}

function CompHero({ comp, rank, result, weight, lockedChamps, actions }) {
  const r = rating(comp.score, weight);
  const bal = comp.balance;
  return html`<article class="hero panel">
    <header class="hero-head">
      <div class="hero-title">
        <span class="eyebrow">${rank === 0 ? html`<${Icon} name="crown" size=${14} /> Meilleure compo` : `Option n°${rank + 1}`}</span>
        <div class="hero-chips"><${BalanceChips} b=${bal} /></div>
      </div>
      <div class="hero-score" title="Note = confort des joueurs + équilibre de la compo">
        <div class=${cx('score', scoreClass(r))}><b>${r}</b><span>/100</span></div>
        <div class="score-break">
          <span>Confort <b>${comp.comfort}</b>/${MAX_COMFORT}</span>
          <span>Équilibre <b>${signed(bal.total * weight)}</b></span>
          ${comp.hasMatchups && html`<span>Matchups <b>${signed(comp.matchup)}</b></span>`}
        </div>
      </div>
    </header>
    <div class="hero-slots">
      ${comp.slots.map((s, ri) => html`<${SlotCard} key=${s.role + s.champ} slot=${s} alts=${alternatives(result, comp, ri)}
        locked=${lockedChamps.has(s.champ)} onToggleLock=${() => actions.toggleLock(s.champ, s.player.id)} />`)}
    </div>
    <footer class="hero-foot">
      <span class="muted small">
        ${comp.bench.length ? html`<${Icon} name="user" size=${14} /> Remplaçant${comp.bench.length > 1 ? 's' : ''} : <b>${comp.bench.map((p) => p.name).join(', ')}</b>` : html`<${Icon} name="info" size=${14} /> Les petites icônes = autres choix du joueur à ce poste.`}
      </span>
      <button type="button" class="btn btn-ghost btn-sm" onClick=${() => actions.saveComp(comp)}>
        <${Icon} name="bookmark" size=${15} /> Enregistrer cette compo
      </button>
    </footer>
  </article>`;
}

function SlotCard({ slot, alts, locked, onToggleLock }) {
  const c = champ(slot.champ);
  return html`<div class=${cx('slot-card', locked && 'is-locked')} style=${{ '--pc': slot.player.color }}>
    <div class="sc-art">
      <img key=${slot.champ} src=${loadingUrl(slot.champ)} alt="" loading="lazy" draggable="false"
        onError=${(e) => { e.currentTarget.src = splashUrl(slot.champ); }} />
      <div class="sc-top">
        <span class="sc-role"><${RoleIcon} role=${slot.role} size=${15} />${ROLE_LABEL[slot.role]}</span>
        <button type="button" class=${cx('sc-lock', locked && 'on')} onClick=${onToggleLock}
          title=${locked ? 'Pick verrouillé — cliquer pour le retirer' : 'On a pick ce champion : le verrouiller'}
          aria-label=${locked ? `Déverrouiller ${c.name}` : `Verrouiller ${c.name}`}>
          <${Icon} name=${locked ? 'lock' : 'unlock'} size=${14} />
        </button>
      </div>
      <div class="sc-bottom">
        ${slot.mu && html`<span class=${cx('sc-mu', wrClass(slot.mu.wr))}
          title=${`${c.name} contre ${champ(slot.mu.vs).name} : ${pct(slot.mu.wr)} de victoires (${slot.mu.games.toLocaleString('fr-FR')} parties)`}>
          <img src=${iconUrl(slot.mu.vs)} alt="" /> vs · ${pct(slot.mu.wr)}
        </span>`}
        <${TierPill} tier=${slot.tier} off=${slot.off} />
        <h3 class="sc-name">${c.name}</h3>
        <span class="sc-player"><span class="dot"></span>${slot.player.name}</span>
      </div>
    </div>
    <div class="sc-alts">
      ${alts.length
        ? alts.map((a) => html`<${ChampIcon} key=${a.champ} id=${a.champ} size=${28} tier=${a.tier}
            title=${`Sinon : ${champ(a.champ).name} (${TIER_LETTER[a.tier]})${a.mu ? ` — ${pct(a.mu.wr)} contre ${champ(a.mu.vs).name}` : ''}`} />`)
        : html`<span class="muted tiny">Pas d’autre choix</span>`}
    </div>
  </div>`;
}

function BalanceChips({ b }) {
  const total = b.ad + b.ap || 1;
  const adPct = Math.round((b.ad / total) * 100);
  const lopsided = Math.min(b.ad, b.ap) < 1;
  return html`
    <span class=${cx('chip-stat', lopsided && 'warn')} title="Répartition des dégâts physiques / magiques">
      <span class="dmg-bar"><span style=${{ width: `${adPct}%` }}></span></span>
      AD <b>${adPct}%</b> · AP <b>${100 - adPct}%</b>
    </span>
    <span class=${cx('chip-stat', b.front === 0 && 'warn')} title="Champions capables d’encaisser">
      <${Icon} name="shield" size=${14} /> ${b.front} frontline
    </span>
    <span class=${cx('chip-stat', b.engage === 0 && 'warn')} title="Champions capables de lancer les combats">
      <${Icon} name="bolt" size=${14} /> ${b.engage} engage
    </span>`;
}

function CompMini({ comp, rank, active, best, weight, onClick }) {
  const r = rating(comp.score, weight);
  const delta = rating(comp.score, weight) - rating(best, weight);
  return html`<button type="button" class=${cx('mini', active && 'is-active')} onClick=${onClick} aria-pressed=${active}>
    <div class="mini-head">
      <span class="mini-rank">#${rank + 1}</span>
      <span class=${cx('mini-score', scoreClass(r))}>${r}</span>
      ${rank > 0 && html`<span class="mini-delta">${delta === 0 ? '=' : signed(delta)}</span>`}
      ${comp.balance.warnings.length > 0 && html`<span class="mini-warn" title=${comp.balance.warnings.join(' · ')}><${Icon} name="alert" size=${13} /> ${comp.balance.warnings[0]}</span>`}
    </div>
    <div class="mini-slots">
      ${comp.slots.map((s) => html`<div class="mini-slot" key=${s.role}>
        <${ChampIcon} id=${s.champ} size=${42} tier=${s.off ? null : s.tier} />
        <span class="mini-player" style=${{ color: s.player.color }} title=${`${s.player.name} · ${ROLE_LABEL[s.role]}`}>${s.player.name}</span>
      </div>`)}
    </div>
  </button>`;
}

/** Pour chaque pick adverse : nos champions (pools des titulaires) classés par winrate contre lui. */
function MatchupPanel({ enemies, players, unavailable, muRaw }) {
  const list = enemies.filter((e) => e?.role);
  if (!list.length) return null;
  return html`<section class="panel side-panel">
    <div class="panel-head"><h3><${Icon} name="swords" size=${16} /> Matchups adverses</h3></div>
    <p class="muted small">Notre winrate contre chaque pick adverse, dans sa lane, avec les champions de nos pools.</p>
    ${list.map((e) => {
      const wr = e.stats.status === 'ok' ? roleWinrate(e.stats.data, e.role) : null;
      const rows = [];
      if (e.stats.status === 'ok') {
        const seen = new Map();
        for (const p of players) {
          for (const [id, roles] of Object.entries(p.pool || {})) {
            if (!roles?.[e.role] || unavailable?.has(id)) continue;
            const m = muRaw(id, e.role);
            if (!seen.has(id)) seen.set(id, { id, m, players: [] });
            seen.get(id).players.push(`${p.name} (${TIER_LETTER[roles[e.role]]})`);
          }
        }
        rows.push(...[...seen.values()].sort((a, b) => (b.m?.wrS ?? 0.5) - (a.m?.wrS ?? 0.5)).slice(0, 6));
      }
      return html`<div class="mu-block" key=${e.idx}>
        <div class="mu-enemy">
          <${ChampIcon} id=${e.champ} size=${34} />
          <div class="mu-enemy-txt">
            <b>${champ(e.champ).name}</b>
            <span class="muted tiny">${ROLE_LABEL[e.role]}${e.auto ? ' (auto)' : ''}${wr ? html` · <span class=${wrClass(wr.wr)}>${pct(wr.wr)}</span> de victoires` : ''}</span>
          </div>
        </div>
        ${e.stats.status === 'loading' && html`<p class="muted tiny">Chargement des stats…</p>`}
        ${e.stats.status === 'error' && html`<p class="muted tiny">Stats indisponibles pour ce champion.</p>`}
        ${e.stats.status === 'ok' && (rows.length
          ? html`<ul class="mu-list">${rows.map((r) => html`<li key=${r.id} title=${r.players.join(', ')}>
              <${ChampIcon} id=${r.id} size=${26} />
              <span class="mu-name">${champ(r.id).name}<small class="muted"> ${r.players.join(', ')}</small></span>
              ${r.m
                ? html`<span class=${cx('mu-wr', wrClass(r.m.wr))} title=${`${r.m.games.toLocaleString('fr-FR')} parties`}>${pct(r.m.wr)}<small> ${r.m.games < 100 ? `(${r.m.games})` : ''}</small></span>`
                : html`<span class="mu-wr muted" title="Pas assez de parties">—</span>`}
            </li>`)}</ul>`
          : html`<p class="muted tiny">Personne n’a de champion en ${ROLE_LABEL[e.role]} dans son pool.</p>`)}
      </div>`;
    })}
  </section>`;
}

function PriorityPanel({ items }) {
  const level = (it) => (it.points === Infinity || it.points >= 6 ? 'high' : it.points >= 3 ? 'mid' : 'low');
  const levelTxt = { high: 'À sécuriser', mid: 'Important', low: 'Remplaçable' };
  return html`<section class="panel side-panel">
    <div class="panel-head"><h3><${Icon} name="target" size=${16} /> Priorités de pick</h3></div>
    <p class="muted small">Ce que la meilleure compo perd si l’adversaire ban ou prend ce champion. Pick tôt ceux du haut.</p>
    ${items == null
      ? html`<div class="skeleton-list"><span></span><span></span><span></span></div>`
      : items.length === 0
        ? html`<p class="muted small">Tous les picks de la compo sont verrouillés.</p>`
        : html`<ol class="prio">
          ${items.map((it) => html`<li class=${cx('prio-item', `lv-${level(it)}`)} key=${it.champ}>
            <${ChampIcon} id=${it.champ} size=${38} />
            <div class="prio-txt">
              <b>${champ(it.champ).name}</b>
              <span class="muted tiny">${it.player.name} · ${ROLE_LABEL[it.role]}${it.replacement ? html` · sinon <b>${champ(it.replacement.champ).name}</b>` : ''}</span>
            </div>
            <div class="prio-right">
              <span class="prio-loss">${it.points === Infinity ? 'Critique' : it.points === 0 ? '±0' : `−${it.points}`}</span>
              <span class="prio-lv">${it.points === Infinity ? 'Plus de compo' : levelTxt[level(it)]}</span>
            </div>
          </li>`)}
        </ol>`}
  </section>`;
}

function SavedPanel({ saved, actions }) {
  return html`<section class="panel side-panel">
    <div class="panel-head"><h3><${Icon} name="bookmark" size=${16} /> Compos enregistrées</h3></div>
    ${saved.length === 0
      ? html`<p class="muted small">Enregistrez vos plans de jeu avant le Clash : pendant la draft, vous verrez tout de suite si un ban en casse un.</p>`
      : html`<ul class="saved">
        ${saved.map(({ id, item, ev }) => html`<li class=${cx('saved-item', !ev.ok && 'is-broken')} key=${id}>
          <div class="saved-head">
            <${EditableText} value=${item.name} onCommit=${(v) => actions.renameSaved(id, v)} class="saved-name" ariaLabel="Nom de la compo" />
            <span class=${cx('saved-status', ev.ok ? scoreClass(ev.rating) : 'ko')}>${ev.ok ? `${ev.rating}/100` : 'Cassée'}</span>
            <${ConfirmButton} class="icon-btn icon-btn-sm" onConfirm=${() => actions.removeSaved(id)} confirmLabel=${html`<${Icon} name="check" size=${14} />`} title="Supprimer">
              <${Icon} name="trash" size=${14} />
            <//>
          </div>
          <div class="saved-slots">
            ${ROLES.map((r) => {
              const s = item.slots?.[r];
              return s ? html`<${ChampIcon} key=${r} id=${s.champ} size=${32} banned=${ev.reasons.some((x) => x.startsWith(champ(s.champ).name + ' '))}
                title=${`${ROLE_LABEL[r]} : ${champ(s.champ).name} (${s.name || '?'})`} />` : null;
            })}
          </div>
          ${!ev.ok && html`<p class="saved-why"><${Icon} name="alert" size=${13} /> ${ev.reasons.join(' · ')}</p>`}
        </li>`)}
      </ul>`}
  </section>`;
}
