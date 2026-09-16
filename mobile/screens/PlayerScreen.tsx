import { useRef, useState } from "react";
import { Image, PanResponder, Share, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { Svg, Path, Rect } from "react-native-svg";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { usePlayer, usePlayerProgress } from "../lib/PlayerContext";
import type { RootStackParamList } from "../lib/navigation";
import { colors, fonts } from "../lib/theme";

function formatTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function PreviousIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill={color}>
      <Rect x={4} y={5} width={2.2} height={14} rx={1} />
      <Path d="M19 5.5v13a1 1 0 01-1.53.85l-9-6.5a1 1 0 010-1.7l9-6.5A1 1 0 0119 5.5z" />
    </Svg>
  );
}

function NextIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill={color}>
      <Rect x={17.8} y={5} width={2.2} height={14} rx={1} />
      <Path d="M5 5.5v13a1 1 0 001.53.85l9-6.5a1 1 0 000-1.7l-9-6.5A1 1 0 005 5.5z" />
    </Svg>
  );
}

function PlayIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5v14l11-7z" />
    </Svg>
  );
}

function PauseIcon({ color }: { color: string }) {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill={color}>
      <Rect x={6} y={5} width={4} height={14} rx={1} />
      <Rect x={14} y={5} width={4} height={14} rx={1} />
    </Svg>
  );
}

function RepeatIcon({ color, mode }: { color: string; mode: "one" | "other" }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
      <Path d="M17 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 11V9a4 4 0 014-4h14" strokeLinecap="round" />
      <Path d="M7 22l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 13v2a4 4 0 01-4 4H3" strokeLinecap="round" />
    </Svg>
  );
}

function ShuffleIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
      <Path d="M3 6h3.5a4 4 0 013.2 1.6l6.6 8.8A4 4 0 0019.5 18H21" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 4l4 2-4 2" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 18h3.5a4 4 0 003.2-1.6l.7-.93" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14.5 7.53l.7-.93A4 4 0 0118.5 5H21" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M17 20l4-2-4-2" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function LyricsIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
      <Path d="M4 5h16v11H8l-4 4V5z" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

function QueueIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
      <Path d="M4 6h10M4 11h10M4 16h6" strokeLinecap="round" />
      <Path d="M18 16.5a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6z" />
      <Path d="M20.3 16.5V7" strokeLinecap="round" />
    </Svg>
  );
}

const BAR_WIDTH = 320;

function SeekBar({ positionSec, durationSec, onSeek }: { positionSec: number; durationSec: number; onSeek: (sec: number) => void }) {
  const [dragSec, setDragSec] = useState<number | null>(null);
  const barWidthRef = useRef(BAR_WIDTH);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => durationSec > 0,
      onMoveShouldSetPanResponder: () => durationSec > 0,
      onPanResponderGrant: (e) => {
        const ratio = Math.min(Math.max(e.nativeEvent.locationX / barWidthRef.current, 0), 1);
        setDragSec(ratio * durationSec);
      },
      onPanResponderMove: (e) => {
        const ratio = Math.min(Math.max(e.nativeEvent.locationX / barWidthRef.current, 0), 1);
        setDragSec(ratio * durationSec);
      },
      onPanResponderRelease: (e) => {
        const ratio = Math.min(Math.max(e.nativeEvent.locationX / barWidthRef.current, 0), 1);
        onSeek(ratio * durationSec);
        setDragSec(null);
      },
    }),
  ).current;

  const shownSec = dragSec ?? positionSec;
  const progress = durationSec > 0 ? Math.min(shownSec / durationSec, 1) : 0;

  return (
    <View>
      <View
        style={styles.seekTrack}
        onLayout={(e) => {
          barWidthRef.current = e.nativeEvent.layout.width;
        }}
        {...panResponder.panHandlers}
      >
        <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
        <View style={[styles.seekThumb, { left: `${progress * 100}%` }]} />
      </View>
      <View style={styles.timeRow}>
        <Text style={styles.timeText}>{formatTime(shownSec)}</Text>
        <Text style={styles.timeText}>-{formatTime(Math.max(durationSec - shownSec, 0))}</Text>
      </View>
    </View>
  );
}

export function PlayerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    current,
    isPlaying,
    repeatMode,
    shuffled,
    queue,
    queueIndex,
    togglePlay,
    seek,
    next,
    previous,
    cycleRepeat,
    toggleShuffle,
    play,
  } = usePlayer();
  const { positionSec, durationSec } = usePlayerProgress();
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  if (!current) return null;

  const hasNext = queueIndex < queue.length - 1 || (repeatMode === "all" && queue.length > 0);

  async function handleShare() {
    if (!current) return;
    try {
      await Share.share({ message: `${current.title} — ${current.artistName} on XOLDOUT` });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.minimize}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerLabel}>Playing from XOLDOUT</Text>
        <TouchableOpacity style={styles.shareButton} onPress={handleShare} hitSlop={12}>
          <Text style={styles.shareIcon}>↗</Text>
          <Text style={styles.shareText}>Share</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.artworkWrap}>
        {current.artworkUrl ? (
          <Image source={{ uri: current.artworkUrl }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkPlaceholder]} />
        )}
      </View>

      <Text style={styles.title} numberOfLines={2}>
        {current.title}
      </Text>
      <Text style={styles.artist}>{current.artistName}</Text>

      <SeekBar positionSec={positionSec} durationSec={durationSec} onSeek={seek} />

      <View style={styles.controlsRow}>
        <View style={styles.sideControl}>
          <TouchableOpacity onPress={toggleShuffle} disabled={queue.length < 2} hitSlop={10}>
            <ShuffleIcon color={shuffled ? colors.redSoft : queue.length < 2 ? colors.line : colors.ink2} />
          </TouchableOpacity>
        </View>
        <View style={styles.centerControls}>
          <TouchableOpacity onPress={previous} hitSlop={10}>
            <PreviousIcon color={colors.ink2} />
          </TouchableOpacity>
          <TouchableOpacity onPress={togglePlay} style={styles.playButton} hitSlop={10}>
            {isPlaying ? <PauseIcon color={colors.bg} /> : <PlayIcon color={colors.bg} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={next} disabled={!hasNext} hitSlop={10}>
            <NextIcon color={hasNext ? colors.ink2 : colors.line} />
          </TouchableOpacity>
        </View>
        <View style={[styles.sideControl, styles.sideControlEnd]}>
          <TouchableOpacity onPress={cycleRepeat} hitSlop={10}>
            <RepeatIcon color={repeatMode !== "off" ? colors.redSoft : colors.ink2} mode={repeatMode === "one" ? "one" : "other"} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity
          onPress={() => setShowLyrics((v) => !v)}
          disabled={!current.lyricsText}
          hitSlop={10}
        >
          <LyricsIcon color={!current.lyricsText ? colors.line : showLyrics ? colors.redSoft : colors.ink2} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setShowQueue((v) => !v)} disabled={queue.length < 2} hitSlop={10}>
          <QueueIcon color={queue.length < 2 ? colors.line : showQueue ? colors.redSoft : colors.ink2} />
        </TouchableOpacity>
      </View>

      {showLyrics && current.lyricsText && (
        <View style={styles.lyricsWrap}>
          <Text style={styles.lyricsText}>{current.lyricsText}</Text>
        </View>
      )}

      {showQueue && queue.length > 1 && (
        <View style={styles.queueWrap}>
          {queue.map((t, i) => (
            <TouchableOpacity key={t.trackId} style={styles.queueRow} onPress={() => play(t, queue)}>
              <Text style={[styles.queueTitle, i === queueIndex && styles.queueTitleActive]} numberOfLines={1}>
                {i + 1}. {t.title}
              </Text>
              {i === queueIndex && <Text style={styles.nowPlaying}>Now Playing</Text>}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  minimize: { color: colors.ink2, fontSize: 30, width: 28 },
  headerLabel: { flex: 1, textAlign: "center", color: colors.ink3, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  shareButton: { flexDirection: "row", alignItems: "center", gap: 4 },
  shareIcon: { color: colors.redSoft, fontSize: 18 },
  shareText: { color: colors.redSoft, fontSize: 12, fontWeight: "600" },
  artworkWrap: { alignItems: "center", marginBottom: 24 },
  artwork: { width: 300, height: 300, borderRadius: 16, backgroundColor: colors.surface2 },
  artworkPlaceholder: {},
  title: { color: colors.ink, fontSize: 22, fontFamily: fonts.serif, marginBottom: 2 },
  artist: { color: colors.ink3, fontSize: 14, marginBottom: 24 },
  seekTrack: { height: 4, borderRadius: 2, backgroundColor: colors.lineSoft, justifyContent: "center" },
  seekFill: { height: 4, borderRadius: 2, backgroundColor: colors.red, position: "absolute", left: 0, top: 0 },
  seekThumb: { position: "absolute", width: 12, height: 12, borderRadius: 6, backgroundColor: colors.ink, marginLeft: -6, top: -4 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, marginBottom: 28 },
  timeText: { color: colors.ink3, fontSize: 11 },
  controlsRow: { flexDirection: "row", alignItems: "center", marginBottom: 32 },
  sideControl: { flex: 1 },
  sideControlEnd: { alignItems: "flex-end" },
  centerControls: { flexDirection: "row", alignItems: "center", gap: 28 },
  playButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  bottomRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 20 },
  lyricsWrap: { marginTop: 4 },
  lyricsText: { color: colors.ink2, fontFamily: fonts.serif, fontSize: 15, lineHeight: 24, textAlign: "center" },
  queueWrap: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.lineSoft },
  queueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  queueTitle: { color: colors.ink2, fontSize: 13, flex: 1 },
  queueTitleActive: { color: colors.redSoft },
  nowPlaying: { color: colors.ink3, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase" },
});
