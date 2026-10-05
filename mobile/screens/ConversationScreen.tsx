import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useIsFocused, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAuth } from "../lib/AuthContext";
import { API_BASE_URL } from "../lib/api";
import { uploadAndFinalizeArtwork } from "../lib/uploadImage";
import { DISAPPEAR_CHOICES, type DmMessage, type DmPerson, type DmThread } from "../lib/messageTypes";
import type { RootStackParamList } from "../lib/navigation";
import { colors } from "../lib/theme";
import { Avatar } from "../components/Avatar";
import { ActionSheet } from "../components/ActionSheet";
import { ReportSheet } from "../components/ReportSheet";
import { useToast } from "../components/ToastProvider";

// Mirrors web's app/(app)/messages/[id]/page.tsx (direct messages, explicit
// ask 2026-10-04) — rules live server-side in web's lib/messages. Opened
// with { id } for an existing conversation or { toUserId } to start one.
// Refreshes every 3s while focused.

const REFRESH_MS = 3_000;

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit" });
}

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" });
}

export function ConversationScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Conversation">>();
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const isFocused = useIsFocused();
  const [conversationId, setConversationId] = useState<string | null>(route.params.id ?? null);
  const [newTo, setNewTo] = useState<{ person: DmPerson; blocked: boolean } | null>(null);
  const [thread, setThread] = useState<DmThread | null>(null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [disappearOpen, setDisappearOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [selected, setSelected] = useState<DmMessage | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);

  // Calls the API and surfaces the server's own error text.
  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
      if (!firebaseUser) throw new Error("Not signed in");
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw Object.assign(new Error(data.error ?? "Something went wrong"), { status: res.status });
      return data as T;
    },
    [firebaseUser],
  );

  // Starting a new conversation: jump to the existing one if there is one.
  useEffect(() => {
    const to = route.params.toUserId;
    if (conversationId || !to || !firebaseUser) return;
    call<{ user: DmPerson; conversationId: string | null; blockedByMe: boolean; blockedMe: boolean }>("GET", `/api/messages/with/${to}`)
      .then((d) => {
        if (d.conversationId) setConversationId(d.conversationId);
        else setNewTo({ person: d.user, blocked: d.blockedByMe || d.blockedMe });
      })
      .catch(() => setMissing(true));
  }, [call, conversationId, firebaseUser, route.params.toUserId]);

  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      setThread(await call<DmThread>("GET", `/api/messages/${conversationId}`));
    } catch (err) {
      if ((err as { status?: number }).status === 404) setMissing(true);
    }
  }, [call, conversationId]);

  useEffect(() => {
    if (!isFocused || !conversationId) return;
    load();
    const id = setInterval(load, REFRESH_MS);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") load();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [isFocused, conversationId, load]);

  const other = thread?.other ?? newTo?.person ?? null;
  useEffect(() => {
    navigation.setOptions({
      title: other?.displayName ?? "",
      headerRight: thread
        ? () => (
            <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={10}>
              <Text style={styles.menuDots}>•••</Text>
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, other?.displayName, thread]);

  async function sendMessage(message: Record<string, unknown>) {
    if (conversationId) {
      await call("POST", `/api/messages/${conversationId}/messages`, message);
      await load();
    } else if (newTo) {
      const res = await call<{ conversationId: string }>("POST", "/api/messages", { toUserId: newTo.person.id, message });
      setConversationId(res.conversationId);
    }
  }

  async function sendText() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendMessage({ kind: "TEXT", body });
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send");
    } finally {
      setSending(false);
    }
  }

  async function pickImage() {
    if (!firebaseUser) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setSending(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const ladder = await uploadAndFinalizeArtwork(asset.uri, asset.mimeType ?? "image/jpeg", idToken);
      await sendMessage({ kind: "IMAGE", imageUrl: ladder["1024"], body: text.trim() || undefined });
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send that photo");
    } finally {
      setSending(false);
    }
  }

  async function act(body: Record<string, unknown>, success?: string) {
    if (!conversationId) return false;
    try {
      await call("POST", `/api/messages/${conversationId}`, body);
      if (success) toast.success(success);
      await load();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      return false;
    }
  }

  async function setBlock(blocked: boolean) {
    if (!thread) return;
    try {
      await call("POST", "/api/blocks", { userId: thread.other.id, blocked });
      toast.success(blocked ? `${thread.other.displayName} is blocked.` : `${thread.other.displayName} is unblocked.`);
      await load();
    } catch {
      toast.error("Something went wrong");
    }
  }

  async function deleteSelected() {
    if (!selected || !conversationId) return;
    const id = selected.id;
    setSelected(null);
    try {
      await call("DELETE", `/api/messages/${conversationId}/messages/${id}`);
      await load();
    } catch {
      toast.error("Couldn't delete that message");
    }
  }

  if (missing) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Conversation not found</Text>
      </View>
    );
  }
  if (!thread && !newTo) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const t = thread;
  const lastMine = t ? [...t.messages].reverse().find((m) => m.fromMe && m.kind !== "SYSTEM") : undefined;
  const seen = !!(t && lastMine && t.otherLastReadAt && new Date(t.otherLastReadAt) >= new Date(lastMine.createdAt));
  const canSend = t ? !t.blockedByMe && !t.blockedMe && !t.waitingForAccept : !newTo?.blocked;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      {t?.disappear.seconds ? <Text style={styles.disappearBar}>⏱ Disappearing messages · {t.disappear.label}</Text> : null}

      {t?.disappear.pending && (
        <View style={styles.pendingBar}>
          <Text style={styles.pendingText}>
            {t.disappear.pending.byMe
              ? `Waiting for ${t.other.displayName} to approve ${t.disappear.pending.seconds ? `disappearing messages (${t.disappear.pending.label})` : "turning them off"}.`
              : `${t.other.displayName} wants to ${t.disappear.pending.seconds ? `turn on disappearing messages (${t.disappear.pending.label})` : "turn off disappearing messages"}.`}
          </Text>
          <View style={styles.pendingActions}>
            {t.disappear.pending.byMe ? (
              <TouchableOpacity onPress={() => act({ action: "disappear-respond", approve: false })}>
                <Text style={styles.linkText}>Withdraw</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity onPress={() => act({ action: "disappear-respond", approve: false })}>
                  <Text style={styles.linkText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.smallPrimary} onPress={() => act({ action: "disappear-respond", approve: true }, "Disappearing messages updated.")}>
                  <Text style={styles.smallPrimaryText}>Approve</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12, gap: 6 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {!t || t.messages.length === 0 ? (
          <View style={styles.hello}>
            {other && <Avatar uri={other.avatarUrl} name={other.displayName} index={0} size={72} />}
            <Text style={styles.helloName}>{other?.displayName}</Text>
            <Text style={styles.helloHint}>
              {newTo?.blocked
                ? "You can't message this person."
                : "If they don't follow you, your message arrives as a request — you can send more once they accept."}
            </Text>
          </View>
        ) : (
          t.messages.map((m, i) => {
            const prev = t.messages[i - 1];
            const newDay = !prev || dayOf(prev.createdAt) !== dayOf(m.createdAt);
            return (
              <View key={m.id}>
                {newDay && <Text style={styles.day}>{dayOf(m.createdAt)}</Text>}
                {m.kind === "SYSTEM" ? (
                  <Text style={styles.system}>⏱ {m.body}</Text>
                ) : (
                  <View style={{ alignItems: m.fromMe ? "flex-end" : "flex-start" }}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onLongPress={() => m.fromMe && !m.deleted && setSelected(m)}
                      onPress={() => {
                        if (m.share && !m.deleted) {
                          if (m.share.type === "LIVE") navigation.navigate("LiveViewer", { id: m.share.id });
                          else if (m.share.type === "EVENT") navigation.navigate("Event", { id: m.share.id });
                          else navigation.navigate("Product", { id: m.share.id });
                        }
                      }}
                      style={[styles.bubble, m.deleted ? styles.deleted : m.fromMe ? styles.mine : styles.theirs]}
                    >
                      {m.deleted ? (
                        <Text style={styles.deletedText}>Message deleted</Text>
                      ) : (
                        <>
                          {m.kind === "IMAGE" && m.imageUrl && <Image source={{ uri: m.imageUrl }} style={styles.photo} />}
                          {m.kind === "SHARE" &&
                            (m.share ? (
                              <View style={styles.card}>
                                {m.share.imageUrl ? (
                                  <Image source={{ uri: m.share.imageUrl }} style={styles.cardImage} />
                                ) : (
                                  <View style={[styles.cardImage, styles.cardImageEmpty]}>
                                    <Text>{m.share.type === "LIVE" ? "🔴" : "🎵"}</Text>
                                  </View>
                                )}
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={styles.cardTitle} numberOfLines={1}>
                                    {m.share.title}
                                  </Text>
                                  <Text style={styles.cardSub} numberOfLines={1}>
                                    {m.share.subtitle}
                                  </Text>
                                  {m.share.status && (
                                    <Text style={[styles.cardStatus, m.share.status === "Live now" && styles.cardLive]}>
                                      {m.share.status === "Live now" ? "Join live" : m.share.status}
                                    </Text>
                                  )}
                                </View>
                              </View>
                            ) : (
                              <Text style={styles.deletedText}>This item is no longer available</Text>
                            ))}
                          {!!m.body && <Text style={[styles.body, m.fromMe && styles.bodyMine]}>{m.body}</Text>}
                        </>
                      )}
                      <Text style={[styles.time, m.fromMe && !m.deleted && styles.timeMine]}>
                        {m.expiresAt ? "⏱ " : ""}
                        {timeOf(m.createdAt)}
                      </Text>
                    </TouchableOpacity>
                    {lastMine?.id === m.id && seen && <Text style={styles.seen}>Seen</Text>}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {t && t.myStatus === "REQUEST" && !t.blockedByMe ? (
        <View style={styles.requestBar}>
          <Text style={styles.requestText}>
            {t.other.displayName} wants to send you a message. They won&apos;t know you&apos;ve seen it until you accept.
          </Text>
          <View style={styles.requestActions}>
            <TouchableOpacity style={styles.requestGhost} onPress={() => setBlock(true)}>
              <Text style={[styles.requestGhostText, { color: colors.redSoft }]}>Block</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.requestGhost}
              onPress={async () => {
                if (await act({ action: "hide" })) navigation.goBack();
              }}
            >
              <Text style={styles.requestGhostText}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.requestPrimary} onPress={() => act({ action: "accept" }, "Request accepted.")}>
              <Text style={styles.requestPrimaryText}>Accept</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : !canSend ? (
        <View style={styles.requestBar}>
          <Text style={styles.requestText}>
            {t?.blockedByMe
              ? `You blocked ${t.other.displayName}.`
              : t?.blockedMe || newTo?.blocked
                ? "You can't reply to this conversation."
                : `Message request sent. You can send more once ${other?.displayName} accepts.`}
          </Text>
          {t?.blockedByMe && (
            <TouchableOpacity onPress={() => setBlock(false)}>
              <Text style={[styles.linkText, { textAlign: "center", marginTop: 6 }]}>Unblock</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.composer}>
          <TouchableOpacity onPress={pickImage} disabled={sending} style={styles.iconButton} accessibilityLabel="Send a photo">
            <Text style={styles.iconText}>🖼</Text>
          </TouchableOpacity>
          <TextInput
            value={text}
            onChangeText={(v) => setText(v.slice(0, 2000))}
            placeholder="Message…"
            placeholderTextColor={colors.ink3}
            multiline
            style={styles.input}
          />
          <TouchableOpacity onPress={sendText} disabled={sending || !text.trim()} style={[styles.sendButton, (sending || !text.trim()) && { opacity: 0.4 }]}>
            <Text style={styles.sendText}>➤</Text>
          </TouchableOpacity>
        </View>
      )}

      {t && (
        <ActionSheet
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          actions={[
            {
              label: `Disappearing messages · ${t.disappear.label}`,
              onPress: () => {
                setMenuOpen(false);
                setDisappearOpen(true);
              },
            },
            {
              label: "View profile",
              onPress: () => {
                setMenuOpen(false);
                navigation.navigate("Creator", { handle: t.other.handle });
              },
            },
            {
              label: t.blockedByMe ? `Unblock ${t.other.displayName}` : `Block ${t.other.displayName}`,
              destructive: !t.blockedByMe,
              onPress: () => {
                setMenuOpen(false);
                setBlock(!t.blockedByMe);
              },
            },
            {
              label: "Report conversation",
              destructive: true,
              onPress: () => {
                setMenuOpen(false);
                setReportOpen(true);
              },
            },
            {
              label: "Delete conversation",
              destructive: true,
              onPress: async () => {
                setMenuOpen(false);
                if (await act({ action: "hide" })) navigation.goBack();
              },
            },
          ]}
        />
      )}

      {t && (
        <ActionSheet
          visible={disappearOpen}
          title={`New messages disappear after the time you pick. ${t.other.displayName} has to approve the change.`}
          onClose={() => setDisappearOpen(false)}
          actions={[...DISAPPEAR_CHOICES, { seconds: 0, label: "Off" }]
            .filter((c) => (t.disappear.seconds ?? 0) !== c.seconds)
            .map((c) => ({
              label: c.label,
              onPress: () => {
                setDisappearOpen(false);
                if (t.disappear.pending) {
                  toast.error("A change is already waiting for an answer.");
                  return;
                }
                act(
                  { action: "disappear-propose", seconds: c.seconds },
                  `Asked ${t.other.displayName} to ${c.seconds ? `turn on disappearing messages (${c.label})` : "turn off disappearing messages"}.`,
                );
              },
            }))}
        />
      )}

      <ActionSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        actions={[{ label: "Delete for everyone", destructive: true, onPress: deleteSelected }]}
      />

      {t && <ReportSheet visible={reportOpen} onClose={() => setReportOpen(false)} targetType="CONVERSATION" targetId={t.id} />}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  menuDots: { color: colors.ink2, fontSize: 16, fontWeight: "700", letterSpacing: 1 },
  disappearBar: { color: colors.ink3, fontSize: 12, textAlign: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  pendingBar: { backgroundColor: "rgba(217,154,43,0.1)", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  pendingText: { color: colors.ink, fontSize: 13 },
  pendingActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 14, marginTop: 8 },
  linkText: { color: colors.redSoft, fontSize: 13, fontWeight: "700" },
  smallPrimary: { backgroundColor: colors.red, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  smallPrimaryText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  hello: { alignItems: "center", paddingVertical: 60, gap: 8 },
  helloName: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  helloHint: { color: colors.ink3, fontSize: 13, textAlign: "center", maxWidth: 280 },
  day: { color: colors.ink3, fontSize: 11, textAlign: "center", marginVertical: 10 },
  system: { color: colors.ink3, fontSize: 12, textAlign: "center", marginVertical: 4 },
  bubble: { maxWidth: "80%", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { backgroundColor: colors.red, borderBottomRightRadius: 6 },
  theirs: { backgroundColor: colors.surface2, borderBottomLeftRadius: 6 },
  deleted: { borderWidth: 1, borderColor: colors.lineSoft },
  deletedText: { color: colors.ink3, fontSize: 14, fontStyle: "italic" },
  body: { color: colors.ink, fontSize: 14 },
  bodyMine: { color: "#fff" },
  photo: { width: 220, height: 220, borderRadius: 12, marginBottom: 4 },
  card: { flexDirection: "row", gap: 10, alignItems: "center", width: 230, backgroundColor: "rgba(0,0,0,0.3)", borderRadius: 12, padding: 8, marginBottom: 4 },
  cardImage: { width: 52, height: 52, borderRadius: 8 },
  cardImageEmpty: { backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  cardTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  cardSub: { color: "rgba(255,255,255,0.75)", fontSize: 12 },
  cardStatus: { alignSelf: "flex-start", marginTop: 3, color: "#fff", fontSize: 10, fontWeight: "700", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 999, paddingHorizontal: 6, overflow: "hidden" },
  cardLive: { backgroundColor: colors.red },
  time: { color: colors.ink3, fontSize: 10, textAlign: "right", marginTop: 2 },
  timeMine: { color: "rgba(255,255,255,0.7)" },
  seen: { color: colors.ink3, fontSize: 11, marginTop: 2 },
  requestBar: { borderTopWidth: 1, borderTopColor: colors.lineSoft, padding: 14 },
  requestText: { color: colors.ink2, fontSize: 13, textAlign: "center" },
  requestActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  requestGhost: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  requestGhostText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  requestPrimary: { flex: 1, backgroundColor: colors.red, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  requestPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  iconButton: { padding: 8 },
  iconText: { fontSize: 22 },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.ink,
    fontSize: 14,
  },
  sendButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.red, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#fff", fontSize: 16 },
});
