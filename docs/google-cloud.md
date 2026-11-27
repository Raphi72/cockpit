# Connecter ton compte Google à Cockpit (à faire une fois)

Avec ton compte Google, Cockpit :

- **montre tes agendas Google** dans le calendrier, la Journée et Aujourd'hui, et **les modifie** (titre,
  heures, lieu, création, suppression), même hors connexion : les changements partent au retour du réseau ;
- **synchronise ton PC et ton téléphone** par un dossier caché de ton Google Drive, chiffré : Google ne peut
  pas lire ce qu'il contient, et Cockpit ne voit rien d'autre de ton Drive.

Google n'autorise une application à se connecter à ton compte que si elle a un **projet Google Cloud**,
avec un **identifiant de client**. Cockpit n'en a pas à lui (son code est public) : tu crées le tien. C'est
gratuit, sans carte bancaire, et ça prend une dizaine de minutes.

> **Tes identifiants restent chez toi.** L'ID et le code secret du client, comme le jeton de connexion, sont
> rangés dans le **Gestionnaire d'identification de Windows** sur le PC, et dans le dossier privé de l'appli
> sur le téléphone. Ils ne vont jamais dans la base, ni dans les exports, ni sur GitHub. Ne les colle nulle
> part ailleurs que dans Cockpit, et ne les envoie à personne.

**Sommaire** : [1. Créer le projet](#1-créer-le-projet) ·
[2. Activer les deux API](#2-activer-les-api-google-agenda-et-google-drive) ·
[3. Écran de consentement](#3-lécran-de-consentement) · [4. Identifiant du client](#4-créer-lidentifiant-du-client) ·
[5. Dans Cockpit](#5-dans-cockpit-sur-le-pc) · [6. Le téléphone](#6-relier-le-téléphone) ·
[7. En cas de souci](#7-en-cas-de-souci)

## 1. Créer le projet

1. Ouvre <https://console.cloud.google.com> et connecte-toi avec **le compte Google de tes agendas**.
   La première fois, accepte les conditions d'utilisation.
2. En haut à gauche, clique sur le **sélecteur de projet**, puis **Nouveau projet**.
3. Nom du projet : `Cockpit`. Laisse « Organisation » sur « Aucune organisation ». **Créer**.
4. Une fois créé, vérifie que le sélecteur de projet affiche bien **Cockpit** (sinon, choisis-le).

## 2. Activer les API Google Agenda et Google Drive

1. Menu ☰ › **API et services** › **Bibliothèque**.
2. Cherche **Google Calendar API**, ouvre-la, clique sur **Activer**.
3. Reviens à la **Bibliothèque**, cherche **Google Drive API**, ouvre-la, clique sur **Activer**.

Sans la première, les agendas ne se lisent pas ; sans la seconde, la synchronisation ne marche pas.

## 3. L'écran de consentement

C'est la page que Google te montrera au moment de connecter Cockpit.

1. Menu ☰ › **API et services** › **Écran de consentement OAuth** (Google l'appelle aussi **Google Auth
   Platform**), puis **Commencer**.
2. **Informations sur l'application** : nom `Cockpit`, e-mail d'assistance : le tien. **Suivant**.
3. **Audience** : **Externe**. **Suivant**.
4. **Coordonnées** : ton adresse e-mail. **Suivant**, coche l'acceptation du règlement, puis **Créer**.
5. Dans le menu de gauche, **Accès aux données** › **Ajouter ou supprimer des niveaux d'accès**. Coche ces
   trois lignes (le filtre en haut aide à les trouver), puis **Mettre à jour** et **Enregistrer** :

   | Niveau d'accès | Ce que Google en dit | Pour quoi faire |
   |---|---|---|
   | `.../auth/calendar.readonly` | Afficher les événements de tous vos agendas | Lire tes agendas |
   | `.../auth/calendar.events` | Afficher et modifier les événements de tous vos agendas | Modifier, créer, supprimer |
   | `.../auth/drive.appdata` | Voir, créer et supprimer ses propres données de configuration dans votre Google Drive | Le dossier caché de la synchronisation, rien d'autre |

6. Dans **Audience**, clique sur **Publier l'application**, puis **Confirmer** : l'état passe à **En
   production**.
   *Pourquoi ?* En mode « Test », Google coupe la connexion tous les 7 jours. En production, sans
   validation par Google, tu verras seulement un avertissement au moment de te connecter (étape 5) : c'est
   normal pour une application personnelle, et tu es la seule personne à l'utiliser.

## 4. Créer l'identifiant du client

1. Dans le menu de gauche, **Clients** › **Créer un client** (ou **API et services** › **Identifiants** ›
   **Créer des identifiants** › **ID client OAuth**).
2. Type d'application : **Application de bureau**. Nom : `Cockpit`. **Créer**.
3. Google affiche l'**ID client** (il finit par `.apps.googleusercontent.com`) et le **code secret du
   client**. Garde cette fenêtre ouverte pour l'étape suivante (ou clique sur **Télécharger le JSON** et
   garde le fichier en lieu sûr, pas sur un dossier partagé).

Un seul client suffit, pour le PC comme pour le téléphone : le téléphone le reçoit du PC (étape 6).

## 5. Dans Cockpit, sur le PC

1. **Paramètres › Google Agenda** : colle l'**ID client** et le **code secret**, puis **Enregistrer**.
2. Clique sur **Se connecter à Google** : ton navigateur s'ouvre sur la page de Google.
3. Choisis ton compte. Google prévient que « Google n'a pas validé cette application » : clique sur
   **Paramètres avancés**, puis **Accéder à Cockpit (non sécurisé)**. C'est ton propre projet.
4. Coche tout ce que Google propose (tes agendas, leurs événements, le dossier de Cockpit sur Drive), puis
   **Continuer**. La page dit que Cockpit est connecté : tu peux la fermer.
5. Retour dans Cockpit : tes agendas apparaissent dans Paramètres › Google Agenda. Coche ceux à afficher et
   choisis leur couleur. L'agenda de ton emploi du temps (celui de l'intranet, abonné par un lien iCal) est
   reconnu tout seul comme **agenda des cours**.
6. Pour la synchronisation : **Paramètres › Synchronisation › Activer ici**. Cockpit affiche un **code** de
   13 groupes de 4 caractères : **note-le en lieu sûr** (sans lui, tes données sur Drive sont illisibles,
   même pour toi).

**Déjà connecté avant ?** Paramètres › Google Agenda propose **Autoriser la modification** (et Paramètres ›
Synchronisation, **Autoriser la synchronisation**) : un clic, et la page de Google demande seulement ce qui
manque. En attendant, tes modifications d'événements restent dans Cockpit et partiront ensuite.

## 6. Relier le téléphone

Le téléphone n'a rien à saisir : il reçoit tout du PC par un code QR.

1. Installe l'appli Android : sur le téléphone, ouvre <https://github.com/Raphi72/cockpit/releases/latest>,
   touche `Cockpit_…_android.apk` dans **Assets**, puis ouvre le fichier téléchargé. Android demande
   d'autoriser l'installation depuis Chrome : **Paramètres** › **Autoriser à partir de cette source**, puis
   **Installer**. Si Play Protect avertit, **Plus de détails** › **Installer quand même**.
2. Sur le PC : **Paramètres › Synchronisation › Relier le téléphone**. Un code QR s'affiche.
3. Sur le téléphone : Cockpit › **Réglages** (le bouton tout à droite, en haut) › **Scanner le code du PC**, autorise la
   caméra, vise le code.
4. Le téléphone reçoit l'accès à ton compte Google et la clé de la synchronisation, puis toutes tes données.
   **Masque le code QR** sur le PC : il ouvre ton compte Google, ne le montre à personne.
5. Dans les Réglages du téléphone, choisis les agendas Google à afficher.

Ensuite, le PC et le téléphone se synchronisent chaque minute tant que Cockpit est ouvert. « Délier ce
téléphone » (Réglages du téléphone) l'arrête sur le téléphone sans toucher au PC.

## 7. En cas de souci

| Ce que tu vois | Ce qu'il faut faire |
|---|---|
| « Accès bloqué : Cockpit n'a pas terminé la procédure de validation de Google » | L'application est restée en mode « Test » sans toi comme testeur : refais l'étape 3.6 (**Publier l'application**). |
| « Google refuse l'identifiant du client » | L'ID ou le code secret est mal copié (espace en trop, caractère manquant) : recopie-les depuis la console (étape 4), **Changer les identifiants** dans Paramètres. |
| « Google refuse l'accès à l'agenda : l'API Google Calendar est-elle activée ? » | Refais l'étape 2 pour **Google Calendar API**. |
| La synchronisation échoue, Drive refuse | Refais l'étape 2 pour **Google Drive API**, puis **Autoriser la synchronisation**. |
| « Google a coupé la connexion : reconnecte-toi » | Le jeton a expiré ou a été retiré : **Se connecter à Google** dans Paramètres. Si ça revient chaque semaine, l'application est encore en mode « Test » : étape 3.6. |
| Une modification d'événement « en attente » | Hors connexion, elle partira au retour du réseau. Sinon, **Autoriser la modification** dans Paramètres › Google Agenda. |
| Un événement de l'intranet ne se modifie pas chez Google | Normal : un agenda abonné par iCal ne se modifie pas, même dans Google. Tes changements restent dans Cockpit (et sur le téléphone) ; **Rétablir** dans la fiche du cours les retire. |

**Couper l'accès** : **Se déconnecter** dans Paramètres › Google Agenda (le jeton est retiré chez Google), ou
<https://myaccount.google.com/permissions> › Cockpit › **Supprimer l'accès**. **Tout oublier** retire aussi
l'ID et le code secret du client de ton PC.
