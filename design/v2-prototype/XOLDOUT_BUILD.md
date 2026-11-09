# Xoldout: build notes

A mobile-first prototype of the Xoldout app (Discover, Charts, Socials, Communities, Library, Profile, Drop).
It is a **front-end prototype with stand-in data**. Nothing is saved after a reload, and payments, live
streams, messaging and file storage are simulated. The rules are written as single functions so they can
move to your backend unchanged.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Standalone build. Open it directly, or drop it on Netlify or Vercel. Works offline. |
| `xoldout-discover.jsx` | Source: one React component file (default export `XoldoutDiscover`). Uses Tailwind utility classes and `lucide-react`. |
| `XOLDOUT_BUILD.md` | This document. |

## Get a shareable link

I can't host files. To publish `index.html`:

1. **Netlify Drop:** go to app.netlify.com/drop and drag `index.html` onto the page.
2. **Vercel:** put `index.html` in an empty folder and run `vercel --prod`.
3. Share the new production URL, not an older preview URL. Preview links point to one fixed build.

## Navigation

Bottom bar: **Discover, Socials, Drop (centre button), Library, Profile**.
Discover top tabs: **For You, Following, Charts**.

## What's built

### Discover
- Search bar with live suggestions, per-section categories and shortcut cards (Music, Beats, Events, Merch).
- Dropdown pill that appears on scroll so you can switch sections without scrolling to the top.
- Events shortcuts include Happening Now and Near You.
- For You recommender (follows, likes, plays, genres, recency, de-duplication); Following feed.

### Charts
- Nine sections: Top Sellers, Music Charts, Top Creators, Billboard, Viral, Rising, Trending Events, Trending Beats, Top Merch.
- Separate ranking calculation per chart, configurable weights, time filters (Today, Week, Month, All Time).
- Only verified completed payments count; repeat interactions from one account count once.
- Billboard is paid and labelled Sponsored. It never affects organic rankings.
- Admin panel (admin role only): feature sections, weights, suspicious activity, campaigns.

### Product pages ("See details")
- **Music:** add-ons, tip (artist only), playlist, cart.
- **Beats:** license cards (price, formats, streams, commercial use, monetization, distribution, video, YouTube/social, radio/live, Content ID, duration, credit). Terms are shown before purchase, and a downloadable `.txt` agreement is generated after purchase.
- **Merch:** sizes, colours (image changes with colour), size guide, quantity, stock; digital vs physical chosen first in Drop.
- **Events:** type (in-person, virtual, hybrid), category, venue, organiser, lineup (Xoldout accounts only, clickable, notified), ticket tiers and remaining counts, referral code.
- Add-ons list on every product type.

### Drop (upload)
Beat (license editor), Merch (physical or digital first), Event (lineup search limited to Xoldout accounts, tiers, add-ons).
Organiser tools: sales, attendees with check-in, paid promotions (no tipping).

### Profiles and Link-in-Bio
- Public URL for every user: `xoldout.app/<username>`.
- Artist and regular-user profiles share one layout: cover, avatar, name, handle, bio, location, Follow, Message, Community, Share, social icons.
- **Links:** unlimited, custom titles, platform icons, drag-and-drop or arrow reordering, enable/disable, edit, delete, URL validation.
- **Xoldout products** appear automatically (music, beats, subscription, events, merch, extras attached to releases).
- Owner view: Edit profile, Manage links, Sections, Preview public profile, Share, Wallet, Insights, Settings. Visitors never see these.
- Purchases stay private unless the owner turns on Music library.

### Library and subscriptions
- Tabs: Purchased, Your Playlist, Your Subscriptions, Events (tickets with QR). Cart icon in the header.
- Catalog subscription is **music only**; artists set price and duration. Cancel, resume, expiry and renew all work.

### Community and Memberships
- Lives in **Socials → Communities**; **Community** button beside **Follow** on profiles. Follow, Community and Membership stay separate.
- Telegram-style structure: announcements channel, topic discussions, pinned posts, replies, reactions, media, roles.
- Free, paid and mixed communities; plans with price, cycle (monthly, yearly, one-time), benefits, capacity, approval, auto-renew.
- Membership card (brand colours, layouts, ID, tier, status, dates, **real QR code**). Full-screen view and a shareable preview that hides the QR.
- QR holds only an opaque token URL. Scanning checks the live record: green for active, red for expired, suspended, pending or invalid.
- My Memberships: active, pending, expired; renewals; failed-payment handling; duplicate-payment lock.
- Organizer dashboard: overview, members (approve, reject, suspend, revoke), revenue (gross, platform fee, net), settings (topics, plans, card design, permissions, moderators, rules).
- Platform admin (admin role): all communities, transactions, reports, commission setting.
- First official community: **X Recording Club** (Standard ₦5,000, Premium ₦10,000, Founding ₦3,000 per month).

## Responsiveness

Checked on 9 Nov 2026 in headless Chrome at 320×568, 360×640, 375×667, 390×844, 414×896, 430×932,
768×1024, 1024×768, 1440×900 and 844×390 (phone landscape). Every main screen and owner sheet was opened
at each size: Discover (For You, Following, Charts, Beats, Events, Merch), product details, search,
Socials and Communities, Drop forms, all Library tabs, Profile, Manage links, Edit profile, Wallet,
Insights and Settings.

**Layout model:** on phones (up to 500px wide) the app fills the whole screen. On wider screens it shows
as a 430px phone frame, centred, up to 900px tall.

**Fixed in this pass** (one added `<style id="xo-responsive">` block in `index.html` plus one small tweak; no screens were redesigned):

| Problem | Where | Fix |
| --- | --- | --- |
| Bottom nav needed 336px, so Profile was cut off at 320px | All screens, small phones | Narrower tab buttons below 360px |
| Tapping a half-hidden tab scrolled the whole app 8–17px sideways, and it stayed shifted | 320px, all screens | App frame set to `overflow: clip` |
| "For You" wrapped onto two lines; "Communities" was cut off | Discover and Socials top tabs | Tabs don't wrap; tab rows scroll sideways; smaller tab text below 360px |
| Withdraw button pushed off-screen | Wallet, up to 375px | Text fields in a row may shrink (`min-width: 0`) |
| `100vh` hides the bottom nav behind mobile browser bars | Mobile Safari and Chrome | Uses `100dvh` where supported |
| 900px height cap left a 32px gap below the nav | Tall phones (430×932) | No height cap on phones |
| Phone frame stuck to the top of the window | Tablets and tall desktop windows | Frame centred vertically |
| Bottom nav sat under the iPhone home indicator | iPhones with no home button | Nav padding uses `env(safe-area-inset-bottom)` |
| "WWW" badge text overflowed its square | Manage links | Smaller text for three-letter badges |

**Result:** no element extends past the app frame, nothing scrolls the page sideways, and there are no console errors at any tested size.

**Minor, left as is:** at 320px the "Live now" heading wraps onto two lines, and the ₦ revenue figure in Insights fills its tile edge to edge. Both are still fully readable.

## Backend you still need

All of this is simulated in the prototype and must be enforced server-side:

- Authentication and the signed-in user (`CURRENT_USER`, `ME_ID`) and the admin role.
- Payments: provider checkout, webhook verification, idempotency keys, payouts, platform commission, failed-payment handling.
- Subscription and membership billing jobs (renewals, expiry) using the server clock.
- Community permissions (`topicAccess`), QR verification (`verifyToken`) and plan capacity checks.
- Wallet, withdrawals and tipping; messaging; notifications (lineup tags, renewals, charts).
- File storage for covers, logos, posters, audio previews and downloads; the Go Live player.
- Persistence for profiles, links, products, orders, licenses, stock and ticket counters.

## Verified in a browser

Roughly 100 automated checks passed with no console errors, including:
section search/filters, dropdown navigation, charts and admin, product pages, beat agreement download,
merch variants, Xoldout-only event lineups, Drop forms, profile and links management, community join/pay/card/QR flows,
failed-payment handling, and permission rules for members, expired, suspended, pending and admin users.
Some check-in and QR flows use typed codes instead of camera scanning.
The responsiveness pass above re-ran the screens at ten viewport sizes from 320px to 1440px.

## Known limits

- Everything resets on reload; data is stand-in.
- QR scanning uses a typed code or link. Camera scanning needs a device camera and a scanner library.
- Audio previews are generated tones, not real tracks.
- The Go Live viewer is a stand-in for your existing stream player.
- Safe-area spacing (iPhone notch and home indicator) only applies on a real device. Headless browsers report zero insets, so check it once on an iPhone after deploying.
- The responsive CSS finds the app frame with `#root>div>div`. If you wrap the root component in another element, update those selectors (or move the rules into `xoldout-discover.jsx`).
