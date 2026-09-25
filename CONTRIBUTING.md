# Contribuer à Cockpit

Cockpit en est à la **version 1.1.0** : le MVP (jalons 0 à 6 de la [conception](docs/CONCEPTION.md)) et les étapes 1 à 4 de la V1.1 sont faits. La suite de la V1.1 est en cours.
Le détail de chaque point (règles, choix déjà faits) est au §7 de la conception ; cette page n'en garde que la liste.

Avant de coder : lire [CLAUDE.md](CLAUDE.md) (règles d'architecture, données personnelles, vérifications) et travailler sur une branche `jalon-N-…` ou `v1.1-…`, fusionnée dans `main` en avance rapide.

## V1.1 (en cours, une étape à la fois)

### Étape 1 : retours d'usage (branche `v1.1-retours`)

- [x] Les Propositions n'apparaissent plus sur le dashboard (« À venir », À surveiller) ni dans le calendrier (ni leurs dates, ni leurs encaissements ; leurs tâches restent).
- [x] **Idées** dans la fiche projet : notées pour plus tard, transformables en tâche.
- [x] **Flèches autour de la date** du dashboard pour voir les tâches d'hier, de demain ou de n'importe quel jour.
- [x] **Tâches des prochains jours** dans le bloc Prochains jours du dashboard.

### Étape 2 : retours d'usage, suite (branche `v1.1-taches`)

- [x] Corbeille et croix du panneau de tâche trop petites.
- [x] Sélectionner plusieurs tâches (Ctrl+clic, Maj+clic) et leur appliquer la même date, deadline ou priorité en une fois.
- [x] Catégories de tâches et sous-tâches (« Tâches admin » › « Faire la refonte graphique », « Ajout de graphiques »…).
- [x] Échéances : distinguer « à faire aujourd'hui » et « deadline qui approche ». Texte calculé partout (« Aujourd'hui », « Demain », « Dans 3 jours », « En retard de 2 jours », « Terminée ») avec sa couleur ; les deadlines proches visibles sur le dashboard sans entrer dans les tâches du jour ; une tâche avec une date de début et une deadline dessinée en barre dans le calendrier.

### Étape 3 : dates et deadlines (branche `v1.1-dates`)

- [x] Les deadlines se remarquent : un bloc **Deadlines** sur le dashboard (tout ce qui doit être fini d'ici 7 jours, projets et tâches, avec un compte à rebours coloré) et des deadlines colorées selon leur urgence dans le calendrier.
- [x] Un projet **À venir passe En cours** à sa date de début ; sur le dashboard, il suit le jour affiché (et redevient À venir si l'on revient avant).
- [x] Un **sélecteur de date maison** partout, qui comprend « auj. », « demain », « +3j », « lundi » ou « 25/10 » ; une icône calendrier à côté de la date du dashboard (touche `D`).
- [x] La **date de fin** d'une tâche ou d'un projet terminé est affichée, et effacée quand on les rouvre.
- [x] Calendrier : option « Tâches sans deadline » dans le filtre, désactivée par défaut.

### Étape 4 : glisser-déposer (branche `v1.1-glisser`)

- [x] Calendrier : prendre une tâche, un encaissement, un projet (début ou deadline) ou un événement et le déposer sur un autre jour pour changer sa date ; dans la grille horaire, un rendez-vous prend aussi l'heure du créneau. « Annuler » dans le toast.
- [x] Fiche projet : glisser une tâche dans les idées, et une idée dans les tâches.
- [x] Fiche projet : déposer une tâche sur une autre pour en faire une sous-tâche (et l'en sortir).
- [x] Réordonner les tâches au clavier (Alt+↑ / Alt+↓), et Alt+→ / Alt+← pour en faire une sous-tâche ou l'en sortir.

### Étapes suivantes

- [ ] **Planning** : une ligne par projet en cours ou à venir, avec une barre du début à la deadline, une ligne « aujourd'hui », des losanges pour les encaissements, une bande qui montre combien de projets se chevauchent chaque semaine, et un zoom mois ou trimestre. La page existe mais elle est vide.
- [ ] **Notifications Windows** : deadline à J-3 et le jour J, tâche prioritaire due demain, encaissement prévu demain ou en retard, début de projet, rendez-vous 15 minutes avant, résumé du matin. Chacune peut être désactivée.
- [ ] **Exports** : JSON (toutes les données) et CSV pour les finances, qui s'ouvre directement dans Excel. Les fichiers sont nommés `cockpit-export-…` (motif ignoré par Git).
- [ ] **Paramètres complets** : thème clair ou sombre forcé, premier jour de la semaine, et l'app qui se rouvre à la même taille et au même endroit.

## Petits défauts à reprendre (§7.3 de la conception)

- [x] Remplacer le sélecteur de date natif, gênant au clic, par un sélecteur maison qui comprend « auj. », « demain » ou « +3j » (étape 3).
- [ ] Supprimer avec Suppr aussi dans les panneaux latéraux et sur la fiche projet.
- [ ] Clients : archivage, total encaissé et montant à recevoir sur la fiche.
- [ ] Comptes : en créer, en renommer ou en archiver depuis l'interface.
- [ ] Fiche projet : afficher ses prochains événements.
- [x] Calendrier : un événement sur plusieurs jours en une seule barre continue.
- [ ] Une erreur dans une fenêtre (création, panneau de tâche) remplace toute l'app par l'écran d'erreur ; elle devrait rester dans la fenêtre.
- [ ] Vue mois : un mois chargé dépasse de quelques pixels en 1080p à 125 %.
- [ ] `Ctrl+N` à vérifier dans la vraie fenêtre (la touche `N` seule fonctionne).

## V2 : plus tard, seulement si l'usage le demande

- [ ] **Google Agenda dans le calendrier** : voir aussi ce qu'on a dans son agenda Google (cours, rendez-vous perso…), dans le calendrier et dans Prochains jours du dashboard. En lecture seule, en option, sans rien changer côté Google.
  - Piste la plus simple : l'« adresse secrète au format iCal » de l'agenda Google (Paramètres de l'agenda › Intégrer l'agenda). Pas de compte ni de connexion à gérer dans Cockpit.
  - L'adresse est un secret : gardée dans la base locale (table `settings`), jamais dans le dépôt ni dans les exports.
  - Téléchargée par Rust (l'interface ne fait aucun appel réseau, CSP stricte), au lancement puis toutes les 15 minutes environ ; sans connexion, la dernière copie reste affichée.
  - Ces événements restent à part : une couleur ou un filtre dédié, et ils ne se modifient pas dans Cockpit.
- [ ] Cockpit dans la zone de notification et lancé au démarrage de Windows.
- [ ] Raccourci global, même app fermée.
- [ ] Événements récurrents.
- [ ] Chiffre d'affaires par mois ou trimestre (pour l'URSSAF).
