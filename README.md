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
- **Nos picks** : verrouille un champion qu'on vient de prendre (bouton cadenas sur la compo, ou case « Picks » de *Nous*). Le joueur peut rester en *Auto* ou être choisi.
- **Compo recommandée** : la meilleure répartition joueur → poste → champion, avec sous chaque carte les **autres choix** du joueur à ce poste.
- **Toutes les options** : les meilleures compos avec des répartitions de rôles différentes (clique pour afficher en grand).
- **Priorités de pick** : ce qu'on perd si l'adversaire ban/prend tel champion → à pick en premier.
- **Compos enregistrées** : sauvegardez vos plans de jeu ; pendant la draft, une compo devient *Cassée* dès qu'un de ses champions est banni ou pris.

### Comment la note /100 est calculée
- **Confort** : somme des points des 5 picks (max 50).
- **Équilibre** (réglable dans ⚙ Réglages) : dégâts AD/AP (+2 si mixte, jusqu'à −5 si full AD/AP), frontline (−4 si aucune, +1,5 dès deux), engage (−3 si aucun, +1 dès deux).

Les rôles habituels et le profil (AD/AP, frontline, engage) de chaque champion sont dans [`js/data.js`](js/data.js) : modifiez-les si vous n'êtes pas d'accord. Un nouveau champion sorti après coup est déduit automatiquement de ses tags Riot.

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
js/store.js           synchro Firebase / mode local
js/actions.js         modifications + journal d'activité
js/app.js             application (en-tête, onglets, modales)
js/players.js · draft.js · comps.js · picker.js · ui.js   écrans et composants
```

---

*Clash Compo n'est pas approuvé par Riot Games et ne reflète pas les opinions de Riot Games ou de toute personne officiellement impliquée dans la production ou la gestion des propriétés de Riot Games. Riot Games et toutes les propriétés associées sont des marques commerciales ou des marques déposées de Riot Games, Inc.*
