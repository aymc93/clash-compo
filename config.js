// ─────────────────────────────────────────────────────────────────────────────
//  Configuration de la synchro en direct (Firebase Realtime Database)
// ─────────────────────────────────────────────────────────────────────────────
//
//  • Laisse `databaseURL` vide  → mode LOCAL : tout est enregistré dans ton
//    navigateur, rien n'est partagé avec tes potes (pratique pour tester).
//
//  • Colle l'URL de ta Realtime Database → mode LIVE : tout le monde voit les
//    modifications des autres en temps réel.
//    Exemple : 'https://clash-compo-default-rtdb.europe-west1.firebasedatabase.app'
//
//  Voir le README pour créer la base en 2 minutes (gratuit).
//  L'URL n'est pas un secret : c'est normal qu'elle soit visible sur GitHub.

export const firebaseConfig = {
  databaseURL: 'https://clash-compo-default-rtdb.europe-west1.firebasedatabase.app',
};
