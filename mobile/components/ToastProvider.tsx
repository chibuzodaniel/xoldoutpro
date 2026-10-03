import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Animated, Text, View, StyleSheet } from "react-native";
import { colors } from "../lib/theme";

type ToastKind = "success" | "error";
type Toast = { id: number; message: string; kind: ToastKind; rows?: [string, string][] };

export type LiveSummaryToast = { peakViewers: number; giftsXg: number; giftsCount: number; paidAccessXg: number; paidRequestsXg: number };

type ToastContextValue = {
  success: (message: string) => void;
  error: (message: string) => void;
  liveSummary: (summary: LiveSummaryToast) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VISIBLE_MS = 2500;
// The end-of-Live stats toast has more to read than a one-line nudge.
const SUMMARY_VISIBLE_MS = 8000;

// Mirrors web's ToastProvider — a transient, non-blocking banner (unlike
// Alert.alert, which blocks until dismissed) for a "this succeeded" nudge
// that shouldn't interrupt the flow, e.g. after adding an event promoter.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const idRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, kind: ToastKind, rows?: [string, string][], visibleMs = VISIBLE_MS) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const id = ++idRef.current;
      setToast({ id, message, kind, rows });
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timerRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
          setToast((cur) => (cur?.id === id ? null : cur));
        });
      }, visibleMs);
    },
    [opacity],
  );

  const success = useCallback((message: string) => show(message, "success"), [show]);
  const error = useCallback((message: string) => show(message, "error"), [show]);
  const liveSummary = useCallback(
    (s: LiveSummaryToast) =>
      show(
        "Live ended",
        "success",
        [
          ["Peak viewers", s.peakViewers.toLocaleString("en-NG")],
          ["Gifts", `${s.giftsXg.toLocaleString("en-NG")} XG (${s.giftsCount})`],
          ["Paid access", `${s.paidAccessXg.toLocaleString("en-NG")} XG`],
          ["Paid requests", `${s.paidRequestsXg.toLocaleString("en-NG")} XG`],
        ],
        SUMMARY_VISIBLE_MS,
      ),
    [show],
  );

  return (
    <ToastContext.Provider value={{ success, error, liveSummary }}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { opacity }, toast.kind === "error" && styles.wrapError]}
        >
          <Text style={[styles.text, toast.rows && styles.title]}>{toast.message}</Text>
          {toast.rows?.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowValue}>{value}</Text>
            </View>
          ))}
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 100,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 100,
    elevation: 100,
  },
  wrapError: { borderColor: colors.redSoft },
  text: { color: colors.ink, fontSize: 13, fontWeight: "600", textAlign: "center" },
  title: { fontSize: 14, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1 },
  rowLabel: { color: colors.ink3, fontSize: 12 },
  rowValue: { color: colors.ink, fontSize: 12, fontWeight: "700" },
});
