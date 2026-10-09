import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { StreakFlame } from './StreakFlame';

export function StreakBuddy({
  days,
  enabled,
  onPress,
}: {
  days: number;
  enabled: boolean;
  onPress(): void;
}) {
  const bob = useRef(new Animated.Value(0)).current;
  const focused = useIsFocused();
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => {
        if (live) setReduceMotion(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    if (reduceMotion || !focused) {
      bob.setValue(0);
      return;
    }
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 950,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 950,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      bob.setValue(0);
    };
  }, [bob, focused, reduceMotion]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${days} day streak. ${
        enabled ? "Open today's Daily Term" : 'Add notes to unlock Daily Term'
      }`}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={6}
      style={styles.buddy}
    >
      <View style={styles.bubble}>
        <Text style={styles.bubbleText}>
          {enabled ? 'Tap for Daily Term!' : 'Add notes to play!'}
        </Text>
      </View>
      <View style={styles.tail} />
      <Animated.View
        style={{
          transform: [
            {
              translateY: bob.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -3],
              }),
            },
            {
              scale: bob.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.04],
              }),
            },
          ],
        }}
      >
        <StreakFlame days={days} size={38} />
      </Animated.View>
      <Text style={styles.count}>{days} day streak</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buddy: { width: 108, alignItems: 'center', gap: 2 },
  bubble: {
    backgroundColor: '#EEE9FF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 3,
  },
  bubbleText: { color: '#293452', fontSize: 9, fontWeight: '700' },
  tail: {
    position: 'absolute',
    top: 19,
    width: 6,
    height: 6,
    backgroundColor: '#EEE9FF',
    transform: [{ rotate: '45deg' }],
  },
  count: { color: '#FFE5A4', fontSize: 10, fontWeight: '700' },
});
