import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Share, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useAuth } from "../lib/AuthContext";
import { apiGet, apiPost, apiDelete } from "../lib/api";
import { API_BASE_URL } from "../lib/api";
import { colors, fonts } from "../lib/theme";
import { useToast } from "./ToastProvider";
import { UserHandleAutocomplete } from "./UserHandleAutocomplete";

type Promoter = { id: string; sharePercent: number; code: string; referredCount: number; user: { handle: string; displayName: string } };

// Owner-only, mirrors web's components/product/EventPromotersPanel.tsx —
// renders nothing for anyone but the event's own creator. Note this is a
// per-event revenue split the creator sets up, not a purchase flow — buying
// tickets stays web-only, same as every other product type.
export function EventPromotersPanel({
  eventId,
  eventTitle,
  creatorId,
  onFocusInput,
}: {
  eventId: string;
  eventTitle: string;
  creatorId: string;
  // This panel sits at the very bottom of EventScreen's ScrollView, well
  // below the fold — automaticallyAdjustKeyboardInsets alone doesn't
  // reliably scroll a distant, deeply-nested input into view once the
  // keyboard opens, so the screen scrolls itself to the end on focus instead.
  onFocusInput?: () => void;
}) {
  const { appUser, firebaseUser } = useAuth();
  const toast = useToast();
  const [promoters, setPromoters] = useState<Promoter[] | null>(null);
  const [handle, setHandle] = useState("");
  const [sharePercent, setSharePercent] = useState("10");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPercent, setEditPercent] = useState("");

  const isOwner = appUser?.id === creatorId;

  async function load() {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      const data = await apiGet<{ promoters: Promoter[] }>(`/api/events/${eventId}/promoters`, idToken);
      setPromoters(data.promoters);
    } catch {
      // owner-only endpoint — a stray failure here just leaves the list empty
    }
  }

  useEffect(() => {
    if (!isOwner) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, eventId, firebaseUser]);

  async function handleAdd() {
    if (!firebaseUser) return;
    const trimmed = handle.trim().replace(/^@/, "");
    const percent = Number(sharePercent);
    if (!trimmed || !Number.isInteger(percent) || percent < 1 || percent > 90) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/events/${eventId}/promoters`, idToken, { handle: trimmed, sharePercent: percent });
      setHandle("");
      await load();
      toast.success(`@${trimmed} added as a promoter.`);
    } catch (e) {
      Alert.alert("Could not add promoter", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  // Explicit ask, 2026-09-15: "event owners should be able to edit
  // percentage to give to their promoters after they have saved" — mirrors
  // web's components/product/EventPromotersPanel.tsx, reusing the same
  // POST (it upserts by handle) rather than a new endpoint.
  async function handleSaveEdit(p: Promoter) {
    if (!firebaseUser) return;
    const percent = Number(editPercent);
    if (!Number.isInteger(percent) || percent < 1 || percent > 90) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/events/${eventId}/promoters`, idToken, { handle: p.user.handle, sharePercent: percent });
      setEditingId(null);
      await load();
      toast.success(`@${p.user.handle}'s share updated to ${percent}%.`);
    } catch (e) {
      Alert.alert("Could not update promoter", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(promoterId: string) {
    if (!firebaseUser) return;
    setBusy(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiDelete(`/api/events/${eventId}/promoters/${promoterId}`, idToken);
      await load();
    } catch {
      Alert.alert("Could not remove promoter");
    } finally {
      setBusy(false);
    }
  }

  async function handleShare(code: string) {
    try {
      await Share.share({ message: `Get tickets to ${eventTitle} on XOLDOUT\n${API_BASE_URL}/e/${eventId}?promo=${code}` });
    } catch {
      // dismissed — nothing to do
    }
  }

  if (!isOwner) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Ticket promoters</Text>
      <Text style={styles.subtitle}>
        Add anyone to earn a % of your own ticket revenue when they bring in a sale through their own link.
      </Text>

      {promoters === null ? (
        <ActivityIndicator color={colors.ink} style={styles.spinner} />
      ) : (
        promoters.length > 0 && (
          <View style={styles.list}>
            {promoters.map((p) => (
              <View key={p.id} style={styles.row}>
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {p.user.displayName} <Text style={styles.rowHandle}>@{p.user.handle}</Text>
                  </Text>
                  {editingId === p.id ? (
                    <View style={styles.editRow}>
                      <TextInput
                        value={editPercent}
                        onChangeText={setEditPercent}
                        keyboardType="numeric"
                        autoFocus
                        onFocus={onFocusInput}
                        style={[styles.input, styles.editPercentInput]}
                      />
                      <Text style={styles.rowMeta}>% of your net</Text>
                      <TouchableOpacity onPress={() => handleSaveEdit(p)} disabled={busy}>
                        <Text style={styles.removeText}>Save</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setEditingId(null)} disabled={busy}>
                        <Text style={styles.rowMeta}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.rowMeta}>
                      {p.sharePercent}% of your net per ticket · {p.referredCount} referred
                    </Text>
                  )}
                </View>
                {editingId !== p.id && (
                  <View style={styles.rowActions}>
                    <TouchableOpacity style={styles.copyLinkButton} onPress={() => handleShare(p.code)}>
                      <Text style={styles.copyLinkText}>Share link</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingId(p.id);
                        setEditPercent(String(p.sharePercent));
                      }}
                      disabled={busy}
                    >
                      <Text style={styles.copyLinkText}>Edit %</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleRemove(p.id)} disabled={busy}>
                      <Text style={styles.removeText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )
      )}

      <View style={styles.addRow}>
        <View style={styles.handleField}>
          <Text style={styles.fieldLabel}>Handle</Text>
          <UserHandleAutocomplete
            value={handle}
            onChangeText={setHandle}
            onSelect={(u) => setHandle(u.handle)}
            excludeUserId={appUser?.id}
            style={styles.handleInput}
            onFocus={onFocusInput}
          />
        </View>
        <View>
          <Text style={styles.fieldLabel}>% you pay them per sale</Text>
          <TextInput
            value={sharePercent}
            onChangeText={setSharePercent}
            keyboardType="numeric"
            accessibilityLabel="Percentage of your own net you'll pay this promoter per ticket sold"
            onFocus={onFocusInput}
            style={[styles.input, styles.percentInput]}
          />
        </View>
        <TouchableOpacity style={styles.addButton} onPress={handleAdd} disabled={busy}>
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.helperNote}>
        This comes out of your own earnings, not the buyer&apos;s price — e.g. 10% means you keep 90% of your net on
        every ticket this promoter sells.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14 },
  title: { color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 },
  subtitle: { color: colors.ink3, fontSize: 12, lineHeight: 17, marginBottom: 12 },
  spinner: { marginVertical: 8 },
  list: { borderTopWidth: 1, borderColor: colors.lineSoft, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  rowHandle: { color: colors.ink3, fontWeight: "400" },
  rowMeta: { color: colors.ink3, fontSize: 12, marginTop: 1 },
  rowActions: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  editPercentInput: { width: 52, textAlign: "center", paddingHorizontal: 6, paddingVertical: 5, fontSize: 12 },
  copyLinkButton: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  copyLinkText: { color: colors.ink2, fontSize: 11.5, fontWeight: "600" },
  removeText: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  addRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  helperNote: { color: colors.ink3, fontSize: 11, lineHeight: 15, marginTop: 8 },
  fieldLabel: { color: colors.ink3, fontSize: 10, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 },
  handleField: { flex: 1, minWidth: 0 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: colors.ink,
    fontSize: 13,
  },
  handleInput: { flex: 1, minWidth: 0 },
  percentInput: { width: 60, textAlign: "center" },
  addButton: { backgroundColor: colors.red, borderRadius: 10, paddingHorizontal: 14, justifyContent: "center" },
  addButtonText: { color: colors.ink, fontSize: 13, fontWeight: "700" },
});
