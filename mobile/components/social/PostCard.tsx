import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, Pressable, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { apiDelete, apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import type { FeedPost, PostComment } from "../../lib/socialTypes";
import type { RootStackParamList } from "../../lib/navigation";
import { colors, fonts } from "../../lib/theme";
import { Avatar } from "../Avatar";
import { FollowButton } from "./FollowButton";

const DOUBLE_TAP_WINDOW_MS = 300;

function timeAgo(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

export function PostCard({
  post,
  onDeleted,
  onExpandComments,
}: {
  post: FeedPost;
  onDeleted?: (postId: string) => void;
  // Lets the hosting FlatList (SocialsScreen) scroll this row into view once
  // the comment input actually exists — a FlatList row's own KeyboardAvoidingView
  // inset can't reach content the keyboard already covers when it opens, since
  // this input only mounts on expand and sits at the bottom of a
  // variable-height card.
  onExpandComments?: () => void;
}) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { appUser, firebaseUser } = useAuth();
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [busy, setBusy] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[] | null>(null);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [commentBody, setCommentBody] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const lastTapRef = useRef(0);
  const heartAnim = useRef(new Animated.Value(0)).current;

  async function toggleComments() {
    const next = !commentsOpen;
    setCommentsOpen(next);
    if (next) {
      // Double rAF: wait for the newly-expanded section's layout to commit
      // before asking the list to scroll to it, or it scrolls to where the
      // (shorter, pre-expand) row used to end.
      requestAnimationFrame(() => requestAnimationFrame(() => onExpandComments?.()));
    }
    if (next && comments === null && firebaseUser) {
      try {
        const idToken = await firebaseUser.getIdToken();
        const data = await apiGet<{ comments: PostComment[] }>(`/api/posts/${post.id}/comments`, idToken);
        setComments(data.comments);
      } catch {
        setComments([]);
      } finally {
        // The spinner-to-list swap changes this row's height again once
        // comments actually arrive — re-settle the scroll position for it.
        requestAnimationFrame(() => requestAnimationFrame(() => onExpandComments?.()));
      }
    }
  }

  async function handleAddComment() {
    const trimmed = commentBody.trim();
    if (!trimmed || !firebaseUser) return;
    setPostingComment(true);
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiPost<{ comment: PostComment }>(`/api/posts/${post.id}/comments`, idToken, { body: trimmed });
      setComments((cur) => [...(cur ?? []), data.comment]);
      setCommentCount((c) => c + 1);
      setCommentBody("");
    } catch {
      Alert.alert("Couldn't post your comment. Try again.");
    } finally {
      setPostingComment(false);
    }
  }

  function handleDelete() {
    Alert.alert("Delete this post?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!firebaseUser) return;
          // Removes from the feed immediately rather than waiting on the
          // network round trip — the confirmation dialog already got explicit
          // intent, so there's nothing left for a spinner to protect against.
          onDeleted?.(post.id);
          try {
            const idToken = await firebaseUser.getIdToken();
            await apiDelete(`/api/posts/${post.id}`, idToken);
          } catch {
            Alert.alert("Couldn't delete this post. Try again.");
          }
        },
      },
    ]);
  }

  async function toggleLike() {
    if (busy || !firebaseUser) return;
    setBusy(true);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => c + (nextLiked ? 1 : -1));
    try {
      const idToken = await firebaseUser.getIdToken();
      const data = await apiPost<{ liked: boolean; likeCount: number }>(`/api/posts/${post.id}/like`, idToken);
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    } catch {
      setLiked(!nextLiked);
      setLikeCount((c) => c + (nextLiked ? -1 : 1));
    } finally {
      setBusy(false);
    }
  }

  // Double-tap on the photo (or, for a text-only post, the body) toggles
  // like the same as tapping the heart button — mirrors web's PostCard.tsx
  // gesture 1:1, including that a second double-tap unlikes again rather
  // than only ever liking. Manual timestamp-based detection since RN has no
  // built-in double-tap event.
  function handleDoubleTapLike() {
    const now = Date.now();
    const isDoubleTap = now - lastTapRef.current < DOUBLE_TAP_WINDOW_MS;
    lastTapRef.current = isDoubleTap ? 0 : now;
    if (!isDoubleTap) return;

    // Only the like transition pops the heart — double-tapping an
    // already-liked post to unlike it stays silent, same as web.
    if (!liked) {
      heartAnim.setValue(0);
      Animated.sequence([
        Animated.spring(heartAnim, { toValue: 1, useNativeDriver: true, friction: 4 }),
        Animated.timing(heartAnim, { toValue: 0, duration: 250, delay: 350, useNativeDriver: true }),
      ]).start();
    }
    toggleLike();
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate("Creator", { handle: post.author.handle })}>
          <Avatar uri={post.author.avatarUrl} name={post.author.displayName} index={0} size={32} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <TouchableOpacity onPress={() => navigation.navigate("Creator", { handle: post.author.handle })}>
            <Text style={styles.authorName} numberOfLines={1}>
              {post.author.displayName}
            </Text>
          </TouchableOpacity>
          <Text style={styles.timeText}>{timeAgo(post.createdAt)}</Text>
        </View>
        {appUser?.id !== post.author.id && (
          <FollowButton targetUserId={post.author.id} compact initialFollowing={post.followedByMe} />
        )}
        {appUser?.id === post.author.id && (
          <TouchableOpacity onPress={handleDelete}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>

      <Pressable onPress={post.imageUrl ? undefined : handleDoubleTapLike}>
        <Text style={styles.body}>{post.body}</Text>
      </Pressable>

      {post.imageUrl && (
        <Pressable onPress={handleDoubleTapLike} style={styles.postImageWrap}>
          <Image source={{ uri: post.imageUrl }} style={styles.postImage} />
          <Animated.Text
            pointerEvents="none"
            style={[
              styles.flyingHeart,
              {
                opacity: heartAnim,
                transform: [{ scale: heartAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.3] }) }],
              },
            ]}
          >
            ♥
          </Animated.Text>
        </Pressable>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionButton} onPress={toggleLike}>
          <Text style={[styles.actionIcon, liked && styles.likedIcon]}>{liked ? "♥" : "♡"}</Text>
          <Text style={[styles.actionText, liked && styles.likedText]}>{likeCount.toLocaleString("en-NG")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={toggleComments}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionText}>{commentCount > 0 ? commentCount.toLocaleString("en-NG") : "Comment"}</Text>
        </TouchableOpacity>
      </View>

      {commentsOpen && (
        <View style={styles.commentsSection}>
          {comments === null ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.commentRow}>
                <Avatar uri={c.author.avatarUrl} name={c.author.displayName} index={0} size={24} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.commentText}>
                    <Text style={styles.commentAuthor}>{c.author.displayName} </Text>
                    {c.body}
                  </Text>
                  <Text style={styles.commentTime}>{timeAgo(c.createdAt)}</Text>
                </View>
              </View>
            ))
          )}
          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              value={commentBody}
              onChangeText={(t) => setCommentBody(t.slice(0, 500))}
              placeholder="Add a comment…"
              placeholderTextColor={colors.ink3}
            />
            <TouchableOpacity onPress={handleAddComment} disabled={postingComment || !commentBody.trim()}>
              <Text style={styles.postCommentText}>Post</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(225,29,46,0.15)", backgroundColor: "rgba(225,29,46,0.08)", padding: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  authorName: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  timeText: { color: colors.ink3, fontSize: 11, marginTop: 1 },
  deleteText: { color: colors.ink3, fontSize: 12 },
  body: { color: colors.ink2, fontSize: 14, lineHeight: 20, marginBottom: 10 },
  postImageWrap: { marginBottom: 10 },
  postImage: { width: "100%", aspectRatio: 1, borderRadius: 8, backgroundColor: colors.surface2 },
  flyingHeart: {
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -40,
    marginLeft: -35,
    fontSize: 70,
    color: colors.ink,
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowRadius: 8,
  },
  actionsRow: { flexDirection: "row", gap: 20 },
  actionButton: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionIcon: { color: colors.ink3, fontSize: 16 },
  likedIcon: { color: colors.redSoft },
  actionText: { color: colors.ink3, fontSize: 12 },
  likedText: { color: colors.redSoft },
  commentsSection: { marginTop: 12, gap: 10 },
  commentRow: { flexDirection: "row", gap: 8 },
  commentText: { color: colors.ink2, fontSize: 12, lineHeight: 17 },
  commentAuthor: { fontWeight: "700", color: colors.ink },
  commentTime: { color: colors.ink3, fontSize: 10, marginTop: 1 },
  commentInputRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  commentInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: colors.ink,
    fontSize: 12,
  },
  postCommentText: { color: colors.redSoft, fontSize: 12, fontWeight: "700" },
});
