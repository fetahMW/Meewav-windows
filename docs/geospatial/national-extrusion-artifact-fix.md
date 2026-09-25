# National overlay extrusion artifact fix

## Symptom

In `national` mode, large triangular fragments could flash below the map while
the camera was pitched, rotated or moved to a higher altitude.

## Cause

The national runtime rendered the regular polygon fill and a zero-height
`fill-extrusion` for every visible zone at the same elevation. Those coplanar
surfaces competed in the WebGL depth buffer (z-fighting), which became much
more visible while the camera moved.

## Fix

The extrusion layer now starts with an empty zone filter. Its filter is updated
to contain only the currently hovered or selected zone. Inactive zones are
rendered exactly once by the regular fill layer, so there is no hidden
zero-height extrusion surface below them.

The active heights remain state driven and deliberately shallow so the zone
surface never masks native buildings:

- hovered: 0.6 metre;
- selected: 3 metres;
- inactive: absent from the extrusion layer.

## Reproduction and verification

```bash
npm run test:geo
npm run build
```

Visual verification is performed on the isolated national host by opening the
Paris city view, pitching the map, moving it, then zooming out through the
altitude at which the triangular fragments were previously visible.

Rollback this isolated change with:

```bash
git revert <artifact-fix-commit>
```
