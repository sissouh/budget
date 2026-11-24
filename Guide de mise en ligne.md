# Mon budget Ar (PWA) — mise en ligne

L'app fonctionne **hors ligne** : tout ce que tu notes est d'abord enregistré sur ton téléphone. Quand il y a du réseau, l'app recopie tout dans un Google Sheets **« Mon budget Ar — données »** sur ton Google Drive.

Il y a 3 étapes, à faire une seule fois :

1. Mettre l'app en ligne sur GitHub Pages (gratuit).
2. Créer l'autorisation Google dans Google Cloud (gratuit).
3. Installer l'app sur ton Android.

---

## 1. Mettre l'app en ligne (GitHub Pages)

1. Crée un compte sur [github.com](https://github.com), si tu n'en as pas.
2. Clique sur **New repository**, nomme-le `budget`, choisis **Public**, puis **Create repository**.
   Seul le code de l'app y sera publié. **Tes données n'y passent jamais** : elles restent sur ton téléphone et ton Drive.
3. Clique sur **uploading an existing file**, puis glisse tous les fichiers de ce dossier :
   `index.html`, `app.js`, `config.js`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `icon-maskable.png`.
   Clique ensuite sur **Commit changes**.
4. Va dans **Settings → Pages**. Pour *Source*, choisis **Deploy from a branch**, puis *Branch* **main** et le dossier **/ (root)**. Clique sur **Save**.
5. Après une ou deux minutes, ton app est en ligne à l'adresse :
   `https://TON-NOM-GITHUB.github.io/budget/`

## 2. Créer l'autorisation Google (Google Cloud)

1. Va sur [console.cloud.google.com](https://console.cloud.google.com) et connecte-toi avec le compte Google de ton budget.
2. **Crée un projet** : menu des projets en haut, puis **Nouveau projet**, nommé « Mon budget Ar ».
3. **Active les 2 API** : menu **API et services → Bibliothèque**, cherche puis active :
   - **Google Sheets API**
   - **Google Drive API**
4. **Écran de consentement** : menu **API et services → Écran de consentement OAuth** (ou *Google Auth Platform*).
   - Nom de l'application : `Mon budget Ar`, avec ton adresse mail comme adresse d'assistance.
   - Audience : **Externe**.
   - Dans **Utilisateurs test**, ajoute ta propre adresse Gmail.
5. **Crée l'identifiant** : menu **API et services → Identifiants → Créer des identifiants → ID client OAuth**.
   - Type d'application : **Application Web**.
   - **Origines JavaScript autorisées**, ajoute :
     - `https://TON-NOM-GITHUB.github.io` (sans `/budget` à la fin)
   - Il n'y a rien à mettre dans « URI de redirection ».
   - Clique sur **Créer**, puis copie l'**ID client**. Il se termine par `.apps.googleusercontent.com`.
6. Ouvre `config.js`, colle l'ID entre les guillemets, puis renvoie ce fichier sur GitHub (étape 1.3) :
   ```js
   window.BUDGET_CONFIG = { clientId: "1234…apps.googleusercontent.com" };
   ```

L'app ne demande que l'accès **« fichiers créés par cette app »** (`drive.file`). Elle ne peut ni voir ni modifier tes autres fichiers Drive.

## 3. Installer sur Android

1. Ouvre `https://TON-NOM-GITHUB.github.io/budget/` dans **Chrome**.
2. Menu **⋮ → Installer l'application** (ou *Ajouter à l'écran d'accueil*).
3. Ouvre l'app, va dans l'onglet **Budget**, puis appuie sur **Connecter Google Drive** et choisis ton compte.
   Google peut afficher « Google n'a pas validé cette application » : c'est normal pour ta propre app. Clique sur **Continuer**.

C'est prêt.

---

## Au quotidien

- **Sans réseau**, tu notes normalement. En haut de l'écran, tu vois par exemple « Hors ligne · 2 modifications en attente ».
- **Avec du réseau**, la sauvegarde est automatique. L'écran affiche « ✓ Sauvegardé sur Drive · 14:32 ».
- Google limite l'accès à **1 heure**. Ensuite, l'app se reconnecte quand tu appuies sur *Enregistrer*, ou propose un bouton **Sauvegarder** en haut de l'écran.
- **Nouveau téléphone ?** Installe l'app, puis appuie sur **Connecter Google Drive** : tout revient depuis ton Drive.

## Bon à savoir

- Le **budget prévu** se modifie **dans l'app**, onglet Budget. Une modification de l'onglet *Postes* faite directement dans le Google Sheets serait écrasée.
- Tu peux **ajouter des lignes à la main** dans l'onglet *Journal* du Sheets (Date, Poste, Montant) : l'app les récupère. Pour **supprimer** une ligne, fais-le dans l'app, sinon elle reviendrait.
- **Mettre l'app à jour** : renvoie les fichiers modifiés sur GitHub, en changeant `budget-v1` en `budget-v2` dans `sw.js`. La nouvelle version s'affiche à l'ouverture suivante de l'app.
