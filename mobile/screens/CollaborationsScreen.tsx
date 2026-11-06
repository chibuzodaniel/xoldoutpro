import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { apiDelete, apiGet, apiPost } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { useToast } from "../components/ToastProvider";

// Mirrors web's app/(app)/profile/collaborations/page.tsx — featured artists
// & revenue sharing (explicit ask, 2026-11-06): requests waiting on this
// user, and the recorded arrangement + earnings for every release they're a
// party to.

type Person = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type Tag = {
  id: string;
  arrangement: "ROYALTY_SPLIT" | "CREDIT_ONLY";
  sharePercent: number;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  createdAt: string;
  artist: Person;
  earnedKobo: number | null;
};
type ReleaseCollab = {
  product: { id: string; title: string; artworkUrl: string | null; createdAt: string };
  mainArtist: Person;
  isMine: boolean;
  mainSharePercent: number;
  mainEarnedKobo: number | null;
  collaborators: Tag[];
};

const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
const terms = (t: Tag) => (t.arrangement === "ROYALTY_SPLIT" ? `${t.sharePercent}% royalty share` : "Feature credit only");
const STATUS_LABEL: Record<Tag["status"], string> = { PENDING: "Pending", ACCEPTED: "Accepted", DECLINED: "Declined" };
const STATUS_COLOR: Record<Tag["status"], string> = { PENDING: colors.amber, ACCEPTED: colors.green, DECLINED: colors.ink3 };

export function CollaborationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { firebaseUser, appUser } = useAuth();
  const toast = useToast();
  const [releases, setReleases] = useState<ReleaseCollab[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({ title: "Collaborations" });
  }, [navigation]);

  const load = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiGet<{ releases: ReleaseCollab[] }>("/api/collaborations", idToken);
      setReleases(data.releases);
    } catch {
      setReleases([]);
    }
  }, [firebaseUser]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(tag: Tag, run: (idToken: string) => Promise<unknown>, done: string) {
    if (!firebaseUser) return;
    setBusyId(tag.id);
    try {
      await run(await firebaseUser.getIdToken());
      toast.success(done);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  function respond(tag: Tag, action: "accept" | "decline") {
    const go = () =>
      act(
        tag,
        (t) => apiPost(`/api/collaborations/${tag.id}`, t, { action }),
        action === "accept" ? "Feature accepted. You're now credited on this release." : "Feature declined.",
      );
    if (action === "accept") return go();
    Alert.alert("Decline this feature?", "You won't be credited and can't accept it later.", [
      { text: "Cancel", style: "cancel" },
      { text: "Decline", style: "destructive", onPress: go },
    ]);
  }

  function withdraw(tag: Tag) {
    Alert.alert("Withdraw request?", `The request to ${tag.artist.displayName} will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Withdraw", style: "destructive", onPress: () => act(tag, (t) => apiDelete(`/api/collaborations/${tag.id}`, t), "Request withdrawn.") },
    ]);
  }

  if (releases === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (releases.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>No collaborations yet</Text>
        <Text style={styles.emptyBody}>Tag featured artists when you upload music, or accept a request here when someone tags you.</Text>
      </View>
    );
  }

  const pendingForMe = releases.flatMap((r) =>
    r.collaborators.filter((c) => c.artist.id === appUser?.id && c.status === "PENDING").map((tag) => ({ r, tag })),
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {pendingForMe.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>WAITING FOR YOU</Text>
          {pendingForMe.map(({ r, tag }) => (
            <View key={tag.id} style={[styles.card, styles.pendingCard]}>
              <Text style={styles.title}>{r.product.title}</Text>
              <Text style={styles.meta}>From {r.mainArtist.displayName}</Text>
              <Text style={styles.terms}>{terms(tag)}</Text>
              <Text style={styles.meta}>
                {tag.arrangement === "ROYALTY_SPLIT"
                  ? `You'd get ${tag.sharePercent}% of ${r.mainArtist.displayName}'s earnings from every sale (after the platform fee), paid into your wallet automatically from when you accept. ${r.mainArtist.displayName} keeps ${r.mainSharePercent}%.`
                  : `You'd be credited on this release and it would show on your profile. ${r.mainArtist.displayName} keeps 100% of the revenue.`}
              </Text>
              <View style={styles.buttons}>
                <TouchableOpacity style={styles.accept} disabled={busyId === tag.id} onPress={() => respond(tag, "accept")}>
                  <Text style={styles.acceptText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.decline} disabled={busyId === tag.id} onPress={() => respond(tag, "decline")}>
                  <Text style={styles.declineText}>Decline</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>AGREEMENTS</Text>
        {releases.map((r) => {
          const hasRoyalty = r.collaborators.some((c) => c.arrangement === "ROYALTY_SPLIT" && c.status !== "DECLINED");
          return (
            <View key={r.product.id} style={styles.card}>
              <TouchableOpacity onPress={() => navigation.navigate("Product", { id: r.product.id })}>
                <Text style={styles.title}>{r.product.title}</Text>
                <Text style={styles.meta}>{r.isMine ? "Your release" : `By ${r.mainArtist.displayName}`}</Text>
              </TouchableOpacity>
              <View style={styles.row}>
                <Text style={styles.rowText}>
                  {r.isMine ? "You" : r.mainArtist.displayName} · main artist · {hasRoyalty ? r.mainSharePercent : 100}%
                </Text>
                {r.mainEarnedKobo != null && <Text style={styles.amount}>{naira(r.mainEarnedKobo)}</Text>}
              </View>
              {r.collaborators.map((c) => (
                <View key={c.id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowText}>
                      {c.artist.id === appUser?.id ? "You" : c.artist.displayName} · {terms(c)}
                    </Text>
                    <Text style={[styles.status, { color: STATUS_COLOR[c.status] }]}>{STATUS_LABEL[c.status]}</Text>
                  </View>
                  {c.arrangement === "ROYALTY_SPLIT" && c.status === "ACCEPTED" && c.earnedKobo != null && (
                    <Text style={styles.amount}>{naira(c.earnedKobo)}</Text>
                  )}
                  {r.isMine && c.status === "PENDING" && (
                    <TouchableOpacity disabled={busyId === c.id} onPress={() => withdraw(c)}>
                      <Text style={styles.meta}>Withdraw</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <Text style={styles.footnote}>
                Earnings are from paid sales of this release. Royalty shares are of the main artist's earnings after the platform fee, counted from each
                artist's acceptance date.
              </Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, paddingHorizontal: 32 },
  emptyTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  emptyBody: { color: colors.ink3, fontSize: 12, marginTop: 4, textAlign: "center" },
  section: { marginBottom: 24, gap: 10 },
  sectionLabel: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  card: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, padding: 14, gap: 6 },
  pendingCard: { borderColor: colors.amber },
  title: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  meta: { color: colors.ink3, fontSize: 12, lineHeight: 17 },
  terms: { color: colors.ink, fontSize: 13, fontWeight: "700", marginTop: 4 },
  buttons: { flexDirection: "row", gap: 8, marginTop: 6 },
  accept: { flex: 1, backgroundColor: colors.red, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  acceptText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  decline: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  declineText: { color: colors.ink2, fontSize: 13, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  rowText: { flex: 1, color: colors.ink2, fontSize: 12 },
  status: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  amount: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  footnote: { color: colors.ink3, fontSize: 10.5, lineHeight: 15, marginTop: 4 },
});
