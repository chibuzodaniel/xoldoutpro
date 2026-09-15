import { useState } from "react";
import { FlatList, Modal, Text, TextInput, TouchableOpacity, View, StyleSheet } from "react-native";
import { colors, fonts } from "../lib/theme";
import type { Bank } from "../lib/walletTypes";

export function BankSelectSheet({
  visible,
  banks,
  onSelect,
  onClose,
}: {
  visible: boolean;
  banks: Bank[];
  onSelect: (bank: Bank) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = search.trim()
    ? banks.filter((b) => b.name.toLowerCase().includes(search.trim().toLowerCase()))
    : banks;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Select bank</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search banks"
            placeholderTextColor={colors.ink3}
            style={styles.search}
          />
          <FlatList
            data={filtered}
            keyExtractor={(b) => b.code}
            style={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  onSelect(item);
                  setSearch("");
                }}
              >
                <Text style={styles.rowText}>{item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No banks match.</Text>}
          />
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, maxHeight: "75%" },
  title: { color: colors.ink, fontSize: 18, fontFamily: fonts.serif, marginBottom: 12 },
  search: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
    fontSize: 14,
    marginBottom: 8,
  },
  list: { maxHeight: 320 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  rowText: { color: colors.ink, fontSize: 14 },
  emptyText: { color: colors.ink3, fontSize: 13, paddingVertical: 12 },
  closeButton: { alignItems: "center", paddingVertical: 14, marginTop: 8 },
  closeText: { color: colors.ink3, fontSize: 14, fontWeight: "600" },
});
