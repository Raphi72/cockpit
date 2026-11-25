# Contribuer à Cockpit

Cockpit en est à la **V1.1.2** : le MVP (jalons 0 à 6 de la [conception](docs/CONCEPTION.md)), la V1.1 (8 étapes) et la V1.1.2 (4 étapes) sont faits. La V2 est en conception (§9 de la conception).
Le détail de chaque point (règles, choix déjà faits) est au §7 de la conception ; cette page n'en garde que la liste.

Avant de coder : lire [CLAUDE.md](CLAUDE.md) (règles d'architecture, données personnelles, vérifications) et travailler sur une branche `jalon-N-…` ou `v1.1-…`, fusionnée dans `main` en avance rapide.

## V1.1 (terminée)

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

- [x] **Planning** (étape 5, branche `v1.1-planning`) : une ligne par projet en cours ou à venir, avec une barre du début à la deadline, une ligne « aujourd'hui », des losanges pour les encaissements, une bande qui montre combien de projets se chevauchent chaque semaine, et un zoom mois ou trimestre.
- [x] **Notifications Windows** (étape 6, branche `v1.1-notifications`) : deadline à J-3 et le jour J, tâche prioritaire due demain, encaissement prévu demain ou en retard, début de projet, rendez-vous 15 minutes avant, résumé du matin. Chacune peut être désactivée.
- [x] **Exports** (étape 7, branche `v1.1-exports`) : JSON (toutes les données) et CSV pour les finances (transactions, encaissements), qui s'ouvre directement dans Excel. Les fichiers sont nommés `cockpit-export-…` (motif ignoré par Git).
- [x] **Paramètres complets** (étape 7) : thème clair ou sombre forcé, premier jour de la semaine, et l'app qui se rouvre à la même taille et au même endroit.

## Petits défauts (étape 8, branche `v1.1-defauts`)

- [x] Remplacer le sélecteur de date natif, gênant au clic, par un sélecteur maison qui comprend « auj. », « demain » ou « +3j » (étape 3).
- [x] Supprimer avec Suppr aussi dans les panneaux latéraux et sur la fiche projet.
- [x] Clients : archivage, total encaissé et montant à recevoir sur la fiche.
- [x] Comptes : en créer, en renommer ou en archiver depuis l'interface.
- [x] Fiche projet : afficher ses prochains événements.
- [x] Calendrier : un événement sur plusieurs jours en une seule barre continue.
- [x] Une erreur dans une fenêtre (création, panneau de tâche) remplace toute l'app par l'écran d'erreur ; elle devrait rester dans la fenêtre.
- [x] Vue mois : un mois chargé dépasse de quelques pixels en 1080p à 125 %.
- [x] `Ctrl+N` à vérifier dans la vraie fenêtre (la touche `N` seule fonctionne) : il fonctionne, comme Ctrl+K et ?.

Restent à essayer à la main (§7.3) : les fenêtres natives de sauvegarde et de restauration, et les notifications dans l'app installée.

## V1.1.2 (terminée, branche `v1.1.2`)

- [x] **Terminer une tâche en douceur** : cocher une tâche la fait disparaître trop brusquement. À la place, une petite animation plus lente (la case se remplit, le titre se barre, puis la ligne s'efface). Et un toast en bas à droite, comme pour le reste : « Tâche terminée : Faire la refonte graphique », avec « Annuler ».
- [x] **Titre complet des tâches** : dans le panneau d'une tâche (ouvert depuis le calendrier ou ailleurs), un titre trop long est coupé. Il doit passer à la ligne pour se lire en entier. Même chose dans le panneau d'un événement.
- [x] **Deadlines du dashboard** :
  - Défaut : le bloc Deadlines reste calé sur aujourd'hui, sur 7 jours, même quand on affiche un autre jour. Exemple : le 26 septembre, une tâche due le 7 octobre n'apparaît pas quand on se met au 2 octobre. Le bloc doit suivre le jour affiché.
  - Paramètres : choisir combien de jours avant sa deadline une tâche ou un projet apparaît dans le bloc (7 jours aujourd'hui).
  - Couleurs : toujours celles de l'urgence (rouge, ambre, bleu), mais recalées sur ce nombre de jours, partout dans l'app (une même deadline a la même couleur dans le bloc et sur sa ligne). Plus la deadline approche, plus la tâche ou le projet tire vers le rouge et attire l'œil.
- [x] **Planning : « Je veux travailler… »** : l'app compose la liste des tâches à faire aujourd'hui.
  - Par durée (30 min, 2 h, plus ou moins) : des tâches dont l'estimation tient dans ce temps, **sans jamais le dépasser**. Pour 2 h avec deux tâches de 1 h 30, une seule des deux est proposée.
  - Par nombre (« 3 tâches ») : quand on ne sait pas quoi faire, l'app pioche dans les tâches à faire.
  - Une tâche choisie par le planning mais pas terminée revient, en fin de journée, là d'où elle venait (sa date d'avant).
  - Précisé en le faisant (conception, §7.3) : les retards et ce qui est dû aujourd'hui d'abord, puis ce qui est prévu, dû dans les 3 jours ou urgent, puis les tâches de priorité haute et les deadlines de la semaine ; en mode durée, les tâches sans estimation ne sont pas proposées (la fenêtre dit combien et permet de leur donner une durée sur place).

## V2 : tout dans Cockpit (en conception)

Le compagnon de tous les jours : travail, cours, sport et journée organisée, sur le PC et sur le téléphone Android. Détail complet au §9 de la [conception](docs/CONCEPTION.md) ; les étapes, dans l'ordre de leurs dépendances :

- [ ] **1. Toujours là** : démarrage avec Windows, zone de notification, raccourci global et boîte de réception, événements récurrents, chiffre d'affaires par mois et par trimestre (URSSAF), premières animations.
- [ ] **2. Modes et espace Cours** : modes Travail et Cours, matières, emploi du temps, devoirs, examens, notes et moyennes.
- [ ] **3. Organisateur de journée** : modules réutilisables (« Sport 3 h »), blocs glissés sur la journée, tâches dans les blocs, semaines types, remplir les trous, bloc en cours, bilan du soir.
- [ ] **4. Pages** (à la place de Notion) : éditeur en blocs, sous-pages, pages rattachées à un projet ou une matière, liens `[[…]]`, modèles, journal du jour, import Notion.
- [ ] **5. Révisions** : fiches, flashcards avec répétition espacée, révisions à rebours avant un examen.
- [ ] **6. Sport, habitudes et objectifs** : habitudes et séries, objectifs, carnet de séances, revue de la semaine.
- [ ] **7. Le compagnon** : écran du matin, mode focus, mini-fenêtre « En ce moment », célébrations, nouvelles notifications.
- [ ] **8. Google Agenda** : connexion Google, événements Google dans le calendrier et la journée (et, si retenu, les blocs envoyés dans Google).
- [ ] **9. Synchronisation** par Google Drive : fichiers de modifications chiffrés, jamais la base elle-même.
- [ ] **10. Application Android** : journée, capture, devoirs, habitudes, notifications et widget.

Avec ces étapes, **refonte visuelle, à faire ensemble** : mieux voir ce qu'on fait d'un coup d'œil, tout en restant sobre et professionnel. À travailler avec l'utilisateur, écran par écran, avec des maquettes validées avant de coder. Les principes du design system restent (peu d'informations à la fois, beaucoup d'espace, pas de cartes partout) : il s'agit de mieux hiérarchiser, pas de charger.

## V2.5 : partage de projets

- [ ] **Être plusieurs sur un projet** : partager un projet avec d'autres personnes, qui voient et gèrent avec soi ses tâches, son budget, ses encaissements et ses dates.
  - C'est un changement de nature : Cockpit est aujourd'hui local, hors ligne et sans compte. Partager demande des comptes, un serveur de synchronisation et la gestion des modifications faites en même temps.
  - Seuls les projets partagés quittent l'ordinateur ; le reste (finances perso, autres projets) reste local.
  - À préciser au moment de s'y mettre : les droits de chacun (lecture, modification), ce qu'on voit des finances d'un projet partagé, et le fonctionnement hors ligne.
