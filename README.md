# ⏰ Clokyfy

Une application web moderne et minimaliste d’horloge et de réveil, avec support des sons personnalisés, preview, snooze automatique et persistance locale.  
Développée en **TypeScript + SCSS + Vite.js** et déployée sur **Netlify**.

👉 Accès direct : [https://clockyfy.netlify.app](https://clockyfy.netlify.app)

---

## ✨ Fonctionnalités

- ⏱️ Affichage de l’heure et de la date en temps réel  
- 🔔 Programmation d’une alarme avec étiquette (label)  
- 🎶 Choix du son parmi plusieurs sonneries intégrées  
- ▶️ Preview des sons avant de les sélectionner  
- 🔄 Snooze manuel (bouton) et auto-snooze après 1 minute  
- 💾 Persistance locale (alarme, son, volume) via `localStorage`  
- 🎚️ Contrôle du volume avec affichage du pourcentage  
- 🪟 Toast central avec overlay semi-transparent (actions **Stop** / **Snooze**)  
- 🔔 Notification système (si autorisée et onglet non visible)

---

## 🎵 Crédits sons

Les sonneries intégrées proviennent de la plateforme [Zedge](https://www.zedge.net/ringtones) et sont utilisées ici à titre de démonstration.

---

## 📦 Stack technique

- **TypeScript** — logique et gestion des états  
- **SCSS** — styles custom et mise en page  
- **Vite.js** — bundler et serveur de développement  
- **LocalStorage** — persistance locale

---

## 💻 Installation locale

Cloner le projet et installer les dépendances :

```bash
git clone https://github.com/<ton-user>/clokyfy.git
cd clokyfy
npm install
```
Lancer le serveur de développement :
```bash
npm run dev
```
Le projet sera dispo sur [localhost](http://localhost:5173)

---

## 🚀 Déploiement

L’application est déployée via [Netlify](https://www.netlify.com).  
👉 Accès direct : [https://clockyfy.netlify.app](https://clockyfy.netlify.app)

---

## 🏷️ Badges

![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Vite](https://img.shields.io/badge/Vite-4-purple?logo=vite)
![SCSS](https://img.shields.io/badge/SCSS-CC6699?logo=sass&logoColor=white)
[![Netlify Status](https://api.netlify.com/api/v1/badges/77b9c37c-3359-436a-8afd-2846b9d3d301/deploy-status)](https://app.netlify.com/projects/clockyfy/deploys)
