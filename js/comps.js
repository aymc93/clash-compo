// Résultats : colonne centrale (compo recommandée + autres options) et panneau latéral
// (priorités de pick, matchups, compos gardées).
import { html, useEffect, useState } from './vendor.js';
import { cx, lsGet, lsSet, plural, signed } from './util.js';
import { ROLES, ROLE_LABEL, TIER_LETTER, champ, iconUrl, loadingUrl, splashUrl } from './data.js';
import { pct, roleWinrate, wrClass } from './stats.js';
import { alternatives, MAX_COMFORT, rating } from './optimizer.js';
import { ChampIcon, ConfirmButton, EditableText, Icon, Modal, RoleIcon, TierPill, toast } from './ui.js';
import { kdaTxt } from './playerstats.js';
import { SAFETY_LABEL, TIMING_LABEL, copyText, discordText, recordTxt } from './insights.js';
import { compImage, shareImage } from './share.js';
import { GameEnd } from './draft.js';

const scoreClass = (r) => (r >= 88 ? 's-gold' : r >= 75 ? 's-green' : r >= 60 ? 's-blue' : 's-grey');

const compSig = (slots) => ROLES.map((r) => `${slots[r]?.champ}:${slots[r]?.player}`).join('|');

/** Rend deux colonnes : la compo (centre) et le panneau latéral. */
export function CompsView({ result, weight, selected, onSelect, lockedChamps, actions, priority, saved, onGoPlayers, playersCount, enemies = [], players = [], unavailable, muRaw, mode = 'tiers', onMode, withStats = 0, bans = [], records = {}, teamName = 'Mon équipe', onRecord, plan = null, flex = [], safetyOf = () => null, votesOf = null }) {
  const comps = result.comps;
  const [showAll, setShowAll] = useState(false);
  const savedSigs = new Map(saved.map(({ item }) => [compSig(item.slots || {}), item.name]));
  const current = comps.length ? comps[Math.min(selected, comps.length - 1)] : null;
  const rank = current ? comps.indexOf(current) : -1;

  const center = html`<section class="col col-center" aria-label="Compos proposées">
    <div class="col-head">
      <h2>${rank > 0 ? `Option n°${rank + 1}` : 'Meilleure compo'}</h2>
      <${ModeSwitch} mode=${mode} onMode=${onMode} withStats=${withStats} total=${players.length} onGoPlayers=${onGoPlayers} />
    </div>
    ${current
      ? html`
        <${CompHero} comp=${current} rank=${rank} result=${result} weight=${weight} lockedChamps=${lockedChamps} actions=${actions} teamName=${teamName} onRecord=${onRecord} votes=${votesOf ? votesOf(current) : null}
          mode=${mode} savedName=${savedSigs.get(compSig(Object.fromEntries(current.slots.map((s) => [s.role, { champ: s.champ, player: s.player.id }]))))} />
        ${comps.length > 1 && html`<div class="options">
          <div class="options-head">
            <h3>Autres options</h3>
            <span class="muted tiny" title=${result.truncated ? 'Beaucoup de possibilités : recherche limitée, résultats très bons mais peut-être pas parfaits.' : ''}>une répartition des rôles chacune</span>
            <button type="button" class="link-btn options-more" onClick=${() => setShowAll(true)}>Voir les ${comps.length}</button>
          </div>
          <div class="options-list">
            ${comps.map((c, i) => html`<${CompMini} key=${c.key} comp=${c} rank=${i} active=${c === current} best=${comps[0].score}
              weight=${weight} onClick=${() => onSelect(i)} votes=${votesOf ? votesOf(c) : null} />`)}
          </div>
        </div>`}
        ${showAll && html`<${Modal} open=${true} onClose=${() => setShowAll(false)} title="Toutes les options" size="lg"
          subtitle="Une répartition des rôles par ligne. Clique sur une option pour l’afficher en grand.">
          <div class="options-all">
            ${comps.map((c, i) => html`<${CompMini} key=${c.key} comp=${c} rank=${i} active=${c === current} best=${comps[0].score}
              weight=${weight} onClick=${() => { onSelect(i); setShowAll(false); }} />`)}
          </div>
        <//>`}`
      : html`<${EmptyComps} reason=${result.reason} onGoPlayers=${onGoPlayers} playersCount=${playersCount} />`}
  </section>`;

  return [center, html`<${SidePanel} key="side" priority=${current ? priority : []} weight=${weight} saved=${saved} actions=${actions}
    enemies=${enemies} players=${players} unavailable=${unavailable} muRaw=${muRaw} hasComp=${!!current} bans=${bans} records=${records} teamName=${teamName}
    plan=${plan} flex=${flex} safetyOf=${safetyOf} />`];
}

/** Panneau latéral à onglets : une seule chose à la fois. */
function SidePanel({ priority, weight, saved, actions, enemies, players, unavailable, muRaw, hasComp, bans, records, teamName, plan, flex, safetyOf }) {
  const muCount = enemies.filter((e) => e?.role).length;
  const [tab, setTabRaw] = useState(() => lsGet('cc.sideTab', 'prio'));
  const setTab = (t) => { setTabRaw(t); lsSet('cc.sideTab', t); };
  const tabs = [
    ['bans', 'Bans', null, 'Bans conseillés : mains et one-tricks adverses (onglet Adversaires) et champions qui contrent notre meilleure compo.'],
    ['prio', 'Priorités', null, 'Ce que la meilleure compo perd si l’adversaire ban ou prend ce champion : pick tôt ceux du haut.'],
    ['mu', 'Analyse', muCount || null, 'Profil de leur compo et de la nôtre, plan de jeu, et nos meilleurs matchups contre chaque pick adverse.'],
    ['saved', 'Gardées', saved.length || null, 'Compos validées par l’équipe. Pendant la draft, une compo devient « cassée » si un de ses champions est banni ou pris.'],
  ];
  return html`<aside class="col col-side" aria-label="Infos de draft">
    <div class="seg seg-wide side-tabs" role="tablist">
      ${tabs.map(([id, label, n, tip]) => html`<button type="button" role="tab" aria-selected=${tab === id} class=${cx(tab === id && 'on')} title=${tip} onClick=${() => setTab(id)}>
        ${label}${n != null && html`<span class="tab-n">${n}</span>`}
      </button>`)}
    </div>
    <div class="side-body">
      ${tab === 'bans' && html`<${BanPanel} bans=${bans} actions=${actions} />`}
      ${tab === 'prio' && (hasComp
        ? html`<${PriorityPanel} items=${priority} weight=${weight} safetyOf=${safetyOf} flex=${flex} />`
        : html`<p class="side-empty muted small">Les priorités de pick apparaissent dès qu’une compo est possible.</p>`)}
      ${tab === 'mu' && html`<${AnalysisPanel} plan=${plan} />
        <${MatchupPanel} enemies=${enemies} players=${players} unavailable=${unavailable} muRaw=${muRaw} />`}
      ${tab === 'saved' && html`<${SavedPanel} saved=${saved} actions=${actions} records=${records} teamName=${teamName} />`}
    </div>
  </aside>`;
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
  return html`<section class="empty panel">
    <div class="empty-icon"><${Icon} name="sparkles" size=${28} /></div>
    <h2>${title}</h2>
    <p class="muted">${text}</p>
    <button type="button" class="btn btn-gold" onClick=${onGoPlayers}><${Icon} name="users" size=${17} /> Gérer les joueurs et les pools</button>
    <ol class="steps">
      <li><b>1.</b> Ajoutez les joueurs et leurs champions (onglet Joueurs).</li>
      <li><b>2.</b> Pendant la draft, entrez les bans et les picks adverses.</li>
      <li><b>3.</b> Les meilleures compos s’affichent ici, en direct pour tout le monde.</li>
    </ol>
  </section>`;
}

/** Choix du calcul : niveaux déclarés (S/A/B/C) ou vraies stats des joueurs (Riot ID). */
function ModeSwitch({ mode, onMode, withStats, total, onGoPlayers }) {
  const stats = mode === 'stats';
  return html`<div class="mode-switch">
    <div class="seg seg-sm" role="group" aria-label="Calcul des compos">
      <button type="button" class=${cx(!stats && 'on')} onClick=${() => stats && onMode('tiers')} aria-pressed=${!stats}
        title="Compos calculées avec les niveaux S / A / B / C renseignés dans les pools">
        <${Icon} name="sliders" size=${14} /> Nos niveaux
      </button>
      <button type="button" class=${cx(stats && 'on on-stats')} onClick=${() => !stats && onMode('stats')} aria-pressed=${stats}
        title=${`Meilleures compos selon nos stats classées de la saison (expérience, winrate et KDA de chacun, même hors pool) — ${withStats}/${total} joueurs avec un Riot ID`}>
        <${Icon} name="sparkles" size=${14} /> Nos stats
      </button>
    </div>
    ${stats && !withStats && html`<button type="button" class="link-btn warn-link" onClick=${onGoPlayers}><${Icon} name="alert" size=${13} /> Ajoutez vos Riot ID</button>`}
  </div>`;
}

function CompHero({ comp, rank, result, weight, lockedChamps, actions, mode, savedName, teamName, onRecord, votes }) {
  const r = rating(comp.score, weight);
  const bal = comp.balance;
  const stats = mode === 'stats';
  const share = async () => {
    const slots = Object.fromEntries(comp.slots.map((s) => [s.role, { champ: s.champ, name: s.player.name }]));
    const ok = await copyText(discordText({ title: `Compo Clash — ${teamName}`, rating: r, slots }));
    if (ok) toast({ text: 'Compo copiée : colle-la sur Discord (Ctrl+V).', type: 'ok' });
  };
  const [imgBusy, setImgBusy] = useState(false);
  const image = async () => {
    setImgBusy(true);
    try {
      const slots = Object.fromEntries(comp.slots.map((s) => [s.role, { champ: s.champ, name: s.player.name, color: s.player.color }]));
      const blob = await compImage({ slots, title: `Compo Clash — ${teamName}`, subtitle: bal.warnings.length ? '' : 'Compo équilibrée', rating: r });
      const how = await shareImage(blob, `compo-${teamName.replace(/\W+/g, '-').toLowerCase()}.png`);
      toast({ text: how === 'copied' ? 'Image copiée : colle-la sur Discord (Ctrl+V).' : 'Image téléchargée.', type: 'ok' });
    } catch {
      toast({ text: 'Impossible de créer l’image.', type: 'warn' });
    }
    setImgBusy(false);
  };
  const keep = () => {
    actions.saveComp(comp, mode, r);
    toast({ text: 'Compo validée : elle est gardée dans « Compos enregistrées » pour toute l’équipe.', type: 'ok' });
  };
  const scoreTip = [
    `${stats ? 'Performance' : 'Confort'} des joueurs : ${String(comp.comfort).replace('.', ',')} / ${MAX_COMFORT}`,
    `Équilibre de la compo : ${signed(bal.total * weight)}`,
    comp.hasMatchups ? `Matchups : ${signed(Math.round(comp.matchup))}` : null,
  ].filter(Boolean).join('\n');
  return html`<article class="hero">
    <header class="hero-head">
      <div class="hero-chips"><${BalanceChips} b=${bal} />
        ${comp.bench.length > 0 && html`<span class="chip-stat" title="Pas dans cette compo"><${Icon} name="user" size=${14} /> Remplaçant${comp.bench.length > 1 ? 's' : ''} : <b>${comp.bench.map((p) => p.name).join(', ')}</b></span>`}
      </div>
      <div class="hero-right">
        ${votes && html`<div class="votes" role="group" aria-label="Votes de l’équipe">
          <button type="button" class=${cx('vote', votes.mine > 0 && 'on up')} onClick=${() => actions.vote(votes.slots, votes.mine > 0 ? 0 : 1)} title="J’aime cette compo">👍 <b>${votes.up}</b></button>
          <button type="button" class=${cx('vote', votes.mine < 0 && 'on down')} onClick=${() => actions.vote(votes.slots, votes.mine < 0 ? 0 : -1)} title="Je n’aime pas cette compo">👎 <b>${votes.down}</b></button>
        </div>`}
        <div class=${cx('score', scoreClass(r))} title=${scoreTip}><b>${r}</b><span>/100</span></div>
      </div>
    </header>
    <div class="hero-slots">
      ${comp.slots.map((s, ri) => html`<${SlotCard} key=${s.role + s.champ} slot=${s} alts=${alternatives(result, comp, ri)} stats=${stats}
        locked=${lockedChamps.has(s.champ)} onToggleLock=${() => actions.toggleLock(s.champ, s.player.id)} />`)}
    </div>
    <footer class="hero-foot">
      <${GameEnd} onRecord=${onRecord} canRecord=${true} />
      <div class="hero-actions">
      <button type="button" class="btn btn-ghost" onClick=${share} title="Copier la compo en texte, prêt à coller sur Discord">
        <${Icon} name="link" size=${15} /> Texte
      </button>
      <button type="button" class="btn btn-ghost" onClick=${image} disabled=${imgBusy} title="Image de la compo (copiée, ou téléchargée)">
        <${Icon} name="download" size=${15} /> Image
      </button>
      ${savedName
        ? html`<span class="kept"><${Icon} name="check" size=${16} /> Compo gardée · <b>${savedName}</b></span>`
        : html`<button type="button" class="btn btn-gold" onClick=${keep} title="Garder cette compo dans « Compos enregistrées » (visible par toute l’équipe)">
            <${Icon} name="check" size=${16} /> Valider et garder
          </button>`}
      </div>
    </footer>
  </article>`;
}

function SlotCard({ slot, alts, locked, onToggleLock, stats }) {
  const c = champ(slot.champ);
  const pf = slot.perf;
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
        ${slot.fromStats
          ? html`<span class="tier-pill off stats" title="Pas dans son pool, mais il le joue en classé">Ses stats</span>`
          : html`<${TierPill} tier=${slot.tier} off=${slot.off} />`}
        <h3 class="sc-name">${c.name}</h3>
        <span class="sc-player"><span class="dot"></span>${slot.player.name}</span>
        ${stats && (pf
          ? html`<span class="sc-perf" title=${`${slot.player.name} sur ${c.name} en ${ROLE_LABEL[slot.role]} (classé, saison en cours) : ${plural(pf.games, 'partie')}, ${pct(pf.wr)} de victoires, KDA ${kdaTxt(pf.kda)} (${kdaTxt(pf.k)}/${kdaTxt(pf.d)}/${kdaTxt(pf.a)}), ${kdaTxt(pf.cs)} CS/min`}>
              <b>${pf.games}</b> p. · <b class=${wrClass(pf.wr)}>${pct(pf.wr, 0)}</b> · <b>${kdaTxt(pf.kda)}</b> KDA
            </span>`
          : html`<span class="sc-perf muted">Pas de partie classée</span>`)}
      </div>
    </div>
    <div class="sc-alts" title="Autres choix du joueur à ce poste">
      ${alts.length
        ? alts.map((a) => html`<${ChampIcon} key=${a.champ} id=${a.champ} size=${28} tier=${a.tier}
            title=${`Sinon : ${champ(a.champ).name} (${a.tier ? TIER_LETTER[a.tier] : 'hors pool'})${a.perf ? ` — ${plural(a.perf.games, 'partie')}, ${pct(a.perf.wr, 0)}` : ''}${a.mu ? ` — ${pct(a.mu.wr)} contre ${champ(a.mu.vs).name}` : ''}`} />`)
        : null}
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
      <b>${adPct}</b> AD · <b>${100 - adPct}</b> AP
    </span>
    <span class=${cx('chip-stat', b.front === 0 && 'warn')} title="Champions capables d’encaisser">
      <${Icon} name="shield" size=${14} /> ${b.front} frontline
    </span>
    <span class=${cx('chip-stat', b.engage === 0 && 'warn')} title="Champions capables de lancer les combats">
      <${Icon} name="bolt" size=${14} /> ${b.engage} engage
    </span>`;
}

function CompMini({ comp, rank, active, best, weight, onClick, votes }) {
  const r = rating(comp.score, weight);
  const delta = rating(comp.score, weight) - rating(best, weight);
  return html`<button type="button" class=${cx('mini', active && 'is-active')} onClick=${onClick} aria-pressed=${active}>
    <div class="mini-head">
      <span class="mini-rank">#${rank + 1}</span>
      <span class=${cx('mini-score', scoreClass(r))}>${r}</span>
      ${votes && votes.up - votes.down !== 0 && html`<span class=${cx('mini-votes', votes.up - votes.down > 0 ? 'pos' : 'neg')} title=${`${votes.up} 👍 · ${votes.down} 👎`}>${votes.up - votes.down > 0 ? '👍' : '👎'}${Math.abs(votes.up - votes.down)}</span>`}
      ${rank > 0 && html`<span class="mini-delta">${delta === 0 ? '=' : signed(delta)}</span>`}
    </div>
    <div class="mini-slots">
      ${comp.slots.map((s) => html`<div class="mini-slot" key=${s.role} title=${`${ROLE_LABEL[s.role]} : ${champ(s.champ).name} (${s.player.name})`}>
        <${ChampIcon} id=${s.champ} size=${34} tier=${s.off || !s.tier ? null : s.tier} title="" />
        <span class="mini-player" style=${{ color: s.player.color }}>${s.player.name}</span>
      </div>`)}
    </div>
    ${comp.balance.warnings.length > 0
      ? html`<span class="mini-warn" title=${comp.balance.warnings.join(' · ')}><${Icon} name="alert" size=${13} /></span>`
      : html`<span class="mini-warn"></span>`}
  </button>`;
}

/** Pour chaque pick adverse : nos champions (pools des titulaires) classés par winrate contre lui. */
function MatchupPanel({ enemies, players, unavailable, muRaw }) {
  const list = enemies.filter((e) => e?.role);
  if (!list.length) return html`<p class="side-empty muted small">Ajoute les picks adverses dans la draft : tu verras ici nos meilleurs champions contre chacun, dans sa lane.</p>`;
  return html`<div class="side-list">
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
  </div>`;
}

function PriorityPanel({ items, safetyOf = () => null, flex = [] }) {
  const level = (it) => (it.points === Infinity || it.points >= 6 ? 'high' : it.points >= 3 ? 'mid' : 'low');
  const levelTxt = { high: 'À sécuriser', mid: 'Important', low: 'Remplaçable' };
  return html`<div class="side-list">
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
              ${(() => {
                const sf = safetyOf(it.champ, it.role);
                const isFlex = flex.some((f) => f.champ === it.champ);
                return (sf || isFlex) && html`<span class="prio-tags">
                  ${sf && html`<span class=${cx('tag', `tag-${sf.level}`)} title=${sf.counters.length ? `Contres : ${sf.counters.map((c) => `${champ(c.opp).name} ${Math.round(c.wr * 100)} %`).join(', ')}` : 'Pas de vrai contre'}>${SAFETY_LABEL[sf.level]}</span>`}
                  ${isFlex && html`<span class="tag tag-flex" title="Jouable à plusieurs postes : le pick tôt cache nos rôles">Flex</span>`}
                </span>`;
              })()}
            </div>
            <div class="prio-right">
              <span class="prio-loss">${it.points === Infinity ? 'Critique' : it.points === 0 ? '±0' : `−${it.points}`}</span>
              <span class="prio-lv">${it.points === Infinity ? 'Plus de compo' : levelTxt[level(it)]}</span>
            </div>
          </li>`)}
        </ol>`}
    ${flex.length > 0 && html`<div class="flex-block">
      <h4 title="Champions que l’équipe peut jouer à plusieurs postes : les pick tôt cache nos rôles à l’adversaire.">Flex picks</h4>
      <div class="flex-list">
        ${flex.slice(0, 8).map((f) => html`<${ChampIcon} key=${f.champ} id=${f.champ} size=${32}
          title=${`${champ(f.champ).name} : ${f.roles.map((r) => ROLE_LABEL[r]).join(' / ')} (${f.who.join(', ')})`} />`)}
      </div>
    </div>`}
  </div>`;
}

/** Profil des deux compos et conseils de jeu. */
function AnalysisPanel({ plan }) {
  if (!plan || (!plan.us.n && !plan.them.n)) return null;
  const Row = ({ label, p, side }) => (p.n ? html`<div class=${cx('an-row', side)}>
    <b>${label}</b>
    <div class="an-chips">
      ${p.timing && html`<span class="chip-stat">${TIMING_LABEL[p.timing]}</span>`}
      ${p.styles.map((x) => html`<span class="chip-stat">${x}</span>`)}
      <span class="chip-stat">${Math.round(p.ad * 10) / 10} AD · ${Math.round(p.ap * 10) / 10} AP</span>
    </div>
  </div>` : null);
  return html`<div class="analysis">
    <${Row} label="Nous" p=${plan.us} side="us" />
    <${Row} label=${`Eux (${plan.them.n}/5)`} p=${plan.them} side="them" />
    ${plan.tips.length > 0 && html`<ul class="tips">${plan.tips.map((t) => html`<li>${t}</li>`)}</ul>`}
  </div>`;
}

/** Bans conseillés, avec la raison principale et un bouton pour bannir. */
function BanPanel({ bans, actions }) {
  if (!bans.length) {
    return html`<p class="side-empty muted small">Ajoute les Riot ID adverses dans l’onglet <b>Adversaires</b> : leurs mains apparaîtront ici. Les champions qui contrent notre meilleure compo s’affichent aussi dès que les stats sont chargées.</p>`;
  }
  const ban = (id) => {
    if (actions.banNext(id)) toast({ text: `${champ(id).name} ajouté à nos bans`, type: 'ok', champ: id });
    else toast({ text: 'Nos 5 bans sont déjà pris.', type: 'warn' });
  };
  return html`<ol class="bans">
    ${bans.map((b) => html`<li class="ban-item" key=${b.champ} title=${b.reasons.join('\n')}>
      <${ChampIcon} id=${b.champ} size=${36} />
      <div class="prio-txt">
        <b>${champ(b.champ).name}</b>
        <span class="muted tiny">${b.reasons[0]}${b.reasons.length > 1 ? ` (+${b.reasons.length - 1})` : ''}</span>
      </div>
      <button type="button" class="btn btn-ghost btn-xs" onClick=${() => ban(b.champ)}>Bannir</button>
    </li>`)}
  </ol>`;
}

function SavedPanel({ saved, actions, records = {}, teamName }) {
  return html`<div class="side-list">
    ${saved.length === 0
      ? html`<p class="side-empty muted small">Aucune compo gardée. Clique sur « Valider et garder » sous une compo : pendant la draft, tu verras tout de suite si un ban la casse.</p>`
      : html`<ul class="saved">
        ${saved.map(({ id, item, ev }) => html`<li class=${cx('saved-item', !ev.ok && 'is-broken')} key=${id}>
          <div class="saved-head">
            <${EditableText} value=${item.name} onCommit=${(v) => actions.renameSaved(id, v)} class="saved-name" ariaLabel="Nom de la compo" />
            ${item.mode === 'stats' && html`<span class="tag tag-stats" title="Proposée d’après les stats des joueurs">Stats</span>`}
            ${records[id] && html`<span class="tag tag-rec" title="Bilan en partie">${recordTxt(records[id])}</span>`}
            <span class=${cx('saved-status', ev.ok ? scoreClass(ev.rating) : 'ko')}>${ev.ok ? `${ev.rating}/100` : 'Cassée'}</span>
            <button type="button" class="icon-btn icon-btn-sm" title="Copier pour Discord" aria-label="Copier pour Discord"
              onClick=${async () => { if (await copyText(discordText({ title: `${item.name} — ${teamName}`, rating: ev.ok ? ev.rating : null, slots: item.slots || {}, note: item.note ? `📝 ${item.note}` : '' }))) toast({ text: 'Compo copiée pour Discord.', type: 'ok' }); }}>
              <${Icon} name="link" size=${13} />
            </button>
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
          <${NoteField} value=${item.note || ''} onCommit=${(v) => actions.setSavedNote(id, v)} />
        </li>`)}
      </ul>`}
  </div>`;
}

/** Plan de jeu d'une compo gardée (texte libre, partagé). */
function NoteField({ value, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  useEffect(() => { if (!editing) setText(value); }, [value, editing]);
  if (!editing) {
    return value
      ? html`<button type="button" class="note-view" onClick=${() => setEditing(true)} title="Modifier le plan de jeu">📝 ${value}</button>`
      : html`<button type="button" class="link-btn note-add" onClick=${() => setEditing(true)}>+ Plan de jeu</button>`;
  }
  const commit = () => { setEditing(false); if (text.trim() !== value) onCommit(text.trim()); };
  return html`<div class="note-edit">
    <textarea class="input note-input" rows="3" maxlength="400" value=${text} placeholder="Ex. : on joue autour du drake, Annie flash-ult sur leur ADC…"
      ref=${(el) => el && el !== document.activeElement && !el.dataset.f && (el.dataset.f = '1', el.focus())}
      onInput=${(e) => setText(e.currentTarget.value)}
      onBlur=${(e) => { if (!e.relatedTarget?.classList?.contains('note-ok')) commit(); }}
      onKeyDown=${(e) => { if (e.key === 'Escape') { setText(value); setEditing(false); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit(); }} />
    <button type="button" class="btn btn-ghost btn-xs note-ok" onClick=${commit}>OK</button>
  </div>`;
}
