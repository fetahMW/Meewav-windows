# Map Mechanics Snapshot

Date: 2026-06-24

Commit hash when visually validated: pending

Branch: map-mechanics-reset

Mode: `MAP_MECHANICS_ONLY = true`

## Validated Scope

- Globe, country, city, commune and subzone camera mechanics only.
- Avatar canvas, avatar source, avatar layers, avatar image preload and avatar layout are disabled upstream.
- France search index is lazy-loaded on search focus/change/submit only.
- `Survol drone` is removed from the visible UX.
- Runtime check on local Vite: `http://127.0.0.1:5173/globe?mapMechanicsOnly=1`.

## Required Scenarios

- Globe startup, rotate, zoom, pitch, no freeze.
- France to Paris, Nice, Marseille, Lyon.
- Paris to Nice, Nice to Paris, Paris to Marseille, Marseille to Lyon, Lyon to Paris, Paris to Nantes, Nantes to Lille.
- Paris to Montreuil, Saint-Denis, Pantin, Aubervilliers, then Ville return.
- Montreuil to Bas-Montreuil and Croix-de-Chavaux.
- Saint-Denis to Pleyel and La Plaine Saint-Denis.
- Belleville to Couronnes.

## Camera Reference

- City to city uses `CITY_CAMERA_PRESETS` from `flyMechanicsReference.ts`.
- A fly must move the camera only. No avatar recalculation, heavy DOM scan, global zone recalculation or large `setData` is allowed during the fly.

## FPS Notes

- 2026-06-24 local headless Edge / 1440x1000 / Vite dev server.
- Paris to Nice: 32.5 FPS over 4215.7 ms, 2 RAF gaps above 50 ms, max gap 283.3 ms.
- Nice to Paris: 25.0 FPS over 4235.2 ms, 10 RAF gaps above 50 ms, max gap 200.1 ms.
- Runtime confirmed: `AVATARS 0`, no canvas avatar DOM, no `meewav-avatars` source, no `meewav-avatar-*` layers.
- Startup requests confirmed: no `/search/france-communes-index.json`, no avatar GeoJSON, no avatar images.

## Known Bugs

- Commune/subzone product labels still depend on available non-avatar map data in this base branch.
- Dedicated host marker / Ma position is intentionally not implemented in this pass.

## Do Not Break

- `AVATARS` HUD count must stay `0`.
- Canvas Avatar must stay absent from DOM.
- `meewav-avatars` source must stay absent.
- `meewav-avatar-*` layers must stay absent.
- No `querySelectorAll("body *")` during premium fly.
- No startup load of `/search/france-communes-index.json`.
