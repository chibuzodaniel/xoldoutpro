# XOLDOUT — Product Requirements (Revision 3, greenfield build)

**Tagline**: Where music actually sells out
**Building**: new, from scratch
**Market**: Nigeria-first (₦, local bank payout)
**Date**: 2 August 2026

Phase keys: **[MVP]** the first shippable product · **[P2]** follows once the core loop works · **[P3]** later, and only if earlier phases earn it.

> An earlier prototype exists and was walked through on video. This document treats that prototype as *design reference*, not as an inventory. Nothing here assumes existing code.
>
> The HTML edition at `xoldout-prd.html` carries the same content plus screen designs.

---

## 1. The thesis

XOLDOUT is a direct-to-fan marketplace where a music creator sells to their own audience and talks to that audience in the same place. Fans buy, fans own, creators get paid into a local bank account.

That description alone would make it one more storefront. The thing that makes it a product is in the name.

### 1.1 Scarcity is the product

A digital file has no natural scarcity. XOLDOUT deliberately reintroduces it: an artist can cap how many copies of a release exist, and when they are gone, they are gone.

**XOLDOUT only means something if things can actually sell out.** Everything else follows:

- **Limited quantity** makes a release finite
- **Remaining counts** replace sold counts wherever a cap exists, turning a tally into a countdown
- **Gifting** makes a copy transferable, the way a physical ticket or record is
- **Sold-out state persists** and stays visible rather than disappearing, because a sold-out drop is proof, not an error
- **Ownership is permanent**, so what a fan bought cannot be taken back

Streaming services cannot copy this without abandoning their own model. It is the only defensible position available, so it belongs in the MVP.

**Decision**: Limited quantity ships in the MVP. A marketplace named XOLDOUT that cannot sell out has no reason to exist yet.

### 1.2 Money is not the foreground

> "I never wanted it to be moneyful, because I wanted it to be a creative place."
> — Founder, on the prototype walkthrough

**Requirement**: No monetary total appears on Home, Fanbase, Library, or the Profile root. Money lives behind an explicit Wallet destination.

**Naming tension, decided**: "Wallet" is the most money-forward word available, and it sits on the Profile where money is not supposed to be. Keep the word, because it is clear and users know it, but show *no balance figure* at the entry point. The Profile shows a link named Wallet; it does not show ₦412,000.

### 1.3 Units are public, revenue is private

Sold and remaining counts appear everywhere on browsing surfaces. Revenue never does. Price times units is inferable by anyone, and that is acceptable: it is per-product, not per-account, and the urgency it creates is the point.

### 1.4 Identity does not gate capability

Users carry self-assigned tags (Artist, Producer, Manager, Label). Tags describe; they never restrict.

**Requirement**: Tags must never be used as an authorisation check anywhere in the system. Every account can buy and sell from the moment it exists.

---

## 2. Goals and non-goals

### Goals
- An artist can publish a release and take money for it, in Naira, into a Nigerian bank account, without an intermediary
- An artist can cap supply and let scarcity do the marketing
- A fan owns what they buy, permanently, and can play it offline
- An artist owns the relationship with their audience rather than renting it
- The whole thing works on intermittent mobile data on a mid-range Android phone

### Non-goals
- **Not a streaming service.** No all-you-can-eat catalogue, no subscription, no per-stream royalties
- **Not a general social network.** Social surfaces serve selling and fan relationships, not time-on-app
- **Not a distributor.** No delivery to Spotify, Apple Music, or DSPs
- **Not a rights or royalty-splitting system** in early phases. One seller per item
- **Not global at launch.** Naira only, Nigerian payout rails only

**The riskiest assumption** is that fans will pay per item in a market conditioned by free streaming and piracy. Everything else is execution. The MVP must produce a real answer to that question quickly, which is another reason to strip the first release down to the buying loop.

---

## 3. Users

| Role | Description | Primary need |
|---|---|---|
| Creator | Artist, producer, manager, or label operator | Sell without an intermediary, keep the fan relationship, get paid locally |
| Fan | Buyer, follower, community member | Buy directly, own what they buy, hear from artists directly |
| Fanbase admin | Artist or delegate moderating a private group | Approve or reject join requests, moderate |
| Platform moderator | Internal | Work a report queue with an SLA |

One account type. No creator application, no upgrade, no separate signup path.

---

## 4. Scope

Building from scratch means the first question is not what to build but what to leave out.

### 4.1 The one loop that must work

```
creator uploads → fan discovers → fan buys → fan owns and plays → creator withdraws
```

Everything in the MVP serves that loop. Everything that does not, waits.

### 4.2 Phases

| Area | MVP | Phase 2 | Phase 3 |
|---|---|---|---|
| Accounts | Signup, profile, tags, bio, avatar | Cover photo, verification | Teams, delegated admins |
| Publishing | Music only: MP3/WAV, artwork, description, price or free, limited quantity, preview selection, delete | Beats, events | Merchandise, physical fulfilment |
| Discovery | Simple browse: new, trending by units, search, creator pages | Personalised recommendations | Editorial curation |
| Commerce | Buy, own, entitlement, stock decrement, sold-out state | Gifting | Bundles, pre-orders |
| Playback | Full player: seek, repeat, offline, mini player, static lyrics | Animated lyrics | Queues, playlists |
| Library | Purchased, offline downloads | Collections, downloaded beats, pending gifts | — |
| Money | Wallet, balance, withdraw, payout account, basic analytics | Full analytics, sell-through metrics | Scheduled payouts |
| Community | Follow a creator, creator-only announcement posts | Fanbase groups, join requests, polls, comments | Socials feed, Shorts |
| Trust and safety | In-context reporting, basic moderation queue | SLA-backed tooling | Automated screening |
| Onboarding | PWA install guide, taste selection | Improved first-run | — |

**Decision: music only in the MVP.** Beats, events, and merchandise each carry their own commerce model: beats need licence tiers and file delivery, events need ticketing and inventory, merchandise needs physical fulfilment. Each is a separate product. Shipping all four at once quadruples surface area before anything is validated. The four-way publish sheet stays in the design from day one, with the other three visible and marked coming soon.

**Decision: Socials and Shorts are Phase 3.** A public algorithmic feed with photo and video is close to a second product, and short-form video is the most expensive thing on the roadmap: encoding, storage, bandwidth, and moderation load that scales with usage. Neither sells a record.

---

## 5. Information architecture

The full vision has seven top-level candidates for five slots.

### MVP navigation
```
Home  |  Fanbase  |  (+)  |  Library  |  Profile
```

### Target navigation, once Socials and Shorts exist  [P3]
```
Home  |  Shorts  |  (+)  |  Fanbase  |  Library
```

Profile moves to an avatar in the top-right of Home, which is conventional and frees a slot. Home carries Discover and Socials as segmented tabs. Fanbase opens to the list of communities the user has joined.

**Requirement**: Build the MVP tab bar so the Phase 3 shape is reachable without a rewrite. Profile is already accessible from a Home avatar in the MVP even while it also holds a tab, and Fanbase is already a list-of-groups root even when a user follows only one creator.

Wallet, Analytics, Withdraw, and all publishing flows are pushed screens. Never tabs.

---

## 6. Home  [MVP]

Vertically scrolling, sectioned feed. MVP ordering is rule-based, not personalised.

- **Hero release**, one featured item with artwork, title, creator, type, price, remaining or sold count
- **Selling out now**, capped items close to exhausted. This section makes the product's argument and should sit high.
- **New releases**, reverse chronological
- **Trending**, ranked by units sold in a rolling window
- **Creators**, with follower counts in compact form

**Requirement**: Every product card shows price and either sold count or, where a cap exists, **remaining count**. One shared card component handles both states plus sold out.

**Requirement**: A sold-out item stays visible and browsable, clearly marked, with the buy action replaced by a sold-out state. It is never hidden. Proof that things sell out is the marketing.

**Search [MVP]**: across release titles, creator names, and handles. Personalised recommendations wait for Phase 2, when there is purchase history to rank on.

**Note**: Purchase is a far stronger preference signal than a follow or a like, and this product captures it from day one. When recommendations arrive, rank on what a user bought and whose fanbase they joined, not on watch time.

---

## 7. Publishing  [MVP]

The centre (+) opens a sheet titled "What are you publishing?" with four options. In the MVP only the first is enabled.

| Option | Subtitle | Phase |
|---|---|---|
| Upload Music | Single, EP, or album, free or paid | MVP |
| Upload Beat | Beats, sample packs, drum kits, presets | P2 |
| Create Event | Concerts, listening parties, workshops | P2 |
| Add Merchandise | Apparel, posters, digital or physical goods | P3 |

### 7.1 Music upload

| Field | Requirement |
|---|---|
| Audio | Direct MP3 and WAV. Transcode to a streaming format on ingest; retain the original master for any download entitlement. |
| Release type | Single, EP, or album. EPs and albums hold an ordered track list. |
| Artwork | Square. Cropped at selection, resized into a ladder server-side. |
| Description | Free text per release and per track. Searchable. Cap at 2,000 characters. |
| Price | Free or a Naira amount. Free is first class, not a discount. |
| Limited quantity | Optional cap. When set, listings show remaining, and sale hard-stops at zero. |
| Preview length | 30 seconds, 50 seconds, or custom. |
| Preview segment | Artist picks *which part* of the track previews, via a waveform scrubber with a draggable window. |
| Delete | Available on any published item. See the rule below. |

**Decision: delete never removes what a fan bought.** Delete withdraws an item from sale and from every discovery surface. Existing buyers keep their entitlement and their downloaded copy indefinitely. Stripping purchased content would be a refund event and must be treated as one, with money returned. The delete confirmation must say this plainly.

**Requirement**: The waveform scrubber is the only non-trivial UI in the MVP. Generate waveform peak data server-side at ingest and cache it; do not decode the full file in the browser on a mid-range phone.

### 7.2 Limited quantity mechanics

**Requirement**: Stock decrements at successful payment, atomically. Two buyers racing for the last copy must never both succeed. A failed or abandoned payment releases its hold; hold duration in the order of ten minutes.

**Requirement**: Once stock reaches zero the item enters a permanent sold-out state: still visible, still browsable, buy action replaced. An artist cannot raise the cap after publishing, because doing so would make every prior sell-out meaningless.

**Note**: Lowering a cap is different from raising one and should be allowed only down to units already sold. An artist who capped at 500 and sold 60 can cut to 100. They cannot cut to 50.

### 7.3 Gifting  [P2]

A fan buys extra copies as gifts from the Buy action.

- Delivery by claim link, so it works over WhatsApp where this audience already is
- Unclaimed gifts hold stock and expire after a fixed window, returning the unit and refunding the buyer
- Gifted units count toward sold and remaining counts

**Requirement**: A gifted unit decrements stock at purchase, not at claim. Otherwise a limited drop can be silently oversold by gifts nobody has opened.

---

## 8. Commerce and ownership  [MVP]

**Requirement**: A purchase creates an **entitlement**: a permanent, non-expiring right for that account to access that item. Entitlements are never revoked by artist action, only by refund.

**Requirement**: Free items still create entitlements and still appear in the Library. A free release is a sale at ₦0, tracked identically, so unit counts, fan growth, and top-performing lists treat it the same way.

**Payment methods in**: Payout rails are settled. How fans *pay* is an open decision and a significant one here. Support card and bank transfer at minimum via a Nigerian processor; evaluate USSD and wallets against the target audience, since card penetration should not be assumed.

**Refunds**: A refund reverses the entitlement and returns the unit to stock. Define a window; it interacts directly with settlement.

**Platform commission**: Undecided, and the largest commercial unknown in this document. The take rate determines unit economics, pricing guidance, and whether payout fees are absorbed. It needs an answer before the wallet ledger is designed.

**Settlement**: Earnings move from pending to available on a schedule tied to the refund window. The Wallet must show both figures separately and explain the difference plainly, since an artist seeing a number they cannot withdraw will assume something is broken.

---

## 9. Player  [MVP]

The player is where a fan experiences the thing they paid for. A weak player undermines the ownership promise.

| Capability | Requirement | Phase |
|---|---|---|
| Seek | Scrub to any position, draggable handle | MVP |
| Repeat | Cycles off, repeat-all, repeat-one | MVP |
| Mini player | Persists across tabs; artwork, title, artist, play/pause; expands on tap | MVP |
| Offline playback | Purchased audio plays with no network | MVP |
| Static lyrics | Plain scrollable text, optional per release | MVP |
| Animated lyrics | Line-synced highlighting | P2 |
| Queue and playlists | Ordered playback across releases | P3 |

**Requirement**: Seek must respect preview boundaries. A non-buyer scrubbing a preview can move only within the artist-selected window, never outside it.

**Note**: Animated lyrics need per-line timestamps, and nothing in the upload flow captures them. Do not schedule animated lyrics without also scheduling the authoring tool that produces the timings. Static lyrics have no such dependency, which is why they ship first.

**Requirement**: Purchased audio is cached encrypted on device and plays only in-app. Downloadable for offline listening, never exportable as a loose file. This is what separates ownership here from a file locker, and what makes artists willing to sell.

---

## 10. Library  [MVP]

| Tab | Contents | Phase |
|---|---|---|
| Purchased | Every entitlement, playable offline | MVP |
| Collections | User-organised groupings | P2 |
| Downloaded Beats | Beat files, exportable | P2 |
| Gifts | Bought but unclaimed, and received | P2 |

**Requirement**: Downloads are managed. The user can see what is stored on device, how much space it uses, and remove a download without losing the entitlement.

**Note**: Beats behave differently from music, deliberately. Music plays in-app only; beats download as real files because a producer who buys a beat needs to work with it. Design that divergence into the entitlement model from the start rather than retrofitting it, even though beats are Phase 2.

---

## 11. Fanbase

> "Where you and the creators you follow actually talk."
> — From the prototype

### MVP: announcements
A user follows creators. The Fanbase tab shows a chronological feed of posts from followed creators. Creator posts only, text and image, with likes. No member posting, no comments, no groups.

Enough for an artist to tell their audience a drop is live, which is the only community function the buying loop requires.

### Phase 2: groups
Fanbases become closed communities with WhatsApp-like semantics: request to join, artist or admin approval, member participation.

**Requirement**: Per-group settings for visibility (open or request-to-join), who may post (creator only, admins, or all members), and an admin list.

**Requirement**: Default new groups to **creator-only posting**. An artist should opt into moderation load deliberately rather than inherit it the day their group is created.

Also Phase 2: polls with proportional result bars, comments, and the joined-communities list as the tab root.

**Note**: Groups are where moderation cost enters the product. Member-to-member posting brings spam and harassment, and an artist who wanted a mailing list now owns a room they must police. Reporting tooling must exist before groups open.

### Phase 3: Socials and Shorts
A public algorithmic feed open to all creators with text, photo, and short video, plus a separate full-screen Shorts surface.

**Requirement**: Before any Shorts work begins, fix a maximum duration. Encoding ladder, storage cost, preload strategy, and feed pacing all derive from it. Sixty seconds is the common ceiling.

---

## 12. Profile  [MVP]

| Element | Requirement | Phase |
|---|---|---|
| Avatar | Circular, cropped at selection, server-resized | MVP |
| Cover photo | Banner behind the avatar, one fixed aspect ratio across all devices | MVP |
| Handle and display name | Unique handle, editable display name | MVP |
| Bio | Short free text | MVP |
| Tags | Self-assigned, multi-select, open set, never authorising | MVP |
| Catalog | Counts per publish type, linking to management views | MVP |
| Wallet and Analytics | Entry points, no figures shown here | MVP |
| Join requests | Queue for private fanbases | P2 |
| Verification | Badge, criteria to be defined | P2 |

**Requirement**: Enforce one cover aspect ratio everywhere. Crop at selection, never letterbox or stretch at render. Generate a size ladder server-side so a phone on mobile data never pulls a full-resolution banner.

The public creator page is the same object viewed by someone else: cover, avatar, bio, tags, catalog for sale, and a Follow action.

---

## 13. Wallet and Analytics  [MVP]

Two destinations, not one screen with tabs.

| Destination | Answers | Contents |
|---|---|---|
| **Wallet** | How much do I have, and how do I get it out? | Available balance, pending balance, total earned, earned by category, payout history, payout accounts, Withdraw |
| **Analytics** | How is my work performing? | Units sold, sell-through rate, time to sell out, fan growth, returning customers, top products by units |

**Decision**: All currency figures live in Wallet. Analytics carries units, fans, conversion, and retention, and shows no Naira amounts. *Wallet answers what I earned; Analytics answers what happened.* This keeps money consolidated in exactly one place, consistent with §1.2.

### Scarcity metrics
Because supply is capped, this product has metrics a normal storefront does not:

- **Sell-through rate**, units sold against cap
- **Time to sell out**, per release
- **Sell-out rate**, share of capped releases that fully sold

**Requirement**: Ship sell-through and time-to-sell-out in the MVP alongside basic unit counts. They are the feedback loop that teaches an artist how to price and size their next drop. Without them, limited quantity is guesswork.

### Withdraw
**Requirement**: Amount entry with quick-select at 25%, 50%, Max. Destination account with a default. Fee disclosed before confirmation, net receivable always shown. Amount can never exceed available balance.

**Requirement**: Nigerian bank transfer rails. Account verification with name matching at the time an account is added, not at withdrawal time.

---

## 14. Trust and safety  [MVP]

| Type | Urgency | Routing |
|---|---|---|
| Inappropriate content | **Time-critical** | Moderation queue with an SLA. Reachable from the offending item itself. |
| Copyright claim | **Time-critical** | Takedown workflow, distinct from general content reports. |
| Bug report | Normal | Engineering triage, with device, app version, screenshot attached automatically. |
| Feature request | Low | Product backlog. No response SLA implied. |

**Requirement**: Reporting is available in context, as an action on any release, post, comment, or profile. A user who has just seen something harmful will not navigate to a settings menu to report it.

**Note**: Copyright is the specific risk for this product. A marketplace selling music invites someone to upload a record they do not own and take money for it. That is legal exposure, not merely a moderation nuisance, and a takedown path plus a way to reverse the associated payout needs to exist at launch rather than after the first claim arrives.

---

## 15. Data model

```
User ──┬── Profile (handle, name, bio, avatar, cover, tags[])
       ├── PayoutAccount (bank, number, default)         1:n
       ├── WalletLedgerEntry (amount, kind, status)      1:n
       ├── Payout (amount, fee, net, status)             1:n
       ├── Follow ──▶ User                               n:n
       ├── Entitlement ──▶ Product                       1:n
       └── Order ──┬── OrderItem ──▶ Product             1:n
                   └── Payment (processor ref, status)

Product (abstract) ──┬── Release ── Track (order, audio, preview)
                     ├── Beat            [P2]
                     ├── Event           [P2]
                     └── MerchItem       [P3]
   └── StockPolicy (cap, sold, reserved, sold_out_at)

FanbaseGroup ──┬── Membership ──▶ User
               ├── JoinRequest ──▶ User   [P2]
               └── Post ──┬── PostMedia
                          ├── Poll ── PollVote   [P2]
                          └── Comment            [P2]

Report (target_type, target_id, reason, status, sla_due)
```

**Requirement**: **Product is polymorphic from day one**, even though only Release exists in the MVP. Beats, events, and merchandise all become sellable things with prices, stock, and entitlements. Modelling Release as the only sellable type will force a migration later.

**Requirement**: **Money is a ledger, not a balance column.** Every credit, debit, fee, refund, and payout is an immutable entry. Available and pending balances are derived. A mutable balance field cannot be audited and will eventually disagree with reality.

**Requirement**: **StockPolicy is separate from Product** and holds cap, sold, reserved, and a sold-out timestamp. Reserved covers in-flight payments. The timestamp is what makes time-to-sell-out reportable.

**Requirement**: **Entitlement is the source of truth for access**, never the order. Orders can be refunded, split, or gifted; entitlement is the durable fact that this account may play this thing forever.

---

## 16. Technical shape

Not a stack mandate, but the constraints that should drive whatever stack is chosen.

| Area | Constraint |
|---|---|
| Client | Installable PWA. Store distribution is a later decision; an install guide is a launch requirement either way. |
| Offline | Service worker plus encrypted local audio cache. Offline playback is a core promise. |
| Audio pipeline | Accept MP3 and WAV, transcode on ingest, generate waveform peaks, store master separately from streaming rendition. |
| Delivery | Signed, expiring URLs for purchased audio. Never a permanent public link to a paid master. |
| Payments | Nigerian processor with card and bank transfer. Idempotent webhooks; stock decrement transactional with payment confirmation. |
| Payouts | Nigerian bank transfer with account name verification. |
| Concurrency | Stock reservation under contention is the hardest correctness problem in the MVP. Row-level locking or equivalent, with tests that actually race. |
| Media sizes | Image ladders for artwork, avatars, covers. Mid-range Android on intermittent data is the target device. |

**Note**: The single hardest engineering problem in the MVP is selling the last copy exactly once while payment is asynchronous and webhooks can arrive twice or out of order. Design that path first, and write the race tests before the feature.

---

## 17. Non-functional requirements

| Area | Requirement |
|---|---|
| Platform | Mobile-first, portrait, installable PWA. |
| Theme | Dark. Near-black grounds, white serif display type, a single red accent (approximately #E11D2E). |
| Typography | High-contrast serif for headings and monetary values, sans for body and labels. |
| Currency | ₦ symbol, thousands separators, no decimals. Compact form (₦412K) in stat tiles only. |
| Bandwidth | Usable on intermittent mobile data. Aggressive image ladders, lazy loading, optimistic UI. |
| Accessibility | Contrast checked against the dark palette. The red accent must never be the only carrier of meaning, particularly for sold-out state. |
| Auditability | Every money movement traceable to a ledger entry and a processor reference. |

---

## 18. Open decisions

The first four block the MVP itself.

1. **Platform commission** — *blocks MVP*. What take rate? Determines unit economics, pricing guidance, whether payout fees are absorbed, and the shape of the ledger. Needed before money code is written.
2. **Settlement and refund window** — *blocks MVP*. How long do earnings stay pending, and what refund policy are they pending against? One decision, not two.
3. **Payment methods in** — *blocks MVP*. Card only, or card plus transfer plus USSD? Card penetration should not be assumed. Drives processor choice.
4. **Sold-out semantics** — *blocks MVP*. Cap per release or per format? Can an artist run a second pressing under a new listing, and does that undermine the first sell-out?
5. **Free release strategy.** Free items are entitlements at ₦0. Lead generation into the fanbase? Should they be capped too? A limited free drop is an interesting instrument.
6. **Verification criteria.** Who gets a badge, on what evidence, reviewed by whom?
7. **Beat licensing model.** Lease, exclusive, or buyout? Blocks Phase 2 beats and shapes the entitlement model.
8. **Physical fulfilment.** Creator-shipped or platform-shipped? Blocks Phase 3 merchandise entirely.
9. **Currency scope.** Naira only, or multi-currency for diaspora buyers?
10. **Gift claim mechanics.** Link or handle, expiry length, refusal behaviour. Blocks Phase 2 gifting.
11. **Lyrics authoring.** Who produces per-line timings, in what tool? Blocks Phase 2 animated lyrics.
12. **Shorts duration cap.** Blocks all Phase 3 video costing.
13. **Moderation staffing.** Who works the queue, at what hours, with what tooling?

---

## 19. Build plan

### Milestone 1: the spine
1. Accounts, profile, handle, avatar, cover, bio, tags
2. Audio ingest: MP3 and WAV, transcode, waveform peaks, artwork
3. Release model with description, pricing, and StockPolicy
4. Preview length and segment selection with the waveform scrubber

### Milestone 2: the loop closes
5. Payments in, orders, entitlements, transactional stock decrement
6. Library with offline download and encrypted local cache
7. Player: seek, repeat, mini player, static lyrics, preview boundaries
8. Wallet ledger, balances, payout accounts, withdraw

### Milestone 3: it becomes a market
9. Home with new, trending, and selling-out sections, plus search
10. Creator pages and follow
11. Fanbase announcements
12. Analytics with sell-through and time to sell out
13. In-context reporting, moderation queue, copyright takedown
14. PWA install guide and onboarding

**Milestone 2 is the moment the product exists.** Everything before it is scaffolding and everything after it is amplification. If the schedule slips, protect milestone 2 and cut from milestone 3, because a marketplace with a thin browse experience still works if buying works, and the reverse is not true.

**What to measure at launch**: the riskiest assumption is that fans will pay per item. The metric that answers it is conversion from release page view to purchase, segmented by price. Sell-through on capped releases answers whether scarcity is doing any work. Instrument both before launch, not after.

---

## 20. Build prompt

A self-contained brief to hand to a coding agent when you are ready to start. It points at this document, fixes scope to the MVP core loop, and forces the blocking questions to be answered before any code is written.

Run it from the directory containing `xoldout-prd.md`.

````
You are building XOLDOUT, a direct-to-fan music marketplace, from scratch.

Read `xoldout-prd.md` in this directory in full before doing anything else. It is the
source of truth for product scope, phasing, invariants, and terminology. Where this
prompt and the PRD appear to disagree, stop and ask me rather than guessing.

═══════════════════════════════════════════════════════════════════════
WHAT YOU ARE BUILDING
═══════════════════════════════════════════════════════════════════════

Milestones 1 and 2 of the MVP, as defined in PRD section 19. That is the core loop
and nothing else:

    creator uploads → fan discovers → fan buys → fan owns and plays → creator withdraws

Concretely, in scope:
  • Accounts, profile (handle, display name, bio, avatar, cover photo, tags)
  • Music upload: MP3 and WAV ingest, transcode, artwork, description,
    free-or-paid pricing, limited quantity, preview length AND segment selection
  • Purchase, entitlement, atomic stock decrement, permanent sold-out state
  • Library with managed offline downloads and encrypted local cache
  • Player: seek, repeat, mini player with artwork, static lyrics, preview boundaries
  • Wallet: ledger, available vs pending balance, payout accounts, withdraw
  • Enough of Home to find and buy something: new releases, selling-out, search

Explicitly NOT in scope, do not build or scaffold these:
  • Beats, events, merchandise (PRD phases 2 and 3)
  • Socials feed, Shorts, fanbase groups, polls, comments, join requests
  • Gifting, collections, animated lyrics, personalised recommendations
  • Verification badges, teams, delegated admins

The publish sheet shows all four publish types with three marked "Coming soon"
(PRD section 7). Show them. Do not implement them.

═══════════════════════════════════════════════════════════════════════
BEFORE YOU WRITE ANY CODE: ASK ME THESE
═══════════════════════════════════════════════════════════════════════

Ask all of the below in ONE pass, grouped as shown, with your recommended default
for each so I can reply "defaults except 3 and 7". Do not trickle them out one at
a time across the session.

Do not begin implementation until the BLOCKING set is answered. For the
SHOULD-KNOW set, if I skip a question, proceed with your recommended default and
record it in DECISIONS.md with the date and the reasoning.

── BLOCKING ─────────────────────────────────────────────────────────

 1. Platform commission. What take rate does XOLDOUT charge on a sale, and is the
    withdrawal fee absorbed or passed to the artist? This shapes the ledger, so it
    cannot be retrofitted cleanly.

 2. Settlement and refund window. How long do earnings stay pending before becoming
    withdrawable, and what is the refund policy they are pending against? One
    decision, not two.

 3. Payment processor and methods in. Paystack or Flutterwave or other? Card only,
    or card plus bank transfer plus USSD? Do not assume card penetration for this
    audience.

 4. Sold-out semantics. Is the quantity cap per release or per format? May an artist
    run a second pressing as a new listing, and if so does that undermine the first
    sell-out? PRD section 7.2 sets the rules for raising and lowering caps; confirm
    them.

 5. Authentication. Phone number with OTP, email and password, or social sign-in?
    Phone-first is common in this market and affects the whole onboarding flow.

 6. Stack and hosting. If you have no preference I will propose one and wait for
    your yes before scaffolding. Tell me any hard constraints: existing infra,
    a team's language, a hosting account already paid for, data-residency needs.

── SHOULD KNOW (defaults are fine if you skip) ──────────────────────

 7. Money representation. Store Naira in minor units (kobo) as integers?
 8. Are free releases allowed to carry a quantity cap? A limited free drop is an
    interesting instrument but adds a state to reason about.
 9. Default preview length when an artist does not choose. PRD offers 30s, 50s,
    custom.
10. Pricing granularity: per release only, or also per track within an EP/album?
11. Upload limits: max file size, max tracks per release, accepted sample rates.
12. Repo. New repo or existing one, and where should I create it?
13. Brand assets. Do you have a logo, typeface licence, or Figma file, or should I
    build from the reconstructed screens in xoldout-prd.html?
14. Environments. Is there a staging environment, or local plus production only?

═══════════════════════════════════════════════════════════════════════
ENGINEERING INVARIANTS
═══════════════════════════════════════════════════════════════════════

These come from PRD sections 15 and 16. Do not negotiate them away for speed. If
you believe one is wrong, argue it explicitly rather than quietly departing from it.

  • MONEY IS A LEDGER, NOT A BALANCE COLUMN. Every credit, debit, fee, refund and
    payout is an immutable entry. Available and pending balances are derived.

  • PRODUCT IS POLYMORPHIC FROM DAY ONE, even though only Release exists now.
    Beats, events and merch become sellable things later. Do not model Release as
    the only sellable type.

  • ENTITLEMENT IS THE SOURCE OF TRUTH FOR ACCESS, never the order. Orders get
    refunded, split and gifted; entitlement is the durable fact.

  • STOCK DECREMENT IS ATOMIC WITH PAYMENT CONFIRMATION. Two buyers racing for the
    last copy must never both succeed. Write the race tests BEFORE the feature.
    This is the hardest correctness problem in the MVP; design it first.

  • WEBHOOKS ARE IDEMPOTENT. They arrive twice and out of order. Assume it.

  • PAID AUDIO IS SERVED BY SIGNED, EXPIRING URLS. Never a permanent public link
    to a master.

  • DELETE NEVER STRIPS A PURCHASE. Delete withdraws from sale and discovery;
    existing buyers keep entitlement and downloads forever. Removing purchased
    content is a refund event and must move money.

  • OFFLINE PLAYBACK IS A CORE PROMISE. Encrypted local cache, in-app only, never
    exportable as a loose file.

  • TARGET DEVICE is a mid-range Android phone on intermittent mobile data.
    Waveform peaks are generated server-side, images ship as size ladders.

═══════════════════════════════════════════════════════════════════════
HOW TO WORK
═══════════════════════════════════════════════════════════════════════

 1. Ask the questions above. Wait.
 2. Propose architecture and the full data schema. Wait for my approval before
    scaffolding anything.
 3. Build milestone 1 (accounts, upload, release model, preview scrubber).
    Checkpoint with me.
 4. Build milestone 2 (payments, entitlements, library, player, wallet, withdraw).
    Checkpoint with me.
 5. Only then touch milestone 3 items.

Along the way:
  • Keep DECISIONS.md at the repo root: every assumption you made, what you chose,
    and why. One line each.
  • Keep a running list of anything in the PRD you found underspecified.
  • Tests: the stock race, ledger arithmetic, entitlement after refund, and preview
    boundary enforcement are the four that matter most. Do not skip them.
  • Ask before anything irreversible: creating cloud resources that cost money,
    registering domains, pushing to a public remote, or touching production keys.
  • Tell me plainly when something is not working. Do not report a milestone as done
    if a test is failing or a path is stubbed.

═══════════════════════════════════════════════════════════════════════
DONE WHEN
═══════════════════════════════════════════════════════════════════════

On a clean environment I can:
  1. Create an account and set up a profile
  2. Upload a WAV, set artwork, a description, a price, a cap of 3, and choose a
     30-second preview from the middle of the track
  3. From a second account, find that release, hear exactly that preview and not a
     second more, and buy it
  4. Play it, go offline, and still play it
  5. Buy from a third account, then watch a fourth account fail to buy the sold-out
     item cleanly, with stock never going negative under concurrent attempts
  6. As the artist, see the sale in Wallet, see pending become available, and
     withdraw to a bank account
````

**One caveat worth setting expectations on**: questions 1 through 3 are commercial decisions, not engineering ones. No agent can pick a take rate or a payment processor for you, and getting them wrong is expensive to unwind because the ledger is built around them. If you want to shorten the loop later, deciding those three now is the single highest-leverage thing you can do before starting.

---

## Appendix: provenance

**Revision 3**, rewritten as a greenfield build specification. Revisions 1 and 2 documented an existing prototype and proposed changes to it; this revision assumes no existing code.

Two sources fed it: a 54-second narrated walkthrough of an earlier prototype, and a written brief of next features and improvements. Direct quotes are marked. Screen copy, values, and layout patterns from the walkthrough are used as design reference for the target product.

Phase assignments, the MVP cut, the data model, the technical constraints, the build plan, and every decision block are recommendations rather than observations. The most consequential is the decision to ship music only in the MVP and defer beats, events, and merchandise, which narrows the original four-way scope considerably. That is a proposal and should be challenged if the commercial case demands otherwise.
