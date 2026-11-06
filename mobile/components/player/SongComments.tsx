import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { Svg, Path, Circle } from "react-native-svg";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { apiDelete, apiGet, apiPost } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import type { RootStackParamList } from "../../lib/navigation";
import { colors } from "../../lib/theme";
import { Avatar } from "../Avatar";

// YouTube-style song comments under the player (explicit ask, 2026-11-04).
// Mirrors web's components/player/SongComments.tsx. Loaded once when the
// Comments tab is shown for a song — never polled (mobile/CLAUDE.md).

type Author = { id: string; handle: string; displayName: string; avatarUrl: string | null };
type SongComment = {
  id: string;
  body: string;
  createdAt: string;
  likeCount: number;
  replyCount: number;
  parentId: string | null;
  author: Author;
  myVote: number;
};

function timeAgo(iso: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  const units: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [604800, "week"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${name}${n > 1 ? "s" : ""} ago`;
  }
  return "just now";
}

function compact(n: number) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function ThumbIcon({ down, filled, color }: { down?: boolean; filled?: boolean; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={1.7} style={down ? { transform: [{ rotate: "180deg" }] } : undefined}>
      <Path d="M7 10v11H4a1 1 0 01-1-1v-9a1 1 0 011-1h3z" strokeLinejoin="round" />
      <Path d="M7 10l4-7a2 2 0 012.9 2.2L13 10h6.2a2 2 0 012 2.3l-1.3 7A2 2 0 0117.9 21H7" strokeLinejoin="round" />
    </Svg>
  );
}

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
      <Path d="M21 3L10 14" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 3l-7 18-4-7-7-4 18-7z" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BlankAvatar({ size }: { size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2, overflow: "hidden" }}>
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={colors.ink3}>
        <Circle cx={12} cy={9} r={4} />
        <Path d="M4 21a8 8 0 0116 0z" />
      </Svg>
    </View>
  );
}

function Composer({
  placeholder,
  initial = "",
  autoFocus,
  small,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  initial?: string;
  autoFocus?: boolean;
  small?: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const { appUser } = useAuth();
  const [body, setBody] = useState(initial);
  const [posting, setPosting] = useState(false);
  const size = small ? 28 : 34;

  async function submit() {
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    const ok = await onSubmit(trimmed);
    setPosting(false);
    if (ok) setBody("");
  }

  if (!appUser) {
    return (
      <View style={styles.composer}>
        <BlankAvatar size={size} />
        <Text style={[styles.composerInput, { color: colors.ink3 }]}>Sign in to share your thoughts…</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.composer}>
        {appUser.avatarUrl ? <Avatar uri={appUser.avatarUrl} name={appUser.displayName} index={0} size={size} /> : <BlankAvatar size={size} />}
        <TextInput
          style={styles.composerInput}
          value={body}
          autoFocus={autoFocus}
          onChangeText={(t) => setBody(t.slice(0, 1000))}
          placeholder={placeholder}
          placeholderTextColor={colors.ink3}
          multiline
        />
        <TouchableOpacity
          onPress={submit}
          disabled={posting || !body.trim()}
          style={[styles.sendButton, { width: size + 2, height: size + 2, borderRadius: (size + 2) / 2 }, (posting || !body.trim()) && { opacity: 0.4 }]}
          accessibilityLabel="Post comment"
        >
          {posting ? <ActivityIndicator size="small" color="#fff" /> : <SendIcon />}
        </TouchableOpacity>
      </View>
      {onCancel && (
        <TouchableOpacity onPress={onCancel} style={{ alignSelf: "flex-end", paddingHorizontal: 8, paddingTop: 4 }}>
          <Text style={styles.metaText}>Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CommentRow({
  comment,
  creatorId,
  canDeleteAll,
  isReply,
  onVote,
  onReply,
  onDelete,
}: {
  comment: SongComment;
  creatorId: string | null;
  canDeleteAll: boolean;
  isReply?: boolean;
  onVote: (c: SongComment, value: number) => void;
  onReply: (c: SongComment) => void;
  onDelete: (c: SongComment) => void;
}) {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { appUser } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const long = comment.body.length > 220 || comment.body.split("\n").length > 4;
  const isCreator = comment.author.id === creatorId;
  const canDelete = canDeleteAll || appUser?.id === comment.author.id;
  const openProfile = () => navigation.navigate("Creator", { handle: comment.author.handle });

  function openMenu() {
    Alert.alert("Comment", undefined, [
      { text: "Delete", style: "destructive", onPress: () => onDelete(comment) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={openProfile}>
        {comment.author.avatarUrl ? (
          <Avatar uri={comment.author.avatarUrl} name={comment.author.displayName} index={0} size={isReply ? 26 : 36} />
        ) : (
          <BlankAvatar size={isReply ? 26 : 36} />
        )}
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowHeader}>
          <Text style={styles.metaText} numberOfLines={1}>
            <Text onPress={openProfile} style={isCreator ? styles.creatorHandle : styles.handle}>
              @{comment.author.handle}
              {isCreator ? " ♪" : ""}
            </Text>
            {"  · "}
            {timeAgo(comment.createdAt)}
          </Text>
          {canDelete && (
            <TouchableOpacity onPress={openMenu} hitSlop={10}>
              <Text style={styles.menuDots}>⋮</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.body} numberOfLines={!expanded && long ? 4 : undefined}>
          {comment.body}
        </Text>
        {long && (
          <TouchableOpacity onPress={() => setExpanded((v) => !v)}>
            <Text style={styles.readMore}>{expanded ? "Show less" : "Read more"}</Text>
          </TouchableOpacity>
        )}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.action} onPress={() => onVote(comment, comment.myVote === 1 ? 0 : 1)} hitSlop={8}>
            <ThumbIcon filled={comment.myVote === 1} color={comment.myVote === 1 ? colors.ink : colors.ink2} />
            {comment.likeCount > 0 && <Text style={styles.actionText}>{compact(comment.likeCount)}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={() => onVote(comment, comment.myVote === -1 ? 0 : -1)} hitSlop={8}>
            <ThumbIcon down filled={comment.myVote === -1} color={comment.myVote === -1 ? colors.ink : colors.ink2} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onReply(comment)} hitSlop={8}>
            <Text style={styles.replyText}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function Thread({
  comment,
  kind,
  trackId,
  creatorId,
  canDeleteAll,
  onVote,
  onDeleted,
}: {
  comment: SongComment;
  kind: "track" | "beat";
  trackId: string;
  creatorId: string | null;
  canDeleteAll: boolean;
  onVote: (c: SongComment, value: number) => Promise<boolean>;
  onDeleted: (c: SongComment) => void;
}) {
  const { appUser, firebaseUser } = useAuth();
  const [replies, setReplies] = useState<SongComment[] | null>(null);
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<SongComment | null>(null);
  const replyCount = replies ? replies.length : comment.replyCount;

  async function loadReplies() {
    try {
      const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
      const data = await apiGet<{ replies: SongComment[] }>(`/api/song-comments/${comment.id}/replies`, idToken);
      setReplies(data.replies);
    } catch {
      setReplies([]);
    }
  }

  async function toggleReplies() {
    const next = !open;
    setOpen(next);
    if (next && replies === null) await loadReplies();
  }

  async function postReply(body: string) {
    if (!firebaseUser) return false;
    try {
      const idToken = await firebaseUser.getIdToken();
      await apiPost(`/api/song-comments`, idToken, { kind, trackId, body, parentId: replyTo?.id ?? comment.id });
      await loadReplies();
      setOpen(true);
      setReplyTo(null);
      return true;
    } catch {
      Alert.alert("Couldn't post your reply. Try again.");
      return false;
    }
  }

  async function voteReply(c: SongComment, value: number) {
    if (!appUser) return onVote(c, value);
    const patch = (r: SongComment, v: number, likes: number) => setReplies((cur) => cur?.map((x) => (x.id === r.id ? { ...x, myVote: v, likeCount: likes } : x)) ?? cur);
    patch(c, value, Math.max(0, c.likeCount + (value === 1 ? 1 : 0) - (c.myVote === 1 ? 1 : 0)));
    if (!(await onVote(c, value))) patch(c, c.myVote, c.likeCount);
  }

  async function deleteReply(c: SongComment) {
    if (!firebaseUser) return;
    try {
      await apiDelete(`/api/song-comments/${c.id}`, await firebaseUser.getIdToken());
      setReplies((cur) => cur?.filter((r) => r.id !== c.id) ?? cur);
    } catch {
      Alert.alert("Couldn't delete that reply.");
    }
  }

  const replyPrefill = replyTo && replyTo.id !== comment.id && replyTo.author.id !== appUser?.id ? `@${replyTo.author.handle} ` : "";

  return (
    <View>
      <CommentRow
        comment={{ ...comment, replyCount }}
        creatorId={creatorId}
        canDeleteAll={canDeleteAll}
        onVote={onVote}
        onReply={(c) => (appUser ? setReplyTo(c) : Alert.alert("Sign in to reply."))}
        onDelete={onDeleted}
      />
      <View style={{ paddingLeft: 48 }}>
        {replyTo && (
          <View style={{ marginTop: 10 }}>
            <Composer key={replyTo.id} small autoFocus initial={replyPrefill} placeholder="Add a reply…" onSubmit={postReply} onCancel={() => setReplyTo(null)} />
          </View>
        )}
        {replyCount > 0 && (
          <TouchableOpacity onPress={toggleReplies} style={{ marginTop: 8 }}>
            <Text style={styles.repliesToggle}>
              {open ? "▴" : "▾"} {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </Text>
          </TouchableOpacity>
        )}
        {open && (
          <View style={{ marginTop: 12, gap: 16 }}>
            {replies === null ? (
              <ActivityIndicator color={colors.ink3} />
            ) : (
              replies.map((r) => (
                <CommentRow
                  key={r.id}
                  comment={r}
                  isReply
                  creatorId={creatorId}
                  canDeleteAll={canDeleteAll}
                  onVote={voteReply}
                  onReply={(c) => setReplyTo(c)}
                  onDelete={deleteReply}
                />
              ))
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export function SongComments({
  kind,
  trackId,
  listVisible,
  onPosted,
}: {
  kind: "track" | "beat";
  trackId: string;
  /** false while the Lyrics tab is showing: only the composer renders. */
  listVisible: boolean;
  onPosted?: () => void;
}) {
  const { appUser, firebaseUser } = useAuth();
  const [sort, setSort] = useState<"top" | "new">("top");
  const [comments, setComments] = useState<SongComment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedKey = useRef<string | null>(null);

  const load = useCallback(
    async (offset: number) => {
      try {
        const idToken = firebaseUser ? await firebaseUser.getIdToken() : undefined;
        const qs = `kind=${kind}&trackId=${encodeURIComponent(trackId)}&sort=${sort}&offset=${offset}`;
        const data = await apiGet<{ comments: SongComment[]; nextOffset: number | null; total?: number; creatorId?: string }>(
          `/api/song-comments?${qs}`,
          idToken,
        );
        setComments((cur) => (offset === 0 ? data.comments : [...(cur ?? []), ...data.comments]));
        setNextOffset(data.nextOffset);
        if (offset === 0) {
          setTotal(data.total ?? 0);
          setCreatorId(data.creatorId ?? null);
        }
      } catch {
        if (offset === 0) setComments([]);
      }
    },
    [kind, trackId, sort, firebaseUser],
  );

  // Fetch once per song + sort, and only once the list is actually on screen.
  useEffect(() => {
    const key = `${kind}:${trackId}:${sort}`;
    if (!listVisible || loadedKey.current === key) return;
    loadedKey.current = key;
    setComments(null);
    load(0);
  }, [kind, trackId, sort, listVisible, load]);

  async function postComment(body: string) {
    if (!firebaseUser) return false;
    try {
      const idToken = await firebaseUser.getIdToken();
      const { comment } = await apiPost<{ comment: SongComment }>(`/api/song-comments`, idToken, { kind, trackId, body });
      setComments((cur) => [comment, ...(cur ?? [])]);
      setTotal((t) => t + 1);
      onPosted?.();
      return true;
    } catch {
      Alert.alert("Couldn't post your comment. Try again.");
      return false;
    }
  }

  async function vote(c: SongComment, value: number) {
    if (!firebaseUser || !appUser) {
      Alert.alert("Sign in to like comments.");
      return false;
    }
    const optimistic = { myVote: value, likeCount: Math.max(0, c.likeCount + (value === 1 ? 1 : 0) - (c.myVote === 1 ? 1 : 0)) };
    setComments((cur) => cur?.map((x) => (x.id === c.id ? { ...x, ...optimistic } : x)) ?? cur);
    try {
      await apiPost(`/api/song-comments/${c.id}/vote`, await firebaseUser.getIdToken(), { value });
      return true;
    } catch {
      setComments((cur) => cur?.map((x) => (x.id === c.id ? { ...x, myVote: c.myVote, likeCount: c.likeCount } : x)) ?? cur);
      return false;
    }
  }

  async function remove(c: SongComment) {
    if (!firebaseUser) return;
    try {
      await apiDelete(`/api/song-comments/${c.id}`, await firebaseUser.getIdToken());
      setComments((cur) => cur?.filter((x) => x.id !== c.id) ?? cur);
      setTotal((t) => Math.max(0, t - 1 - c.replyCount));
    } catch {
      Alert.alert("Couldn't delete that comment.");
    }
  }

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    await load(nextOffset);
    setLoadingMore(false);
  }

  const canDeleteAll = !!appUser && appUser.id === creatorId;

  return (
    <View style={{ gap: 18 }}>
      <Composer placeholder="Share your thoughts…" onSubmit={postComment} />

      {listVisible && (
        <>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>
              Comments <Text style={styles.listCount}>{compact(total)}</Text>
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["top", "new"] as const).map((s) => (
                <TouchableOpacity key={s} onPress={() => setSort(s)} style={[styles.sortChip, sort === s && styles.sortChipActive]}>
                  <Text style={[styles.sortChipText, sort === s && styles.sortChipTextActive]}>{s === "top" ? "Top" : "Newest"}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {comments === null ? (
            <ActivityIndicator color={colors.ink3} style={{ paddingVertical: 12 }} />
          ) : comments.length === 0 ? (
            <Text style={styles.empty}>No comments yet. Be the first to share your thoughts.</Text>
          ) : (
            <View style={{ gap: 20 }}>
              {comments.map((c) => (
                <Thread key={c.id} comment={c} kind={kind} trackId={trackId} creatorId={creatorId} canDeleteAll={canDeleteAll} onVote={vote} onDeleted={remove} />
              ))}
              {nextOffset !== null && (
                <TouchableOpacity onPress={loadMore} disabled={loadingMore} style={{ paddingVertical: 8, alignItems: "center" }}>
                  <Text style={styles.replyText}>{loadingMore ? "Loading…" : "Show more comments"}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 6,
  },
  composerInput: { flex: 1, color: colors.ink, fontSize: 14, maxHeight: 100, paddingVertical: 4 },
  sendButton: { backgroundColor: colors.red, alignItems: "center", justifyContent: "center" },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listTitle: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  listCount: { color: colors.ink3, fontWeight: "400" },
  sortChip: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: colors.surface2 },
  sortChipActive: { backgroundColor: colors.ink },
  sortChipText: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  sortChipTextActive: { color: colors.bg },
  empty: { color: colors.ink3, fontSize: 13, textAlign: "center", paddingVertical: 12 },
  row: { flexDirection: "row", gap: 12 },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  metaText: { color: colors.ink3, fontSize: 12, flexShrink: 1 },
  handle: { color: colors.ink2, fontWeight: "600" },
  creatorHandle: { color: colors.ink, fontWeight: "700", backgroundColor: colors.surface2 },
  menuDots: { color: colors.ink3, fontSize: 16, paddingHorizontal: 4 },
  body: { color: colors.ink, fontSize: 14, lineHeight: 20, marginTop: 2 },
  readMore: { color: colors.ink3, fontSize: 12, fontWeight: "600", marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 6 },
  action: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionText: { color: colors.ink2, fontSize: 12 },
  replyText: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
  repliesToggle: { color: colors.redSoft, fontSize: 13, fontWeight: "700" },
});
