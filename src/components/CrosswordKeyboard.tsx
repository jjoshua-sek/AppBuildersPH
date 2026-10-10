import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import { brand as colors, radius, space } from '../app/theme';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

/**
 * Always-visible A to Z keyboard for the crossword, so the phone's own keyboard
 * never covers the grid. Keys have testIDs `key-A` .. `key-Z` and `key-BACK`.
 */
export function CrosswordKeyboard({
  onLetter,
  onBackspace,
}: {
  onLetter(ch: string): void;
  onBackspace(): void;
}) {
  return (
    <View style={styles.wrap} accessibilityLabel="Letter keyboard">
      {ROWS.map((row, i) => (
        <View key={row} style={styles.row}>
          {Array.from(row).map(ch => (
            <Pressable
              key={ch}
              testID={`key-${ch}`}
              accessibilityRole="button"
              accessibilityLabel={ch}
              style={({ pressed }) => [styles.key, pressed && styles.pressed]}
              onPress={() => onLetter(ch)}
            >
              <Text style={styles.keyText}>{ch}</Text>
            </Pressable>
          ))}
          {i === ROWS.length - 1 && (
            <Pressable
              testID="key-BACK"
              accessibilityRole="button"
              accessibilityLabel="Backspace"
              style={({ pressed }) => [
                styles.key,
                styles.wide,
                pressed && styles.pressed,
              ]}
              onPress={onBackspace}
            >
              <Delete color={colors.cardText} size={20} />
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 4 },
  key: {
    flex: 1,
    maxWidth: 40,
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wide: { flex: 1.5, maxWidth: 60, marginLeft: space.xs },
  pressed: { backgroundColor: colors.cardAlt },
  keyText: { color: colors.cardText, fontSize: 18, fontWeight: '700' },
});
