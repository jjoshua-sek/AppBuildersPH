import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, ui } from '../app/theme';

/** Like components/Button, plus a testID, an outlined `ghost` style and a compact `small` size. */
export function ActionButton(props: {
  testID: string;
  label: string;
  onPress(): void;
  disabled?: boolean;
  ghost?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      style={[
        ui.button,
        props.ghost && styles.ghost,
        props.small && styles.small,
        props.disabled && ui.buttonDisabled,
      ]}
    >
      <Text
        style={[
          ui.buttonText,
          props.ghost && styles.ghostText,
          props.small && styles.smallText,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  ghostText: { color: colors.accent },
  small: { paddingVertical: 6, paddingHorizontal: 12 },
  smallText: { fontSize: 13 },
});
