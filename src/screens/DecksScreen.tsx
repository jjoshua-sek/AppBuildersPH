import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  CheckCircle2,
  Library,
  Plane,
  Plus,
  ShieldCheck,
} from 'lucide-react-native';
import { brand as colors, radius, space } from '../app/theme';
import type { RootStackParamList } from '../app/navigation';
import { Card, Header, IconBadge, Screen } from '../components/ui';
import { setCurrentDeck, useDeckStore } from '../store/useDeckStore';
import { useProgress } from '../store/useProgress';
import { images } from '../assets/images';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const SWATCH = [colors.green, colors.pink, colors.orange, colors.primary];

const OFFLINE_POINTS = [
  'All features work on your device',
  'No internet required',
  'Your notes stay private',
  'Learn anytime, anywhere',
];

export function DecksScreen() {
  const nav = useNavigation<Nav>();
  const decks = useDeckStore(s => s.decks);
  const { decks: progress } = useProgress();
  return (
    <Screen bg={images.bgLandscape} dim={0.25}>
      <Header
        title="Study Decks"
        subtitle="Organize your learning by topic"
        icon={
          <IconBadge color={colors.primary} size={36}>
            <Library color="#fff" size={20} />
          </IconBadge>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {decks.map((d, i) => {
            const p = progress.find(x => x.id === d.id);
            return (
              <Pressable
                key={d.id}
                style={styles.cell}
                onPress={() => {
                  setCurrentDeck(d.id);
                  nav.navigate('Wordscape', { docId: d.id });
                }}
              >
                <Card light style={styles.deck}>
                  <IconBadge color={SWATCH[i % SWATCH.length]} size={48}>
                    <ShieldCheck color="#fff" size={26} />
                  </IconBadge>
                  <Text style={styles.deckName} numberOfLines={2}>
                    {d.title}
                  </Text>
                  <Text style={styles.deckTerms}>
                    {d.terms} terms
                    {p && p.total ? ` · ${p.mastered}/${p.total} mastered` : ''}
                  </Text>
                </Card>
              </Pressable>
            );
          })}
          <Pressable style={styles.cell} onPress={() => nav.navigate('Ingest')}>
            <View style={[styles.deck, styles.addDeck]}>
              <View style={styles.addCircle}>
                <Plus color={colors.textMuted} size={24} />
              </View>
              <Text style={styles.addText}>Add{'\n'}Custom Deck</Text>
            </View>
          </Pressable>
        </View>

        <Card light style={styles.offline}>
          <View style={styles.offlineHead}>
            <View style={styles.plane}>
              <Plane color="#fff" size={26} />
            </View>
            <View>
              <Text style={styles.offlineTitle}>Offline First</Text>
              <Text style={styles.offlineSub}>Works in Airplane Mode</Text>
            </View>
          </View>
          {OFFLINE_POINTS.map(p => (
            <View key={p} style={styles.point}>
              <CheckCircle2 color="#fff" fill={colors.green} size={20} />
              <Text style={styles.pointText}>{p}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: space.lg,
    paddingTop: 0,
    gap: space.lg,
    paddingBottom: space.xl,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -space.xs },
  cell: { width: '50%', padding: space.xs },
  deck: {
    alignItems: 'center',
    paddingVertical: space.lg,
    minHeight: 150,
    justifyContent: 'center',
  },
  deckName: {
    color: colors.cardText,
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    marginTop: space.sm,
  },
  deckTerms: {
    color: colors.cardMuted,
    fontSize: 12,
    marginTop: 2,
    textAlign: 'center',
  },
  addDeck: {
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.textDim,
  },
  addCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.textDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: space.sm,
  },
  offline: { gap: space.md },
  offlineHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.xs,
  },
  plane: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineTitle: { color: colors.cardText, fontSize: 18, fontWeight: '800' },
  offlineSub: { color: colors.primary, fontSize: 14 },
  point: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pointText: { color: colors.cardText, fontSize: 14 },
});
