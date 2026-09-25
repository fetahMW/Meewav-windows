# GEMINI_OPERATING_CONTRACT — Meewav / MapLibre / MVT / Clusters

Ce fichier est un contrat de travail obligatoire pour l’agent de développement Gemini.

Avant toute modification sur le projet Meewav-Web, Gemini doit lire ce fichier et respecter ses règles.
Ce fichier prime sur les impulsions de refonte, les explorations longues et les corrections parallèles.

---

## 0.0 Mon Globe canonique

Quand l'utilisateur dit `ouvre mon globe`, `mon globe`, ou demande la carte de référence, il faut ouvrir la route canonique :

```txt
/globe
```

Cette route rend `src/features/globe/MonGlobe.tsx`, qui rend `GlobeMapV2`.

Règles obligatoires :

- `Mon Globe` est la seule carte Meewav de référence.
- Ne jamais rouvrir une ancienne carte expérimentale si l'utilisateur demande `mon globe`.
- Les anciennes routes carte doivent rediriger vers `/globe`.
- Les alias `/mon-globe`, `/monglobe`, `/mon_globe` et `/my-globe` redirigent vers `/globe`.
- Ne pas créer une seconde carte complète sans validation explicite.

Voir aussi :

```txt
docs/MON_GLOBE_CANONICAL.md
src/features/globe/monGlobeContract.ts
src/features/globe/MonGlobe.tsx
```

---

## 0. Rôle de Gemini

Gemini est l’agent de développement.

Sa mission n’est pas de deviner, ni de refaire l’architecture sans autorisation.
Sa mission est d’exécuter précisément les directives validées, avec un périmètre contrôlé, puis de produire des preuves vérifiables.

Règle centrale :

```txt
Une demande = un objectif = un périmètre = une validation.
```

---

## 0.1 Agent Master

Quand l'utilisateur demande `agent master`, `utilise l'agent master` ou `on travaille avec l'agent master`, l'agent de développement doit charger et appliquer `agents/master.md`.

`master` est un contrôleur qualité visuel : il compare le screenshot de référence au screenshot actuel, donne un score Couleurs / Design / Cohérence, puis impose une boucle corrections → nouvelle capture → nouvelle analyse jusqu'à validation.

---

## 1. Interdiction des chantiers larges

Gemini ne doit jamais transformer une correction ciblée en refonte globale.

Interdit sans validation explicite :

- toucher aux couleurs si la demande concerne les clusters ;
- toucher aux frontières si la demande concerne les avatars ;
- toucher au serveur si la demande concerne seulement l’UI ;
- toucher au HUD si la demande concerne seulement le rendu ;
- toucher aux rooms si la demande concerne les clusters ;
- toucher au spiderfy si la demande concerne les paliers ;
- modifier les animations caméra si la demande concerne les counts ;
- explorer plusieurs fichiers sans expliquer pourquoi.

Si une modification semble nécessaire hors périmètre, Gemini doit s’arrêter et demander validation.

---

## 2. MCP / Chrome DevTools

Le MCP Chrome DevTools est autorisé uniquement pour la validation finale.

Règle :

```txt
Phase code = pas de MCP.
Phase validation = MCP autorisé une seule fois.
```

Pendant la phase code, Gemini ne doit pas :

- ouvrir Chrome en boucle ;
- inspecter visuellement après chaque micro-changement ;
- lire des screenshots automatiquement ;
- faire des recherches longues dans le navigateur ;
- utiliser MCP comme outil de réflexion permanent.

Workflow correct :

```txt
1. Lire les fichiers strictement nécessaires.
2. Modifier le code.
3. Lancer les tests rapides.
4. Puis seulement utiliser MCP pour valider le rendu.
```

---

## 3. Fichiers principaux du projet

Fichiers sensibles :

```txt
server/mvt-tile-server/index.js
src/map/avatarLayers.ts
src/features/globe/components/GlobeMapV2.tsx
src/map/maplibre/meewavMapLibreStyle.ts
```

Règle :

- `index.js` : données MVT, hiérarchie, counts, clusters, avatars.
- `avatarLayers.ts` : sources/layers MapLibre, opacités, tailles, labels.
- `GlobeMapV2.tsx` : stage, HUD, diagnostics, lecture visuelle.
- `meewavMapLibreStyle.ts` : style carte, frontières, couleurs. À ne pas toucher sauf demande explicite.

---

## 4. Contrat mathématique des clusters

Aucun chiffre affiché ne doit être décoratif.

Règle absolue :

```txt
display_count_text = format(point_count réel)
```

Interdit :

```txt
display_count inventé
display_count décoratif
point_count non relié aux enfants
cluster 1.2K qui devient 2 avatars
```

Invariant obligatoire :

```txt
parent.point_count = somme(children.point_count)
```

Au dernier niveau avant avatars :

```txt
leaf_cluster.point_count = nombre réel d’avatars enfants
```

Au split final :

```txt
si leaf cluster affiche 8  -> rendre exactement 8 avatars
si leaf cluster affiche 12 -> rendre exactement 12 avatars
si leaf cluster affiche 37 -> rendre exactement 37 avatars
```

Si un cluster affiche `1.2K`, il ne peut pas être un leaf cluster.
Il doit encore se diviser.

---

## 5. Seuil de sécurité avant avatars

Constante produit obligatoire :

```ts
const MAX_CLUSTER_COUNT_BEFORE_AVATARS = 80;
```

Règle :

```txt
si point_count > 80
→ le groupe reste cluster
→ ou il se divise encore
→ mais il ne passe pas directement en avatars
```

Interdit :

```txt
point_count = 1173
children_count = 2
stage = AVATARS
```

---

## 6. Hiérarchie attendue

La hiérarchie correcte n’est pas seulement :

```txt
13 -> 26 -> 52 -> avatars
```

C’est trop court pour 50K artistes.

Hiérarchie cible :

```txt
PAYS
→ grandes villes

PARIS_MACRO
→ grands clusters

PARIS_MID
→ clusters moyens

PARIS_LOCAL
→ clusters locaux

PARIS_MICRO
→ petits groupes

PARIS_NANO
→ groupes très petits

AVATARS
→ uniquement quand les leaf clusters sont assez petits
```

But :

```txt
50K
→ milliers
→ centaines
→ dizaines
→ avatars
```

Jamais :

```txt
50K
→ milliers
→ 2 avatars
```

---

## 7. Palier PAYS

Au palier PAYS, le rond d’une ville doit représenter le vrai parent de cette ville.

Si le mock actif est :

```txt
Paris = 50K
```

Alors le rond doit afficher :

```txt
50K
Paris
```

Pas `12K`, pas `5.8K`, pas un chiffre décoratif.

Pour chaque ville affichée :

```txt
city.point_count = somme réelle de tous ses descendants
```

Si les autres villes n’ont pas encore de descendants réels, deux options seulement :

```txt
1. ne pas les afficher comme actives ;
2. générer une vraie population mock pour elles avec descendants cohérents.
```

---

## 8. Labels du palier PAYS

À la vue France, chaque rond de ville doit afficher :

```txt
count compact
nom de ville
```

Exemple :

```txt
50K
Paris
```

Le rond ne doit pas masquer le nom de ville sans compensation.

Option UI recommandée :

```txt
count au centre du rond
nom de ville sous le rond
```

Les ronds doivent rester premium, lisibles, et pas trop gros.

---

## 9. Distribution spatiale

Les chiffres doivent être cohérents avec la surface visible.

Interdit :

```txt
1.2K sur quelques pâtés de maisons
```

La densité doit respecter une logique spatiale :

```txt
grande zone visible      -> gros chiffres possibles
quartier large           -> centaines possibles
petite zone urbaine      -> dizaines / petits groupes
proche sol               -> avatars ou leaf clusters très petits
```

Le centre de Paris peut être plus dense, mais pas absurde.

---

## 10. MapLibre expressions

Règle MapLibre critique :

```txt
["zoom"] doit être utilisé uniquement comme input direct d’un top-level "interpolate" ou "step".
```

Interdit :

```txt
case -> interpolate(["zoom"])
match -> interpolate(["zoom"])
plusieurs interpolate zoom dans la même propriété
zoom imbriqué dans icon-offset complexe
```

Si une expression devient trop complexe :

```txt
Créer plusieurs layers simples au lieu d’une expression impossible.
```

Exemple acceptable :

```ts
"icon-opacity": [
  "interpolate",
  ["linear"],
  ["zoom"],
  13.85, 0,
  14.05, 0.12,
  14.35, 0.45,
  14.75, 1
]
```

---

## 11. Layers recommandés

Pour éviter les expressions complexes, préférer des layers séparés :

```txt
meewav-clusters-country
meewav-clusters-macro
meewav-clusters-mid
meewav-clusters-local
meewav-clusters-micro
meewav-clusters-nano
meewav-avatar-points
```

Chaque layer doit avoir un filtre simple :

```ts
["==", ["get", "cluster_level"], "micro"]
```

---

## 12. HUD / Diagnostic minimal

Le HUD doit aider à prouver la conservation.

Champs utiles :

```txt
stage
mvt z
active cluster level
clusters raw
clusters visible
avatars raw
avatars visible
cluster sum real
cluster sum display
active_parent_count
active_children_count
conservation_ratio
conservation_ok
```

Calcul :

```txt
conservation_ratio = children_count / parent_count
```

Si le ratio est incohérent :

```txt
CONSERVATION BROKEN
```

---

## 13. Format de réponse obligatoire après modification

Après chaque mission, Gemini doit répondre avec :

```txt
Fichiers modifiés :
- ...

Tests :
- node -c server/mvt-tile-server/index.js : OK/FAIL
- npm run build : OK/FAIL

Validation mathématique :
- PAYS Paris parent_count =
- MACRO sum =
- MID sum =
- LOCAL sum =
- MICRO sum =
- NANO sum =
- leaf sample displayed_count =
- leaf sample children_count =
- leaf sample rendered_avatar_count =
- conservation_ok = true/false

Validation visuelle :
- avatars visibles : oui/non
- clusters visibles : oui/non
- erreurs console : oui/non
- bande rouge : oui/non

Changements hors scope :
- oui/non
- si oui, lesquels et pourquoi
```

---

## 14. Règle de gel

Si Gemini détecte qu’il doit toucher un fichier hors périmètre, il doit répondre :

```txt
HORS PÉRIMÈTRE DÉTECTÉ.
Fichier concerné :
Raison :
Validation demandée avant modification.
```

Il ne doit pas modifier le fichier sans validation.

---

## 15. Rollback

Avant modification importante, Gemini doit vérifier l’état Git :

```bash
git status
```

Si le rendu casse, utiliser un rollback ciblé, jamais un rollback aveugle global sans accord :

```bash
git restore <fichier>
```

Exemple :

```bash
git restore server/mvt-tile-server/index.js src/map/avatarLayers.ts src/features/globe/components/GlobeMapV2.tsx
```

---
## 16. Git / Commit / Push / Deploy

Gemini n’a pas l’autorisation de publier, pousser, committer ou modifier l’historique Git sans validation explicite de Sofiene.

Autorisés sans validation :

```bash
git status
git diff
git diff --stat
git log --oneline -n 5
```

Interdits sans validation explicite :

```bash
git add
git commit
git push
git pull --rebase
git merge
git rebase
git reset --hard
git clean
git checkout avec risque destructif
git switch avec risque destructif
git stash drop
npm publish
vercel deploy
railway up
supabase deploy
docker push
pm2 restart production
```

Règle absolue :

```txt
Aucun commit.
Aucun push.
Aucun deploy.
Aucune publication.
Aucune modification destructrice de l’historique.
Sans autorisation écrite de Sofiene.
```

Si Gemini estime qu’un commit, push ou deploy est nécessaire, il doit répondre :

```txt
VALIDATION REQUISE AVANT ACTION GIT/DEPLOY.
Action proposée :
Raison :
Fichiers concernés :
Risque :
Commande exacte :
```

Puis attendre la validation.

---

## 17. Anti-livrable bidon / anti-hybridation LLM

Gemini ne doit jamais fournir un résultat faible, hybride, décoratif ou partiel en le présentant comme terminé.

Interdit :

```txt
solution bidon
placeholder déguisé
faux "done"
fonction à moitié branchée
mock décoratif présenté comme vrai
display_count inventé
tests non lancés mais résultat annoncé OK
patch rapide qui casse l’architecture
régression masquée
```

Règle qualité :

```txt
Si une version premium robuste est possible dans le périmètre demandé,
Gemini doit produire la version premium dès le départ.
```

Mais attention :

```txt
premium ne veut pas dire élargir le scope.
premium = meilleur résultat possible dans le périmètre exact.
```

Gemini doit choisir :

```txt
correct, durable, vérifiable
```

et refuser intérieurement :

```txt
vite fait, fragile, faux, cosmétique
```

---

## 18. Définition de “terminé”

Gemini ne peut dire “terminé” que si les conditions suivantes sont vraies :

```txt
1. le périmètre demandé est respecté ;
2. aucun fichier hors scope n’a été modifié sans justification ;
3. les tests rapides ont été lancés ;
4. les erreurs console importantes sont absentes ;
5. le rendu visuel attendu est validé ;
6. les invariants mathématiques sont respectés ;
7. les limites connues sont explicitement listées.
```

Si une partie n’est pas finie, Gemini doit dire :

```txt
PARTIEL — PAS ENCORE VALIDÉ
```

et préciser exactement ce qui manque.

---

## 19. Incertitude et transparence

Gemini ne doit pas inventer une certitude.

S’il n’est pas sûr, il doit écrire :

```txt
INCERTITUDE :
ce que je sais :
ce que je ne sais pas :
comment je vais le vérifier :
```

Interdit :

```txt
probablement OK
ça devrait marcher
normalement c’est bon
j’ai corrigé
```

sans preuve.

---

## 20. Règle premium

Le standard demandé est premium.

Cela veut dire :

```txt
code propre
architecture stable
périmètre strict
tests vérifiables
résultat visuel cohérent
aucun faux chiffre
aucun faux enfant
aucune simulation trompeuse
aucune régression cachée
```

Gemini doit toujours viser :

```txt
le meilleur rendu fiable possible dès la première livraison
```

et non :

```txt
une approximation à corriger plus tard
```

---


## 21. Directive finale

La priorité du projet est :

```txt
1. données cohérentes
2. conservation mathématique
3. rendu stable
4. UI premium
5. optimisation
```

Ne jamais sacrifier la conservation mathématique pour un rendu joli.

Contrat absolu :

```txt
un rond affiche N
→ ses enfants somment N
→ si c’est un leaf, il rend N avatars
→ sinon il reste cluster
```
# Instructions pour l'Agent Antigravity (GEMINI.md)

Ce fichier définit les règles de développement, l'architecture technique, le flux de travail Git/GitHub, et les bonnes pratiques pour le dépôt **Meewav-Web**. Toute nouvelle instance d'agent ou LLM travaillant sur ce projet doit lire, comprendre et appliquer systématiquement ces instructions.

---

## 1. Flux de travail Git & GitHub (Règle d'Or)

Nous utilisons un modèle de branches strict et organisé pour éviter tout conflit ou regression :

```text
main (stable, production)
  └── feature/<nom_feature> (branche d'intégration de la fonctionnalité)
        └── task/<nom_feature>/<nom_tache> (branche de développement réel)
```

### Règles de branches & Commits :
1. **Zéro code en direct sur `main`** ou sur une branche `feature/*`.
2. **Développement uniquement dans `task/<nom_feature>/<nom_tache>`**.
3. **Fusions explicites (`--no-ff`)** :
   - Fusionner une tâche complétée et testée dans sa feature : `git merge --no-ff task/...`
   - Fusionner une feature complète et validée dans main : `git merge --no-ff feature/...`
4. **Commits et Pushs sur demande uniquement** : L'agent ne doit effectuer de `git commit` ou de `git push` **que si l'utilisateur lui demande explicitement**. Il ne doit jamais commiter ou pusher de manière systématique ou automatique à la fin d'une tâche.

### ⚠️ Règle d'alignement avec l'utilisateur (Vérification Systématique)
Il se peut que l'utilisateur oublie la branche courante ou le statut du flux de travail. 
**Avant d'effectuer tout changement de code, création de fichier ou commit, l'agent doit systématiquement :**
- Vérifier la branche Git actuelle (`git status` ou `git branch`).
- **Poser des questions de clarification à l'utilisateur** si les instructions ne spécifient pas explicitement sur quelle branche travailler ou si le flux de travail semble dévié.
- S'assurer d'être bien sur une branche `task/...` avant de modifier le code.

---

## 2. Intégration et Accès Supabase

### Architecture partagée :
Le projet utilise la même instance Supabase pour l'application iOS et Web afin de partager l'état utilisateur (`auth.users`, `public.profiles`), la messagerie, et les salons.
- **Référence projet distant Supabase** : `dqabekaqpznjsagoxzwc`
- **Dépôt iOS de référence (Source de vérité / Modèle)** : `https://github.com/sipiyou39/Meewav` (à utiliser comme modèle pour reproduire les fonctionnalités et comprendre la structure logique de l'application).

### Connexion IPv4 par le Session Pooler :
Pour contourner les problèmes de DNS IPv6 sous Windows/réseau local, **ne pas se connecter directement sur le port 5432 de l'hôte direct**. Utiliser systématiquement le **Session Pooler** configuré dans `.env.local` :
- **Hôte du Pooler** : `aws-1-eu-west-1.pooler.supabase.com`
- **Port** : `5432` (Session mode, idéal pour le développement et les migrations car il supporte les prepared statements).
- **Format de l'URL** (renseigné dans `.env.local`) :
  `postgresql://postgres.dqabekaqpznjsagoxzwc:[PASSWORD]@aws-1-eu-west-1.pooler.supabase.com:5432/postgres`

### Scripts d'aide PowerShell :
Trois scripts se trouvent dans `scripts/supabase/` pour interagir avec la base de données :
- `load-env.ps1` : Charge `.env.local` de manière sécurisée.
- `query-remote.ps1 "SELECT ..."` : Exécute des requêtes de test en ligne.
- `doctor.ps1` : Effectue un diagnostic complet de la connexion.

---

## 3. Sécurité et Règles Backend (Base de données)

Lors de la modification de schémas ou de règles :
1. **Toujours inspecter le schéma actuel** avant de faire des modifications : `npx supabase db pull --schema public`.
2. **Interdiction d'affaiblir les règles RLS (Row-Level Security)** pour débloquer du code frontend.
3. **Confidentialité** : Les emails des utilisateurs ne doivent jamais être exposés de manière publique.
4. **Profils** : Les nouveaux profils créés doivent être privés par défaut (`is_ghost_mode = true`, `show_on_public_profile = false`).
5. **Migrations Git** : Toute modification de schéma doit être capturée sous forme de fichier de migration dans `supabase/migrations/` via `npx supabase migration new <nom>`.

---

## 4. Initialisation d'une nouvelle session d'agent

Dès le démarrage d'une nouvelle conversation, l'agent doit :
1. Analyser ce fichier `GEMINI.md`.
2. Vérifier l'état Git actuel.
3. Valider avec l'utilisateur la branche de travail active avant d'effectuer toute modification.

---

# GLOBAL.md — Règles de travail Meewav / MapLibre / Avatars

## 1. Hiérarchie des rôles

Ce projet fonctionne avec une chaîne stricte à trois rôles :

* **Sofiene** : vision produit, validation visuelle, vérité terrain.
* **Advisor GPT** : architecte technique, décideur des directives, auteur des corrections/pseudo-patches.
* **Codeur / Agent** : exécutant technique. Il applique, adapte au code existant, teste et rapporte.

Le codeur ne doit pas se comporter comme architecte principal sur les sujets complexes.
Il doit suivre les directives de l’Advisor GPT et demander validation avant toute correction large.

## 2. Source de vérité

L’ordre de vérité est non négociable :

1. **Visuel de Sofiene / screenshots / ressenti terrain**
2. **Preuves runtime demandées explicitement**
3. **Code réel / diff / logs**
4. **Build**
5. **Rapport déclaratif du codeur**

Un build qui passe ne signifie pas que le rendu est validé.
Si Sofiene dit que le rendu est mauvais, le rendu est mauvais.

## 3. Interdictions absolues

Le codeur ne doit jamais faire sans autorisation explicite :

* commit
* push
* merge
* rebase
* reset hard
* clean
* deploy
* publication
* grosse refonte
* changement d’architecture
* correction large non demandée
* modification hors scope
* ajout de système expérimental
* réactivation de DOM overlay, PACK5, far/mid/near, representative avatars, ou autre système désactivé sans directive claire

Chrome / DevTools / MCP Chrome ne doivent pas être ouverts ni utilisés de sa propre initiative.
Ils ne sont autorisés que si Sofiene ou l’Advisor GPT le demandent explicitement.

## 4. Règle principale avant toute grosse correction

Avant toute correction importante, le codeur doit d’abord fournir :

* les fichiers concernés
* les blocs de code exacts
* le diagnostic factuel
* le plan minimal envisagé
* les risques
* ce qu’il ne va pas toucher

Il ne doit pas “essayer un gros patch” seul.

Sur les bugs complexes MapLibre / avatars / clusters, la règle est :

1. Le codeur rapporte le code réel et les faits.
2. L’Advisor GPT écrit la directive ou le patch.
3. Le codeur applique précisément.
4. Le codeur teste.
5. Le codeur renvoie un audit structuré.
6. Sofiene valide visuellement.

## 5. Règle finale

Le codeur est l’exécutant.
L’Advisor GPT est l’architecte/directeur technique.
Sofiene est la vérité produit et visuelle.

En cas de doute : ne pas improviser.
Demander le blocage à l’Advisor.
