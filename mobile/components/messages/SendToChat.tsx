import { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useAuth } from "../../lib/AuthContext";
import { apiGet, apiPost } from "../../lib/api";
import type { DmConversationRow, DmPerson, DmShareTarget } from "../../lib/messageTypes";
import { colors, fonts } from "../../lib/theme";
import { Avatar } from "../Avatar";
import { BottomSheet } from "../live/LiveBits";
import { useToast } from "../ToastProvider";

// Mirrors web's components/messages/SendToChatButton.tsx: "Send" on a
// product, event or Live — pick a recent chat or search anyone, add an
// optional note, and it arrives as a tappable card.

export function SendToChatButton({ share, style, textStyle }: { share: DmShareTarget; style?: object; textStyle?: object }) {
  const { firebaseUser } = useAuth();
  const [open, setOpen] = useState(false);
  if (!firebaseUser) return null;
  return (
    <>
      <TouchableOpacity style={style ?? styles.button} onPress={() => setOpen(true)} accessibilityLabel="Send in a message">
        <Text style={textStyle ?? styles.buttonText}>✉ Send</Text>
      </TouchableOpacity>
      <SendToChatSheet share={share} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function SendToChatSheet({ share, visible, onClose }: { share: DmShareTarget; visible: boolean; onClose: () => void }) {
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const [recent, setRecent] = useState<DmConversationRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DmPerson[]>([]);
  const [note, setNote] = useState("");
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ conversations: DmConversationRow[] }>("/api/messages?box=inbox", idToken))
      .then((d) => setRecent(d.conversations))
      .catch(() => setRecent([]));
  }, [visible, firebaseUser]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = setTimeout(() => {
      apiGet<{ creators: DmPerson[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((d) => setResults(d.creators ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  async function send(person: DmPerson) {
    if (!firebaseUser) return;
    setBusyId(person.id);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost("/api/messages", idToken, { toUserId: person.id, message: { kind: "SHARE", share, body: note.trim() || undefined } });
      setSentTo((cur) => new Set(cur).add(person.id));
      toast.success(`Sent to ${person.displayName}.`);
    } catch (err) {
      toast.error(err instanceof Error && err.message.endsWith("403") ? "You can't message this person right now." : "Couldn't send. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  const people: DmPerson[] = query.trim().length >= 2 ? results : (recent ?? []).map((c) => c.other).filter((p): p is DmPerson => !!p);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Send to</Text>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search people" placeholderTextColor={colors.ink3} style={styles.input} />
      <ScrollView style={{ maxHeight: 320 }}>
        {people.length === 0 ? (
          <Text style={styles.empty}>{query.trim().length >= 2 ? "No one found." : recent === null ? "Loading…" : "Search for someone to send this to."}</Text>
        ) : (
          people.map((p, i) => (
            <View key={p.id} style={styles.row}>
              <Avatar uri={p.avatarUrl} name={p.displayName} index={i} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {p.displayName}
                </Text>
                <Text style={styles.handle} numberOfLines={1}>
                  @{p.handle}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.send, sentTo.has(p.id) && styles.sent]}
                disabled={busyId === p.id || sentTo.has(p.id)}
                onPress={() => send(p)}
              >
                <Text style={styles.sendText}>{sentTo.has(p.id) ? "Sent" : "Send"}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
      <TextInput
        value={note}
        onChangeText={(t) => setNote(t.slice(0, 500))}
        placeholder="Add a message (optional)"
        placeholderTextColor={colors.ink3}
        style={[styles.input, { marginTop: 10, marginBottom: 0 }]}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  button: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  buttonText: { color: colors.ink2, fontSize: 13, fontWeight: "600" },
  title: { color: colors.ink, fontSize: 24, fontFamily: fonts.serif, marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    marginBottom: 10,
  },
  empty: { color: colors.ink3, fontSize: 13, textAlign: "center", paddingVertical: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  name: { color: colors.ink, fontSize: 15 },
  handle: { color: colors.ink3, fontSize: 12 },
  send: { backgroundColor: colors.red, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  sent: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  sendText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
