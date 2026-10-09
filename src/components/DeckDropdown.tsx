import React, { useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Check, ChevronDown, FileText } from 'lucide-react-native';
import { brand as colors } from '../app/theme';
import { useDeckStore } from '../store/useDeckStore';

/** Chooses saved notes generated from photos, files, pasted text, or sample notes. */
export function DeckDropdown({
  selectedDocId,
  onSelect,
}: {
  selectedDocId?: string;
  onSelect(id: string): void;
}) {
  const decks = useDeckStore(s => s.decks);
  const selected = decks.find(deck => deck.id === selectedDocId);
  const anchor = useRef<React.ComponentRef<typeof View>>(null);
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(130);
  const { height } = useWindowDimensions();
  const show = () => {
    anchor.current?.measureInWindow((_x, y, _width, anchorHeight) => {
      setTop(Math.min(y + anchorHeight + 6, Math.max(60, height - 220)));
      setOpen(true);
    });
  };
  return (
    <>
      <View ref={anchor} collapsable={false} style={styles.anchor}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Choose notes. ${
            selected?.title ?? 'No notes selected'
          }`}
          accessibilityState={{ expanded: open, disabled: !decks.length }}
          disabled={!decks.length}
          onPress={show}
          style={styles.trigger}
        >
          <FileText size={18} color="#C5D6FF" />
          <View style={styles.copy}>
            <Text style={styles.label}>PLAY FROM YOUR NOTES</Text>
            <Text numberOfLines={1} style={styles.title}>
              {selected?.title ??
                (decks.length ? 'Choose your notes' : 'No generated notes yet')}
            </Text>
          </View>
          <ChevronDown color="#fff" size={20} />
        </Pressable>
      </View>
      <Modal
        transparent
        visible={open}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            accessibilityLabel="Close notes menu"
            onPress={() => setOpen(false)}
          />
          <View
            style={[
              styles.menu,
              { top, maxHeight: Math.min(340, height - top - 24) },
            ]}
            accessibilityViewIsModal
          >
            <Text style={styles.menuHeading}>Choose generated notes</Text>
            <FlatList
              data={decks}
              keyExtractor={deck => deck.id}
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: item.id === selectedDocId }}
                  style={[
                    styles.option,
                    item.id === selectedDocId && styles.selected,
                  ]}
                  onPress={() => {
                    setOpen(false);
                    onSelect(item.id);
                  }}
                >
                  <View style={styles.copy}>
                    <Text style={styles.title}>{item.title}</Text>
                    <Text style={styles.detail}>
                      {item.source === 'camera'
                        ? 'Photo notes'
                        : item.source === 'file'
                        ? 'Imported file'
                        : item.source === 'sample'
                        ? 'Sample notes'
                        : 'Pasted notes'}
                    </Text>
                  </View>
                  {item.id === selectedDocId && (
                    <Check size={20} color="#67DDD5" />
                  )}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: { marginHorizontal: 16, marginBottom: 12 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(22,34,74,0.9)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  copy: { flex: 1 },
  label: { color: '#AEB8DA', fontSize: 10, fontWeight: '600', marginBottom: 3 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600' },
  overlay: { flex: 1, backgroundColor: 'rgba(7,13,34,0.45)' },
  menu: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 16,
    backgroundColor: '#16224A',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    elevation: 12,
  },
  menuHeading: {
    color: '#AEB8DA',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 12,
  },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selected: { backgroundColor: '#24365C' },
  detail: { color: '#AEB8DA', fontSize: 11, marginTop: 4 },
});
