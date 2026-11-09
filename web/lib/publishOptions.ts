// The Drop options (design/v2-prototype wording, 2026-11-09). Music stays
// first — the prototype's list leaves it out only because its music upload
// lived elsewhere.
export const PUBLISH_OPTIONS = [
  { title: "Music", subtitle: "A single, EP or album. Sell it, give it away, or let fans pay what they want.", href: "/publish/music", enabled: true },
  { title: "Beat", subtitle: "Upload a beat or sample pack and set your price.", href: "/publish/beat", enabled: true },
  { title: "Merch", subtitle: "Physical products with stock and shipping.", href: "/publish/merch", enabled: true },
  { title: "Event", subtitle: "Tickets, ticket tiers and promoter links.", href: "/publish/event", enabled: true },
] as const;
