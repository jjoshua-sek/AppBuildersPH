import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Lightbulb, MessageCircle } from 'lucide-react-native';
import { brand as colors, radius, space } from '../app/theme';
import type { Props } from '../app/navigation';
import { Card, Header, ProgressBar, Screen } from '../components/ui';
import { TutorSheet } from '../components/TutorSheet';
import { images } from '../assets/images';
import {
  buildCrossword,
  MIN_PLACED_FOR_GRID,
  type Placed,
} from '../services/game/crossword';
import { MISSES_BEFORE_TUTOR } from '../services/game/dailyTerm';
import { getSelectedTerms, logAttempt } from '../services/db/queries';
import { bumpWhy, useDeckStore } from '../store/useDeckStore';
import type { TermRow } from '../types';

const MAX_CELL = 40;

/**
 * Notes Crossword: the layout comes from game/crossword.ts, the terms from the
 * deck's selected terms. With fewer than MIN_PLACED_FOR_GRID placed words it falls
 * back to a plain Clue List. Every submission is logged for the Daily Term pick.
 */
export function CrosswordScreen({ route }: Props<'Crossword'>) {
  const { docId } = route.params;
  const { width } = useWindowDimensions();
  const title = useDeckStore(s => s.decks.find(d => d.id === docId)?.title);
  // Terms keep arriving while the ingest is still reading; reload as they do.
  const selectedSoFar = useDeckStore(s => s.progress?.selected ?? 0);

  const [terms, setTerms] = useState<TermRow[]>([]);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [hints, setHints] = useState<Record<string, number>>({});
  const [misses, setMisses] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<'A' | 'D'>('A');
  const [guess, setGuess] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [tutorOpen, setTutorOpen] = useState(false);

  const reload = useCallback(
    () =>
      getSelectedTerms(docId)
        .then(setTerms)
        .catch(() => {}),
    [docId],
  );
  useEffect(() => {
    reload();
  }, [reload, selectedSoFar]);

  // Only rebuild the layout when the set of terms changes, so it does not reshuffle.
  const termKey = terms.map(t => t.id).join('|');
  const puzzle = useMemo(
    () =>
      buildCrossword(
        terms.map(t => ({ termId: t.id, answer: t.answer, clue: t.clue })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [termKey],
  );
  const showGrid = !!puzzle && puzzle.entries.length >= MIN_PLACED_FOR_GRID;
  const placedIds = new Set(puzzle?.entries.map(e => e.termId));
  // Terms that did not fit the grid still get played, from the clue list.
  const listed = showGrid ? terms.filter(t => !placedIds.has(t.id)) : terms;

  const byId = new Map(terms.map(t => [t.id, t]));
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const total = terms.length;

  const cols = puzzle?.cols ?? 1;
  const cell = Math.min(MAX_CELL, Math.floor((width - space.lg * 2) / cols));

  const letterShown = (e: Placed, i: number) =>
    solved.has(e.termId) || i < (hints[e.termId] ?? 0);

  const select = (id: string) => {
    setSelectedId(id);
    setGuess('');
    setNote(null);
  };

  const submit = () => {
    if (!selected) return;
    const g = guess.toUpperCase().replace(/[^A-Z]/g, '');
    if (!g) return;
    const ok = g === selected.answer;
    logAttempt({
      term_id: selected.id,
      mode: 'crossword',
      correct: ok ? 1 : 0,
      hints_used: hints[selected.id] ?? 0,
      ts: Date.now(),
    }).catch(() => {});
    setGuess('');
    if (ok) {
      markSolved(selected);
    } else {
      const n = (misses[selected.id] ?? 0) + 1;
      setMisses({ ...misses, [selected.id]: n });
      setNote(
        n >= MISSES_BEFORE_TUTOR
          ? 'Not quite. The tutor can give you a nudge.'
          : 'Not quite. Try again!',
      );
    }
  };

  const markSolved = (t: TermRow) => {
    setSolved(s => new Set(s).add(t.id));
    setNote(null);
    bumpWhy(t.id); // make sure its "why it matters" card is next in line
    reload();
  };

  const hint = () => {
    if (!selected) return;
    const n = hints[selected.id] ?? 0;
    if (n < selected.answer.length - 1) setHints({ ...hints, [selected.id]: n + 1 });
  };

  const clueList = (items: { id: string; num?: number; text: string; len: number }[]) =>
    items.map(e => (
      <Pressable key={e.id} style={styles.clueRow} onPress={() => select(e.id)}>
        <Text style={styles.clueNum}>{e.num ? `${e.num}.` : '•'}</Text>
        <Text
          style={[
            styles.clueText,
            solved.has(e.id) && styles.clueSolved,
            e.id === selectedId && styles.clueSelected,
          ]}
        >
          {e.text} ({e.len})
        </Text>
      </Pressable>
    ));

  const dirEntries = (d: 'A' | 'D') =>
    (puzzle?.entries ?? [])
      .filter(e => e.dir === d)
      .sort((a, b) => (a.num ?? 0) - (b.num ?? 0))
      .map(e => ({ id: e.termId, num: e.num, text: e.clue, len: e.answer.length }));

  return (
    <Screen bg={images.bgCabinNight} dim={0.22}>
      <Header title="Notes Crossword" subtitle={title ?? 'Clues generated from your notes'} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.progressRow}>
            <View style={{ flex: 1 }}>
              <ProgressBar
                value={total ? solved.size / total : 0}
                color={colors.green}
                height={8}
              />
            </View>
            <Text style={styles.progressText}>
              {solved.size}/{total}
            </Text>
          </View>

          {!total && (
            <Card light>
              <Text style={styles.clueText}>
                No terms yet. Add notes first, then come back to play.
              </Text>
            </Card>
          )}

          {showGrid && puzzle && (
            <View
              style={[
                styles.grid,
                { width: cell * puzzle.cols, height: cell * puzzle.rows },
              ]}
            >
              {puzzle.entries.map(e =>
                Array.from(e.answer).map((ch, i) => {
                  const r = e.r + (e.dir === 'D' ? i : 0);
                  const c = e.c + (e.dir === 'A' ? i : 0);
                  return (
                    <Pressable
                      key={`${e.termId}-${i}`}
                      onPress={() => select(e.termId)}
                      style={[
                        styles.cell,
                        {
                          left: c * cell,
                          top: r * cell,
                          width: cell - 2,
                          height: cell - 2,
                        },
                        e.termId === selectedId && styles.cellSelected,
                      ]}
                    >
                      {i === 0 && e.num ? (
                        <Text style={styles.cellNum}>{e.num}</Text>
                      ) : null}
                      <Text style={[styles.cellText, { fontSize: cell * 0.5 }]}>
                        {letterShown(e, i) ? ch : ''}
                      </Text>
                    </Pressable>
                  );
                }),
              )}
            </View>
          )}

          {selected && (
            <Card light style={styles.answerCard}>
              <Text style={styles.answerClue}>{selected.clue}</Text>
              {solved.has(selected.id) ? (
                <View style={{ gap: space.xs }}>
                  <Text style={styles.solved}>✓ {selected.term}</Text>
                  {selected.description ? (
                    <Text style={styles.clueText}>{selected.description}</Text>
                  ) : null}
                  {selected.why ? (
                    <Text style={styles.why}>Why it matters: {selected.why}</Text>
                  ) : null}
                </View>
              ) : (
                <>
                  <Text style={styles.letters}>
                    {Array.from(selected.answer)
                      .map((ch, i) => (i < (hints[selected.id] ?? 0) ? ch : '_'))
                      .join(' ')}
                  </Text>
                  <TextInput
                    testID="guess"
                    value={guess}
                    onChangeText={setGuess}
                    onSubmitEditing={submit}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    placeholder="Type your answer"
                    placeholderTextColor={colors.cardMuted}
                    style={styles.input}
                    returnKeyType="done"
                  />
                  {note && <Text style={styles.note}>{note}</Text>}
                  <View style={styles.actions}>
                    <Pressable
                      testID="submit"
                      style={[styles.btn, styles.btnPrimary]}
                      onPress={submit}
                    >
                      <Text style={styles.btnText}>Check</Text>
                    </Pressable>
                    <Pressable style={styles.btn} onPress={hint}>
                      <Lightbulb color={colors.primary} size={16} />
                      <Text style={styles.btnGhost}>Hint</Text>
                    </Pressable>
                    <Pressable
                      testID="ask-tutor"
                      style={styles.btn}
                      onPress={() => setTutorOpen(true)}
                    >
                      <MessageCircle color={colors.primary} size={16} />
                      <Text style={styles.btnGhost}>Tutor</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </Card>
          )}

          <View style={styles.clues}>
            {showGrid ? (
              <>
                <View style={styles.tabs}>
                  {(['A', 'D'] as const).map(d => (
                    <Pressable
                      key={d}
                      style={[styles.tab, tab === d && styles.tabActive]}
                      onPress={() => setTab(d)}
                    >
                      <Text
                        style={[styles.tabText, tab === d && styles.tabTextActive]}
                      >
                        {d === 'A' ? 'Across' : 'Down'} ({dirEntries(d).length})
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.clueBody}>{clueList(dirEntries(tab))}</View>
              </>
            ) : null}
            {listed.length > 0 && (
              <View style={styles.clueBody}>
                <Text style={styles.listTitle}>
                  {showGrid ? 'More clues' : 'Clue List'}
                </Text>
                {clueList(
                  listed.map(t => ({
                    id: t.id,
                    text: t.clue,
                    len: t.answer.length,
                  })),
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {selected && (
        <TutorSheet
          term={selected}
          visible={tutorOpen}
          onClose={() => setTutorOpen(false)}
          onSolved={() => {
            setTutorOpen(false);
            logAttempt({
              term_id: selected.id,
              mode: 'crossword',
              correct: 1,
              hints_used: hints[selected.id] ?? 0,
              ts: Date.now(),
            }).catch(() => {});
            markSolved(selected);
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xl },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  progressText: { color: colors.text, fontSize: 13 },
  grid: { alignSelf: 'center' },
  cell: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: { backgroundColor: '#CFE0FF' },
  cellNum: { position: 'absolute', top: 1, left: 2, fontSize: 8, color: colors.cardMuted },
  cellText: { color: colors.cardText, fontWeight: '800' },
  answerCard: { gap: space.md },
  answerClue: { color: colors.cardText, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  letters: { color: colors.cardText, fontSize: 20, letterSpacing: 2, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: colors.cardAlt,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    color: colors.cardText,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  note: { color: colors.red, fontSize: 13 },
  solved: { color: colors.green, fontSize: 16, fontWeight: '800' },
  why: { color: colors.cardMuted, fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: space.sm },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnText: { color: '#fff', fontWeight: '700' },
  btnGhost: { color: colors.primary, fontWeight: '600' },
  clues: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  tabs: { flexDirection: 'row', backgroundColor: colors.cardAlt },
  tab: { flex: 1, paddingVertical: space.md, alignItems: 'center' },
  tabActive: { backgroundColor: colors.card },
  tabText: { color: colors.cardMuted, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  clueBody: { padding: space.lg, gap: space.md },
  listTitle: { color: colors.cardText, fontWeight: '700', fontSize: 15 },
  clueRow: { flexDirection: 'row', gap: space.sm },
  clueNum: { color: colors.cardText, fontWeight: '700', width: 18 },
  clueText: { color: colors.cardText, flex: 1, lineHeight: 20 },
  clueSolved: { color: colors.green, textDecorationLine: 'line-through' },
  clueSelected: { color: colors.primary, fontWeight: '600' },
});
