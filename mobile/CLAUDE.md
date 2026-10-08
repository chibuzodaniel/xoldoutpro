@AGENTS.md

# Vercel CPU budget — every change must keep this low

Production runs on Vercel **Hobby**: 4h of Fluid Active CPU per month. In October 2026 it hit 4h 13m / 4h (everything else was far under its limit: 146K/1M invocations, 274K/1M CDN requests), so the project risks being paused. CPU time is the only limit that runs out, so every code change or edit should try to lower it, not just avoid raising it.

When writing or editing code:

- **Polling:** don't add a new timed fetch. Piggyback on an existing poll (e.g. `GET /api/messages/latest`, 30s) or push the update over LiveKit data (`publishLiveEvent`) and refetch once on the event. If a poll is unavoidable, use 30s or more, or 5s only while a chat or Live is open on screen. Stop polling when the tab is hidden (`document.visibilityState`) or the app is backgrounded (`AppState`).
- **Queries:** nothing that is polled or rendered on every page may run N+1 queries. Use one `groupBy`, aggregate or `$queryRaw` and `select` only the columns needed. Run independent queries with `Promise.all`.
- **Rendering:** prefer static or cached pages (`revalidate`, `unstable_cache`/`"use cache"`) over per-request SSR for public pages. Don't `router.refresh()` on a timer.
- **Auth:** don't call token-verified endpoints when the result isn't shown (closed sheets, hidden tabs, logged-out users).
- **Work in requests:** move heavy or batch work into the daily crons, not into user requests. Make lazy "settle on read" checks cheap (index-backed, one row).
- **Images:** use `next/image` only where resizing helps. Static icons and avatars that are already small can use a plain `<img>` so they don't count against Image Optimization.
- **When fixing anything nearby:** if you touch a file that polls fast, refreshes on a timer or loops queries, fix it in the same change and mention it.
- **If a feature needs true real-time:** say so and suggest LiveKit data, a websocket service or Vercel Pro, rather than quietly adding a fast poll.
