import { useEffect, useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import * as Clipboard from "expo-clipboard";
import { API_BASE_URL, apiGet } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import type { ReceivedGift, SentGift, GiftProduct } from "../../lib/giftTypes";
import type { RootStackParamList } from "../../lib/navigation";
import { colors } from "../../lib/theme";

function artUrl(product: GiftProduct) {
  return product.release?.artworkLadder?.["256"] ?? product.beat?.coverImageLadder?.["256"] ?? null;
}

const STATUS_LABEL: Record<SentGift["status"], string> = {
  PENDING: "Waiting to be claimed",
  CLAIMED: "Claimed",
  EXPIRED: "Expired, refunded",
  REFUNDED: "Expired, refunded",
};

function GiftCard({ product, children }: { product: GiftProduct; children: React.ReactNode }) {
  const art = artUrl(product);
  return (
    <View style={styles.card}>
      {art ? <Image source={{ uri: art }} style={styles.art} /> : <View style={[styles.art, styles.artPlaceholder]} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={1}>
          {product.title}
        </Text>
        {children}
      </View>
    </View>
  );
}

function SentGiftCard({ gift }: { gift: SentGift }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await Clipboard.setStringAsync(`${API_BASE_URL}/gifts/claim/${gift.claimToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <GiftCard product={gift.product}>
      <Text style={styles.subtitle}>
        {gift.status === "CLAIMED" && gift.claimedBy ? `Claimed by ${gift.claimedBy.displayName}` : STATUS_LABEL[gift.status]}
      </Text>
      {gift.status === "PENDING" && (
        <TouchableOpacity onPress={copyLink}>
          <Text style={styles.linkText}>{copied ? "Link copied" : "Copy claim link"}</Text>
        </TouchableOpacity>
      )}
    </GiftCard>
  );
}

function ReceivedGiftCard({ gift }: { gift: ReceivedGift }) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return (
    <TouchableOpacity onPress={() => navigation.navigate("Product", { id: gift.product.id })}>
      <GiftCard product={gift.product}>
        <Text style={styles.subtitle}>from {gift.giver.displayName}</Text>
      </GiftCard>
    </TouchableOpacity>
  );
}

export function GiftsTab() {
  const { firebaseUser } = useAuth();
  const [data, setData] = useState<{ sent: SentGift[]; received: ReceivedGift[] } | null>(null);

  useEffect(() => {
    if (!firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ sent: SentGift[]; received: ReceivedGift[] }>("/api/gifts", idToken))
      .then(setData)
      .catch(() => setData({ sent: [], received: [] }));
  }, [firebaseUser]);

  if (data === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SENT</Text>
        {data.sent.length === 0 ? (
          <Text style={styles.emptyText}>Gift a release, beat, or ticket from its page — nothing sent yet.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {data.sent.map((g) => (
              <SentGiftCard key={g.id} gift={g} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>RECEIVED</Text>
        {data.received.length === 0 ? (
          <Text style={styles.emptyText}>Nothing claimed yet.</Text>
        ) : (
          <View style={{ gap: 8 }}>
            {data.received.map((g) => (
              <ReceivedGiftCard key={g.id} gift={g} />
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  section: { marginBottom: 24 },
  sectionLabel: { color: colors.ink3, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, marginBottom: 10 },
  emptyText: { color: colors.ink3, fontSize: 13, lineHeight: 19 },
  card: { flexDirection: "row", gap: 12, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: 10, padding: 10 },
  art: { width: 52, height: 52, borderRadius: 6 },
  artPlaceholder: { backgroundColor: colors.surface2 },
  title: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  subtitle: { color: colors.ink3, fontSize: 12, marginTop: 2 },
  linkText: { color: colors.redSoft, fontSize: 12, fontWeight: "600", marginTop: 4 },
});
