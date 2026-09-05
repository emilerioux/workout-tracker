# Reps

Suivi d'entraînement en musculation. PWA, hors ligne, données locales.

**Deux adresses, la même app :**
- https://emilerioux.github.io/reps/
- https://emilerioux.github.io/workout-tracker/ — l'ancienne adresse de
  *Mes Workouts*, conservée pour que l'icône déjà installée sur l'écran
  d'accueil continue de fonctionner.

Même origine, donc **mêmes données** des deux côtés. Le dépôt `reps` est la
source ; `workout-tracker` en reçoit une copie à chaque déploiement.

Reps remplace *Mes Workouts*. Le code de l'ancienne app vit dans l'historique
Git du dépôt `workout-tracker` (commit `02a5b00`), et ses données sont toujours
dans le navigateur. Reps ne les lit que sur demande explicite, depuis
Réglages → *Ancienne app* → *Récupérer mes données* — et c'est une copie, jamais
un déplacement. L'option est en bas des réglages, derrière un bouton : elle ne
sert qu'une fois.

> **L'import doit se faire depuis l'icône déjà installée.** Sur iOS, une app
> ajoutée à l'écran d'accueil a son propre espace de stockage : les anciennes
> données sont dans celui de l'ancienne icône. Une icône fraîchement ajoutée
> depuis `/reps/` ne les verrait pas.

## Les quatre onglets

| Onglet | Ce qu'on y fait |
| --- | --- |
| **Programmes** | Créer et éditer des programmes (exercices, séries, reps, supersets). Chaque programme reçoit automatiquement une couleur libre — jamais deux fois la même — et la porte partout : filet à gauche de sa carte, de ses exercices, et de chacune de ses entrées d'historique. Glisser la poignée d'une ligne réordonne les exercices, le maillon les enchaîne en superset. Un programme se lance en séance guidée. |
| **Historique** | Un calendrier mois par mois — une case pleine = une séance — et dessous les entrées de ce mois, groupées par jour avec leur volume. Toucher une case isole la journée. Glisser une ligne vers la gauche pour la supprimer. Ajout manuel possible. |
| **Progrès** | Courbe de progression par exercice (poids ou reps), poids corporel, photos. |
| **Réglages** | Apparence (clair ou sombre, dix accents), export/import de fichier, renommage d'exercices, récupération depuis l'ancienne app, remise à zéro. |

## La séance guidée

C'est l'écran central. Une carte par **bloc** : un exercice seul, ou
un superset entier.

| Geste | Ce qu'il faut sentir |
| --- | --- |
| **Glisser la carte** | Elle colle au doigt au pixel près. Un coup sec l'envoie plus loin qu'un glissé lent : l'app calcule où le mouvement *allait* s'arrêter. Aux extrémités, ça résiste au lieu de bloquer net. |
| **Attraper une carte en vol** | Elle repart de là où elle est, sans saut. Aucune animation ne verrouille l'écran. |
| **Tirer un chiffre** | Vers le haut ou le bas : le poids par 2,5 lb, les reps par 1. Un cran = une micro-vibration. Vertical exprès, pour ne pas entrer en conflit avec le glissé horizontal. |
| **Valider une série** | Le poids de départ est celui de la dernière fois. Un exercice bouclé s'écrit tout de suite dans l'historique — si l'app se ferme en pleine séance, rien n'est perdu. |
| **Battre un record** | Bandeau qui descend du haut et remonte **par le même chemin**. Une lueur part du chiffre. |
| **Bord gauche → droite** | Retour depuis une vue poussée, suivi au doigt et annulable en cours de route. |
| **Glisser une poignée** | Réordonner les exercices dans l'éditeur. La rangée se soulève et suit le doigt, les autres s'écartent chacune sur son ressort. Vertical par la poignée, horizontal ailleurs pour supprimer : les deux gestes ne se marchent jamais dessus. |
| **Glisser le calendrier** | Il résiste au lieu de partir : il annonce qu'il y a un mois de l'autre côté, et c'est la vitesse au relâchement qui décide. Le nouveau mois entre du côté d'où vient le geste. |
| **Tirer une feuille vers le bas** | Elle suit le doigt, résiste vers le haut, et un coup sec la referme même à mi-chemin. |

## Les supersets

Un superset, ce sont des exercices **qui se suivent** et qui portent le
même numéro de groupe. L'adjacence fait partie de la définition : un
« A … B … A » serait impossible à enchaîner dans la salle, alors la
lecture se fait par suites contiguës (`supersetRuns`), jamais par un
simple décompte de groupes.

**Les créer.** À l'ajout, la case « Superset avec … » le chaîne au
précédent. Après coup, le bouton maillon de chaque ligne le lie à
celle du dessus ou l'en détache. Détacher ne casse que ce maillon-là :
ce qui suit reste soudé, sinon défaire un tri-set le ferait exploser
en trois.

**Les lire.** Dans la fiche du programme, une suite de 2+ tient dans
un encadré, avec ses exercices étiquetés A1, A2… Il n'y a pas de
limite à 2 : un tri-set ou un giant set s'affiche pareil.

**Les faire.** En séance, le bloc entier tient sur **une seule carte**
— dans la salle on fait A1 puis A2 sans repos, les faire glisser l'un
après l'autre n'avait aucun sens. La carte s'organise **par tour** :
tour 1 (A1 puis A2), tour 2, et ainsi de suite. La série en attente
suit cet ordre-là, le bouton dit laquelle il valide (« Valider A2 ·
tour 2 »), et la carte va la chercher si elle est sortie de l'écran.
Chaque exercice garde son propre poids de départ et son propre
historique : le superset ne change que la mise en page et l'ordre, pas
les données écrites.

## Ce qui vient du langage Apple

- **Ressorts, pas de durées fixes.** Deux paramètres (amortissement + réponse),
  comme SwiftUI. Un ressort repart toujours de la valeur affichée → interruptible
  par construction. Tout est dans `js/motion.js`.
- **Relais de vitesse.** La vitesse du doigt au relâchement devient la vitesse
  initiale du ressort : aucune couture entre le glissé et l'animation.
- **Projection de momentum.** `(v/1000)·d/(1−d)` avec `d = 0.998` — la formule du
  code d'exemple *Designing Fluid Interfaces*, pas la physique scolaire.
- **Élastique aux bords** plutôt qu'un mur.
- **Le document ne défile jamais.** `<html>` porte `overflow: hidden` et
  `overscroll-behavior: none` — c'est lui l'élément de défilement, le poser sur
  `<body>` seul n'arrête rien sur iOS — et le corps est fixé au viewport. Seules
  les zones `.page-scroll` défilent, donc la barre d'onglets ne part jamais avec
  un rebond de page.
- **Matériaux translucides**, le contenu passe dessous ; fondu de bord au scroll
  au lieu d'un filet de 1px ; la barre de titre compacte se matérialise quand le
  grand titre sort de l'écran.
- **Les onglets s'échangent sans transition**, comme sur iOS : un fondu croisé
  superpose deux pages entières et lisibles, et ça se lit mal.
- **Typographie** : tracking négatif sur les gros titres, positif sur le
  micro-texte, chiffres tabulaires partout.

## La couleur d'un programme

Chaque programme prend la première couleur libre parmi les dix ; au-delà de dix,
c'est la moins portée qui repasse. `accent` est stocké comme **index**, jamais
comme hex : c'est pourquoi les six premières couleurs de la liste gardent leur
rang historique — les réordonner repeindrait les programmes existants.

Le même filet relie ensuite le programme à tout ce qui vient de lui : sa carte,
la liste de ses exercices, et chaque ligne d'historique qu'il a produite (par
`programId` ; une entrée manuelle garde un filet neutre, pour que l'alignement
des lignes ne bouge pas).

Une passe de redistribution corrige **une seule fois** les doublons hérités de
l'ancienne app (`wt2-accents-v1`). La relancer à chaque démarrage déferait un
double volontaire — dans l'éditeur, les couleurs déjà portées par un autre
programme s'affichent en retrait, mais rien n'interdit de les reprendre.

## Les graphiques

Chaque graphique est **mono-série**, et c'est un choix mesuré : sur fond sombre,
le vert de l'app et l'orange des records ne se distinguent pas en vision
deutéranope (ΔE 7,1 — sous le seuil de 8 du validateur de palette). Les records
sont donc marqués par un **anneau et une étiquette**, jamais par une deuxième
couleur. Un bouton *Voir les valeurs* affiche le tableau : l'information
n'existe jamais uniquement en image.

## Thème

Deux axes indépendants, dans Réglages → *Apparence*.

- **Le mode** — *Clair* ou *Sombre*, et rien d'autre. Le réglage iOS sert de
  valeur de départ à la première ouverture ; ensuite c'est le choix explicite qui
  commande. Un mode « Système » ne disait rien de plus que le thème qu'il
  choisissait, et laissait l'app changer d'apparence toute seule au coucher du
  soleil.
- **L'accent** — dix teintes. Une seule valeur est stockée par teinte : le haut
  du dégradé, la version texte et les fonds teintés en sont dérivés en
  `color-mix`. Sur fond clair, l'accent en **texte** est assombri à 55 % — sinon
  un jaune ou un cyan passe sous 4:1 de contraste ; les **aplats** gardent la
  couleur pleine, avec une encre claire ou foncée selon la teinte.

Aucune couleur n'est écrite en dur ailleurs que dans les deux blocs de tokens en
haut de `style.css` : c'est ce qui rend les deux thèmes tenables. Les graphiques
sont du SVG — leurs couleurs sont lues au tracé, donc `theme.js` émet
`reps:appearance` et la courbe se redessine.

## Accessibilité

`prefers-reduced-motion` (les ressorts sautent à la cible, plus de lueur),
`prefers-reduced-transparency` (surfaces opaques), `prefers-contrast` (bordures
franches).

## Données

Tout est sous le préfixe **`wt2-`** dans `localStorage` : `wt2-programs`,
`wt2-logs`, `wt2-bodyweight`, `wt2-notes`, `wt2-prs`, `wt2-sessions`.
Les deux apps partagent l'origine `emilerioux.github.io`, donc ce préfixe est
ce qui garantit qu'on n'écrase jamais l'ancienne. Les photos vivent dans une
base IndexedDB séparée (`reps-photos`).

Les préférences d'affichage (`wt2-theme`, `wt2-accent`) vivent **hors** de cet
ensemble : « Tout effacer » vide l'entraînement, pas l'apparence.

## Développement

```bash
cd reps && python3 -m http.server 8811   # puis http://localhost:8811
```

Le service worker **ne s'enregistre pas sur localhost** : il resservirait
l'ancienne version depuis son cache à chaque rechargement.

À chaque déploiement, **bumper `VERSION` dans `sw.js`** et le `?v=N` des
scripts. La coquille (`index.html`) passe par le **réseau d'abord**, le reste
par le cache : sans ça, le nouveau service worker s'installait bien mais la page
affichée restait l'ancienne, et il fallait rouvrir l'app deux ou trois fois pour
voir un changement. Quand le nouveau service worker prend la main, la page se
recharge **une fois**, toute seule. Le nom du cache inclut le chemin de déploiement
(`reps-v6/reps/`, `reps-v6/workout-tracker/`) : les deux adresses partagent
l'origine, donc sans ça l'activation de l'une effacerait le cache de l'autre.

Déployer sur les deux adresses :

```bash
cd reps && git push
cp index.html style.css manifest.json sw.js ../workout-tracker/
cp -R js icons ../workout-tracker/
cd ../workout-tracker && git add -A && git commit -m "Synchro depuis reps" && git push
```

## Fichiers

```
index.html      coquille : onglets, vue poussée, séance, feuilles
style.css       tokens (sombre + clair), matériaux, composants
js/theme.js     mode clair/sombre, dix accents, tokens dérivés
js/motion.js    ressorts, projection, élastique, gestes réutilisables
js/data.js      modèle, stockage wt2-, import/export, photos
js/chart.js     graphiques SVG mono-série avec viseur et infobulle
js/session.js   l'écran de séance
js/views.js     les quatre onglets, navigation, feuilles, sélecteurs
js/app.js       amorçage et câblage
```

## Pas encore fait

Minuterie de repos entre les séries.
