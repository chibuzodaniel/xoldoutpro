import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { API_BASE_URL, apiDelete, apiGet, apiPost } from "../lib/api";
import { useAuth } from "../lib/AuthContext";
import { uploadImage } from "../lib/uploadImage";
import type { ChatMessage, GroupDetail, JoinRequestStatus, GroupRole } from "../lib/fanbaseTypes";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";
import { Avatar } from "../components/Avatar";
import { ActionSheet } from "../components/ActionSheet";

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function GroupScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Group">>();
  const { id, name } = route.params;
  const { appUser, firebaseUser } = useAuth();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [myRole, setMyRole] = useState<GroupRole | null>(null);
  const [joinRequestStatus, setJoinRequestStatus] = useState<JoinRequestStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [joining, setJoining] = useState(false);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<{ uri: string; type: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const listRef = useRef<FlatList>(null);

  const loadGroup = useCallback(async () => {
    if (!firebaseUser) return;
    const idToken = await firebaseUser.getIdToken();
    try {
      const data = await apiGet<{ group: GroupDetail; myRole: GroupRole | null; joinRequestStatus: JoinRequestStatus | null }>(
        `/api/groups/${id}`,
        idToken,
      );
      setGroup(data.group);
      setMyRole(data.myRole);
      setJoinRequestStatus(data.joinRequestStatus);
    } catch {
      // ignore
    }
  }, [firebaseUser, id]);

  useEffect(() => {
    loadGroup();
  }, [loadGroup]);

  useEffect(() => {
    if (myRole === null || !firebaseUser) return;
    firebaseUser
      .getIdToken()
      .then((idToken) => apiGet<{ posts: ChatMessage[] }>(`/api/groups/${id}/posts`, idToken))
      .then((data) => setMessages(data.posts))
      .catch(() => setMessages([]));
  }, [myRole, firebaseUser, id]);

  async function handleJoin() {
    if (!firebaseUser) return;
    setJoining(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/groups/${id}/join`, idToken);
      await loadGroup();
    } catch {
      // ignore
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiDelete(`/api/groups/${id}/join`, idToken);
      navigation.goBack();
    } catch {
      // ignore
    }
  }

  async function handleShare() {
    try {
      await Share.share({ message: `Join ${group?.name ?? "this Fanbase"} on XOLDOUT\n${API_BASE_URL}/groups/${id}` });
    } catch {
      // dismissed
    }
  }

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setImage({ uri: asset.uri, type: asset.mimeType ?? "image/jpeg" });
  }

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || !firebaseUser) return;
    setSending(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      let imageUrl: string | null = null;
      if (image) {
        const key = await uploadImage(image.uri, image.type, "artwork", idToken);
        const data = await apiPost<{ artworkLadder: Record<string, string> }>("/api/uploads/artwork/finalize", idToken, { key });
        imageUrl = data.artworkLadder["1024"];
      }
      const data = await apiPost<{ post: ChatMessage }>(`/api/groups/${id}/posts`, idToken, { body: trimmed, imageUrl });
      setMessages((cur) => [...(cur ?? []), data.post]);
      setBody("");
      setImage(null);
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(message: ChatMessage) {
    if (!firebaseUser) return;
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiDelete(`/api/posts/${message.id}`, idToken);
      setMessages((cur) => cur?.filter((m) => m.id !== message.id) ?? null);
    } catch {
      // ignore
    }
  }

  if (!group) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const isMember = myRole !== null;
  const amCreator = appUser?.id === group.creatorId;
  const canPost =
    group.postPermission === "ALL_MEMBERS" ? isMember : group.postPermission === "ADMINS" ? myRole === "ADMIN" : amCreator;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <Avatar uri={group.coverImageUrl} name={group.name} index={0} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.groupName} numberOfLines={1}>
            {group.name || name}
          </Text>
          <Text style={styles.memberCount}>
            {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
          </Text>
        </View>
        {isMember && (
          <TouchableOpacity onPress={handleShare}>
            <Text style={styles.headerActionText}>Share</Text>
          </TouchableOpacity>
        )}
        {myRole === "ADMIN" && (
          <TouchableOpacity onPress={() => navigation.navigate("GroupMembers", { id, isCreator: amCreator })}>
            <Text style={styles.headerActionText}>Manage</Text>
          </TouchableOpacity>
        )}
      </View>

      {group.description && <Text style={styles.description}>{group.description}</Text>}

      {!isMember ? (
        <View style={styles.joinBox}>
          {joinRequestStatus === "PENDING" ? (
            <Text style={styles.pendingText}>Your request to join is pending approval.</Text>
          ) : (
            <TouchableOpacity style={styles.joinButton} onPress={handleJoin} disabled={joining}>
              {joining ? (
                <ActivityIndicator size="small" color={colors.ink} />
              ) : (
                <Text style={styles.joinButtonText}>{group.visibility === "OPEN" ? "Join group" : "Request to join"}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <>
          {!amCreator && (
            <TouchableOpacity onPress={handleLeave}>
              <Text style={styles.leaveText}>Leave group</Text>
            </TouchableOpacity>
          )}

          {messages === null ? (
            <View style={styles.centeredInline}>
              <ActivityIndicator color={colors.ink} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              style={styles.messageList}
              contentContainerStyle={styles.messageListContent}
              data={messages}
              keyExtractor={(m) => m.id}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
              ListEmptyComponent={<Text style={styles.emptyText}>No messages yet — say something.</Text>}
              renderItem={({ item }) => {
                const isMine = item.author.id === appUser?.id;
                const canDelete = isMine || myRole === "ADMIN";
                return (
                  <TouchableOpacity
                    style={[styles.messageRow, isMine && styles.messageRowMine]}
                    onLongPress={() => canDelete && setActionsFor(item)}
                  >
                    {!isMine && <Avatar uri={item.author.avatarUrl} name={item.author.displayName} index={0} size={28} />}
                    <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                      {!isMine && <Text style={styles.messageAuthor}>{item.author.displayName}</Text>}
                      {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.messageImage} />}
                      {item.body ? <Text style={styles.messageBody}>{item.body}</Text> : null}
                      <Text style={styles.messageTime}>{timeAgo(item.createdAt)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {canPost && (
            <View style={styles.composer}>
              {image && (
                <View style={styles.imagePreviewBox}>
                  <Image source={{ uri: image.uri }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeImageButton} onPress={() => setImage(null)}>
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.composerRow}>
                <TouchableOpacity onPress={pickImage}>
                  <Text style={styles.imagePickerIcon}>🖼</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.composerInput}
                  value={body}
                  onChangeText={(t) => setBody(t.slice(0, 500))}
                  placeholder="Message…"
                  placeholderTextColor={colors.ink3}
                  multiline
                />
                <TouchableOpacity onPress={handleSend} disabled={sending || !body.trim()}>
                  {sending ? <ActivityIndicator size="small" color={colors.ink} /> : <Text style={styles.sendText}>Send</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {actionsFor && (
        <ActionSheet
          visible
          title="Message"
          onClose={() => setActionsFor(null)}
          actions={[{ label: "Delete", destructive: true, onPress: () => handleDeleteMessage(actionsFor) }]}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  centeredInline: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  groupName: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  memberCount: { color: colors.ink3, fontSize: 11, marginTop: 1 },
  headerActionText: { color: colors.redSoft, fontSize: 12, fontWeight: "700", marginLeft: 12 },
  description: { color: colors.ink2, fontSize: 13, paddingHorizontal: 16, paddingVertical: 10 },
  joinBox: { padding: 16 },
  pendingText: { color: colors.ink3, fontSize: 13 },
  joinButton: { backgroundColor: colors.red, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 20, alignSelf: "flex-start" },
  joinButtonText: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  leaveText: { color: colors.ink3, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 },
  messageList: { flex: 1 },
  messageListContent: { padding: 16, gap: 10 },
  emptyText: { color: colors.ink3, fontSize: 13, textAlign: "center", marginTop: 40 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "85%" },
  messageRowMine: { alignSelf: "flex-end", flexDirection: "row-reverse" },
  bubble: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, maxWidth: "100%" },
  bubbleTheirs: { backgroundColor: colors.surface2 },
  bubbleMine: { backgroundColor: "rgba(225,29,46,0.25)" },
  messageAuthor: { color: colors.redSoft, fontSize: 11, fontWeight: "700", marginBottom: 2 },
  messageImage: { width: 180, height: 180, borderRadius: 8, marginBottom: 6, backgroundColor: colors.surface2 },
  messageBody: { color: colors.ink, fontSize: 14, lineHeight: 19 },
  messageTime: { color: colors.ink3, fontSize: 10, marginTop: 4, alignSelf: "flex-end" },
  composer: { borderTopWidth: 1, borderTopColor: colors.lineSoft, padding: 10 },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  imagePickerIcon: { fontSize: 22, marginBottom: 4 },
  composerInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: colors.ink,
    fontSize: 14,
    maxHeight: 100,
  },
  sendText: { color: colors.redSoft, fontSize: 14, fontWeight: "700", marginBottom: 6 },
  imagePreviewBox: { width: 72, height: 72, borderRadius: 8, overflow: "hidden", marginBottom: 8, position: "relative" },
  imagePreview: { width: "100%", height: "100%" },
  removeImageButton: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  removeImageText: { color: colors.ink, fontSize: 9 },
});
