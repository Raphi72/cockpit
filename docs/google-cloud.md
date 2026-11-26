# Connecter Cockpit à Google (à faire une fois)

Cockpit lit tes agendas Google (V2, étape 8) et synchronise tes appareils par un dossier caché de ton
Google Drive (étape 9). Pour qu'il ait le droit de se connecter à ton compte,
Google demande un **projet Google Cloud** à ton nom, avec un **identifiant de client**. C'est gratuit,
et ça prend une dizaine de minutes.

> L'identifiant et le code secret du client restent sur ton PC, dans le **Gestionnaire d'identification
> de Windows** (comme le jeton de connexion). Ils ne vont jamais dans la base, ni dans les exports, ni
> dans le dépôt GitHub. Ne les colle nulle part ailleurs que dans Cockpit.

## 1. Créer le projet

1. Ouvre <https://console.cloud.google.com> avec ton compte Google.
2. En haut, clique sur le sélecteur de projet, puis **Nouveau projet**.
3. Nom : `Cockpit`. Clique sur **Créer**, puis sélectionne ce projet.

## 2. Activer les API Google Agenda et Google Drive

1. Menu ☰ › **API et services** › **Bibliothèque**.
2. Cherche **Google Calendar API**, ouvre-la, clique sur **Activer**.
3. Reviens à la bibliothèque, cherche **Google Drive API**, clique sur **Activer** (pour la synchronisation).

## 3. Écran de consentement (Google Auth Platform)

1. Menu ☰ › **API et services** › **Écran de consentement OAuth** (ou **Google Auth Platform**),
   puis **Commencer**.
2. **Informations sur l'application** : nom `Cockpit`, adresse e-mail d'assistance : la tienne.
3. **Audience** : **Externe**.
4. **Coordonnées** : ton adresse e-mail. Accepte le règlement, puis **Créer**.
5. Dans **Accès aux données**, **Ajouter ou supprimer des champs d'application** : coche
   `.../auth/calendar.readonly` (« Afficher les événements de tous vos agendas ») et
   `.../auth/drive.appdata` (« Voir, créer et supprimer ses propres données de configuration dans votre
   Google Drive » : le dossier caché de Cockpit, et rien d'autre de ton Drive), puis **Mettre à jour** et
   **Enregistrer**.
6. Dans **Audience**, clique sur **Publier l'application** pour la passer **En production**.
   *Pourquoi ?* En mode « Test », Google coupe la connexion au bout de 7 jours. En production, sans
   validation par Google, tu verras seulement un avertissement à la connexion (voir l'étape 5) : c'est
   normal pour une application personnelle.

## 4. Créer l'identifiant du client

1. Dans **Clients** (ou **Identifiants** › **Créer des identifiants** › **ID client OAuth**) :
   **Créer un client**.
2. Type d'application : **Application de bureau**. Nom : `Cockpit Windows`. **Créer**.
3. Google affiche l'**ID client** (il finit par `.apps.googleusercontent.com`) et le **code secret du
   client**. Garde cette fenêtre ouverte (ou télécharge le JSON) pour l'étape suivante.

## 5. Dans Cockpit

1. **Paramètres › Google Agenda** : colle l'ID client et le code secret, puis **Enregistrer**.
2. **Se connecter à Google** : ton navigateur s'ouvre.
3. Choisis ton compte. Google prévient que l'application n'est pas validée : **Paramètres avancés**,
   puis **Accéder à Cockpit (non sécurisé)**. C'est ton propre projet.
4. Autorise **l'affichage des événements de tes agendas** et **ses propres données dans Google Drive**.
   La page dit ensuite que Cockpit est connecté : tu peux la fermer.
5. Tes agendas apparaissent dans Paramètres › Google Agenda : coche ceux à afficher, choisis leur couleur.

## 6. Synchroniser un deuxième appareil

1. Sur le premier : **Paramètres › Synchronisation › Activer ici**. Cockpit affiche un **code** de 13
   groupes de 4 caractères : note-le en lieu sûr (sans lui, les fichiers sur Drive sont illisibles).
2. Sur l'autre : connecte le même compte Google (étapes 5.1 à 5.4), puis **Paramètres › Synchronisation ›
   Rejoindre la synchronisation** avec ce code.

Déjà connecté à l'étape 8 ? Paramètres › Synchronisation propose **Autoriser la synchronisation** : la page
de Google demande alors seulement l'accès à Drive.

Pour couper l'accès : **Se déconnecter** dans Cockpit, ou <https://myaccount.google.com/permissions>.
