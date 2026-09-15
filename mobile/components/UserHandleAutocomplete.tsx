import { useEffect, useRef, useState } from "react";
import { Image, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { apiGet } from "../lib/api";
import { colors } from "../lib/theme";

export type UserSuggestion = { id: string; handle: string; displayName: string; avatarUrl: string | null };

const DEBOUNCE_MS = 250;

// Mirrors web's components/ui/UserHandleAutocomplete.tsx — wraps /api/search
// (the creators half of it, same data PRD §6's search already uses), not a
// dedicated endpoint. Debounced so every keystroke doesn't fire a request.
export function UserHandleAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder = "@handle",
  excludeUserId,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  onSelect: (user: UserSuggestion) => void;
  placeholder?: string;
  excludeUserId?: string;
  style?: object;
}) {
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const query = value.trim().replace(/^@/, "");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiGet<{ creators: UserSuggestion[] }>(`/api/search?q=${encodeURIComponent(query)}`);
        setSuggestions(data.creators.filter((c) => c.id !== excludeUserId));
        setOpen(true);
      } catch {
        // best-effort — no suggestions is a fine fallback
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, excludeUserId]);

  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, style]}
      />
      {open && suggestions.length > 0 && (
        <View style={styles.dropdown}>
          {suggestions.map((u) => (
            <TouchableOpacity
              key={u.id}
              style={styles.row}
              onPress={() => {
                onSelect(u);
                setOpen(false);
              }}
            >
              {u.avatarUrl ? (
                <Image source={{ uri: u.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <View style={styles.rowInfo}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {u.displayName}
                </Text>
                <Text style={styles.rowHandle} numberOfLines={1}>
                  @{u.handle}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0, position: "relative" },
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
  dropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    maxHeight: 220,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    backgroundColor: colors.surface,
    zIndex: 20,
    elevation: 20,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarPlaceholder: { backgroundColor: colors.surface2 },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  rowHandle: { color: colors.ink3, fontSize: 11 },
});
