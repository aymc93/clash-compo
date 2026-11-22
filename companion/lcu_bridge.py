#!/usr/bin/env python3
"""
Clash Compo — liaison avec le client League of Legends.

Lit la sélection des champions en direct (API locale du client LoL, sur ce PC uniquement)
et remplit la draft de votre équipe sur le site : côté, bans et picks des deux équipes.

Utilisation (Python 3.8+, aucune installation nécessaire) :
    python lcu_bridge.py --room team-xxxxxxxx
    python lcu_bridge.py --room team-xxxxxxxx --code VOTRE_CODE     (équipe protégée)

Options :
    --lockfile CHEMIN   fichier « lockfile » du client si LoL n'est pas installé au chemin par défaut
    --db URL            base Firebase (par défaut celle du site)
    --once              lit la sélection une seule fois puis s'arrête (pour tester)

Le programme ne fait que LIRE le client (aucune action en jeu) et écrire la draft de votre équipe.
Ctrl+C pour l'arrêter.
"""
import argparse
import base64
import hashlib
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

DEFAULT_DB = 'https://clash-compo-default-rtdb.europe-west1.firebasedatabase.app'
LOCKFILES = [
    r'C:\Riot Games\League of Legends\lockfile',
    r'D:\Riot Games\League of Legends\lockfile',
    r'C:\Program Files\Riot Games\League of Legends\lockfile',
    '/Applications/League of Legends.app/Contents/LoL/lockfile',
]


def http_json(url, method='GET', body=None, headers=None, insecure=False, timeout=8):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    if data is not None:
        req.add_header('Content-Type', 'application/json')
    ctx = None
    if insecure:  # certificat auto-signé du client LoL (connexion locale uniquement)
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


# ── Champions : clé numérique du client → identifiant du site (Data Dragon) ──
def champion_keys():
    version = http_json('https://ddragon.leagueoflegends.com/api/versions.json')[0]
    data = http_json(f'https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json')['data']
    return {int(c['key']): c['id'] for c in data.values()}


# ── Équipe sur le site ───────────────────────────────────────────────────────
def room_path(db, room, code):
    """Adresse des données de l'équipe (identique au site, y compris équipe protégée)."""
    if not code:
        return room
    digest = hashlib.sha256(f'clash-compo:{room}:{code.strip()}'.encode('utf-8')).hexdigest()
    path = f'{room}_k{digest[:24]}'
    if not http_json(f'{db}/rooms/{path}/state/meta/ok.json'):
        sys.exit('Code incorrect pour cette équipe.')
    return path


# ── Client LoL ───────────────────────────────────────────────────────────────
def read_lockfile(path_hint):
    paths = [path_hint] if path_hint else LOCKFILES
    for p in paths:
        if p and os.path.exists(p):
            with open(p, encoding='utf-8') as f:
                _, _, port, password, protocol = f.read().strip().split(':')
            return port, password, protocol
    return None


def lcu_get(lock, endpoint):
    port, password, protocol = lock
    token = base64.b64encode(f'riot:{password}'.encode()).decode()
    return http_json(f'{protocol}://127.0.0.1:{port}{endpoint}', headers={'Authorization': f'Basic {token}'}, insecure=True, timeout=4)


def norm(s):
    return ''.join(ch for ch in str(s or '').lower() if ch.isalnum())


def session_to_draft(session, keys, players, names):
    """Session de sélection (API du client) → draft du site."""
    my_team = session.get('myTeam') or []
    my_cells = {m.get('cellId') for m in my_team}
    side = 'red' if my_team and my_team[0].get('team') == 2 else 'blue'
    draft = {'side': side, 'ourBans': {}, 'enemyBans': {}, 'ourPicks': {}, 'enemyPicks': {}}
    counts = {k: 0 for k in draft if k != 'side'}

    def put(group, value):
        i = counts[group]
        if i < 5:
            draft[group][str(i)] = value
            counts[group] = i + 1

    for turn in session.get('actions') or []:
        for a in turn:
            if not a.get('completed') or not a.get('championId'):
                continue
            cid = keys.get(int(a['championId']))
            if not cid:
                continue
            ours = a.get('isAllyAction', a.get('actorCellId') in my_cells)
            if a.get('type') == 'ban':
                put('ourBans' if ours else 'enemyBans', cid)
            elif a.get('type') == 'pick':
                if ours:
                    player = names.get(a.get('actorCellId'))
                    put('ourPicks', {'champ': cid, 'player': player} if player else {'champ': cid})
                else:
                    put('enemyPicks', cid)
    # Groupes vides → None : la mise à jour efface les anciens champions (les rôles adverses choisis sur le site sont gardés).
    return {k: (v if v != {} else None) for k, v in draft.items()}


def match_players(lock, session, players):
    """Associe chaque joueur de notre équipe (cellId) à un joueur du site via son Riot ID."""
    by_name = {}
    for pid, p in (players or {}).items():
        accounts = list((p.get('accounts') or {}).values())
        if p.get('riot'):
            accounts.append(p['riot'])
        for a in accounts:
            if a.get('name'):
                by_name[norm(a['name'])] = pid
        if p.get('name'):
            by_name.setdefault(norm(p['name']), pid)
    out = {}
    for m in session.get('myTeam') or []:
        name = m.get('gameName')
        if not name and m.get('summonerId'):
            try:
                s = lcu_get(lock, f"/lol-summoner/v1/summoners/{m['summonerId']}")
                name = s.get('gameName') or s.get('displayName')
            except Exception:
                name = None
        pid = by_name.get(norm(name)) if name else None
        if pid:
            out[m.get('cellId')] = pid
    return out


def main():
    ap = argparse.ArgumentParser(description='Clash Compo : draft en direct depuis le client LoL.')
    ap.add_argument('--room', required=True, help='nom de l’équipe (dans le lien : ?room=…)')
    ap.add_argument('--code', default='', help='code de l’équipe si elle est protégée')
    ap.add_argument('--db', default=DEFAULT_DB)
    ap.add_argument('--lockfile', default='')
    ap.add_argument('--once', action='store_true')
    args = ap.parse_args()

    db = args.db.rstrip('/')
    path = room_path(db, args.room, args.code)
    print('Chargement des champions…')
    keys = champion_keys()
    print(f'Équipe : {args.room}. En attente du client LoL et de la sélection des champions (Ctrl+C pour quitter).')

    last = None
    names = {}
    session_id = None
    while True:
        try:
            lock = read_lockfile(args.lockfile)
            if not lock:
                time.sleep(3)
                continue
            try:
                session = lcu_get(lock, '/lol-champ-select/v1/session')
            except urllib.error.HTTPError:
                session = None  # pas en sélection des champions
            if session:
                if session.get('gameId') != session_id:
                    session_id = session.get('gameId')
                    players = http_json(f'{db}/rooms/{path}/state/players.json') or {}
                    names = match_players(lock, session, players)
                    print('Sélection des champions détectée : la draft du site suit en direct.')
                draft = session_to_draft(session, keys, None, names)
                if draft != last:
                    http_json(f'{db}/rooms/{path}/state/draft.json', 'PATCH', draft)
                    last = draft
                    n = sum(len(v or {}) for k, v in draft.items() if k != 'side')
                    print(f'  draft mise à jour ({n} champions, côté {draft["side"]})')
            if args.once:
                break
            time.sleep(1)
        except KeyboardInterrupt:
            print('\nArrêt.')
            break
        except Exception as e:  # réseau, client fermé… on réessaie
            print(f'  (erreur : {e} — nouvel essai)')
            time.sleep(3)


if __name__ == '__main__':
    main()
