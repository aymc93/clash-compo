# Clash Compo

Site pour préparer vos compos **Clash (League of Legends)** entre potes, **en direct** :

- chacun écrit son **pseudo** et renseigne ses champions, avec un **niveau par rôle** (S / A / B / C) — personne n'a de rôle attitré ;
- pendant la draft, vous entrez les **bans** et les **picks adverses** : les **meilleures compos possibles** (qui joue quoi, à quel poste) se recalculent instantanément ;
- tout le monde voit les modifications des autres en temps réel (présence en ligne + journal « qui a fait quoi ») ;
- images officielles des champions (Riot Data Dragon, liste toujours à jour, noms en français).

> Aucune installation, aucun build : c'est un site statique (HTML/CSS/JS) qu'on met sur GitHub Pages.

---

## 1. Activer le mode live (Firebase, gratuit, ~2 min)

Sans configuration, le site marche en **mode local** (tout reste dans ton navigateur). Pour éditer à plusieurs, il faut une petite base de données en ligne :

1. Va sur <https://console.firebase.google.com> → **Créer un projet** (nom au choix, tu peux désactiver Google Analytics).
2. Menu de gauche **Créer › Realtime Database** → **Créer une base de données** → emplacement **Belgique (europe-west1)** → **Démarrer en mode verrouillé** → Activer.
3. Onglet **Règles** : remplace tout par le contenu du fichier [`database.rules.json`](database.rules.json) → **Publier**.
4. Onglet **Données** : copie l'URL affichée en haut, du style
   `https://ton-projet-default-rtdb.europe-west1.firebasedatabase.app`
5. Colle-la dans [`config.js`](config.js) :

   ```js
   export const firebaseConfig = {
     databaseURL: 'https://ton-projet-default-rtdb.europe-west1.firebasedatabase.app',
   };
   ```

C'est tout : la pastille en haut à droite passe de **Local** à **En direct**.
L'URL n'est pas un secret, c'est normal qu'elle soit visible sur GitHub. Le plan gratuit de Firebase est largement suffisant.

## 2. Mettre en ligne sur GitHub Pages

1. Crée un dépôt sur GitHub (public — Pages sur un dépôt privé demande un compte payant).
2. Envoie tous les fichiers de ce dossier (bouton **Add file › Upload files**, ou `git push`).
3. Dans le dépôt : **Settings › Pages** → *Source* : **Deploy from a branch** → branche `main`, dossier `/ (root)` → **Save**.
4. Au bout d'une minute, le site est sur `https://<ton-pseudo>.github.io/<nom-du-depot>/`.

### Partager avec l'équipe

Ouvre le site et clique sur **Inviter** : ça copie le lien de votre équipe (`…?room=team-xxxxxxxx`). Envoie-le sur Discord.
Chaque pote l'ouvre, choisit « C'est moi » ou tape son pseudo, et voilà.

- Le code `room` dans le lien sert de mot de passe : ne le poste pas publiquement. Les règles Firebase empêchent de lister les équipes existantes.
- Vous pouvez avoir plusieurs équipes (une par lien).

## 3. Tester en local (optionnel)

Les navigateurs bloquent les modules JS ouverts en double-clic (`file://`). Lance un mini serveur dans ce dossier :

```powershell
python -m http.server 8080
```

puis ouvre <http://localhost:8080>. (Ou l'extension *Live Server* de VS Code.)

---

## Utilisation

### Onglet « Joueurs »
- **Ajouter un joueur** (remplaçants compris). L'interrupteur *Titulaire / Remplaçant* indique qui joue ce Clash : le moteur choisit les 5 meilleurs titulaires.
- Le **+** de chaque ligne (Top, Jungle, Mid, ADC, Support) ajoute des champions à ce rôle. Le niveau ajouté se choisit en haut du sélecteur.
- Clic sur un champion → niveau **par rôle** (ex. Sett top **S** et support **B**), ou retrait du pool.
- **Riot ID** (`Pseudo#TAG` + région) : on peut en lier **plusieurs par joueur** (main, smurfs, autre région) avec « Ajouter un compte », leurs stats sont **cumulées**. Les stats classées de la saison s'affichent sur la carte du joueur (parties, winrate, KDA, CS/min, rôle principal) et un petit badge donne son winrate sur chaque champion de son pool.
  **Importer ses champions** ajoute d'un coup ses champions les plus joués, au bon rôle, avec un niveau proposé d'après ses stats.
  On peut aussi taper directement `Pseudo#TAG` dans « Ajouter un joueur ».
  Source : DeepLoL (données publiques de leur site, pas une API officielle). Les stats sont enregistrées dans l'équipe et rechargées toutes les 6 h. Si un compte n'a « aucune partie », ouvre son profil DeepLoL (bouton lien), clique sur *Mettre à jour*, puis recharge.
- **Rôle imposé** : force un joueur sur un poste (« Lucas sera jungle quoi qu'il arrive »).
- La **couverture des rôles** montre d'un coup d'œil les trous (ex. personne au support).

| Niveau | Sens | Points |
|---|---|---|
| **S** | Main / OTP | 10 |
| **A** | Très à l'aise | 8 |
| **B** | Confort | 6 |
| **C** | Dépannage | 3 |

### Onglet « Draft & compos »
- **Ajout rapide** : choisis la catégorie (*Ban adverse*, *Notre ban*, *Pick adverse*, *Notre pick*), tape un nom puis **Entrée**.
  Raccourcis : `/` pour aller dans la recherche, flèches haut/bas, `Tab` pour changer de catégorie. Les surnoms marchent (`mf`, `tf`, `j4`, `k6`, `lb`, `ww`, `yi`…).
- Tu peux aussi cliquer sur une case vide. Les champions marqués d'un point doré sont dans vos pools.
- **Picks adverses** : sous chaque pick ennemi, choisis son **rôle** (sinon « Auto » le devine d'après où il est le plus joué) et vois son **winrate** à ce rôle.
  Le panneau **Matchups adverses** classe les champions de vos pools par winrate contre lui, et le moteur en tient compte : +0,5 pt par % au-dessus de 50 % (−0,5 en dessous, max ±4, lissé quand il y a peu de parties). Le badge « vs » sur chaque carte donne le winrate du matchup.
  Source : statistiques publiques de U.GG (ranked solo/duo, patch en cours). Rang, région et importance se règlent dans ⚙ Réglages. Ce n'est pas une API officielle : si U.GG change son format, les winrates disparaissent mais le reste du site continue de marcher.
- **Nos picks** : verrouille un champion qu'on vient de prendre (bouton cadenas sur la compo, ou case « Picks » de *Nous*). Le joueur peut rester en *Auto* ou être choisi.
- **Selon nos niveaux / Meilleures compos selon nos stats** : le second bouton recalcule les compos avec les vraies stats des joueurs (expérience, winrate lissé et KDA sur chaque champion, à chaque rôle), y compris des champions joués en classé mais absents du pool (« Ses stats »). Chaque carte affiche alors les parties, le winrate et le KDA du joueur sur ce champion.
- **Valider et garder cette compo** : garde la compo affichée dans *Compos enregistrées*, pour toute l'équipe (étiquette *Stats* si elle vient du mode stats).
- **Compo recommandée** : la meilleure répartition joueur → poste → champion, avec sous chaque carte les **autres choix** du joueur à ce poste.
- **Toutes les options** : les meilleures compos avec des répartitions de rôles différentes (clique pour afficher en grand).
- **Priorités de pick** : ce qu'on perd si l'adversaire ban/prend tel champion → à pick en premier.
- **Compos enregistrées** : sauvegardez vos plans de jeu ; pendant la draft, une compo devient *Cassée* dès qu'un de ses champions est banni ou pris.

### Comment la note /100 est calculée
- **Confort** : somme des points des 5 picks (max 50).
- **Équilibre** (réglable dans ⚙ Réglages) : dégâts AD/AP (+2 si mixte, jusqu'à −5 si full AD/AP), frontline (−4 si aucune, +1,5 dès deux), engage (−3 si aucun, +1 dès deux).

Les rôles habituels et le profil (AD/AP, frontline, engage) de chaque champion sont dans [`js/data.js`](js/data.js) : modifiez-les si vous n'êtes pas d'accord. Un nouveau champion sorti après coup est déduit automatiquement de ses tags Riot.

### Onglet « Adversaires »
- Colle les Riot ID de l'équipe adverse (visibles dans le lobby Clash), plusieurs d'un coup séparés par des virgules.
- Pour chacun : rang, rôle principal, parties / winrate / KDA, ses champions les plus joués et ses **one-tricks**, avec un bouton pour bannir.
- « À bannir en priorité » résume les plus grosses menaces. « Nouvel adversaire » vide la liste pour le match suivant.

### Bans conseillés et ordre de draft
- Onglet **Bans** du panneau de droite : les mains adverses + les champions qui contrent notre meilleure compo (winrates U.GG), avec la raison.
- En haut de la colonne Draft, l'**étape en cours** suit l'ordre officiel (B1, R1, B2… puis R1-R2, B2-B3…) : « À nous de bannir : Maître Yi » ou « À nous de pick : Annie » avec un bouton pour le faire. La recherche passe toute seule sur la bonne catégorie.

### Onglet « Historique »
- Sous la compo, **Victoire** / **Défaite** (double clic) enregistre la compo jouée et vide la draft.
- L'onglet affiche le winrate global, le bilan de chaque joueur (et de ses champions), le bilan des compos gardées et la liste des parties.

### Dispos, rang, champions à travailler, Discord
- Sur chaque carte joueur : **Dispo / ? / Absent** pour le prochain Clash (un absent n'est pas pris dans les compos) et la date du prochain Clash en haut de l'onglet Joueurs.
- Le **rang** (solo/duo, sinon flex) s'affiche sous le pseudo ; avec plusieurs comptes, le meilleur.
- **Champions à travailler** : repère les trous (rôle sans choix solide, manque d'engage, de frontline ou d'AP) et propose des champions au joueur concerné (ceux qu'il joue déjà en classé ou faciles à prendre en main) ; un clic l'ajoute à son pool en C.
- **Copier pour Discord** (sous la compo et sur chaque compo gardée) : la compo en texte, prête à coller.

### Analyse de draft, méta et votes
- Onglet **Analyse** (panneau de droite) : profil de notre compo et de la leur (early/late, engage, poke, assassins, AD/AP) et conseils de jeu (« ils sont full AD : armure », « vous êtes plus forts early : jouez les drakes »…), puis nos meilleurs matchups contre chaque pick adverse.
- Onglet **Priorités** : chaque pick est marqué **Blind sûr / possible / risqué** (nombre de vrais contres d'après U.GG) et **Flex** s'il se joue à plusieurs postes ; la liste des flex picks de l'équipe est en dessous.
- **Méta du patch** : les champions les plus forts du patch (U.GG, au moins 2 % de pick) entrent dans les bans conseillés et dans les idées de « Champions à travailler ».
- **Votes** 👍 / 👎 sur chaque compo proposée (un vote par joueur, visible par tous).
- **Plan de jeu** : une note libre sur chaque compo gardée (ajoutée au message Discord).

### Forme, tournoi, Discord, image
- Sur chaque carte joueur : la **courbe de LP** en solo/duo sur 30 jours (DeepLoL).
- Onglet Historique : **suivi du tournoi Clash** (rounds, adversaires, résultats) ; le résultat du round en cours se remplit tout seul avec Victoire/Défaite.
- ⚙ Réglages › **Discord** : colle un webhook de ton salon, les compos validées et les résultats y sont postés automatiquement.
- Bouton **Image** sous la compo : une image PNG (splash arts + joueurs), copiée dans le presse-papiers ou téléchargée.

### Équipe protégée par un code
⚙ Réglages › **Accès à l'équipe** : choisis un code (6 caractères min.). Les données sont alors déplacées à une adresse calculée à partir du code : le lien seul ne suffit plus, il faut aussi le code (demandé une fois par appareil). Le code peut être changé ou retiré au même endroit.

### Liaison avec le client LoL
[`companion/lcu_bridge.py`](companion/lcu_bridge.py) (Python 3, sans installation) lit la sélection des champions dans le client LoL du PC et remplit la draft du site en direct (côté, bans, picks, et le joueur de chaque pick s'il retrouve son Riot ID) :

```powershell
python lcu_bridge.py --room team-xxxxxxxx
```

Ajoute `--code TON_CODE` si l'équipe est protégée. Le programme ne fait que lire le client.

### Divers
- 🔔 **Activité** : historique des modifs de chacun (les changements de draft des autres s'affichent aussi en notification).
- ⚙ **Réglages** : poids de l'équilibre, nombre d'options, **export / import** JSON (sauvegarde de l'équipe).

---

## Structure

```
index.html            page + import map (Preact, htm)
config.js             URL Firebase (vide = mode local)
database.rules.json   règles à coller dans Firebase
css/styles.css        thème
js/main.js            démarrage (équipe, données, rendu)
js/data.js            champions (Data Dragon) + rôles/profils + recherche
js/optimizer.js       moteur de compos (recherche exhaustive avec élagage)
js/stats.js           winrates et matchups (U.GG)
js/playerstats.js     stats des joueurs par Riot ID (DeepLoL)
js/insights.js        ordre de draft, bans conseillés, historique, champions à travailler, Discord
js/scout.js · history.js   onglets Adversaires et Historique
js/share.js           image PNG de la compo
js/protect.js         équipe protégée par un code
companion/lcu_bridge.py    liaison avec le client LoL
js/store.js           synchro Firebase / mode local
js/actions.js         modifications + journal d'activité
js/app.js             application (en-tête, onglets, modales)
js/players.js · draft.js · comps.js · picker.js · ui.js   écrans et composants
```

---

*Clash Compo n'est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games ou de toute personne officiellement impliquée dans la production ou la gestion des propriétés de Riot Games. Riot Games et toutes les propriétés associées sont des marques commerciales ou des marques déposées de Riot Games, Inc.*
