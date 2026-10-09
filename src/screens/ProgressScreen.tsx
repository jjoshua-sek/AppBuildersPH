import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgGradient,
  Stop,
} from 'react-native-svg';
import { BarChart3, ShieldCheck, Trophy } from 'lucide-react-native';
import { brand as colors, space } from '../app/theme';
import {
  Card,
  Header,
  IconBadge,
  ProgressBar,
  Screen,
} from '../components/ui';
import { StreakFlame } from '../components/StreakFlame';
import { useProgress } from '../store/useProgress';
import { images } from '../assets/images';

function MasteryRing({
  value,
  size = 150,
  stroke = 14,
}: {
  value: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.teal} />
            <Stop offset="1" stopColor={colors.primary} />
          </SvgGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring)"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ * value} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.ringText}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

const SWATCH = [colors.green, colors.pink, colors.orange, colors.primary];

export function ProgressScreen() {
  const { streak, mastered, total, decks } = useProgress();
  const overall = total ? mastered / total : 0;
  return (
    <Screen bg={images.bgCabinNight} dim={0.18}>
      <Header
        title="Your Progress"
        icon={
          <IconBadge color={colors.primary} size={34}>
            <BarChart3 color="#fff" size={20} />
          </IconBadge>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.masteryCard}>
          <MasteryRing value={overall} />
          <Text style={styles.masteryTitle}>Overall Mastery</Text>
          <Text style={styles.masterySub}>
            {mastered} of {total} terms
          </Text>
        </Card>

        <View style={styles.statsRow}>
          <Card light style={styles.stat}>
            <StreakFlame days={streak} size={30} />
            <Text style={styles.statValue}>{streak}</Text>
            <Text style={styles.statLabel}>day streak</Text>
          </Card>
          <Card light style={styles.stat}>
            <Trophy color={colors.amber} fill={colors.amber} size={26} />
            <Text style={styles.statValue}>{mastered}</Text>
            <Text style={styles.statLabel}>terms mastered</Text>
          </Card>
        </View>

        <Card light style={{ gap: space.lg }}>
          <Text style={styles.subjectsTitle}>Deck Progress</Text>
          {decks.length === 0 && (
            <Text style={styles.statLabel}>
              Add notes and play a game to see your progress.
            </Text>
          )}
          {decks.map((d, i) => {
            const p = d.total ? d.mastered / d.total : 0;
            const color = SWATCH[i % SWATCH.length];
            return (
              <View key={d.id} style={styles.subjectRow}>
                <IconBadge color={color} size={34}>
                  <ShieldCheck color="#fff" size={18} />
                </IconBadge>
                <View style={{ flex: 1 }}>
                  <Text style={styles.subjectName}>{d.title}</Text>
                  <View style={styles.barRow}>
                    <View style={{ flex: 1 }}>
                      <ProgressBar
                        value={p}
                        color={color}
                        track={colors.cardAlt}
                      />
                    </View>
                    <Text style={styles.pct}>{Math.round(p * 100)}%</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    paddingTop: 0,
    gap: space.md,
    paddingBottom: space.xl,
  },
  masteryCard: { alignItems: 'center', paddingVertical: space.xl },
  ringText: { color: colors.text, fontSize: 30, fontWeight: '800' },
  masteryTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginTop: space.md,
  },
  masterySub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: space.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.sm,
  },
  statValue: {
    color: colors.cardText,
    fontSize: 20,
    fontWeight: '800',
    marginTop: space.xs,
  },
  statLabel: { color: colors.cardMuted, fontSize: 11 },
  subjectsTitle: { color: colors.cardText, fontSize: 16, fontWeight: '700' },
  subjectRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  subjectName: {
    color: colors.cardText,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pct: { color: colors.cardMuted, fontSize: 11, width: 30, textAlign: 'right' },
});
