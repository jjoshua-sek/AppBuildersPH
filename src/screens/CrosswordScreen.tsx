import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  MessageCircle,
} from 'lucide-react-native';
import { brand as colors, radius, space } from '../app/theme';
import type { Props } from '../app/navigation';
import { Card, Header, ProgressBar, Screen } from '../components/ui';
import { CrosswordKeyboard } from '../components/CrosswordKeyboard';
import { TutorSheet } from '../components/TutorSheet';
import { images } from '../assets/images';
import {
  buildCrossword,
  MIN_PLACED_FOR_GRID,
  type Placed,
} from '../services/game/crossword';
import {
  backspace,
  cellKey,
  clueOrder,
  entriesAt,
  entryCells,
  entryFor,
  flipDirection,
  isFull,
  lockedCells,
  startOf,
  tapCell,
  typedWord,
  typeLetter,
  type Cursor,
  type Letters,
} from '../services/game/crosswordPlay';
import { MISSES_BEFORE_TUTOR } from '../services/game/dailyTerm';
import { getSelectedTerms, logAttempt } from '../services/db/queries';
import { bumpWhy, useDeckStore } from '../store/useDeckStore';
import type { TermRow } from '../types';

const MAX_CELL = 40;

/**
 * Notes Crossword, played like a newspaper mini: tap a cell, type on the
 * on-screen keyboard (always visible), the cursor moves on by itself, tapping the
 * selected cell flips Across/Down, and a bar shows the current clue. A word is
 * checked as soon as it is full. Terms that did not fit the grid, or a deck with
 * too few placed words, are played from the Clue List with a text box.
 * Every check is logged for the Daily Term pick.
 */
export function CrosswordScreen({ route }: Props<'Crossword'>) {
  const { docId } = route.params;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const title = useDeckStore(s => s.decks.find(d => d.id === docId)?.title);
  // Terms keep arriving while the ingest is still reading; reload as they do.
  const selectedSoFar = useDeckStore(s => s.progress?.selected ?? 0);

  const [terms, setTerms] = useState<TermRow[]>([]);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [hints, setHints] = useState<Record<string, number>>({});
  // Tutor replies per term; added to the letter reveals in hints_used.
  const tutorHints = useRef<Record<string, number>>({});
  const [misses, setMisses] = useState<Record<string, number>>({});
  const [letters, setLetters] = useState<Letters>({});
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [wrong, setWrong] = useState<Set<string>>(new Set()); // full but incorrect words
  const [justSolved, setJustSolved] = useState<string | null>(null); // shows its "why it matters" card
  const [listId, setListId] = useState<string | null>(null); // a Clue List term being played
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
  const total = terms.length;
  const locked = useMemo(
    () => (puzzle ? lockedCells(puzzle, solved) : new Set<string>()),
    [puzzle, solved],
  );

  const activeEntry = showGrid && puzzle ? entryFor(puzzle, cursor) : undefined;
  const activeTerm =
    (activeEntry && byId.get(activeEntry.termId)) ||
    (listId ? byId.get(listId) : undefined) ||
    null;

  const cols = puzzle?.cols ?? 1;
  const cell = Math.min(MAX_CELL, Math.floor((width - space.lg * 2) / cols));

  const hintsUsed = (id: string) =>
    (hints[id] ?? 0) + (tutorHints.current[id] ?? 0);

  const log = (id: string, correct: boolean) =>
    logAttempt({
      term_id: id,
      mode: 'crossword',
      correct: correct ? 1 : 0,
      hints_used: hintsUsed(id),
      ts: Date.now(),
    }).catch(() => {});

  /** Moves to the next clue that is not solved yet. */
  const advance = (from: Cursor | null, done: Set<string>, lettersNow: Letters) => {
    if (!puzzle) return;
    const order = clueOrder(puzzle);
    const now = entryFor(puzzle, from);
    const i = now ? order.indexOf(now) : -1;
    for (let k = 1; k <= order.length; k++) {
      const next = order[(i + k) % order.length];
      if (!done.has(next.termId)) return setCursor(startOf(next, lettersNow));
    }
  };

  const markSolved = (t: TermRow, entry?: Placed, lettersNow: Letters = letters) => {
    const done = new Set(solved).add(t.id);
    setSolved(done);
    setJustSolved(t.id);
    setNote(null);
    bumpWhy(t.id); // make sure its "why it matters" card is next in line
    reload();
    if (entry) {
      const filled = { ...lettersNow };
      entryCells(entry).forEach(([r, c], i) => {
        filled[cellKey(r, c)] = entry.answer[i];
      });
      setLetters(filled);
      // Only move on when the word being typed was the one solved, not a crossing word.
      if (entry.termId === activeEntry?.termId) advance(cursor, done, filled);
    }
  };

  /** Checks every full, unsolved word that runs through the cell just typed. */
  const checkAround = (r: number, c: number, lettersNow: Letters) => {
    if (!puzzle) return;
    let latest = lettersNow;
    const bad = new Set(wrong);
    const missed = { ...misses };
    let said: string | null = null;
    for (const e of entriesAt(puzzle, r, c)) {
      bad.delete(e.termId);
      if (solved.has(e.termId) || !isFull(latest, e)) continue;
      const t = byId.get(e.termId);
      if (!t) continue;
      const ok = typedWord(latest, e) === e.answer;
      log(t.id, ok);
      if (ok) {
        markSolved(t, e, latest);
        latest = { ...latest };
        entryCells(e).forEach(([er, ec], i) => {
          latest[cellKey(er, ec)] = e.answer[i];
        });
      } else {
        bad.add(e.termId);
        missed[e.termId] = (missed[e.termId] ?? 0) + 1;
        said =
          missed[e.termId] >= MISSES_BEFORE_TUTOR
            ? 'Not quite. The tutor can give you a nudge.'
            : 'Not quite. Try again!';
      }
    }
    setWrong(bad);
    setMisses(missed);
    if (said) setNote(said);
  };

  const onLetter = (ch: string) => {
    if (!puzzle || !cursor) return;
    setJustSolved(null);
    const next = typeLetter(puzzle, letters, locked, cursor, ch);
    setLetters(next.letters);
    setNote(null);
    // The cursor only moves on if the word is still open; a solved word advances itself.
    setCursor(next.cur);
    checkAround(cursor.r, cursor.c, next.letters);
  };

  const onBackspace = () => {
    if (!puzzle || !cursor) return;
    const next = backspace(puzzle, letters, locked, cursor);
    setLetters(next.letters);
    setCursor(next.cur);
    setNote(null);
    setWrong(w => {
      const out = new Set(w);
      for (const e of entriesAt(puzzle, cursor.r, cursor.c)) out.delete(e.termId);
      return out;
    });
  };

  const onTapCell = (r: number, c: number) => {
    if (!puzzle) return;
    setJustSolved(null);
    setListId(null);
    setGuess('');
    setNote(null);
    setCursor(tapCell(puzzle, cursor, r, c));
  };

  const pickEntry = (e: Placed) => {
    if (!puzzle) return;
    setJustSolved(null);
    setListId(null);
    setNote(null);
    setCursor(startOf(e, letters));
  };

  const pickListed = (id: string) => {
    setListId(id);
    setCursor(null);
    setGuess('');
    setNote(null);
  };

  const stepBy = (delta: 1 | -1) => {
    if (!puzzle) return;
    const order = clueOrder(puzzle);
    const now = entryFor(puzzle, cursor);
    const i = now ? order.indexOf(now) : delta === 1 ? -1 : 0;
    pickEntry(order[(i + delta + order.length) % order.length]);
  };

  /** Hint: reveal the next wrong or empty letter of the current word. */
  const hint = () => {
    if (!activeTerm || solved.has(activeTerm.id)) return;
    const n = hints[activeTerm.id] ?? 0;
    if (n >= activeTerm.answer.length - 1) return;
    if (activeEntry && puzzle) {
      const cells = entryCells(activeEntry);
      const i = cells.findIndex(
        ([r, c], k) => letters[cellKey(r, c)] !== activeEntry.answer[k],
      );
      if (i < 0) return;
      const [r, c] = cells[i];
      const next = { ...letters, [cellKey(r, c)]: activeEntry.answer[i] };
      setHints({ ...hints, [activeTerm.id]: n + 1 });
      setLetters(next);
      setCursor({ r, c, dir: activeEntry.dir });
      checkAround(r, c, next);
    } else {
      setHints({ ...hints, [activeTerm.id]: n + 1 });
    }
  };

  /** Clue List play (terms outside the grid): the whole answer in a text box. */
  const submitListed = () => {
    if (!activeTerm) return;
    const g = guess.toUpperCase().replace(/[^A-Z]/g, '');
    if (!g) return;
    const ok = g === activeTerm.answer;
    log(activeTerm.id, ok);
    setGuess('');
    if (ok) {
      markSolved(activeTerm);
    } else {
      const n = (misses[activeTerm.id] ?? 0) + 1;
      setMisses({ ...misses, [activeTerm.id]: n });
      setNote(
        n >= MISSES_BEFORE_TUTOR
          ? 'Not quite. The tutor can give you a nudge.'
          : 'Not quite. Try again!',
      );
    }
  };

  const cellFill = (r: number, c: number) => {
    const k = cellKey(r, c);
    const here = puzzle ? entriesAt(puzzle, r, c) : [];
    if (cursor && cursor.r === r && cursor.c === c) return styles.cellCursor;
    if (here.some(e => wrong.has(e.termId))) return styles.cellWrong;
    if (activeEntry && here.includes(activeEntry)) return styles.cellWord;
    if (locked.has(k)) return styles.cellSolved;
    return null;
  };

  const gridCells = useMemo(() => {
    const out = new Map<string, { r: number; c: number; num?: number }>();
    for (const e of puzzle?.entries ?? []) {
      entryCells(e).forEach(([r, c], i) => {
        const k = cellKey(r, c);
        const cur = out.get(k) ?? { r, c };
        if (i === 0 && e.num) cur.num = e.num;
        out.set(k, cur);
      });
    }
    return [...out.values()];
  }, [puzzle]);

  const clueList = (items: { id: string; num?: number; text: string; len: number; entry?: Placed }[]) =>
    items.map(e => (
      <Pressable
        key={e.id}
        style={styles.clueRow}
        onPress={() => (e.entry ? pickEntry(e.entry) : pickListed(e.id))}
      >
        <Text style={styles.clueNum}>{e.num ? `${e.num}.` : '•'}</Text>
        <Text
          style={[
            styles.clueText,
            solved.has(e.id) && styles.clueSolved,
            activeTerm?.id === e.id && styles.clueSelected,
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
      .map(e => ({
        id: e.termId,
        num: e.num,
        text: e.clue,
        len: e.answer.length,
        entry: e,
      }));

  const showKeyboard = showGrid && !listId;
  const cardTerm =
    (justSolved ? byId.get(justSolved) : null) ??
    (activeTerm && solved.has(activeTerm.id) ? activeTerm : null);

  const solvedCard = cardTerm ? (
    <Card light style={showKeyboard ? styles.panelCard : styles.answerCard}>
      <Text style={styles.solved}>✓ {cardTerm.term}</Text>
      {cardTerm.description ? (
        <Text style={styles.clueText} numberOfLines={showKeyboard ? 2 : undefined}>
          {cardTerm.description}
        </Text>
      ) : null}
      {cardTerm.why ? (
        <Text
          testID="why-card"
          style={styles.why}
          numberOfLines={showKeyboard ? 3 : undefined}
        >
          Why it matters: {cardTerm.why}
        </Text>
      ) : null}
    </Card>
  ) : null;

  const body = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.progressRow}>
        <View style={styles.flex}>
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
          testID="grid"
          style={[
            styles.grid,
            { width: cell * puzzle.cols, height: cell * puzzle.rows },
          ]}
        >
          {gridCells.map(g => (
            <Pressable
              key={cellKey(g.r, g.c)}
              testID={`cell-${g.r}-${g.c}`}
              accessibilityRole="button"
              accessibilityLabel={`Row ${g.r + 1}, column ${g.c + 1}`}
              onPress={() => onTapCell(g.r, g.c)}
              style={[
                styles.cell,
                { left: g.c * cell, top: g.r * cell, width: cell - 2, height: cell - 2 },
                cellFill(g.r, g.c),
              ]}
            >
              {g.num ? <Text style={styles.cellNum}>{g.num}</Text> : null}
              <Text style={[styles.cellText, { fontSize: cell * 0.5 }]}>
                {letters[cellKey(g.r, g.c)] ?? ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {cardTerm && !showKeyboard && solvedCard}

      {listId && activeTerm && !solved.has(activeTerm.id) && (
        <Card light style={styles.answerCard}>
          <Text style={styles.answerClue}>{activeTerm.clue}</Text>
          <Text style={styles.letters}>
            {Array.from(activeTerm.answer)
              .map((ch, i) => (i < (hints[activeTerm.id] ?? 0) ? ch : '_'))
              .join(' ')}
          </Text>
          <TextInput
            testID="guess"
            value={guess}
            onChangeText={setGuess}
            onSubmitEditing={submitListed}
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
              onPress={submitListed}
            >
              <Text style={styles.btnText}>Check</Text>
            </Pressable>
            <Pressable testID="hint" style={styles.btn} onPress={hint}>
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
                  <Text style={[styles.tabText, tab === d && styles.tabTextActive]}>
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
              listed.map(t => ({ id: t.id, text: t.clue, len: t.answer.length })),
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );

  return (
    <Screen bg={images.bgCabinNight} dim={0.22}>
      <Header title="Notes Crossword" subtitle={title ?? 'Clues generated from your notes'} />
      {showKeyboard ? (
        body
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {body}
        </KeyboardAvoidingView>
      )}

      {showKeyboard && (
        <View
          testID="play-panel"
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space.sm) }]}
        >
          {solvedCard}
          <View style={styles.clueBar}>
            <Pressable
              testID="clue-prev"
              accessibilityLabel="Previous clue"
              hitSlop={8}
              onPress={() => stepBy(-1)}
            >
              <ChevronLeft color={colors.primary} size={26} />
            </Pressable>
            <Pressable
              testID="clue-bar"
              style={styles.clueBarText}
              onPress={() => puzzle && cursor && setCursor(flipDirection(puzzle, cursor))}
            >
              {activeEntry ? (
                <Text style={styles.barClue} numberOfLines={2}>
                  <Text style={styles.barNum}>
                    {activeEntry.num}
                    {activeEntry.dir === 'A' ? '-Across' : '-Down'}
                    {'  '}
                  </Text>
                  {activeEntry.clue} ({activeEntry.answer.length})
                </Text>
              ) : (
                <Text style={styles.barClue}>Tap a square to start</Text>
              )}
            </Pressable>
            <Pressable
              testID="clue-next"
              accessibilityLabel="Next clue"
              hitSlop={8}
              onPress={() => stepBy(1)}
            >
              <ChevronRight color={colors.primary} size={26} />
            </Pressable>
          </View>
          {note && (
            <Text testID="note" style={styles.panelNote}>
              {note}
            </Text>
          )}
          <View style={styles.panelActions}>
            <Pressable
              testID="hint"
              style={[styles.btn, !activeTerm && styles.dim]}
              disabled={!activeTerm}
              onPress={hint}
            >
              <Lightbulb color={colors.primary} size={16} />
              <Text style={styles.btnGhost}>Hint</Text>
            </Pressable>
            <Pressable
              testID="ask-tutor"
              style={[styles.btn, !activeTerm && styles.dim]}
              disabled={!activeTerm}
              onPress={() => setTutorOpen(true)}
            >
              <MessageCircle color={colors.primary} size={16} />
              <Text style={styles.btnGhost}>Tutor</Text>
            </Pressable>
          </View>
          <CrosswordKeyboard onLetter={onLetter} onBackspace={onBackspace} />
        </View>
      )}

      {activeTerm && (
        <TutorSheet
          term={activeTerm}
          visible={tutorOpen}
          onClose={() => setTutorOpen(false)}
          onHint={() => {
            tutorHints.current[activeTerm.id] =
              (tutorHints.current[activeTerm.id] ?? 0) + 1;
          }}
          onSolved={() => {
            setTutorOpen(false);
            log(activeTerm.id, true);
            markSolved(activeTerm, activeEntry);
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapSm: { gap: space.xs },
  dim: { opacity: 0.4 },
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
  cellWord: { backgroundColor: '#CFE0FF' },
  cellCursor: { backgroundColor: '#FFD84D' },
  cellSolved: { backgroundColor: '#D9F7E4' },
  cellWrong: { backgroundColor: '#FFD0D0' },
  cellNum: { position: 'absolute', top: 1, left: 2, fontSize: 8, color: colors.cardMuted },
  cellText: { color: colors.cardText, fontWeight: '800' },
  answerCard: { gap: space.md },
  panelCard: { gap: space.xs, padding: space.md },
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
  panel: {
    backgroundColor: colors.cardAlt,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
    gap: space.sm,
  },
  clueBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: '#CFE0FF',
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    minHeight: 54,
  },
  clueBarText: { flex: 1, paddingVertical: space.sm },
  barNum: { fontWeight: '800', color: colors.primaryDark },
  barClue: { color: colors.cardText, fontSize: 14, lineHeight: 19 },
  panelNote: { color: colors.red, fontSize: 13, textAlign: 'center' },
  panelActions: { flexDirection: 'row', justifyContent: 'center', gap: space.md },
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
