import { useState } from "react";
import { Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { colors } from "../../lib/theme";
import { Avatar } from "../Avatar";
import { Pill } from "../creator/Pill";
import { UserHandleAutocomplete, type UserSuggestion } from "../UserHandleAutocomplete";
import { MAX_FEATURED_ARTISTS, collaboratorSharesError, mainArtistSharePercent, type CollabArrangement } from "../../lib/collabRules";

// Mirrors web's components/music/FeaturedArtistsEditor.tsx — featured
// artists & revenue sharing on Upload Music (explicit ask, 2026-11-06).

export type FeaturedArtistDraft = { artist: UserSuggestion; arrangement: CollabArrangement; shareText: string };

function shares(drafts: FeaturedArtistDraft[]) {
  return drafts.map((d) => ({
    arrangement: d.arrangement,
    sharePercent: d.arrangement === "ROYALTY_SPLIT" ? Math.floor(Number(d.shareText)) || 0 : 0,
  }));
}

export function featuredDraftsError(drafts: FeaturedArtistDraft[]): string | null {
  return collaboratorSharesError(shares(drafts));
}

export function featuredDraftsPayload(drafts: FeaturedArtistDraft[]) {
  const s = shares(drafts);
  return drafts.map((d, i) => ({ artistId: d.artist.id, ...s[i] }));
}

const HINT: Record<CollabArrangement, string> = {
  ROYALTY_SPLIT: "They get an agreed % of this release's revenue, split automatically.",
  CREDIT_ONLY: "Credited on the release and their profile. You keep 100% of the revenue.",
};

export function FeaturedArtistsEditor({
  drafts,
  onChange,
  selfId,
}: {
  drafts: FeaturedArtistDraft[];
  onChange: (d: FeaturedArtistDraft[]) => void;
  selfId?: string;
}) {
  const [query, setQuery] = useState("");
  const s = shares(drafts);
  const mainShare = mainArtistSharePercent(s);
  const hasRoyalty = drafts.some((d) => d.arrangement === "ROYALTY_SPLIT");
  const error = featuredDraftsError(drafts);

  function update(i: number, patch: Partial<FeaturedArtistDraft>) {
    onChange(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  return (
    <View style={styles.wrap}>
      {drafts.map((d, i) => (
        <View key={d.artist.id} style={styles.card}>
          <View style={styles.head}>
            <Avatar uri={d.artist.avatarUrl} name={d.artist.displayName} index={i} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {d.artist.displayName}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                @{d.artist.handle}
              </Text>
            </View>
            <TouchableOpacity onPress={() => onChange(drafts.filter((_, j) => j !== i))}>
              <Text style={styles.meta}>Remove</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.pills}>
            <Pill label="Royalty sharing" active={d.arrangement === "ROYALTY_SPLIT"} onPress={() => update(i, { arrangement: "ROYALTY_SPLIT" })} />
            <Pill label="Feature credit only" active={d.arrangement === "CREDIT_ONLY"} onPress={() => update(i, { arrangement: "CREDIT_ONLY" })} />
          </View>
          <Text style={styles.hint}>{HINT[d.arrangement]}</Text>
          {d.arrangement === "ROYALTY_SPLIT" && (
            <View style={styles.shareRow}>
              <Text style={styles.meta}>Their share</Text>
              <TextInput
                value={d.shareText}
                onChangeText={(t) => update(i, { shareText: t })}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={colors.ink3}
                style={styles.input}
              />
              <Text style={styles.meta}>%</Text>
            </View>
          )}
        </View>
      ))}

      {drafts.length < MAX_FEATURED_ARTISTS && (
        <UserHandleAutocomplete
          value={query}
          onChangeText={setQuery}
          excludeUserId={selfId}
          placeholder="Search an artist by name or @handle"
          onSelect={(u) => {
            setQuery("");
            if (drafts.some((d) => d.artist.id === u.id)) return;
            onChange([...drafts, { artist: u, arrangement: "ROYALTY_SPLIT", shareText: "" }]);
          }}
        />
      )}

      {hasRoyalty && (
        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Text style={styles.meta}>You</Text>
            <Text style={[styles.summaryValue, mainShare < 0 && { color: colors.redSoft }]}>{mainShare}%</Text>
          </View>
          {drafts.map((d, i) =>
            d.arrangement === "ROYALTY_SPLIT" ? (
              <View key={d.artist.id} style={styles.summaryRow}>
                <Text style={styles.meta}>@{d.artist.handle}</Text>
                <Text style={styles.summaryValue}>{s[i].sharePercent}%</Text>
              </View>
            ) : null,
          )}
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.meta}>Total</Text>
            <Text style={styles.summaryValue}>100%</Text>
          </View>
          <Text style={styles.hint}>Shares are of your earnings after the platform fee, from sales made after each artist accepts.</Text>
        </View>
      )}
      {error && drafts.length > 0 && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 10, padding: 12, gap: 8 },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  meta: { color: colors.ink3, fontSize: 12 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hint: { color: colors.ink3, fontSize: 10.5, lineHeight: 15 },
  shareRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    width: 70,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.ink,
    fontSize: 14,
  },
  summary: { borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 10, padding: 10, gap: 4 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryTotal: { borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 4, marginTop: 2 },
  summaryValue: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  error: { color: colors.redSoft, fontSize: 11 },
});
