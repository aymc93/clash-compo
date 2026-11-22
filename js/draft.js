// Tableau de draft : bans et picks des deux équipes + ajout rapide au clavier.
import { html, useEffect, useMemo, useState } from './vendor.js';
import { cx } from './util.js';
import { ROLES, ROLE_LABEL, champ, iconUrl, searchChamps } from './data.js';
import { pct, roleWinrate, wrClass } from './stats.js';
import { DRAFT_GROUPS, GROUP_LABEL, slotValues } from './actions.js';
import { ChampIcon, ConfirmButton, Icon, toast } from './ui.js';
import { DRAFT_STEPS, draftStep } from './insights.js';

/**
 * Colonne de draft : ajout rapide, puis « Nous » et « Eux » (bans en ligne, picks en liste).
 * props : draft, players (titulaires), actions, usedAll, owners(id), autoPlayer(id), openSlot(group, idx), quickRef, enemies
 */
export function DraftBoard({ draft = {}, players, actions, usedAll, owners, autoPlayer, openSlot, quickRef, enemies = [], suggest = {}, onRecord, canRecord }) {
  const side = draft.side === 'red' ? 'red' : 'blue';
  const enemySide = side === 'blue' ? 'red' : 'blue';
  const filled = (g) => slotValues(draft[g]).filter((v) => (g === 'ourPicks' ? v?.champ : v)).length;
  const total = DRAFT_GROUPS.reduce((n, g) => n + filled(g), 0);
  const step = draftStep(side, Object.fromEntries(DRAFT_GROUPS.map((g) => [g, filled(g)])));

  return html`<div class="draft">
    <div class="col-head">
      <h2>Draft</h2>
      <div class="col-head-tools">
        <div class="seg seg-sm seg-side" role="group" aria-label="Notre côté">
          <button type="button" class=${cx(side === 'blue' && 'on side-blue')} onClick=${() => side !== 'blue' && actions.setSide('blue')} title="On est côté bleu">Bleu</button>
          <button type="button" class=${cx(side === 'red' && 'on side-red')} onClick=${() => side !== 'red' && actions.setSide('red')} title="On est côté rouge">Rouge</button>
        </div>
        ${total > 0 && html`<${ConfirmButton} class="icon-btn icon-btn-sm" onConfirm=${actions.resetDraft} confirmLabel=${html`<${Icon} name="check" size=${14} />`} title="Vider la draft">
          <${Icon} name="refresh" size=${15} />
        <//>`}
      </div>
    </div>

    <${StepCard} step=${step} suggest=${suggest} actions=${actions} />

    <${QuickAdd} draft=${draft} actions=${actions} usedAll=${usedAll} owners=${owners} filled=${filled} inputRef=${quickRef} stepGroup=${step?.group} />

    <${Team} label="Nous" side=${side} ours bans=${slotValues(draft.ourBans)} picks=${slotValues(draft.ourPicks)}
      banGroup="ourBans" pickGroup="ourPicks" players=${players} actions=${actions} owners=${owners} autoPlayer=${autoPlayer} openSlot=${openSlot} />
    <${Team} label="Eux" side=${enemySide} bans=${slotValues(draft.enemyBans)} picks=${slotValues(draft.enemyPicks)}
      banGroup="enemyBans" pickGroup="enemyPicks" players=${players} actions=${actions} owners=${owners} openSlot=${openSlot} enemies=${enemies} />

    <div class="game-end">
      <span class="muted small">Fin de partie</span>
      <${ConfirmButton} class="btn btn-ghost btn-sm res-win" onConfirm=${() => onRecord(true)} confirmLabel="Noter la victoire ?"
        title=${canRecord ? 'Enregistre la compo jouée dans l’historique, puis vide la draft' : 'Il faut une compo pour noter le résultat'}>
        <${Icon} name="crown" size=${14} /> Victoire
      <//>
      <${ConfirmButton} class="btn btn-ghost btn-sm res-loss" onConfirm=${() => onRecord(false)} confirmLabel="Noter la défaite ?"
        title=${canRecord ? 'Enregistre la compo jouée dans l’historique, puis vide la draft' : 'Il faut une compo pour noter le résultat'}>
        Défaite
      <//>
    </div>
  </div>`;
}

/** Étape en cours de la draft (ordre officiel) + ce qu'on conseille de faire. */
function StepCard({ step, suggest, actions }) {
  if (!step) {
    return html`<div class="step-card is-done"><b>Draft terminée</b><span class="muted tiny">Bonne game ! Note le résultat en bas de la colonne.</span></div>`;
  }
  const ours = step.ours;
  const title = ours
    ? (step.kind === 'ban' ? 'À nous de bannir' : step.count > 1 ? `À nous : ${step.count} picks` : 'À nous de pick')
    : (step.kind === 'ban' ? 'Ban adverse' : step.count > 1 ? `L’adversaire pick (${step.count})` : 'L’adversaire pick');
  const s = ours ? (step.kind === 'ban' ? suggest.ban : suggest.pick) : null;
  return html`<div class=${cx('step-card', ours ? 'is-ours' : 'is-theirs')}>
    <div class="step-top">
      <span class="step-n">Étape ${step.index + 1}/${DRAFT_STEPS} · phase ${step.phase}</span>
      <div class="step-dots" aria-hidden="true">${Array.from({ length: DRAFT_STEPS }, (_, i) => html`<span class=${cx(i < step.index && 'done', i === step.index && 'now')}></span>`)}</div>
    </div>
    <b class="step-title">${title}</b>
    ${s
      ? html`<div class="step-sug">
          <${ChampIcon} id=${s.champ} size=${34} />
          <div class="step-sug-txt"><b>${champ(s.champ).name}</b><span class="muted tiny">${s.why}</span></div>
          <button type="button" class="btn btn-gold btn-xs" onClick=${() => s.act()}>${step.kind === 'ban' ? 'Bannir' : 'Verrouiller'}</button>
        </div>`
      : html`<span class="muted tiny">${ours ? 'Choisis dans la recherche ci-dessous.' : 'Entre son choix dans la recherche ci-dessous.'}</span>`}
  </div>`;
}

function Team({ label, side, ours, bans, picks, banGroup, pickGroup, players, actions, owners, autoPlayer, openSlot, enemies }) {
  return html`<section class=${cx('team', `side-${side}`, ours && 'is-ours')}>
    <header class="team-head"><span class="side-dot"></span><b>${label}</b></header>
    <div class="team-bans" aria-label=${`Bans ${label}`}>
      ${bans.map((id, i) => html`<${Slot} key=${i} kind="ban" id=${id} label=${`${GROUP_LABEL[banGroup]} ${i + 1}`}
        onOpen=${() => openSlot(banGroup, i)} onClear=${() => actions.setSlot(banGroup, i, null)} owners=${id ? owners(id) : ''} />`)}
    </div>
    <ol class="team-picks">
      ${picks.map((v, i) => (ours
        ? html`<${OurPick} key=${i} idx=${i} value=${v} players=${players} actions=${actions} autoPlayer=${autoPlayer} onOpen=${() => openSlot(pickGroup, i)} />`
        : html`<${EnemyPick} key=${i} idx=${i} id=${v} enemy=${enemies[i]} actions=${actions}
            onOpen=${() => openSlot(pickGroup, i)} owners=${v ? owners(v) : ''} />`))}
    </ol>
  </section>`;
}

function Slot({ kind, id, label, onOpen, onClear, owners }) {
  if (!id) {
    return html`<button type="button" class=${cx('slot', `slot-${kind}`, 'is-empty')} onClick=${onOpen} aria-label=${`Choisir : ${label}`} title=${label}>
      <${Icon} name="plus" size=${13} />
    </button>`;
  }
  const c = champ(id);
  return html`<div class=${cx('slot', `slot-${kind}`, 'is-filled')}>
    <button type="button" class="slot-img" onClick=${onOpen} title=${`${c.name}${owners ? ` — dans le pool de ${owners}` : ''} (cliquer pour changer)`}>
      <img key=${id} src=${iconUrl(id)} alt=${c.name} draggable="false" />
    </button>
    <button type="button" class="slot-clear" onClick=${onClear} aria-label=${`Retirer ${c.name}`}><${Icon} name="x" size=${11} stroke=${3} /></button>
    ${owners && html`<span class="slot-warn" title=${`Dans le pool de ${owners}`}></span>`}
  </div>`;
}

function EnemyPick({ idx, id, enemy, actions, onOpen, owners }) {
  const slot = html`<${Slot} kind="pick" id=${id} label=${`Pick adverse ${idx + 1}`} onOpen=${onOpen}
    onClear=${() => actions.setSlot('enemyPicks', idx, null)} owners=${owners} />`;
  if (!id) return html`<li class="pick-row is-empty">${slot}<button type="button" class="pick-ph" onClick=${onOpen}>Pick ${idx + 1}</button></li>`;
  const st = enemy?.stats;
  const wr = st?.status === 'ok' && enemy.role ? roleWinrate(st.data, enemy.role) : null;
  return html`<li class="pick-row">
    ${slot}
    <div class="pick-info">
      <b>${champ(id).name}</b>
      ${wr && html`<span class=${cx('wr-line', wrClass(wr.wr))}
        title=${`${champ(id).name} en ${ROLE_LABEL[enemy.role]} : ${pct(wr.wr)} de victoires sur ${wr.games.toLocaleString('fr-FR')} parties (U.GG)`}>${pct(wr.wr)} WR</span>`}
    </div>
    <select class="mini-select" value=${enemy?.auto ? '' : enemy?.role || ''} aria-label="Rôle du pick adverse"
      title="Rôle joué par ce pick adverse (auto = deviné)"
      onChange=${(e) => actions.setEnemyRole(idx, e.currentTarget.value || null)}>
      <option value="">${enemy?.auto && enemy.role ? `${ROLE_LABEL[enemy.role]} (auto)` : 'Auto'}</option>
      ${ROLES.map((r) => html`<option value=${r}>${ROLE_LABEL[r]}</option>`)}
    </select>
  </li>`;
}

function OurPick({ idx, value, players, actions, autoPlayer, onOpen }) {
  const id = value?.champ;
  const slot = html`<${Slot} kind="pick" id=${id} label=${`Notre pick ${idx + 1}`} onOpen=${onOpen} onClear=${() => actions.clearOurPick(idx)} />`;
  if (!id) return html`<li class="pick-row is-empty">${slot}<button type="button" class="pick-ph" onClick=${onOpen}>Pick ${idx + 1}</button></li>`;
  const auto = !value.player ? autoPlayer(id) : null;
  return html`<li class="pick-row">
    ${slot}
    <div class="pick-info"><b>${champ(id).name}</b></div>
    <select class="mini-select" value=${value.player || ''} aria-label="Joueur qui joue ce champion" title="Qui joue ce champion (auto = d’après la meilleure compo)"
      onChange=${(e) => actions.setOurPickPlayer(idx, e.currentTarget.value || null)}>
      <option value="">${auto ? `${auto.name} (auto)` : 'Auto'}</option>
      ${players.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
    </select>
  </li>`;
}

function QuickAdd({ draft, actions, usedAll, owners, filled, inputRef, stepGroup }) {
  const [target, setTarget] = useState(stepGroup || 'enemyBans');
  // La catégorie suit l'étape de la draft (on peut toujours la changer à la main).
  useEffect(() => { if (stepGroup) setTarget(stepGroup); }, [stepGroup]);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const results = useMemo(
    () => (query.trim() ? searchChamps(query).filter((c) => !usedAll.has(c.id)).slice(0, 7) : []),
    [query, usedAll],
  );

  const add = (c) => {
    const values = slotValues(draft[target]);
    const free = values.findIndex((v) => (target === 'ourPicks' ? !v?.champ : !v));
    if (free < 0) {
      toast({ text: `Les 5 emplacements « ${GROUP_LABEL[target]} » sont pleins.`, type: 'warn' });
      return;
    }
    if (target === 'ourPicks') actions.setOurPick(free, { champ: c.id, player: null });
    else actions.setSlot(target, free, c.id);
    setQuery('');
    setHi(0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[hi]) add(results[hi]); }
    else if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); }
    else if (e.key === 'Tab' && !e.shiftKey && query) {
      // Tab : passer à la catégorie suivante sans quitter le champ
      e.preventDefault();
      setTarget((t) => DRAFT_GROUPS[(DRAFT_GROUPS.indexOf(t) + 1) % DRAFT_GROUPS.length]);
    }
  };

  return html`<div class="quick">
    <div class="quick-search">
      <label class="search">
        <${Icon} name="search" size=${17} />
        <input ref=${inputRef} value=${query} placeholder=${`${GROUP_LABEL[target]} : tape un champion…`}
          title="Tape un nom puis Entrée. Raccourcis : / pour venir ici, Tab pour changer de catégorie."
          onInput=${(e) => { setQuery(e.currentTarget.value); setHi(0); }} onKeyDown=${onKeyDown}
          aria-label="Ajouter un champion à la draft" autocomplete="off" spellcheck="false" />
      </label>
      ${results.length > 0 && html`<ul class="suggest" role="listbox">
        ${results.map((c, i) => html`<li key=${c.id}>
          <button type="button" class=${cx('sug', i === hi && 'on')} onMouseDown=${(e) => { e.preventDefault(); add(c); }} onMouseEnter=${() => setHi(i)}>
            <img src=${iconUrl(c.id)} alt="" />
            <span class="sug-name">${c.name}</span>
            ${owners(c.id) && html`<span class="sug-owner">pool : ${owners(c.id)}</span>`}
            ${i === hi && html`<kbd>Entrée</kbd>`}
          </button>
        </li>`)}
      </ul>`}
    </div>
    <div class="seg seg-target" role="group" aria-label="Ajouter en tant que">
      ${DRAFT_GROUPS.map((g) => html`<button type="button" class=${cx(target === g && 'on', `g-${g}`)}
        onClick=${() => { setTarget(g); inputRef.current?.focus(); }}>
        ${GROUP_LABEL[g]}${filled(g) ? html` <span class="count">${filled(g)}</span>` : ''}
      </button>`)}
    </div>
  </div>`;
}
