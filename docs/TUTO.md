# Cockpit, le tuto

Cockpit rassemble ton travail de freelance et tes cours au même endroit : projets, tâches, journée,
calendrier, finances, devoirs, examens, pages de notes. Tout reste sur ton PC.

Ce tuto suit la version **2.2.0**. Il se lit dans l'ordre la première fois, puis sert d'aide-mémoire.

---

## 1. Installer et mettre à jour

1. Télécharge `Cockpit_<version>_x64-setup.exe` dans la [dernière version publiée](https://github.com/Raphi72/cockpit/releases/latest).
2. Si Cockpit tourne déjà, **quitte-le** : clic droit sur son icône près de l'horloge › **Quitter**. Fermer la
   fenêtre ne suffit pas, Cockpit reste dans la zone de notification.
3. Double-clique sur l'installateur. Windows peut prévenir que le fichier n'est pas signé : **Informations
   complémentaires** › **Exécuter quand même**.
4. Lance Cockpit depuis le menu Démarrer.

Une mise à jour garde toutes tes données. Avant de les adapter à la nouvelle version, Cockpit en fait une
sauvegarde.

## 2. Deux modes : Travail et Cours

En haut de la barre latérale, deux icônes : la mallette (**Travail**) et le chapeau (**Cours**). `Ctrl M`
passe de l'un à l'autre.

- **Travail** : projets, tâches, planning, finances, clients.
- **Cours** : devoirs, emploi du temps, examens, notes, matières.
- **Dans les deux** : Aujourd'hui, Journée, Pages, Habitudes, Calendrier, Paramètres.

Chaque mode montre les siens : une tâche de projet n'apparaît pas en Cours, un devoir n'apparaît pas en
Travail. La Journée et le Calendrier montrent tout, puisque c'est ton temps.

## 3. Créer quelque chose

- **Nouveau** (en haut à droite, ou la touche `C`) : le menu de ce qu'on peut créer dans le mode.
- `N` : une nouvelle tâche (un nouveau devoir en mode Cours).
- `Ctrl K` : la recherche. Elle trouve tout (projets, tâches, pages, clients…) et lance aussi des commandes.

Pour supprimer, pas de confirmation : un message propose **Annuler** (ou `Ctrl Z`) pendant quelques
secondes.

## 4. Aujourd'hui

C'est la page d'accueil de chaque mode : ce qui est à faire aujourd'hui, ce qui arrive bientôt et ce qui
mérite attention.

- **Travail** : tâches du jour, deadlines proches, encaissements en retard, prochains jours.
- **Cours** : cours du jour, devoirs à rendre, prochains cours et examens.

Le matin, un **écran du matin** résume ta journée en une phrase. Il se règle dans Paramètres.

## 5. La Journée : organiser ton temps

La Journée montre tes heures, de haut en bas. Tes **cours** et **rendez-vous** y sont déjà, teintés de leur
couleur. Un clic sur un cours ouvre sa fenêtre : sa matière, ses devoirs, « Ajouter un devoir ».

Tu y poses des **blocs** :

- **Modules** (à droite) : des blocs tout faits (Sport, Deep work, Devoirs…). Glisse-en un sur la journée,
  à l'heure voulue. « + Nouveau » en crée un.
- **Un clic sur une heure libre** pose un bloc à cette heure.
- **Déplacer** : glisse le bloc. **Allonger** : tire son bord du bas.
- **Supprimer** : prends le bloc et lâche-le dans la **corbeille** qui apparaît en bas de l'écran.
- Ce qui se chevauche se range côte à côte.

**À caser** (à droite) liste les tâches et devoirs du jour pas encore placés, puis, sous « Avant leur
échéance », ceux qui ont une deadline dans les deux semaines (un devoir pour lundi, un devis pour mardi) :
glisse-les **dans un bloc** du jour où tu veux les faire. Un devoir lié à un cours apparaît aussi dans ce
cours sur la journée, mais il faut quand même lui trouver du temps.

**À caser › Ajouter** crée un module **pour une fois** (« Courses · 1 h ») : il attend les jours suivants,
puis disparaît quand tu le poses. Changé d'avis ? Glisse un bloc de la journée sur **À caser** : il y revient,
avec sa durée.

En haut de la page :

- **Remplir les trous** propose des blocs dans tes heures libres.
- **Journal** ouvre la page du jour.
- **Semaines types** enregistre une semaine de blocs et la réapplique.
- **Jour / Semaine** change la vue.

Le soir, un **bilan** te demande ce qui a été fait.

## 6. Le mode focus

Bouton **Focus** en haut (ou la touche `F`), dans les deux modes.

1. Choisis une **durée** (15 à 90 min, « Autre », ou jusqu'à la fin du bloc en cours), ou un **Pomodoro**
   (travail, pause, nombre de tours).
2. Choisis ce que tu vas faire : les tâches et devoirs du jour sont proposés. **Ajouter une tâche** ouvre
   toutes tes tâches, rangées par projet, avec un filtre (sur la tâche ou le projet). Tu peux aussi écrire
   **« autre chose »**.
3. **Lancer** (`Ctrl Entrée`).

L'écran passe en mode nuit : un anneau lumineux se vide avec le temps, et ta liste est en bas à droite.
Quand elle dépasse cinq lignes, elle défile comme un générique de fin ; passe la souris dessus pour
l'arrêter. **Coche** au fur et à mesure : la tâche est vraiment terminée dans Cockpit.

- `Espace` : pause, ou reprise.
- `Échap` ou **■** : arrêter quand tu veux.
- Tout coché avant la fin : **fin en fête**, avec le temps gagné.
- Sinon, le temps va jusqu'au bout, puis un écran calme dit ce qui est fait et propose **+10 min**.

## 7. Travail : projets, tâches, finances

- **Projets** : statut, client, budget, échéancier des paiements, tâches et sous-tâches, idées.
- **Tâches** : en liste ou en kanban. Pour **renommer** une tâche sans l'ouvrir, clique sur le crayon au
  survol, ou utilise `F2`. « Je veux travailler… » compose un programme pour une durée donnée.
- **Planning** : est-ce que tu auras le temps ? En haut, pour chaque semaine, **À faire** (le travail de tes
  tâches, réparti jusqu'à leur deadline ou celle du projet ; 30 min pour une tâche sans durée) et **Posé dans la
  Journée** (tes blocs de travail). La semaine passe en **ambre** quand le temps posé ne suffit pas ; un clic
  l'ouvre dans la Journée pour y poser des blocs. Sous chaque projet, ses heures de la semaine. Une tâche sans
  deadline (ni celle de son projet) ne compte pas : donne une deadline au projet, ses tâches s'y répartissent.
- **Finances** : comptes, encaissements attendus et reçus, transactions.
- **Couleurs** : chaque projet, client ou matière peut avoir la couleur de ton choix (la palette, ou
  « Autre couleur »).

## 8. Cours : Google Agenda, devoirs, examens

### Relier Google Agenda (une fois)

Paramètres › **Google Agenda**. Le pas-à-pas est dans [google-cloud.md](google-cloud.md). Ton emploi du
temps de l'intranet, abonné dans Google par un lien iCal, est **reconnu tout seul** comme agenda des cours
(sinon : bouton « Agenda des cours » à côté de son nom). Cockpit relit Google toutes les 15 minutes, en
lecture seule : il ne modifie jamais ton agenda.

L'appli est en mode « Test » chez Google : environ une fois par semaine, Cockpit te demandera de te
reconnecter. Un clic sur « Se connecter à Google » suffit.

### Ce que ça donne

- **Emploi du temps** : ta vraie semaine de cours (semaine précédente / suivante).
- **Matières** : créées toutes seules à partir des noms de cours. La page **Matières** permet de les
  renommer, de changer leur couleur ou de les supprimer. Un cours qui n'en est pas un (une réunion
  d'école…) : ouvre-le › **Ce n'est pas un cours**.

### Devoirs

**Nouveau › Nouveau devoir**, ou **Ajouter un devoir** depuis un cours (dans la Journée, Aujourd'hui ou
l'Emploi du temps). Depuis un cours, le devoir est **pour ce cours** ; « Au cours suivant » le décale d'un
clic. Sinon, choisis **pour quel cours** il est à rendre, parmi les séances des 4 prochaines semaines. Le jour de rendu suit le cours, même s'il change de
date dans Google. « Sans cours précis » revient à une matière et une date.

### Examens et notes

**Nouvel examen** › **Séance** : choisis la séance dans ton emploi du temps (celles de type « Examen » sont
marquées) ; matière, jour, horaire et salle se remplissent. Cockpit propose ensuite des **révisions à
rebours** (J-7, J-3, J-1). Le jour passé, la **note** s'ajoute dans l'examen ; la page **Notes** calcule tes
moyennes.

## 9. Pages : tes notes

Des pages comme dans Notion, en arborescence, avec des favoris.

- Écris librement. Pour ajouter un bloc (titre, liste, case à cocher, image…), utilise le **+** qui apparaît
  à gauche d'une ligne au survol, ou tape `/`.
- La poignée **⠿** déplace un bloc (glisser) ou ouvre ses actions (clic).
- `[[` crée un lien vers une autre page.
- **Clic droit sur une ligne** › **En faire** : une tâche, un devoir, un événement, une idée de projet ou un
  projet. C'est ce qui remplace l'ancienne boîte de réception : note d'abord, range ensuite.
- **Journal** : une page par jour, ouverte depuis la Journée.

## 10. Habitudes et objectifs

La page **Habitudes** : coche tes habitudes du jour et suis tes séries, fixe des objectifs en étapes, tiens
un carnet de séances (sport…), et relis ta **revue de la semaine**. Un bloc d'un module lié à une habitude
la coche tout seul quand il est fait.

## 11. Tes données

- Tout est sur ton PC, dans `%APPDATA%\com.cockpit.desktop\`.
- **Sauvegarde automatique** chaque jour, et avant chaque mise à jour. Paramètres › **Données** : sauvegarder
  maintenant, restaurer, choisir le dossier des sauvegardes (OneDrive, clé USB…), exporter en JSON ou en CSV
  (Excel).
- Les identifiants Google sont rangés dans le Gestionnaire d'identification de Windows, jamais dans la base.

## 12. Sur ton téléphone

L'appli Android reprend les pages du PC, mises sur une colonne. En haut, **Travail / Cours** (comme
`Ctrl M` sur le PC), puis trois boutons : le **focus**, les **habitudes** et les **réglages**. En bas, les
onglets suivent le mode :

- **Travail** : **Aujourd'hui** (le même tableau de bord que sur le PC : bloc en cours, tâches du jour,
  deadlines, à surveiller, prochains jours, projets en cours), **Tâches**, **Projets**, **Agenda**, **Pages**.
- **Cours** : **Aujourd'hui** (cours du jour, devoirs, prochain examen), **Devoirs**, **Examens**,
  **Agenda**, **Pages**.

Tu y fais comme sur le PC : cocher, ajouter une tâche ou un devoir, toucher une tâche pour ouvrir sa fiche
(dates, projet, notes, sous-tâches), créer un projet ou un événement. L'**Agenda** montre la semaine en
haut, puis le jour choisi : échéances, blocs (à marquer faits), cours, rendez-vous et événements Google.
Dans un projet, un **appui long** sur une tâche la déplace (glisser le doigt fait défiler). Pendant un
**focus**, l'écran reste allumé. L'**argent** reste sur le PC : le téléphone montre seulement les paiements
en retard, dans « À surveiller ».

Elle partage tes données avec le PC par la **synchronisation**, qui passe par un dossier caché et chiffré de
ton Google Drive.

1. **Installer l'appli** (avec Claude) : le téléphone branché en USB, débogage USB activé
   ([android.md](android.md)). Elle n'est pas sur le Play Store : les mises à jour viennent de ton PC.
2. **Sur le PC, une fois** : Paramètres › **Synchronisation** › **Activer ici**. Cockpit affiche un **code** :
   note-le en lieu sûr, c'est la clé de tes données chiffrées.
3. **Relier le téléphone** : sur le PC, Paramètres › Synchronisation › **Relier le téléphone** ; un code QR
   s'affiche. Sur le téléphone, **Réglages › Scanner le code du PC**, autorise la caméra et vise le code.
   Le téléphone reçoit l'accès à ton compte Google et la clé, puis toutes tes données. Masque ensuite le code
   QR : il ouvre ton compte Google, ne le montre à personne.
4. **Ensuite** : chaque appareil se synchronise toutes les minutes tant que Cockpit est ouvert (et quand tu
   quittes l'appli sur le téléphone). Dans les Réglages du téléphone, choisis les **agendas Google** à
   montrer, comme sur le PC.

« Délier ce téléphone » (Réglages du téléphone) l'arrête sur le téléphone sans toucher au PC.

## 13. Raccourcis

| Touche | Action |
|---|---|
| `Ctrl K` | Rechercher, lancer une commande |
| `C` | Menu « Nouveau » |
| `N` | Nouvelle tâche (un devoir en mode Cours) |
| `F` | Mode focus |
| `Ctrl M` | Passer de Travail à Cours, et retour |
| `Ctrl 1` … `Ctrl 6` | Les pages du mode, dans l'ordre de la barre latérale |
| `Ctrl B` | Réduire ou déplier la barre latérale |
| `Ctrl Z` | Annuler la dernière suppression |
| `Ctrl Maj E` | Mini-fenêtre « En ce moment », toujours au-dessus |
| `F2` | Renommer la tâche sélectionnée |
| `?` | Tous les raccourcis |
| Journée : `←` `→`, `T`, `J` / `S` | Jour (ou semaine) précédent, suivant ; aujourd'hui ; vue jour / semaine |
| Mode focus : `Espace`, `Échap` | Pause ; arrêter |
