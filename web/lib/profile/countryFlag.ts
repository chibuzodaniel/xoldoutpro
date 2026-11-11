// Country flag next to the verified badge (explicit ask, 2026-11-11), worked
// out from the user's own profile location text ("Lagos, Nigeria", "Accra",
// "London, UK"). Zero imports: shared by server and client. No match = no flag.

const COUNTRIES: [string, string[]][] = [
  ["NG", ["nigeria", "naija", "lagos", "abuja", "port harcourt", "ibadan", "kano", "enugu", "benin city", "owerri", "warri", "onitsha", "aba", "calabar", "uyo", "jos", "kaduna", "abeokuta", "ilorin", "akure", "asaba", "nsukka", "awka", "lekki", "ikeja", "surulere", "yaba", "ajah", "festac", "umuahia", "osogbo", "ado ekiti", "makurdi", "yola", "maiduguri", "sokoto", "zaria", "bauchi", "minna", "lokoja", "abakaliki", "yenagoa", "ogun", "oyo", "anambra", "imo", "rivers", "delta", "edo", "kwara", "ekiti", "ondo", "osun", "plateau", "fct"]],
  ["GH", ["ghana", "accra", "kumasi", "tamale", "takoradi", "cape coast", "tema"]],
  ["KE", ["kenya", "nairobi", "mombasa", "kisumu", "nakuru"]],
  ["ZA", ["south africa", "johannesburg", "joburg", "cape town", "durban", "pretoria", "soweto"]],
  ["TZ", ["tanzania", "dar es salaam", "dodoma", "zanzibar", "arusha"]],
  ["UG", ["uganda", "kampala", "entebbe"]],
  ["RW", ["rwanda", "kigali"]],
  ["ET", ["ethiopia", "addis ababa"]],
  ["EG", ["egypt", "cairo", "alexandria"]],
  ["MA", ["morocco", "casablanca", "rabat", "marrakech"]],
  ["SN", ["senegal", "dakar"]],
  ["CI", ["cote d'ivoire", "côte d'ivoire", "ivory coast", "abidjan"]],
  ["CM", ["cameroon", "douala", "yaounde", "yaoundé"]],
  ["BJ", ["benin republic", "cotonou", "porto-novo"]],
  ["TG", ["togo", "lome", "lomé"]],
  ["LR", ["liberia", "monrovia"]],
  ["SL", ["sierra leone", "freetown"]],
  ["GM", ["gambia", "banjul"]],
  ["ZW", ["zimbabwe", "harare", "bulawayo"]],
  ["ZM", ["zambia", "lusaka"]],
  ["BW", ["botswana", "gaborone"]],
  ["NA", ["namibia", "windhoek"]],
  ["AO", ["angola", "luanda"]],
  ["CD", ["congo", "kinshasa", "drc"]],
  ["GB", ["united kingdom", "uk", "england", "london", "manchester", "birmingham", "liverpool", "leeds", "scotland", "glasgow", "edinburgh", "wales", "cardiff", "britain"]],
  ["IE", ["ireland", "dublin"]],
  ["US", ["united states", "usa", "u.s.", "america", "new york", "nyc", "los angeles", "atlanta", "houston", "chicago", "miami", "dallas", "washington dc", "texas", "california", "maryland", "new jersey", "brooklyn"]],
  ["CA", ["canada", "toronto", "montreal", "vancouver", "calgary", "ottawa", "edmonton"]],
  ["JM", ["jamaica", "kingston"]],
  ["TT", ["trinidad", "tobago"]],
  ["BR", ["brazil", "brasil", "sao paulo", "são paulo", "rio de janeiro"]],
  ["FR", ["france", "paris", "lyon", "marseille"]],
  ["DE", ["germany", "berlin", "munich", "hamburg", "frankfurt"]],
  ["NL", ["netherlands", "holland", "amsterdam", "rotterdam"]],
  ["BE", ["belgium", "brussels"]],
  ["IT", ["italy", "rome", "milan"]],
  ["ES", ["spain", "madrid", "barcelona"]],
  ["PT", ["portugal", "lisbon"]],
  ["SE", ["sweden", "stockholm"]],
  ["NO", ["norway", "oslo"]],
  ["DK", ["denmark", "copenhagen"]],
  ["CH", ["switzerland", "zurich", "geneva"]],
  ["AE", ["uae", "united arab emirates", "dubai", "abu dhabi"]],
  ["SA", ["saudi arabia", "riyadh", "jeddah"]],
  ["QA", ["qatar", "doha"]],
  ["IN", ["india", "mumbai", "delhi", "bangalore"]],
  ["CN", ["china", "beijing", "shanghai"]],
  ["JP", ["japan", "tokyo"]],
  ["KR", ["south korea", "korea", "seoul"]],
  ["AU", ["australia", "sydney", "melbourne", "brisbane", "perth"]],
  ["NZ", ["new zealand", "auckland"]],
];

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "NG" → 🇳🇬 */
export function flagEmoji(iso: string) {
  return String.fromCodePoint(...iso.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * The country a free-text location points at, or null. Whole-word matches
 * only; the last place mentioned wins ("Lagos, Nigeria" and "London, Nigeria"
 * both read as Nigeria, the country usually being written last).
 */
export function countryFromLocation(location: string | null | undefined): { iso: string; flag: string } | null {
  const text = location?.toLowerCase().trim();
  if (!text) return null;
  let best: { iso: string; at: number; len: number } | null = null;
  for (const [iso, names] of COUNTRIES) {
    for (const name of names) {
      const re = new RegExp(`(^|[^a-z])${escape(name)}($|[^a-z])`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        const at = m.index + m[1].length;
        if (!best || at > best.at || (at === best.at && name.length > best.len)) best = { iso, at, len: name.length };
      }
    }
  }
  return best ? { iso: best.iso, flag: flagEmoji(best.iso) } : null;
}
