// Shared building blocks for the scaffold screens. Visual only: no state or logic.
import React from 'react';
import {
  Image,
  ImageSourcePropType,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Gradient as LinearGradient } from './Gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { brand as colors, radius, space } from '../app/theme';

/** Full-screen ground: a background image (optionally darkened) or the plain navy gradient. */
export function Screen({
  children,
  bg,
  dim = 0.35,
  style,
}: {
  children: React.ReactNode;
  bg?: ImageSourcePropType;
  dim?: number;
  style?: ViewStyle;
}) {
  const body = (
    <SafeAreaView edges={['top']} style={[styles.fill, style]}>
      {children}
    </SafeAreaView>
  );
  if (!bg) {
    return (
      <LinearGradient colors={['#0E1A3D', colors.bg]} style={styles.fill}>
        {body}
      </LinearGradient>
    );
  }
  return (
    <View style={styles.fill}>
      <Image source={bg} resizeMode="cover" style={styles.backgroundImage} pointerEvents="none" accessible={false} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(7,13,34,${dim})` }]} />
      {body}
    </View>
  );
}

/** Back arrow + title row used by the pushed screens. */
export function Header({
  title,
  subtitle,
  right,
  icon,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const nav = useNavigation();
  return (
    <View style={styles.header}>
      {icon ?? (
        <Pressable hitSlop={12} onPress={() => nav.canGoBack() && nav.goBack()}>
          <ArrowLeft color={colors.text} size={22} />
        </Pressable>
      )}
      <View style={{ flex: 1, marginLeft: space.md }}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style, light }: { children: React.ReactNode; style?: ViewStyle; light?: boolean }) {
  return <View style={[styles.card, light && styles.cardLight, style]}>{children}</View>;
}

export function ProgressBar({
  value,
  color = colors.primary,
  track = 'rgba(255,255,255,0.15)',
  height = 6,
}: {
  value: number; // 0..1
  color?: string;
  track?: string;
  height?: number;
}) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(value * 100)}%`, height, borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

export function GradientTile({
  colors: g,
  children,
  style,
  onPress,
}: {
  colors: readonly [string, string, ...string[]];
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ borderRadius: radius.lg, overflow: 'hidden' }}>
      <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tile, style]}>
        {children}
      </LinearGradient>
    </Pressable>
  );
}

/** Rounded square holding an icon, e.g. the subject deck badges. */
export function IconBadge({ children, color, size = 40 }: { children: React.ReactNode; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Explicit dimensions keep the image tied to the screen instead of its asset size.
  backgroundImage: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  headerSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: 'rgba(22,34,74,0.85)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  cardLight: { backgroundColor: colors.card, borderColor: 'transparent' },
  tile: { borderRadius: radius.lg, padding: space.lg, flexDirection: 'row', alignItems: 'center' },
});
