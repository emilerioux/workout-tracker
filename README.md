# Workouts

Suivi d'entraînement en musculation. PWA, hors ligne, données locales.

**Deux adresses, la même app :**
- https://emilerioux.github.io/reps/
- https://emilerioux.github.io/workout-tracker/ — l'ancienne adresse de
  *Mes Workouts*, conservée pour que l'icône déjà installée sur l'écran
  d'accueil continue de fonctionner.

Même origine, donc **mêmes données** des deux côtés. Le dépôt `reps` est la
source ; `workout-tracker` en reçoit une copie à chaque déploiement.

L'app s'est appelée **Reps** jusqu'en septembre 2026. Les dépôts, les
adresses et la base de photos (`reps-photos`) gardent ce nom : le
renommer casserait l'icône déjà posée sur l'écran d'accueil et
orphelinerait les photos. Seul le nom affiché change.

Cette app remplace *Mes Workouts*. Le code de l'ancienne vit dans l'historique
Git du dépôt `workout-tracker` (commit `02a5b00`), et ses données sont toujours
dans le navigateur. On ne les lit que sur demande explicite, depuis
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

## La fiche d'exercice

Une seule feuille pour modifier un exercice, d'où qu'on vienne
(`js/fiche.js`) : l'éditeur de programme, le menu ⋯ en séance, une
entrée d'historique (corriger ou ajouter), Réglages → Mes exercices.
Toujours le même ordre :

1. **Étiquette** — ce qu'on modifie : *Dans « Push »*, *Cette séance
   seulement*, *Entrée · jeudi 1 octobre*, *Mes exercices*…
2. **Nom** — avec un chevron quand on peut le changer.
3. **Ce qui ne vaut qu'ici** — séries, reps, poids, durée.
4. **L'exercice — partout** — muscle, note et vidéo, en rangées qui
   se déplient.
5. **Actions de l'endroit** (passer, remplacer, historique…).
6. **Enregistrer**, vert, toujours en bas ; l'action destructive
   (retirer, supprimer) en texte rouge discret dessous.

Rien ne s'écrit avant *Enregistrer* ; une action (passer, remplacer…)
enregistre d'abord ce qui a été changé. Les chiffres sont des − / +
qu'on peut toucher pour taper au clavier. Les reps d'un programme
acceptent une fourchette (« 8-10 ») : le − / + décale les deux bornes.

L'éditeur de programme demande avant de quitter s'il y a des
changements non enregistrés (flèche retour ou glissé depuis le bord).

## Modifier une séance en cours

Le bouton **⋯** en haut à droite de la séance ouvre une feuille sur
l'exercice affiché (dans un superset, on choisit A1, A2… en haut).
Tout ce qui s'y change ne vaut **que pour aujourd'hui** : le programme
ne bouge pas.

- **Séries − / +** — jamais sous le nombre de séries déjà faites.
- **Remplacer** — seulement tant qu'aucune série n'est validée.
- **Passer** — l'exercice ne compte plus ; les séries déjà faites sont
  gardées. Une ligne « passé aujourd'hui · Reprendre » reste sur la
  carte : passer n'est jamais définitif.
- **Note technique** — la note permanente de l'exercice, affichée sur
  sa carte à chaque séance (la même que dans Réglages).
- **Ajouter un exercice** — musculation ou cardio, avec une case pour
  le garder aussi dans le programme.

Un exercice déjà écrit dans l'historique qui reçoit une série de plus
**réécrit** son entrée (`updateLog`), il n'en crée pas une deuxième.

**Note de séance** : un champ dans la feuille de fin. Elle s'affiche
dans l'Historique sous la journée ; la toucher permet de la corriger ou
de la supprimer.

**Suggestion de progression.** Même poids aux 3 dernières séances d'un
exercice → une bulle sur la carte (« 3 séances de suite à 135 lb — essaie
140 aujourd'hui ? »). Rien ne change tant qu'on ne touche pas *Essayer* ;
*Pas aujourd'hui* la fait disparaître. Le pas est de 5 lb dès 100 lb,
2,5 lb en dessous.

**Historique d'un exercice** — menu ⋯ en séance, ou *Toutes les séances*
sous la courbe de Progrès : chaque séance, série par série. L'anneau
« record » ne marque qu'une série, la première à avoir atteint le record.

**Le X ne termine rien tout seul.** Il ouvre le bilan ; seule
*Terminer la séance* ferme la séance. Toucher en haut, glisser la
feuille vers le bas ou *Continuer la séance* y ramène, chrono compris.
Sans aucune série validée, le X demande avant de quitter.

**Reprendre une séance.** Tout l'état de la séance est recopié dans
`wt2-live-session` à chaque changement. Si l'app se ferme en plein milieu,
la rouvrir y ramène (jusqu'à 6 h plus tard). Effacé en fermant la séance.

**Séance libre** (Programmes → *Séance libre*) : une séance sans programme,
les exercices s'ajoutent au fil de l'eau. À la fin, *Enregistrer cette séance
comme programme* garde les exercices faits et rattache les entrées au
nouveau programme.

**Vidéo de technique** : un lien (YouTube, TikTok…) par exercice, depuis le
menu ⋯ → *Note et vidéo de technique* ou Réglages → Gérer mes exercices
(`wt2-links`). Il s'affiche sur la carte en séance.

**Sélecteur d'exercice filtré** : en ajoutant un cardio on ne voit que le
cardio, et inversement ; un nom qui existe déjà de l'autre type n'est pas
recréé.

## Autres outils

- **Objectifs** (Programmes) — un poids à atteindre (le record), un nombre
  de reps en une série (à un poids minimum ou à n'importe quel poids), une
  distance/durée en cardio (la meilleure séance), ou un poids corporel à
  atteindre, en montant ou en descendant (la dernière pesée), avec date
  facultative. Ce qui reste s'affiche sur la carte de l'exercice en séance
  et suit les séries validées.
  Barre de progression depuis le niveau au moment de le fixer ; bandeau
  « Objectif atteint » en séance, toast ailleurs (`wt2-goals`).
- **Jalons** — 21 paliers (séances, semaines d'affilée, volume, km et heures
  de cardio), calculés depuis l'historique. Seul ce qui a été fêté est
  retenu (`wt2-badges-seen`) ; au premier lancement, les jalons déjà acquis
  sont notés sans fête.

- **Récap du mois** (Programmes) — séances, volume, cardio comparés au mois
  d'avant, records battus, objectifs atteints et séries par muscle ; les
  flèches changent de mois. Tout est recalculé depuis l'historique.
- **1RM estimé** (Progrès → Exercices) — la meilleure série de chaque séance
  ramenée à une rep (Epley), pour comparer des séries de poids et de reps
  différents. Rien pour une série sans poids.
- **Bilan de la semaine** (haut de Programmes) — séances, volume et
  minutes de cardio du lundi à aujourd'hui, avec l'écart face à la
  semaine passée, en encre neutre (un « −2 » n'est pas une faute).
- **Rappel de sauvegarde** — 30 jours sans export (ou jamais, après deux
  semaines d'historique) : une carte propose d'exporter. *Plus tard*
  repousse d'une semaine. Date du dernier export : `wt2-last-export`.
- **Séries par muscle** (Progrès → Muscles) — cette semaine ou 4
  semaines, comparé à la période d'avant. Le muscle est deviné d'après
  le nom (`guessMuscle`, FR et EN) et se corrige en touchant un muscle,
  ou dans Réglages → Gérer mes exercices (`wt2-muscles`). Ordre fixe des
  muscles, et un muscle à zéro reste affiché : c'est lui qu'on cherche.
- **Corriger une entrée** — toucher une ligne de l'Historique : date,
  séries une par une (ajouter/retirer), ou les champs du cardio. Le
  record est recalculé, il peut aussi baisser (`editLog`).
- **Dupliquer un programme** — dans sa fiche ; la copie prend sa propre
  couleur et s'ouvre dans l'éditeur.
- **Programmes livrés** — `GIFTS` dans `data.js` : un programme préparé
  hors de l'app (avec ses notes et muscles) arrive au prochain lancement
  après un déploiement. Ajouté une seule fois par appareil (`wt2-gifts`),
  donc le supprimer ne le fait pas revenir ; notes et muscles déjà choisis
  ne sont jamais écrasés. Livrés : « Muscles oubliés » (2026-10-02), « Bras » (2026-10-04), « Dos & Pecs » (2026-10-12),
  puis le **Bloc 1 « Fondations 5 jours »** du coach (2026-11-02 : Push, Pull, Legs, Upper, Lower, 6 semaines).

## Les blocs du coach

Tous les 6 à 8 semaines, Claude (skill `/coach`, dans `.claude/skills/coach/`)
prépare un **bloc** : plusieurs programmes en rotation (A → B → C, pas de
jours fixes), un plan semaine par semaine pour chaque exercice, et des
objectifs proposés. La boucle :

1. **Le bloc arrive** comme un programme livré : une entrée de `GIFTS` avec
   un champ `block` et une liste `programs` (`addBlockGift`). Carte
   « Nouveau bloc du coach » en haut de Programmes ; le compteur ne part
   qu'au toucher de **Commencer le bloc** (`start`). Le bloc d'avant est
   alors rangé (`endedAt`), jamais effacé.
2. **Pendant le bloc** — la carte dit « Bloc 2 · semaine 4 sur 6 », une case
   par semaine, et la **Prochaine séance** de la rotation. En séance, les
   séries et les reps de départ sont celles de la semaine (`e.weeks`), avec
   la consigne du coach sous le titre ; tout reste ajustable. Les exercices
   ajoutés par le coach portent « Nouveau ».
3. **Objectifs proposés** — Accepter les place dans les objectifs, partis du
   niveau actuel (`deadline: "bloc"` = fin du bloc). Non merci les écarte.
4. **Changer un exercice** — dans l'éditeur, ou en séance via ⋯ → Remplacer →
   *Pour le reste du bloc*. Le plan suit le nouvel exercice ; changer soi-même
   les séries ou les reps le remplace. Chaque remplacement ou retrait est noté
   dans `swaps` : le coach ne le repropose pas.
5. **Fin du bloc** — la carte invite à **Envoyer au coach** : un JSON
   (`coachPayload` : bilan, programmes, logs du bloc, exercices favoris,
   remplacements) part par la feuille de partage iOS, ou se télécharge. Sans
   bloc, Réglages → Coach envoie tout l'historique pour préparer le premier.

**Mes blocs** (bas de la liste, ou Réglages → Coach) range tous les blocs,
avec leurs dates, programmes et bilan (régularité par semaine, records, plus
gros progrès en 1RM estimé, exercices qui stagnent, séries par muscle par
semaine, exercices changés). Les programmes d'un bloc terminé n'encombrent
plus la liste principale. Données : `wt2-blocks`.

**Semaines chargées à l'école** — le coach marque d'avance les semaines
d'examens (`block.light`, d'après le calendrier) ; la carte du bloc a aussi un
bouton « Semaine chargée » / « Pas cette semaine » (`lightMarks`, par lundi).
Cette semaine-là, « Commencer » propose **séance courte ou complète** : la
courte saute les accessoires (`opt: true`, sinon garde les 3 premiers) et
enlève une série partout (`shortVersion`). Rien n'est imposé.
`syncBlockGifts()` ajoute ces champs à un bloc déjà reçu sans toucher au reste.

**Extras de fin de séance** — une séance finie propose « Un petit extra ? » :
ses programmes d'abdos et ses cardios habituels (`extraOptions`). Un toucher
les ajoute au bout de la séance, facultatifs.

**Doublons** — Réglages → Gérer mes exercices repère les noms du même
mouvement (« Pull-ups » / « Pull Ups », `similarExercises`) et les fusionne
(`mergeExercises` : historique, records, objectifs, programmes). « Fusionner
deux exercices » pour les autres ; « Ce ne sont pas les mêmes » → `wt2-not-dupes`.

**Carte du corps** — Progrès → Muscles, sous les barres : silhouette devant /
dos (`renderBodyMap`), les mêmes séries par muscle en 5 marches d'une seule
teinte (0, 1–3, 4–7, 8–11, 12+ par semaine ; moyenne par semaine sur 4 sem.).
Un muscle à 0 reste gris. Toucher une zone ouvre le même détail que la barre.

**Ordre des objectifs** — bouton « Ordre » sur la carte Objectifs : poignées à
glisser, le plus important en haut (l'ordre de `DB.goals`).

> Un bloc livré par `GIFTS` est dans le code, donc public sur GitHub — jamais
> d'objectif de poids corporel dedans.

## Le cardio

Un exercice porte `kind: "cardio"` (dans le programme comme dans
l'historique). Pas de poids ni de reps : **durée** (obligatoire),
**distance** et **calories** (facultatives), **intensité** Facile /
Modéré / Intense. En séance il a sa propre carte avec des champs à
taper ; il ne s'enchaîne jamais en superset. Il n'entre ni dans les
records ni dans le volume en lb. Dans Progrès, l'interrupteur
Poids/Reps devient Durée/Distance. Entrée manuelle : Historique →
*Ajouter une entrée* → Cardio.

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

La courbe est **lisse mais monotone** (Fritsch–Carlson, `smoothPath`) : arrondie,
elle ne dépasse jamais un point, donc pas de faux pic au-dessus d'un record.
L'échelle garde ~12 % d'air en haut et en bas. Au-delà de 12 séances, seuls les
records et le dernier point gardent leur pastille. La dernière valeur est dans
une pastille placée au-dessus de toute la courbe qu'elle couvre. Le tracé se
dessine à l'apparition (une fois par série, jamais avec « réduire les
animations »).

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
`wt2-logs`, `wt2-bodyweight`, `wt2-notes`, `wt2-prs`, `wt2-sessions`,
`wt2-journal` (notes de séance), `wt2-muscles`, `wt2-goals`, `wt2-links`, `wt2-blocks` (blocs du coach), `wt2-badges-seen`, `wt2-live-session` (séance en cours).
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
js/fiche.js     la fiche d'exercice commune : − / + tapables, « partout »
js/session.js   l'écran de séance
js/views.js     les quatre onglets, navigation, feuilles, sélecteurs
js/app.js       amorçage et câblage
icons/icon.svg  la source de l'icône — les PNG en sont des rendus
```

## L'icône

Un haltère chargé, à plat et symétrique, sur un noir légèrement
verdi. Le choix de la mise à plat est un choix de lisibilité : sur
l'écran d'accueil l'icône fait 60 px, et à cette taille les trois
barres horizontales d'avant se lisaient comme un menu hamburger.
Tout est dessiné pour tenir jusqu'à 38 px — deux plaques par côté,
pas quatre, et une ombre portée qui décolle les plaques de la barre.

`icons/icon.svg` est la source ; les PNG (180, 192, 512) en sont des
rendus. Le 512 maskable existe en double, motif à 76 %, parce
qu'Android rogne dans un cercle inscrit et mangerait les colliers
extérieurs.

**La couleur est figée.** Elle ne suit pas l'accent des Réglages :
iOS lit `apple-touch-icon` une seule fois, à l'ajout à l'écran
d'accueil, et l'API qui change l'icône d'une app est réservée au
natif. Changer de couleur veut dire regénérer les PNG, puis retirer
et rajouter l'app à l'écran d'accueil.

## Pas encore fait

Minuterie de repos entre les séries.
