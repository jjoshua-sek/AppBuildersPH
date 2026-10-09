import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from '@react-native-community/blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { brand as colors, radius } from '../app/theme';

export type ReviewNotesDialogProps = {
  open: boolean;
  onClose(): void;
  title: string;
  onTitleChange(t: string): void;
  text: string;
  onTextChange(t: string): void;
  /** False while games are being generated: the text is read-only then. */
  editable: boolean;
  words: number;
  minWords: number;
};

const DURATION = 180;

/**
 * Notes editor shown above the screen. Rendered as an in-screen overlay (not an RN
 * Modal) so the native blur can see, and blur, the screen underneath. It covers the
 * whole screen, so nothing below it can be touched while it is open.
 */
export function ReviewNotesDialog({
  open,
  onClose,
  title,
  onTitleChange,
  text,
  onTextChange,
  editable,
  words,
  minWords,
}: ReviewNotesDialogProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) setMounted(true);
    Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: DURATION,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, progress]);

  // Android Back closes the dialog, not the screen. Text lives in the parent, so it is kept.
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  if (!mounted) return null;

  const short = words < minWords;
  const lift = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });

  return (
    <View
      style={StyleSheet.absoluteFill}
      testID="review-dialog"
      accessibilityViewIsModal
      importantForAccessibility="yes"
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: progress }]}>
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={16}
          overlayColor="rgba(7,13,34,0.55)"
          reducedTransparencyFallbackColor={colors.bgDeep}
        />
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.fill}
        // Android resizes the window itself (adjustResize); padding there would double up.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View
          style={[
            styles.sheet,
            {
              marginTop: insets.top + 12,
              marginBottom: Math.max(insets.bottom, 12),
              opacity: progress,
              transform: [{ translateY: lift }],
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={styles.heading} accessibilityRole="header">
              Check the text
            </Text>
            <Pressable
              testID="review-close"
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.close}
            >
              <X color={colors.textMuted} size={20} />
            </Pressable>
          </View>

          <TextInput
            testID="title"
            value={title}
            onChangeText={onTitleChange}
            placeholder="Title (optional), e.g. IT Audit Ch. 1"
            placeholderTextColor={colors.textDim}
            editable={editable}
            style={styles.input}
          />
          <TextInput
            testID="notes"
            value={text}
            onChangeText={onTextChange}
            placeholder="Paste your notes here, or snap a page; the text you photograph shows up here to check and fix."
            placeholderTextColor={colors.textDim}
            editable={editable}
            multiline
            scrollEnabled
            textAlignVertical="top"
            style={[styles.input, styles.notes]}
          />

          <View style={styles.footer}>
            <View style={styles.footerCopy}>
              <Text style={[styles.count, words > 0 && short && styles.danger]}>
                {words} words
                {short ? ` · at least ${minWords} needed` : ''}
              </Text>
              {!editable && (
                <Text style={styles.locked}>
                  Locked while reading your notes
                </Text>
              )}
            </View>
            <Pressable
              testID="review-done"
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [styles.done, pressed && styles.pressed]}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: 16 },
  sheet: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 12,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  heading: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: colors.bgDeep,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notes: { flex: 1, minHeight: 120 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerCopy: { flex: 1 },
  count: { color: colors.textMuted, fontSize: 13 },
  locked: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  danger: { color: colors.red },
  done: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 22,
  },
  pressed: { opacity: 0.85 },
  doneText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
