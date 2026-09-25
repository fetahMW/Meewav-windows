# Mon Globe Canonical Map

`Mon Globe` is the only canonical Meewav map experience.

When a user, product note, or AI agent says `ouvre mon globe`, it means:

```txt
Open the React route /globe.
Render src/features/globe/MonGlobe.tsx.
MonGlobe renders src/features/globe/components/GlobeMapV2.tsx.
```

Do not route users to old map experiments, task globe prototypes, cartoon globe pages, overlay tests, MVT test pages, or legacy globe variants.

Deprecated map routes must redirect to `/globe`. Current deprecated routes are defined in:

```txt
src/features/globe/monGlobeContract.ts
```

Rules for future work:

- `Mon Globe` is the reference map.
- `/globe` is the canonical URL.
- `/mon-globe`, `/monglobe`, `/mon_globe`, and `/my-globe` are aliases that redirect to `/globe`.
- Any unknown route redirects to `/globe`, except explicit non-map product routes such as `/auth`.
- Do not introduce a second full map entry point without explicit user approval.
- Do not re-enable legacy map routes; add them to `DEPRECATED_MAP_ROUTES` instead.
- If an AI agent is asked to `ouvrir mon globe`, it should use `/globe`.
