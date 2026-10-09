// @refresh reset
import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { CalendarDays, MessageCircle } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { brand as colors, radius, space } from '../app/theme';
import type { Props, RootStackParamList } from '../app/navigation';
import { images } from '../assets/images';
import { Header, Screen } from '../components/ui';
import { TutorSheet } from '../components/TutorSheet';
import {
  isValidGuess,
  MAX_GUESSES,
  MISSES_BEFORE_TUTOR,
  scoreGuess,
  type Mark,
} from '../services/game/dailyTerm';
import {
  getDailyRound,
  getDailyTerm,
  logAttempt,
  saveDailyRound,
} from '../services/db/queries';
import type { TermRow } from '../types';

const TILE: Record<Mark, string> = {
  G: colors.green,
  Y: colors.amber,
  X: '#6B7399',
};

/** Daily Term: one term a day, six guesses, green/yellow/gray feedback. */
export function DailyTermScreen({ route }: Props<'DailyTerm'>) {
  const { docId } = route.params;
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width } = useWindowDimensions();
  const submitting = useRef(false);
  const answerInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const roundDate = useRef(new Date());
  const tutorHints = useRef(0); // tutor replies this round, logged as hints_used
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [term, setTerm] = useState<TermRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [current, setCurrent] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [tutorSolved, setTutorSolved] = useState(false);

  useEffect(() => {
    let live = true;
    setTerm(null);
    setGuesses([]);
    setCurrent('');
    setTutorSolved(false);
    setLoaded(false);
    setLoadError(null);
    roundDate.current = new Date();
    if (!docId) {
      setLoaded(true);
      return;
    }
    const load = async () => {
      try {
        const picked = await getDailyTerm(docId, roundDate.current);
        if (!picked) return;
        const saved = await getDailyRound(picked, roundDate.current);
        if (live) {
          setTerm(picked);
          setGuesses(saved.guesses);
          setTutorSolved(saved.solved);
        }
      } catch (error) {
        if (live)
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Could not load the daily game.',
          );
      } finally {
        if (live) setLoaded(true);
      }
    };
    load();
    return () => {
      live = false;
    };
  }, [docId]);

  const answer = term?.answer ?? '';
  const marks = guesses.map(g => scoreGuess(g, answer));
  const won = tutorSolved || guesses.includes(answer);
  const lost = !won && guesses.length >= MAX_GUESSES;
  const over = won || lost;
  const misses = guesses.filter(g => g !== answer).length;
  const tileSize = Math.min(
    36,
    Math.floor(
      (width - space.lg * 2 - Math.max(0, answer.length - 1) * 4) /
        Math.max(1, answer.length),
    ),
  );

  const press = async (k: string) => {
    if (over || !term || submitting.current) return;
    setNote(null);
    if (k === 'DEL') return setCurrent(c => c.slice(0, -1));
    if (k === 'ENTER') {
      if (!isValidGuess(current, answer.length)) {
        return setNote(`Enter a ${answer.length}-letter word`);
      }
      submitting.current = true;
      setSaving(true);
      const nextGuesses = [...guesses, current];
      try {
        await saveDailyRound(term, nextGuesses, false, roundDate.current);
        setGuesses(nextGuesses);
        setCurrent('');
        await logAttempt({
          term_id: term.id,
          mode: 'daily',
          correct: current === answer ? 1 : 0,
          hints_used: tutorHints.current,
          ts: Date.now(),
        });
      } catch (error) {
        setNote(
          error instanceof Error
            ? error.message
            : 'Could not save this guess. Try again.',
        );
      } finally {
        submitting.current = false;
        setSaving(false);
      }
      return;
    }
    setCurrent(c => (c.length < answer.length ? c + k : c));
  };

  return (
    <Screen bg={images.bgLandscape} dim={0.16}>
      <Header
        title="Daily Term"
        subtitle="Guess the term from your notes · six tries"
        icon={
          <View style={styles.calIcon}>
            <CalendarDays color={colors.primary} size={22} />
          </View>
        }
      />

      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.fill} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!term ? (
          <View style={[styles.bubble, styles.bubbleLight]}>
            <Text style={styles.bubbleText}>
              {loaded
                ? loadError ??
                  (docId
                    ? 'These notes have no 3 to 16 letter terms yet. Import a handout and generate study games first.'
                    : 'Your daily game is built from your own notes. Scan a photo or import a file to begin.')
                : 'Picking today’s term…'}
            </Text>
            {loaded && (
              <Pressable
                accessibilityRole="button"
                testID="daily-add-notes"
                style={styles.emptyButton}
                onPress={() => nav.navigate('Ingest')}
              >
                <Text style={styles.tutorText}>Scan or import notes</Text>
              </Pressable>
            )}
            {loaded && docId && (
              <Pressable
                accessibilityRole="button"
                style={styles.emptyButton}
                onPress={() =>
                  nav.navigate('Tabs', { screen: 'Decks' } as never)
                }
              >
                <Text style={styles.tutorText}>Choose another deck</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            <View style={[styles.bubble, styles.bubbleBlue]}>
              <Text style={[styles.bubbleText, { color: '#fff' }]}>
                {term.clue}
              </Text>
              <Text style={styles.len}>{answer.length} letters</Text>
              <Text style={styles.len}>
                {Math.max(0, MAX_GUESSES - guesses.length)} guesses left · green
                = correct · gold = move letter
              </Text>
            </View>

            {!over && (
              <View style={styles.answerEntry}>
                <TextInput
                  ref={answerInput}
                  testID="daily-answer"
                  accessibilityLabel="Your Daily Term answer"
                  style={styles.hiddenInput}
                  caretHidden
                  value={current}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  spellCheck={false}
                  editable={!saving}
                  returnKeyType="send"
                  submitBehavior="submit"
                  onChangeText={text => {
                    setCurrent(text.toUpperCase().replace(/[^A-Z]/g, '').slice(0, answer.length));
                    setNote(null);
                  }}
                  onSubmitEditing={() => press('ENTER')}
                />
              </View>
            )}

            <View style={styles.board}>
              {Array.from({ length: guesses.length + (over ? 0 : 1) }, (_, r) => {
                const guess =
                  r < guesses.length
                    ? guesses[r]
                    : r === guesses.length
                    ? current
                    : '';
                const done = r < guesses.length;
                return (
                  <Pressable
                    key={r}
                    testID={done ? `daily-guess-${r}` : 'daily-active-tiles'}
                    style={styles.tileRow}
                    disabled={done || over || saving}
                    accessibilityRole={done ? undefined : 'button'}
                    accessibilityLabel={done ? `Guess ${r + 1}: ${guess}` : `Enter your ${answer.length}-letter answer: ${current || 'empty'}`}
                    onPress={() => answerInput.current?.focus()}
                  >
                    {Array.from(answer, (_, i) => (
                      <View
                        key={i}
                        style={[
                          styles.tile,
                          {
                            width: tileSize,
                            height: Math.max(30, tileSize + 4),
                          },
                          done && { backgroundColor: TILE[marks[r][i]] },
                          !done && i === Math.min(current.length, answer.length - 1) && styles.activeTile,
                        ]}
                      >
                        <Text
                          style={[styles.tileText, done && { color: '#fff' }]}
                        >
                          {guess[i] ?? ''}
                        </Text>
                      </View>
                    ))}
                  </Pressable>
                );
              })}
            </View>

            {!over && (
              <>
                <Text style={styles.answerLabel}>Tap the tiles to type your answer</Text>
                <Pressable
                  testID="key-ENTER"
                  accessibilityRole="button"
                  accessibilityLabel="Submit guess"
                  style={[styles.submitButton, saving && styles.disabled]}
                  disabled={saving}
                  onPress={() => press('ENTER')}
                >
                  <Text style={styles.tutorText}>{saving ? 'Saving…' : 'Submit answer'}</Text>
                </Pressable>
              </>
            )}

            {note && <Text style={styles.note}>{note}</Text>}

            {won && (
              <View style={[styles.bubble, styles.bubbleLight]}>
                <Text style={styles.bubbleText}>
                  ✓ Solved! {term.term}
                  {term.description ? `\n\n${term.description}` : ''}
                  {term.why ? `\n\nWhy it matters: ${term.why}` : ''}
                </Text>
              </View>
            )}
            {lost && (
              <View style={[styles.bubble, styles.bubbleLight]}>
                <Text style={styles.bubbleText}>
                  The term was {term.term}.
                  {term.description ? `\n\n${term.description}` : ''}
                </Text>
              </View>
            )}
            {!over && (
              <Pressable
                testID="ask-tutor"
                style={styles.tutorBtn}
                onPress={() => setTutorOpen(true)}
              >
                <MessageCircle color="#fff" size={18} />
                <Text style={styles.tutorText}>
                  {misses >= MISSES_BEFORE_TUTOR
                    ? 'Ask the tutor for a nudge'
                    : 'Ask for a hint'}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {term && (
        <TutorSheet
          term={term}
          visible={tutorOpen}
          onClose={() => setTutorOpen(false)}
          onHint={() => {
            tutorHints.current += 1;
          }}
          onSolved={async () => {
            setTutorOpen(false);
            try {
              await saveDailyRound(term, guesses, true, roundDate.current);
              setTutorSolved(true);
              await logAttempt({
                term_id: term.id,
                mode: 'daily',
                correct: 1,
                hints_used: tutorHints.current,
                ts: Date.now(),
              });
            } catch {
              setNote('Could not save the tutor result. Please try again.');
            }
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    padding: 12,
    marginTop: 12,
    alignItems: 'center',
  },
  fill: { flex: 1 },
  answerEntry: { position: 'absolute', width: 1, height: 1 },
  answerLabel: { color: '#fff', textAlign: 'center' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0, padding: 0 },
  activeTile: { borderWidth: 2, borderColor: colors.primary },
  submitButton: { backgroundColor: colors.primary, borderRadius: radius.md, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.6 },
  calIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: space.lg, gap: space.lg },
  bubble: { borderRadius: radius.lg, padding: space.lg, maxWidth: '92%' },
  bubbleLight: { backgroundColor: colors.card, alignSelf: 'flex-start' },
  bubbleBlue: { backgroundColor: colors.primary, alignSelf: 'flex-start' },
  bubbleText: { color: colors.cardText, fontSize: 15, lineHeight: 21 },
  len: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: space.xs },
  board: { alignItems: 'center', gap: 6 },
  tileRow: { flexDirection: 'row', gap: 4 },
  tile: {
    width: 36,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { color: colors.cardText, fontSize: 18, fontWeight: '800' },
  note: { color: '#fff', textAlign: 'center' },
  tutorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: colors.violet,
    borderRadius: radius.pill,
    paddingVertical: space.md,
  },
  tutorText: { color: '#fff', fontWeight: '700' },
});
