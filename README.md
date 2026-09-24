# Epitaph

A companion app for **Epitaph**, a tabletop skirmish game. Build your Unburied,
read their cards at the table, and track a battle without printing anything.

Open it here: **https://<your-username>.github.io/<repo>/**

## What is in here

| file | what it is |
|---|---|
| `index.html` | the app — one file, no build step needed to run it |
| `tools/` | the sources it is assembled from, and the ruleset |

The rules live in `tools/ruleset-0.10.5.json` and nothing about the game is written
anywhere else. The app reads that file and refuses to start if it cannot.

## Rebuilding

```
cd tools
python assemble.py ruleset-0.10.5.json ../index.html
```

© Rhyno Jansen. Epitaph, its rules and this app are original work.
