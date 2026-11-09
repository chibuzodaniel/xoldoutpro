# XOLDOUT v2 prototype (design reference)

The target design for the v2 rebuild (added 2026-11-09). Built from these two
files only; the prototype's React source (`xoldout-discover.jsx`) is not
available, so the running prototype is the visual spec.

- `index.html` — the standalone prototype. Open it in a browser (phone width,
  e.g. 390×844). Stand-in data; nothing is saved.
- `XOLDOUT_BUILD.md` — the prototype's own notes: screens, features, rules.

Rules for the rebuild (so the live app keeps working):
- Work happens on the `v2-preview` branch (Vercel preview). `main` is
  production and only changes on an explicit production deploy.
- Never change or remove fields an existing API returns — the mobile app
  depends on them. Add new fields and new endpoints instead.
- Migrations only add (tables, nullable columns, enum values). The preview
  and production share one database.
