import React, { useId } from 'react';
import {
  processColor,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
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
    <View style={[style, { overflow: 'hidden' }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg
          pointerEvents="none"
          width="100%"
          height="100%"
          style={StyleSheet.absoluteFill}
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient
              id={id}
              x1={`${start.x * 100}%`}
              y1={`${start.y * 100}%`}
              x2={`${end.x * 100}%`}
              y2={`${end.y * 100}%`}
            >
              {colors.map((c, i) => {
                // SVG gradient extraction replaces color alpha with stopOpacity.
                const packed = processColor(c);
                const numeric = typeof packed === 'number';
                return (
                  <Stop
                    key={i}
                    offset={locations?.[i] ?? i / last}
                    stopColor={
                      numeric
                        ? `#${(packed & 0xffffff)
                            .toString(16)
                            .padStart(6, '0')}`
                        : c
                    }
                    stopOpacity={numeric ? (packed >>> 24) / 255 : 1}
                  />
                );
              })}
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${id})`} />
        </Svg>
      </View>
      {children}
    </View>
  );
}
