import { useState } from "react";
import { Image, Text, View, StyleSheet } from "react-native";
import { AVATAR_COLORS } from "../lib/format";
import { colors, fonts } from "../lib/theme";

// Falls back to a colored initial when there's no avatarUrl, or the image
// fails to load — Image has no built-in fallback, so this tracks load
// errors itself.
export function Avatar({
  uri,
  name,
  index,
  size,
}: {
  uri: string | null;
  name: string;
  index: number;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = uri && !failed;
  const backgroundColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: showImage ? colors.surface2 : backgroundColor },
      ]}
    >
      {showImage ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{name.slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  initial: { color: colors.ink, fontFamily: fonts.serif },
});
