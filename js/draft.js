// Tableau de draft : bans et picks des deux équipes + ajout rapide au clavier.
import { html, useMemo, useState } from './vendor.js';
import { cx } from './util.js';
import { ROLES, ROLE_LABEL, champ, iconUrl, searchChamps } from './data.js';
import { pct, roleWinrate, wrClass } from './stats.js';
import { DRAFT_GROUPS, GROUP_LABEL, slotValues } from './actions.js';
import { ConfirmButton, Icon, toast } from './ui.js';

/**
 * props : draft, players (titulaires), actions, usedAll (Set des champions déjà dans la draft),
 *         owners(id) → noms des joueurs qui l'ont en pool, autoPlayer(id) → joueur proposé par la meilleure compo,
 *         openSlot(group, idx), quickRef
 */
export function DraftBoard({ draft = {}, players, actions, usedAll, owners, autoPlayer, openSlot, quickRef, enemies = [] }) {
  const side = draft.side === 'red' ? 'red' : 'blue';
  const enemySide = side === 'blue' ? 'red' : 'blue';
  const filled = (g) => slotValues(draft[g]).filter((v) => (g === 'ourPicks' ? v?.champ : v)).length;
  const total = DRAFT_GROUPS.reduce((n, g) => n + filled(g), 0);

  return html`<section class="draft panel">
    <div class="panel-head draft-head">
      <div>
        <h2><${Icon} name="swords" size=${18} /> Draft</h2>
        <p class="muted small">Entre les bans et les picks au fil de la draft : les compos se recalculent en direct, pour tout le monde.</p>
      </div>
      <div class="draft-tools">
        <div class="seg" role="group" aria-label="Notre côté">
          <button type="button" class=${cx(side === 'blue' && 'on side-blue')} onClick=${() => side !== 'blue' && actions.setSide('blue')}>Côté bleu</button>
          <button type="button" class=${cx(side === 'red' && 'on side-red')} onClick=${() => side !== 'red' && actions.setSide('red')}>Côté rouge</button>
        </div>
        <${ConfirmButton} class="btn btn-ghost btn-sm" onConfirm=${actions.resetDraft} confirmLabel="Tout effacer ?" title="Vider les bans et les picks">
          <${Icon} name="refresh" size=${15} /> Réinitialiser${total ? ` (${total})` : ''}
        <//>
      </div>
    </div>

    <${QuickAdd} draft=${draft} actions=${actions} usedAll=${usedAll} owners=${owners} filled=${filled} inputRef=${quickRef} />

    <div class="teams">
      <${TeamRow} label="Nous" side=${side} ours bans=${slotValues(draft.ourBans)} picks=${slotValues(draft.ourPicks)}
        banGroup="ourBans" pickGroup="ourPicks" players=${players} actions=${actions} owners=${owners} autoPlayer=${autoPlayer} openSlot=${openSlot} />
      <${TeamRow} label="Eux" side=${enemySide} bans=${slotValues(draft.enemyBans)} picks=${slotValues(draft.enemyPicks)}
        banGroup="enemyBans" pickGroup="enemyPicks" players=${players} actions=${actions} owners=${owners} openSlot=${openSlot}
        enemies=${enemies} />
    </div>
    ${enemies.some(Boolean) && html`<p class="muted tiny stats-credit">Winrates : U.GG, ranked solo/duo, patch en cours. Le rôle des picks adverses est deviné (« Auto ») tant que vous ne le précisez pas.</p>`}
  </section>`;
}

function TeamRow({ label, side, ours, bans, picks, banGroup, pickGroup, players, actions, owners, autoPlayer, openSlot, enemies }) {
  return html`<div class=${cx('team', `side-${side}`, ours && 'is-ours')}>
    <div class="team-label">
      <span class="side-dot"></span>
      <b>${label}</b>
      <span class="muted small">${side === 'blue' ? 'côté bleu' : 'côté rouge'}</span>
    </div>
    <div class="slot-group">
      <span class="slot-group-label">Bans</span>
      <div class="slots">
        ${bans.map((id, i) => html`<${Slot} key=${i} kind="ban" id=${id} label=${`${GROUP_LABEL[banGroup]} ${i + 1}`}
          onOpen=${() => openSlot(banGroup, i)} onClear=${() => actions.setSlot(banGroup, i, null)} owners=${id ? owners(id) : ''} />`)}
      </div>
    </div>
    <div class="slot-group">
      <span class="slot-group-label">Picks</span>
      <div class="slots">
        ${picks.map((v, i) => (ours
          ? html`<${OurPick} key=${i} idx=${i} value=${v} players=${players} actions=${actions} autoPlayer=${autoPlayer} onOpen=${() => openSlot(pickGroup, i)} />`
          : html`<${EnemyPick} key=${i} idx=${i} id=${v} enemy=${enemies[i]} actions=${actions}
              onOpen=${() => openSlot(pickGroup, i)} owners=${v ? owners(v) : ''} />`))}
      </div>
    </div>
  </div>`;
}

function Slot({ kind, id, label, onOpen, onClear, owners }) {
  if (!id) {
    return html`<button type="button" class=${cx('slot', `slot-${kind}`, 'is-empty')} onClick=${onOpen} aria-label=${`Choisir : ${label}`} title=${label}>
      <${Icon} name="plus" size=${14} />
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
  if (!id) return html`<div class="ourpick">${slot}</div>`;
  const st = enemy?.stats;
  const wr = st?.status === 'ok' && enemy.role ? roleWinrate(st.data, enemy.role) : null;
  return html`<div class="ourpick">
    ${slot}
    <select class="mini-select" value=${enemy?.auto ? '' : enemy?.role || ''} aria-label="Rôle du pick adverse"
      onChange=${(e) => actions.setEnemyRole(idx, e.currentTarget.value || null)}>
      <option value="">${enemy?.auto && enemy.role ? `Auto · ${ROLE_LABEL[enemy.role]}` : 'Auto'}</option>
      ${ROLES.map((r) => html`<option value=${r}>${ROLE_LABEL[r]}</option>`)}
    </select>
    ${st?.status === 'loading' && html`<span class="wr-line muted">…</span>`}
    ${st?.status === 'error' && html`<span class="wr-line muted" title="Stats indisponibles">—</span>`}
    ${st?.status === 'ok' && html`<span class=${cx('wr-line', wr && wrClass(wr.wr))}
      title=${wr ? `${champ(id).name} en ${ROLE_LABEL[enemy.role]} : ${pct(wr.wr)} de victoires sur ${wr.games.toLocaleString('fr-FR')} parties` : 'Presque jamais joué à ce rôle'}>
      ${wr ? pct(wr.wr) : 'rare'}
    </span>`}
  </div>`;
}

function OurPick({ idx, value, players, actions, autoPlayer, onOpen }) {
  const id = value?.champ;
  const auto = id && !value.player ? autoPlayer(id) : null;
  return html`<div class="ourpick">
    <${Slot} kind="pick" id=${id} label=${`Notre pick ${idx + 1}`} onOpen=${onOpen} onClear=${() => actions.clearOurPick(idx)} />
    ${id && html`<select class="mini-select" value=${value.player || ''} aria-label="Joueur qui joue ce champion"
      onChange=${(e) => actions.setOurPickPlayer(idx, e.currentTarget.value || null)}>
      <option value="">${auto ? `Auto · ${auto.name}` : 'Auto'}</option>
      ${players.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
    </select>`}
  </div>`;
}

function QuickAdd({ draft, actions, usedAll, owners, filled, inputRef }) {
  const [target, setTarget] = useState('enemyBans');
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
    <div class="seg seg-target" role="group" aria-label="Ajouter en tant que">
      ${DRAFT_GROUPS.map((g) => html`<button type="button" class=${cx(target === g && 'on', `g-${g}`)}
        onClick=${() => { setTarget(g); inputRef.current?.focus(); }}>
        ${GROUP_LABEL[g]} <span class="count">${filled(g)}/5</span>
      </button>`)}
    </div>
    <div class="quick-search">
      <label class="search">
        <${Icon} name="search" size=${17} />
        <input ref=${inputRef} value=${query} placeholder=${`${GROUP_LABEL[target]} : tape un champion puis Entrée  ( / pour focus )`}
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
  </div>`;
}
