import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Bot,
  Camera,
  ChevronRight,
  Grid3x3,
  Layers,
  Network,
  Plane,
  Search,
  Settings,
} from 'lucide-react-native';
import { brand as colors, homeActions, space } from '../app/theme';
import type { RootStackParamList } from '../app/navigation';
import { images } from '../assets/images';
import { Card, GradientTile, Screen } from '../components/ui';
import { StreakBuddy } from '../components/StreakBuddy';
import { TutorSheet } from '../components/TutorSheet';
import { StudyActivityLog } from '../components/StudyActivityLog';
import { stats } from '../services/ai/llamaBridge';
import { getSelectedTerms } from '../services/db/queries';
import { useDeckStore } from '../store/useDeckStore';
import { useProgress } from '../store/useProgress';
import type { TermRow } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const nav = useNavigation<Nav>();
  const decks = useDeckStore(s => s.decks);
  const currentDocId = useDeckStore(s => s.currentDocId);
  const dbError = useDeckStore(s => s.dbError);
  const current = decks.find(d => d.id === currentDocId) ?? decks[0];
  const { streak, decks: progress } = useProgress();
  const done = progress.find(p => p.id === current?.id);
  const pct = done?.total ? Math.round((done.mastered / done.total) * 100) : 0;
  const [tutorTerm, setTutorTerm] = useState<TermRow | null>(null);
  const [tutorError, setTutorError] = useState('');
  const [openingTutor, setOpeningTutor] = useState(false);

  const openTutor = async () => {
    if (!current || openingTutor) return;
    setOpeningTutor(true);
    setTutorError('');
    try {
      const terms = await getSelectedTerms(current.id);
      if (terms[0]) setTutorTerm(terms[0]);
      else
        setTutorError(
          'Add notes with study terms to start a tutor conversation.',
        );
    } catch {
      setTutorError('Could not load your study terms. Please try again.');
    } finally {
      setOpeningTutor(false);
    }
  };

  return (
    <Screen bg={images.bgLandscape} dim={0.08}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Pressable onLongPress={() => nav.navigate('Proof')}>
              <Image
                source={images.logo}
                style={styles.logo}
                resizeMode="contain"
              />
            </Pressable>
            <Pressable
              style={{ flex: 1 }}
              onLongPress={() => nav.navigate('DevBench')}
            >
              <Text style={styles.brand}>Backpack{'\n'}Tutor</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="App information"
              hitSlop={12}
              onPress={() => nav.navigate('Proof')}
            >
              <Settings color="#fff" size={22} />
            </Pressable>
          </View>
          <View style={styles.heroBottom}>
            <Text style={styles.tagline}>
              Your notes. Your games.{'\n'}Your AI tutor.{' '}
              <Text style={styles.offlineWord}>Offline.</Text>
            </Text>
            <StreakBuddy
              days={streak}
              enabled
              onPress={() => nav.navigate('DailyTerm', { docId: current?.id })}
            />
          </View>
        </View>

        <StudyActivityLog />
        <View style={styles.actions}>
          <GradientTile
            colors={homeActions.scan}
            onPress={() => nav.navigate('Ingest')}
            style={styles.action}
          >
            <View style={styles.icon}>
              <Camera color="#153653" size={24} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={styles.actionTitle}>Scan Notes</Text>
              <Text style={styles.actionSub}>
                Turn your handouts into games
              </Text>
            </View>
            <ChevronRight color="#fff" size={18} />
          </GradientTile>
          <GradientTile
            colors={homeActions.daily}
            style={styles.action}
            onPress={() =>
              current
                ? nav.navigate('Wordscape', { docId: current.id })
                : nav.navigate('Ingest')
            }
          >
            <View style={styles.icon}>
              <Network color="#243252" size={25} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, styles.dark]}>Wordscape</Text>
              <Text style={[styles.actionSub, styles.dark]}>
                Connect letters from your notes
              </Text>
            </View>
            <ChevronRight color={colors.cardText} size={18} />
          </GradientTile>
          <GradientTile
            colors={homeActions.crossword}
            style={[styles.action, !current && styles.disabled]}
            onPress={() =>
              current && nav.navigate('Crossword', { docId: current.id })
            }
          >
            <View style={styles.icon}>
              <Grid3x3 color="#263559" size={26} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, styles.dark]}>
                Notes Crossword
              </Text>
              <Text style={[styles.actionSub, styles.dark]}>
                Solve clues from your lessons
              </Text>
            </View>
            <ChevronRight color={colors.cardText} size={18} />
          </GradientTile>
          <GradientTile
            colors={homeActions.tutor}
            style={[
              styles.action,
              (!current || openingTutor) && styles.disabled,
            ]}
            onPress={openTutor}
          >
            <View style={styles.icon}>
              <Bot color="#263559" size={26} />
            </View>
            <View style={styles.actionCopy}>
              <Text style={[styles.actionTitle, styles.dark]}>Ask Tutor</Text>
              <Text style={[styles.actionSub, styles.dark]}>
                {openingTutor
                  ? 'Opening your notes…'
                  : 'Get hints, not answers'}
              </Text>
            </View>
            <ChevronRight color={colors.cardText} size={18} />
          </GradientTile>
          {tutorError ? <Text style={styles.error}>{tutorError}</Text> : null}
        </View>

        <View style={styles.offlineRow}>
          <View style={styles.offlineIcon}>
            <Plane color="#fff" size={20} />
          </View>
          <View>
            <Text style={styles.offlineTitle}>Works Offline</Text>
            <Text style={styles.offlineSub}>No internet needed</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryHeading}>
            <Text style={styles.section}>Your study journey</Text>
            <Pressable
              accessibilityLabel="View study decks"
              onPress={() => nav.navigate('Tabs', { screen: 'Decks' } as never)}
            >
              <Text style={styles.link}>View decks →</Text>
            </Pressable>
          </View>
          <View testID="deck">
            <Card style={styles.continueCard}>
              <Image
                source={images.book}
                style={styles.book}
                resizeMode="contain"
              />
              <View style={styles.actionCopy}>
                <Text style={styles.cardTitle}>
                  {dbError
                    ? 'Notes database error'
                    : current?.title ?? 'No notes yet'}
                </Text>
                <Text style={styles.cardSub}>
                  {dbError ??
                    (current
                      ? `${current.terms} terms · ${pct}% mastered`
                      : 'Scan a handout to begin your journey')}
                </Text>
              </View>
              {current && !dbError ? (
                <Pressable
                  accessibilityLabel="Continue Wordscape"
                  onPress={() =>
                    nav.navigate('Wordscape', { docId: current.id })
                  }
                >
                  <ChevronRight color="#fff" size={22} />
                </Pressable>
              ) : null}
            </Card>
          </View>
          <View style={styles.shortcuts}>
            <Pressable
              style={styles.shortcut}
              onPress={() => nav.navigate('Tabs', { screen: 'Decks' } as never)}
            >
              <Layers color="#C4CDFF" size={18} />
              <Text style={styles.shortcutText}>Browse Study Decks</Text>
            </Pressable>
            <Pressable
              style={[styles.shortcut, !decks.length && styles.disabled]}
              onPress={() => decks.length && nav.navigate('Ask')}
            >
              <Search color="#C4CDFF" size={18} />
              <Text style={styles.shortcutText}>Ask my notes</Text>
            </Pressable>
          </View>
          <Text style={styles.model}>
            {stats.modelName} · {stats.gpu ? 'GPU' : 'CPU'} · on-device
          </Text>
        </View>
      </ScrollView>
      {tutorTerm && (
        <TutorSheet
          term={tutorTerm}
          visible
          onClose={() => setTutorTerm(null)}
          onSolved={() => setTutorTerm(null)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingBottom: space.xl },
  hero: { paddingTop: 10, paddingHorizontal: 8, paddingBottom: 8 },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  heroBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  logo: { width: 54, height: 60, marginRight: 10 },
  brand: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 27,
    textShadowColor: '#08214A',
    textShadowRadius: 8,
  },
  tagline: {
    color: '#fff',
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    textShadowColor: '#08214A',
    textShadowRadius: 6,
  },
  offlineWord: { color: '#D2F179', fontWeight: '700' },
  actions: { gap: 10 },
  action: {
    minHeight: 68,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCopy: { flex: 1, marginLeft: 12 },
  actionTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  actionSub: { color: '#F0FAFF', fontSize: 11, marginTop: 3, lineHeight: 15 },
  dark: { color: '#192A53' },
  disabled: { opacity: 0.55 },
  offlineRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 17,
  },
  offlineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(40,70,110,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  offlineTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
  offlineSub: { color: '#D5E0F8', fontSize: 10, marginTop: 2 },
  summary: { gap: 10, marginTop: 4 },
  summaryHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  section: { color: '#fff', fontSize: 15, fontWeight: '700' },
  link: { color: '#D2D8FF', fontSize: 12 },
  streakMascot: {
    width: 108,
    height: 48,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  streakBubble: {
    position: 'absolute',
    top: -18,
    color: '#293452',
    backgroundColor: '#EEE9FF',
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 9,
    fontWeight: '700',
  },
  bubbleTail: {
    position: 'absolute',
    top: 2,
    width: 7,
    height: 7,
    backgroundColor: '#EEE9FF',
    transform: [{ rotate: '45deg' }],
  },
  streakCount: {
    color: '#FFE5A4',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  cardTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  cardSub: { color: '#CDDAF3', fontSize: 11, marginTop: 3 },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  book: { width: 44, height: 44 },
  shortcuts: { flexDirection: 'row', gap: 10 },
  shortcut: {
    flex: 1,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  shortcutText: { color: '#D3DCF6', fontSize: 11, flexShrink: 1 },
  model: { color: '#B8C8E4', fontSize: 10, textAlign: 'center', marginTop: 4 },
  error: { color: '#FFE2B8', fontSize: 12, padding: 8 },
});
