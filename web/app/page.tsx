import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./landing.css";
import { Art } from "@/components/landing/Illustrations";
import { AuthButton, ChartPills, EarnExplorer, LandingAuthProvider, PhonePreview, SectionLink } from "@/components/landing/LandingClient";

// The landing page (xoldout-mockup.html, explicit ask 2026-11-16). "/" used to
// redirect to /discover; it now explains XOLDOUT and signs people in or up in
// a dialog. The installed app still opens on /discover (public/manifest.json
// start_url), and every other link is unchanged. Static: prerendered once at
// build, no server work per visit (web/CLAUDE.md CPU budget). Styles are in
// app/landing.css, all scoped under .xl so nothing leaks into the app.

const fraunces = Fraunces({ subsets: ["latin"], axes: ["opsz"], variable: "--font-fraunces", display: "swap" });
const instrument = Instrument_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-instrument", display: "swap" });

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Xoldout | Music. Culture. Connected.",
  description:
    "Xoldout is where independent artists sell music, beats, tickets and merch, go live for fans, and run communities. The D2C social network of the independent industry and creator economy.",
  openGraph: {
    title: "Xoldout | Music. Culture. Connected.",
    description: "Independent artists sell music, beats, tickets and merch, go live for fans, and run communities.",
    url: "/",
    siteName: "XOLDOUT",
    images: [{ url: "/xoldout-icon.jpeg" }],
  },
};

const NAV = [
  ["#about", "What it is"],
  ["#sell", "Start selling"],
  ["#earn", "Ways to earn"],
  ["#strategies", "Strategies"],
  ["#features", "All features"],
  ["#faq", "FAQ"],
] as const;

const TABROWS: [string, React.ReactNode, boolean?][] = [
  [
    "Discover",
    <>
      Your home feed. Switch between <strong>For You</strong>, <strong>Following</strong> and <strong>Charts</strong>. Browse Music, Beats, Events and Merch, each with its own search, categories and shortcuts.
    </>,
  ],
  [
    "Socials",
    <>
      Post text and photos, share songs, beats, events and merch as preview cards, watch <strong>Go Live</strong> streams, find creators, and join communities.
    </>,
  ],
  [
    "Drop",
    <>
      The red button in the middle. This is where artists <strong>upload</strong> music, beats, events and merch.
    </>,
    true,
  ],
  [
    "Library",
    <>
      Everything you own. Tabs for <strong>Purchased</strong>, <strong>Your Playlist</strong>, <strong>Your Subscriptions</strong> and <strong>Events</strong>, plus your cart.
    </>,
  ],
  [
    "Profile",
    <>
      Your public page, with Music, Events and Merch tabs. Privately, you also get a <strong>Wallet</strong>, <strong>Insights</strong> and <strong>Settings</strong>.
    </>,
  ],
];

const STEPS = [
  ["Create your account", "Use Google or your email. No long forms, and it takes a few seconds."],
  ["Build your profile", "Add a cover image, profile photo, name, handle and tagline. Verified accounts get a badge."],
  ["Tap Drop", "Pick Music, Beat, Event or Merch. Set your own prices, add details, and publish."],
  ["Share and track", "Post a preview card to Socials, then watch your numbers in Insights and your balance in Wallet."],
];

const LAUNCH = [
  ["Drop it", "Upload the song and attach a bonus item."],
  ["Post a preview", "Share a preview card on Socials."],
  ["Go live", "Talk to fans while it’s fresh."],
  ["Invite them in", "Point fans to your community or catalog."],
  ["Watch the charts", "Verified sales move you up."],
];

const PLAYS: { title: string; goal: string; body: string; stack: string[] }[] = [
  {
    title: "Launch a song properly",
    goal: "Goal: turn a release into an event for your fans.",
    body: "Drop the song with a bonus item attached, like merch, another digital item or a collectible, so buyers get something extra. Post a preview card to Socials so your followers can tap straight to it, then go live on release day to talk to the people who showed up.",
    stack: ["Drop", "Bonus items", "Socials preview card", "Go Live"],
  },
  {
    title: "Turn listeners into regulars",
    goal: "Goal: steady support instead of one-off sales.",
    body: "Keep Follow free so anyone can start. Then offer a Catalog subscription with your own price and duration for fans who want all your music, and a community for fans who want to be closer. Individual song sales stay available for people who prefer to buy one at a time.",
    stack: ["Free follow", "Catalog subscription", "Community", "Song sales"],
  },
  {
    title: "Fill the room",
    goal: "Goal: sell tickets and make the lineup part of the promotion.",
    body: "Create the event with ticket tiers, then add your lineup by searching registered Xoldout accounts. Each artist is notified and their name links to their profile, so their fans can find the event. Use referrals, check sales as they come in, and add optional paid promotional add-ons if you want more reach.",
    stack: ["Ticket tiers", "Lineup from Xoldout accounts", "Referrals", "QR check-in"],
  },
  {
    title: "Sell beats at every budget",
    goal: "Goal: let different artists license the same beat in different ways.",
    body: "Set several license cards on one beat, each with its own price, file formats (MP3, WAV, STEMS), streaming limit and usage rights. Because the terms are visible before purchase and the agreement downloads afterwards, buyers know what they’re getting.",
    stack: ["License tiers", "MP3, WAV, STEMS", "Clear usage rights", "Licensing agreement"],
  },
  {
    title: "Run a monthly club",
    goal: "Goal: recurring membership with real perks.",
    body: "Create a paid community with monthly, yearly or one-time plans, and set what each tier can access. Members carry a branded membership card with a QR code. X Recording Club, Xoldout’s first official community, uses a monthly plan that includes a monthly recording camp.",
    stack: ["Paid community", "Tiers", "Membership card", "Organizer dashboard"],
  },
  {
    title: "Climb the charts honestly",
    goal: "Goal: get seen by people who haven’t found you yet.",
    body: "Rankings count completed, verified sales and de-duplicated fan engagement, so real fans are what move you. Time filters help newer artists too: Today and This Week show who is rising now, and Rising Creators spotlights artists on the way up. Billboard is separate paid promotion, always labelled Sponsored.",
    stack: ["Verified sales", "Time filters", "Rising Creators", "Billboard (paid, separate)"],
  },
];

const CHART_SECTIONS = [
  ["Top Sellers", "The best-selling items, from verified sales."],
  ["Music Charts", "The songs people are buying and playing."],
  ["Top Creators", "The artists leading across the platform."],
  ["Viral on Xoldout", "What’s spreading fastest right now."],
  ["Rising Creators", "Artists gaining ground quickly."],
  ["Trending Events", "The events fans are talking about."],
  ["Trending Beats", "The beats producers are moving."],
  ["Top Merch", "The merch fans are wearing."],
  ["Billboard", "Paid placements, labelled Sponsored."],
];

const FANS = [
  ["Find new artists", "Browse For You, follow artists you like, and check Charts for what’s rising."],
  ["Buy and keep", "Songs you purchase live in your Library. Build playlists, and use the cart for merch."],
  ["Subscribe to a catalog", "Pay an artist’s price for their music catalog, and manage renewals and cancellations in Your Subscriptions."],
  ["Go to the show", "Buy tickets, keep the QR code in your Library, and walk in. Events can be physical, virtual or hybrid."],
  ["Join the live moment", "Chat in real time and send Xoldout Gifts like Star, Mic, Grammy, Coin and Money Spray to artists who go live."],
  ["Join a community", "Free or paid, with announcements, topic discussions and a membership card that proves you’re in."],
];

const FEATURES: [string, string[]][] = [
  [
    "Discover and charts",
    [
      "For You and Following feeds",
      "Music, Beats, Events and Merch sections",
      "Search, category chips and shortcut cards",
      "Charts with Today, This Week, This Month and All Time",
      "Nine chart sections including Rising Creators",
      "Event discovery: Upcoming, Happening now, Near you",
    ],
  ],
  [
    "Music and subscriptions",
    [
      "Sell songs with Play All and Preview All",
      "Bonus items bundled with a release",
      "Optional paid add-ons on details pages",
      "Catalog subscription, music only, your price and duration",
      "Renewals, cancellations and expiry handled for you",
      "Tips on artist profiles and music",
    ],
  ],
  [
    "Beats",
    [
      "License cards with producer-set prices",
      "MP3, WAV and STEMS formats",
      "Usage rights: commercial, monetization, distribution, music video, YouTube and social, radio, live, Content ID",
      "Terms shown before purchase",
      "Downloadable licensing agreement after purchase",
    ],
  ],
  [
    "Events and tickets",
    [
      "Physical, virtual and hybrid events",
      "Poster, description, date, venue, organizer profile",
      "Ticket tiers with availability",
      "Lineup from registered Xoldout accounts, with notifications",
      "QR tickets, check-in and attendee management",
      "Referrals, sales tracking and optional promotional add-ons",
    ],
  ],
  [
    "Merch",
    [
      "Physical or digital, chosen when you upload",
      "Sizes, colours with matching images, size guide",
      "Quantity and stock control",
      "Add to Cart and Buy Now",
      "Merch can also come as a bonus on a release",
    ],
  ],
  [
    "Go Live and Socials",
    [
      "Livestreams with real-time chat",
      "Xoldout Gifts: Star, Mic, Grammy, Coin, Money Spray",
      "Artist earnings dashboard and moderation tools",
      "No replays: live is live",
      "Text and photo posts with For You and Following",
      "Share any song, beat, event or merch as a preview card",
      "Audience control: Everyone or Followers only",
    ],
  ],
  [
    "Communities and memberships",
    [
      "Announcements and topic-based discussions",
      "Pinned posts, plus admin, moderator and member roles",
      "Public or private communities",
      "Free, paid or mixed plans and tiers",
      "Membership cards with QR verification",
      "My Memberships and organizer dashboard",
    ],
  ],
  ["Library and wallet", ["Purchased, Your Playlist, Your Subscriptions, Events", "Cart in your Library header", "Private Wallet, Insights and Settings", "Edit Profile and manage your Music, Events and Merch"]],
  [
    "Artist profile",
    [
      "Cover image, profile photo, handle and tagline",
      "Verification badge for verified accounts",
      "Followers, subscribers and total sales",
      "Message, Tip, Follow, Subscribe to Catalog",
      "Music, Events and Merch tabs",
      "Community button next to Follow",
    ],
  ],
];

const FAIR = [
  ["Only completed sales count", "Chart rankings use verified, completed transactions. Failed, pending, cancelled and refunded ones are left out."],
  ["One fan, one vote", "Engagement is de-duplicated per account, so repeat actions don’t inflate a ranking."],
  ["Ads are labelled", "Billboard placements say Sponsored and stay separate from organic charts."],
  ["Memberships verify on the server", "Each QR code is checked against the backend. The code carries no personal data. Green means active, red means expired or invalid."],
  ["Payments are validated", "Gifts, renewals and purchases are confirmed server-side, with no duplicate charges on renewals."],
  ["Live stays live", "Go Live streams aren’t saved as replays, and moderation tools are built in."],
];

const FAQ = [
  ["Is following an artist free?", "Yes. Follow is free and separate from subscribing to a catalog or joining a community."],
  ["What does a catalog subscription include?", "Music only. The artist sets the price and duration, and the details page shows what’s included and when it renews or expires. You can still buy individual songs."],
  ["Can I sell beats on Xoldout?", "Yes. Producers create license cards with their own prices, formats and usage rights. Buyers see the terms before paying and can download a licensing agreement afterwards."],
  ["Are Go Live streams saved?", "No. Streams are live only, with no replay. Fans can chat and send Xoldout Gifts while it’s happening."],
  ["Can I pay to rank higher on the charts?", "No. Organic rankings come from verified sales and engagement. Billboard is a separate paid section, clearly marked Sponsored."],
  ["Where can fans tip?", "On artist profiles and music. Beats, merch and events don’t have tipping."],
  ["Who can I add to my event lineup?", "Registered Xoldout accounts. Search and select them. They’re notified, and their names link to their profiles."],
  ["How do community memberships work?", "Communities can be free, paid or mixed. Members get a branded card with a unique ID, tier, status and QR code, and can track renewals under My Memberships."],
];

export default function LandingPage() {
  return (
    <div className={`xl ${fraunces.variable} ${instrument.variable}`}>
      <LandingAuthProvider>
        {/* ================= HERO ================= */}
        <header className="hero">
          <div className="wrap">
            <nav className="nav" aria-label="Main">
              <SectionLink className="logo" href="#top">
                XOLDOUT
              </SectionLink>
              <ul>
                {NAV.map(([href, label]) => (
                  <li key={href}>
                    <SectionLink href={href}>{label}</SectionLink>
                  </li>
                ))}
              </ul>
              <AuthButton mode="signin" className="btn btn-ghost btn-sm btn-pill">
                Sign in
              </AuthButton>
            </nav>

            <div className="hero-grid" id="top">
              <div>
                <p className="tagline">Music. Culture. Connected.</p>
                <h1>
                  <span>The D2C social network</span>
                  <span>of the independent industry and creator economy</span>
                </h1>
                <p className="sub">
                  Xoldout is one app where independent artists sell music, beats, tickets and merch, go live with fans, and run their own communities. Fans discover it all, support the artists they love, and show up in person or online.
                </p>
                <div className="cta">
                  <AuthButton mode="signup" className="btn btn-white btn-pill">
                    Get Started
                  </AuthButton>
                  <SectionLink className="btn btn-ghost btn-pill" href="#about">
                    See How It Works
                  </SectionLink>
                </div>
                <p className="note">Following an artist is always free. Pay only for what you choose to buy.</p>
              </div>
              <PhonePreview />
            </div>
          </div>
        </header>

        <main>
          {/* ================= ABOUT ================= */}
          <section className="sec a" id="about">
            <div className="wrap">
              <div className="about-grid">
                <div className="head" style={{ marginBottom: 0 }}>
                  <h2>One place for the music, the shows and the people behind them.</h2>
                  <p className="lede">
                    Xoldout connects independent artists with fans. Artists upload, sell and perform. Fans find new sounds, buy what they love, join communities and go to events. Everything runs inside one app.
                  </p>
                </div>
                <div className="who">
                  <div>
                    <h3>If you make things</h3>
                    <p>Artists, producers and event organizers can sell songs, license beats, ticket events, sell merch, go live, and charge for memberships. Your profile, your prices, your audience.</p>
                  </div>
                  <div>
                    <h3>If you love music</h3>
                    <p>Discover new artists, keep what you buy in your Library, hold tickets as QR codes, send gifts during live shows, and join communities for the artists you follow.</p>
                  </div>
                </div>
              </div>

              <div className="tabrows" role="list" aria-label="The five tabs of the app">
                {TABROWS.map(([name, body, drop]) => (
                  <div key={name} className="tabrow" role="listitem">
                    <h3 className={drop ? "dropname" : undefined}>{name}</h3>
                    <p>{body}</p>
                  </div>
                ))}
              </div>

              <div className="board" role="group" aria-label="How Xoldout connects artists and fans">
                <h3>Straight from the artist to the fan.</h3>
                <p>Artists drop what they make. Fans discover it, buy it and show up. What they get lands in their Library.</p>
                <div className="flow">
                  <div>
                    <h4>Artists drop</h4>
                    <ul>
                      {["Songs", "Beats", "Events", "Merch"].map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="arr" aria-hidden />
                  <div className="hub">
                    <b>XOLDOUT</b>
                    <small>Discover, Charts and Socials</small>
                  </div>
                  <div className="arr" aria-hidden />
                  <div>
                    <h4>Fans respond</h4>
                    <ul>
                      {["Buy and keep", "Subscribe", "Go to the show", "Send gifts live"].map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ================= START SELLING ================= */}
          <section className="sec b" id="sell">
            <div className="wrap">
              <div className="head">
                <h2>Start selling in four moves.</h2>
                <p className="lede">You don&apos;t need a team or a website. Set up once, then drop whatever you want to sell.</p>
              </div>
              <div className="steps">
                {STEPS.map(([t, p], i) => (
                  <div key={t} className="step">
                    <div className="n">{i + 1}</div>
                    <h3>{t}</h3>
                    <p>{p}</p>
                  </div>
                ))}
              </div>
              <div className="google-line">
                <AuthButton mode="signup" className="btn btn-white btn-pill">
                  Get Started
                </AuthButton>
                <span>Prices are yours to set, in naira (₦).</span>
              </div>
            </div>
          </section>

          {/* ================= WAYS TO EARN ================= */}
          <section className="sec a" id="earn">
            <div className="wrap">
              <div className="head">
                <h2>Eight ways to earn from your work.</h2>
                <p className="lede">Use one or stack them. Pick a way to earn below to see exactly how it works.</p>
              </div>
              <EarnExplorer />
            </div>
          </section>

          {/* ================= STRATEGIES ================= */}
          <section className="sec b" id="strategies">
            <div className="wrap">
              <div className="head">
                <h2>Six strategies that put the features to work together.</h2>
                <p className="lede">Each one is a combination of tools already on Xoldout. Mix them to fit where you are right now.</p>
              </div>

              <div className="board rd" style={{ marginTop: 0, marginBottom: 56 }} role="group" aria-label="A launch week mapped in five steps">
                <h3>A launch, mapped.</h3>
                <p>One way the tools chain together when you release a song.</p>
                <ol className="tl5">
                  {LAUNCH.map(([t, d], i) => (
                    <li key={t}>
                      <span className="n">{i + 1}</span>
                      <b>{t}</b>
                      <span className="d">{d}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {PLAYS.map((p) => (
                <article key={p.title} className="play">
                  <div>
                    <h3>{p.title}</h3>
                    <p className="goal">{p.goal}</p>
                  </div>
                  <div>
                    <p>{p.body}</p>
                    <div className="stack">
                      {p.stack.map((s) => (
                        <span key={s}>{s}</span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* ================= DISCOVER & CHARTS ================= */}
          <section className="sec a" id="discover">
            <div className="wrap">
              <div className="head">
                <h2>See what&apos;s happening right now.</h2>
                <p className="lede">Discover shows you what to listen to, buy and attend. Charts shows you what everyone else is into.</p>
              </div>
              <div className="dc">
                <div>
                  <h3 style={{ marginTop: 0 }}>Discover</h3>
                  <p style={{ color: "var(--mute)" }}>
                    Switch between <strong style={{ color: "var(--ink)" }}>For You</strong> for recommendations and <strong style={{ color: "var(--ink)" }}>Following</strong> for the artists you follow. Pick a section and search inside it.
                  </p>
                  <div className="chips2" style={{ marginBottom: 8 }}>
                    {["Music", "Beats", "Events", "Merch"].map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </div>
                  <p style={{ color: "var(--mute)", marginTop: 14 }}>
                    Events are easy to browse by Upcoming, Happening now, Near you, and categories like concerts, festivals, club nights, album launches, listening parties, comedy shows, workshops and more.
                  </p>

                  <h3>Charts</h3>
                  <p style={{ color: "var(--mute)" }}>Choose a time window and every chart updates to match.</p>
                  <ChartPills />
                </div>
                <div>
                  <ul className="sections">
                    {CHART_SECTIONS.map(([b, s]) => (
                      <li key={b}>
                        <b>{b}</b>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="sponsored">
                    <strong>Billboard never changes organic rankings.</strong> Paid placements are clearly marked Sponsored and live in their own section.
                  </p>
                </div>
              </div>

              <div className="board" role="group" aria-label="Organic charts compared with the separate Sponsored Billboard">
                <h3>Rankings are earned. Ads are labelled.</h3>
                <p>The two live side by side, and they never mix.</p>
                <div className="lanes">
                  <div>
                    <h4>Organic charts</h4>
                    <p className="sub">Ranked by verified sales and fan engagement.</p>
                    {[
                      ["Midnight Run", "92%"],
                      ["Soft Landing", "71%"],
                      ["Rooftop Session", "54%"],
                    ].map(([t, w], i) => (
                      <div key={t} className="rk">
                        <i>{i + 1}</i>
                        <div>
                          <small>{t}</small>
                          <div className="bar" style={{ width: w }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="split" aria-hidden />
                  <div>
                    <h4>Billboard</h4>
                    <p className="sub">Paid placement, kept in its own section.</p>
                    <div className="ad">
                      <span className="sp">Sponsored</span>
                      <div className="poster" aria-hidden>
                        Your drop here
                      </div>
                      <small>Doesn&apos;t change any organic ranking.</small>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ================= FANS ================= */}
          <section className="sec b" id="fans">
            <div className="wrap">
              <div className="head">
                <h2>Fans get more than a play button.</h2>
                <p className="lede">New here as a listener? This is what you can do.</p>
              </div>
              <div className="fans-grid">
                {FANS.map(([t, p]) => (
                  <div key={t}>
                    <h3>{t}</h3>
                    <p>{p}</p>
                  </div>
                ))}
              </div>

              <div className="board rd" role="group" aria-label="Three fan moments: a ticket, live gifts and a membership card">
                <h3>Not just a play button.</h3>
                <p>The moments fans actually keep coming back for.</p>
                <div className="moments">
                  {[
                    ["Events", "Your ticket lives in your Library."],
                    ["Go Live", "Send gifts while they’re live."],
                    ["Communities", "Show your membership card."],
                  ].map(([a, c]) => (
                    <figure key={a}>
                      <Art name={a} />
                      <figcaption>{c}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ================= ALL FEATURES ================= */}
          <section className="sec a" id="features">
            <div className="wrap">
              <div className="head">
                <h2>Every feature, in one list.</h2>
                <p className="lede">The complete set of tools on Xoldout, grouped by what you&apos;re trying to do.</p>
              </div>
              <div className="feat">
                {FEATURES.map(([h, items]) => (
                  <div key={h}>
                    <h3>{h}</h3>
                    <ul>
                      {items.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ================= TRUST ================= */}
          <section className="sec b" id="fair">
            <div className="wrap">
              <div className="head">
                <h2>Built so the numbers mean something.</h2>
              </div>
              <div className="fair">
                {FAIR.map(([h, p]) => (
                  <div key={h}>
                    <h3>{h}</h3>
                    <p>{p}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ================= FAQ ================= */}
          <section className="sec a" id="faq">
            <div className="wrap">
              <div className="head">
                <h2>Questions first-timers ask.</h2>
              </div>
              <div className="faq">
                {FAQ.map(([q, a]) => (
                  <details key={q}>
                    <summary>{q}</summary>
                    <p>{a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* ================= FINAL CTA ================= */}
          <section className="final" id="join">
            <div className="wrap">
              <h2>Your creativity deserves an audience.</h2>
              <p>Create your profile, drop your first release, and meet the people who&apos;ll show up for it.</p>
              <div className="cta">
                <AuthButton mode="signup" className="btn btn-white btn-pill">
                  Get Started
                </AuthButton>
                <SectionLink className="btn btn-ghost btn-pill" href="#about">
                  See How It Works
                </SectionLink>
              </div>
            </div>
          </section>
        </main>

        <footer>
          <div className="wrap">
            <div className="foot">
              <div>
                <SectionLink className="logo" href="#top">
                  XOLDOUT
                </SectionLink>
                <p className="tag">Music. Culture. Connected.</p>
              </div>
              <ul>
                {NAV.map(([href, label]) => (
                  <li key={href}>
                    <SectionLink href={href}>{label === "All features" ? "Features" : label}</SectionLink>
                  </li>
                ))}
                <li>
                  <Link href="/legal/terms">Terms</Link>
                </li>
                <li>
                  <Link href="/legal/privacy">Privacy</Link>
                </li>
              </ul>
            </div>
            <p className="copy">&copy; Xoldout. All rights reserved.</p>
          </div>
        </footer>
      </LandingAuthProvider>
    </div>
  );
}
