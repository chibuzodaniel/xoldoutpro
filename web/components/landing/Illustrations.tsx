// Small UI vignettes that explain each feature on the landing page
// (xoldout-mockup.html, 2026-11-16). Used by the "Ways to earn" explorer and
// the fan-moments board. Plain markup, styled by app/landing.css.

const WAVE = [8, 14, 20, 10, 24, 16, 6, 18, 22, 12, 8, 20, 26, 14, 10, 18, 24, 12, 6, 16, 22, 10];

function Wave() {
  return (
    <svg viewBox={`0 0 ${WAVE.length * 6} 28`} width="100%" height="28" preserveAspectRatio="none" aria-hidden>
      {WAVE.map((v, i) => (
        <rect key={i} x={i * 6} y={(28 - v) / 2} width="3" height={v} rx="1.5" fill="#000" />
      ))}
    </svg>
  );
}

export const ART: Record<string, { label: string; body: React.ReactNode }> = {
  Songs: {
    label: "Illustration: a song card with Preview and Buy buttons and a bonus item tag.",
    body: (
      <>
        <span className="flt" style={{ top: 16, right: 16, transform: "rotate(4deg)" }}>
          + Bonus item
        </span>
        <div className="wc">
          <div className="r2">
            <span className="sqp" />
            <div>
              <b>Midnight Run</b>
              <small>Sample Artist</small>
            </div>
          </div>
          <div className="wv">
            <Wave />
          </div>
          <div className="r2 mt">
            <span className="pill k">Preview</span>
            <span className="pill r">Buy</span>
          </div>
        </div>
      </>
    ),
  },
  "Catalog subscription": {
    label: "Illustration: a fan of album covers above a Subscribe to Catalog card marked music only.",
    body: (
      <>
        <div className="fan">
          <i />
          <i />
          <i />
        </div>
        <div className="wc">
          <b>Subscribe to Catalog</b>
          <small>Price and duration set by the artist</small>
          <div className="r2 mt">
            <span className="pill k">Music only</span>
            <span className="pill">Shows renewal date</span>
          </div>
        </div>
      </>
    ),
  },
  Beats: {
    label: "Illustration: three license cards for MP3, WAV and STEMS, plus a downloadable agreement.",
    body: (
      <>
        <div className="trio">
          {["MP3", "WAV", "STEMS"].map((f) => (
            <div key={f} className="wc">
              <small>License</small>
              <b>{f}</b>
              <span className="pill">Your price</span>
            </div>
          ))}
        </div>
        <div className="wc">
          <div className="r2">
            <span className="pill k">Terms shown first</span>
            <span className="pill r">Agreement to download</span>
          </div>
        </div>
      </>
    ),
  },
  Events: {
    label: "Illustration: an event ticket with a QR code, ticket tier and a lineup of artists.",
    body: (
      <>
        <div className="tkt">
          <div className="tl">
            <b>Rooftop Session</b>
            <small>Sat, 8:00 PM</small>
            <div className="r2 mt">
              <span className="pill k">Hybrid</span>
              <span className="pill">VIP tier</span>
            </div>
          </div>
          <div className="tq">
            <div className="qrx" />
            <small>Scan at the door</small>
          </div>
        </div>
        <div className="lineup">
          <i />
          <i />
          <i />
          <span>Lineup from Xoldout accounts</span>
        </div>
      </>
    ),
  },
  Merch: {
    label: "Illustration: a tour tee with colour swatches and size options.",
    body: (
      <div className="wc c">
        <svg viewBox="0 0 160 140" width="140" aria-hidden>
          <path d="M52 12 L30 22 L8 48 L30 62 L40 52 L40 128 L120 128 L120 52 L130 62 L152 48 L130 22 L108 12 Q80 30 52 12 Z" fill="#000" />
          <text x="80" y="86" textAnchor="middle" fill="#fff" fontFamily="Georgia,serif" fontWeight="900" fontSize="30">
            X
          </text>
        </svg>
        <b>Tour tee</b>
        <div className="r2 center">
          <i className="sw" style={{ background: "#000" }} />
          <i className="sw" style={{ background: "#fff", border: "1.5px solid #000" }} />
          <i className="sw" style={{ background: "#C70F1E" }} />
        </div>
        <div className="r2 center mt">
          <span className="pill">S</span>
          <span className="pill k">M</span>
          <span className="pill">L</span>
          <span className="pill">XL</span>
        </div>
      </div>
    ),
  },
  "Go Live": {
    label: "Illustration: a live stream with chat and Xoldout Gifts, marked no replay.",
    body: (
      <>
        <div className="chips">
          <span className="pill w">Star</span>
          <span className="pill w">Mic</span>
          <span className="pill w">Grammy</span>
        </div>
        <div className="live">
          <div className="r2">
            <span className="lv">LIVE</span>
            <b>Sample Artist</b>
          </div>
          <div className="bub">Play the new one!</div>
          <div className="bub">Fire set</div>
        </div>
        <div className="chips">
          <span className="pill w">Coin</span>
          <span className="pill w">Money Spray</span>
          <span className="pill k">No replay</span>
        </div>
      </>
    ),
  },
  Communities: {
    label: "Illustration: a membership card with a QR code and an Active status, above community channels.",
    body: (
      <>
        <div className="mcard">
          <div className="r2 sb">
            <b>XOLDOUT</b>
            <span className="pill g">Active</span>
          </div>
          <div className="mrow">
            <div>
              <small>Member</small>
              <b>Sample Member</b>
              <small>Tier</small>
              <b>Your tier</b>
            </div>
            <div className="qrx" />
          </div>
        </div>
        <div className="chips">
          <span className="pill w">Announcements</span>
          <span className="pill w">Discussions</span>
          <span className="pill k">Free, paid or mixed</span>
        </div>
      </>
    ),
  },
  Tips: {
    label: "Illustration: an artist profile card with Message, Tip and Follow buttons and a coin dropping onto Tip.",
    body: (
      <>
        <div className="coin">&#8358;</div>
        <div className="wc">
          <div className="r2">
            <span className="av" />
            <div>
              <b>Sample Artist</b>
              <small>@sampleartist</small>
            </div>
          </div>
          <div className="r2 mt">
            <span className="pill">Message</span>
            <span className="pill r">Tip</span>
            <span className="pill k">Follow</span>
          </div>
        </div>
        <p className="cap">Tips live on profiles and music only.</p>
      </>
    ),
  },
};

export function Art({ name }: { name: string }) {
  const a = ART[name];
  if (!a) return null;
  return (
    <div className="art" role="img" aria-label={a.label}>
      {a.body}
    </div>
  );
}
