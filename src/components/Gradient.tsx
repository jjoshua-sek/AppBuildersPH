import React, { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

type Point = { x: number; y: number };

/**
 * Drop-in for expo-linear-gradient's <LinearGradient>, drawn with react-native-svg
 * so the bare app needs no extra native gradient library. Same props:
 * colors, start/end (0..1, default top to bottom), locations, style, children.
 */
export function Gradient({
  colors,
  start = { x: 0, y: 0 },
  end = { x: 0, y: 1 },
  locations,
  style,
  children,
}: {
  colors: readonly string[];
  start?: Point;
  end?: Point;
  locations?: readonly number[];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const id = `g${useId().replace(/:/g, '')}`;
  const last = Math.max(1, colors.length - 1);
  return (
    <View style={style}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <LinearGradient
            id={id}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
          >
            {colors.map((c, i) => (
              <Stop key={i} offset={locations?.[i] ?? i / last} stopColor={c} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}
