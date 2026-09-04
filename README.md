# Mes Workouts → Reps

Cette adresse sert désormais **Reps**, la nouvelle app.

- **Dépôt principal :** https://github.com/emilerioux/reps
- **Autre adresse, identique :** https://emilerioux.github.io/reps/

Les deux URL servent la même app et partagent les mêmes données
(même origine `emilerioux.github.io`, clés `localStorage` préfixées `wt2-`).
Cette adresse est conservée pour que l'icône déjà installée sur l'écran
d'accueil continue de fonctionner.

## L'ancienne app

Le code de « Mes Workouts » n'est pas perdu : il vit dans l'historique Git,
jusqu'au commit `02a5b00`. Pour le récupérer :

```bash
git checkout 02a5b00 -- .
```

Ses données sont toujours dans le navigateur, sous les clés `workout-logs`,
`workout-templates`, `bodyweight-logs` et `exercise-notes`. Reps ne les touche
jamais tout seul — l'import se déclenche à la main depuis
**Réglages → Importer depuis Mes Workouts**, et c'est une copie.

Toute modification se fait dans le dépôt `reps`, puis se recopie ici.
