import { useState } from "react";
import { Text, TouchableOpacity, View, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Svg, Path } from "react-native-svg";
import { useAuth } from "../../lib/AuthContext";
import { API_BASE_URL } from "../../lib/api";
import { colors, fonts } from "../../lib/theme";
import { useToast } from "../ToastProvider";
import { SendToChatSheet } from "../messages/SendToChat";
import { BottomSheet, shareLive } from "./LiveBits";

// The Live header's share controls — mirrors web's
// components/live/LiveShareButtons.tsx (explicit ask, 2026-10-08: "Send"
// didn't say what it did, and the Share/Send pills squeezed the host's name
// to "M…"). A paper plane sends the Live in a direct message; the share icon
// opens a menu: send in a message, share to other apps, or copy the link.

export function ShareIcon({ color = "#fff", size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3v12" />
      <Path d="M7 8l5-5 5 5" />
      <Path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6" />
    </Svg>
  );
}

export function PaperPlaneIcon({ color = "#fff", size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 3L10 14" />
      <Path d="M21 3l-7 18-4-7-7-4 18-7z" />
    </Svg>
  );
}

function LinkIcon({ color = "#fff", size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <Path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </Svg>
  );
}

export function LiveShareButtons({ liveSessionId, message, accent = false }: { liveSessionId: string; message: string; accent?: boolean }) {
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dmOpen, setDmOpen] = useState(false);

  async function copyLink() {
    setMenuOpen(false);
    await Clipboard.setStringAsync(`${API_BASE_URL}/live/${liveSessionId}`);
    toast.success("Link copied.");
  }

  return (
    <>
      {!!firebaseUser && (
        <TouchableOpacity style={styles.round} onPress={() => setDmOpen(true)} accessibilityLabel="Send this Live in a message" hitSlop={4}>
          <PaperPlaneIcon />
        </TouchableOpacity>
      )}
      <TouchableOpacity style={[styles.round, accent && { backgroundColor: colors.red }]} onPress={() => setMenuOpen(true)} accessibilityLabel="Share this Live" hitSlop={4}>
        <ShareIcon />
      </TouchableOpacity>

      <BottomSheet visible={menuOpen} onClose={() => setMenuOpen(false)}>
        <Text style={styles.title}>Share this Live</Text>
        {!!firebaseUser && (
          <TouchableOpacity
            style={styles.row}
            onPress={() => {
              setMenuOpen(false);
              setDmOpen(true);
            }}
          >
            <PaperPlaneIcon size={20} />
            <Text style={styles.rowText}>Send in a message</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            setMenuOpen(false);
            shareLive(liveSessionId, message);
          }}
        >
          <ShareIcon size={20} />
          <Text style={styles.rowText}>Share to other apps…</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.row} onPress={copyLink}>
          <LinkIcon size={20} />
          <Text style={styles.rowText}>Copy link</Text>
        </TouchableOpacity>
        <View style={{ height: 8 }} />
      </BottomSheet>
      <SendToChatSheet share={{ type: "LIVE", id: liveSessionId }} visible={dmOpen} onClose={() => setDmOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  round: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.15)" },
  title: { fontFamily: fonts.serif, fontSize: 24, color: colors.ink, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 4 },
  rowText: { color: colors.ink, fontSize: 16 },
});
