# Contribuer à Cockpit

Cockpit en est à la **version 1.0.0 (MVP)** : les jalons 0 à 6 de la [conception](docs/CONCEPTION.md) sont faits.
Le détail de chaque point (règles, choix déjà faits) est au §7 de la conception ; cette page n'en garde que la liste.

Avant de coder : lire [CLAUDE.md](CLAUDE.md) (règles d'architecture, données personnelles, vérifications) et travailler sur une branche `jalon-N-…` ou `v1.1-…`, fusionnée dans `main` en avance rapide.

## V1.1 (prochaine étape prévue)

- [ ] **Planning** : une ligne par projet en cours ou à venir, avec une barre du début à la deadline, une ligne « aujourd'hui », des losanges pour les encaissements, une bande qui montre combien de projets se chevauchent chaque semaine, et un zoom mois ou trimestre. La page existe mais elle est vide.
- [ ] **Notifications Windows** : deadline à J-3 et le jour J, tâche prioritaire due demain, encaissement prévu demain ou en retard, début de projet, rendez-vous 15 minutes avant, résumé du matin. Chacune peut être désactivée.
- [ ] **Exports** : JSON (toutes les données) et CSV pour les finances, qui s'ouvre directement dans Excel. Les fichiers sont nommés `cockpit-export-…` (motif ignoré par Git).
- [ ] **Paramètres complets** : thème clair ou sombre forcé, premier jour de la semaine, et l'app qui se rouvre à la même taille et au même endroit.

## Petits défauts à reprendre (§7.3 de la conception)

- [ ] Remplacer le sélecteur de date natif, gênant au clic, par un sélecteur maison qui comprend « auj. », « demain » ou « +3j ».
- [ ] Réordonner les tâches au clavier (Alt+↑ / Alt+↓).
- [ ] Supprimer avec Suppr aussi dans les panneaux latéraux et sur la fiche projet.
- [ ] Clients : archivage, total encaissé et montant à recevoir sur la fiche.
- [ ] Comptes : en créer, en renommer ou en archiver depuis l'interface.
- [ ] Fiche projet : afficher ses prochains événements.
- [ ] Calendrier : un événement sur plusieurs jours en une seule barre continue, et glisser pour le déplacer.
- [ ] Une erreur dans une fenêtre (création, panneau de tâche) remplace toute l'app par l'écran d'erreur ; elle devrait rester dans la fenêtre.
- [ ] Vue mois : un mois chargé dépasse de quelques pixels en 1080p à 125 %.
- [ ] `Ctrl+N` à vérifier dans la vraie fenêtre (la touche `N` seule fonctionne).

## Plus tard, seulement si l'usage le demande (V1.2 et après)

- [ ] Cockpit dans la zone de notification et lancé au démarrage de Windows.
- [ ] Raccourci global, même app fermée.
- [ ] Événements récurrents.
- [ ] Chiffre d'affaires par mois ou trimestre (pour l'URSSAF).
- [ ] Sous-tâches.
