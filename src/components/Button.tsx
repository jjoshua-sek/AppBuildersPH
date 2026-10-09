import React from 'react';
import { Pressable, Text } from 'react-native';
import { ui } from '../app/theme';

export function Button(props: { title: string; onPress(): void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={props.disabled}
      style={[ui.button, props.disabled && ui.buttonDisabled]}
    >
      <Text style={ui.buttonText}>{props.title}</Text>
    </Pressable>
  );
}
