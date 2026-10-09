// @refresh reset
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { Lightbulb, Shuffle } from 'lucide-react-native';
import { Header, Screen } from '../components/ui';
import { TutorSheet } from '../components/TutorSheet';
import { DeckDropdown } from '../components/DeckDropdown';
import { setCurrentDeck } from '../store/useDeckStore';
import { images } from '../assets/images';
import { brand as colors, radius } from '../app/theme';
import {
  layoutAnswerRows,
  layoutLetterWheel,
} from '../services/game/wordscapeLayout';
import type { Props } from '../app/navigation';
import type { TermRow } from '../types';
import {
  getTerms,
  getWordscapeSolved,
  logAttempt,
} from '../services/db/queries';

type Letter = { id: number; value: string };
type Point = { x: number; y: number };
const shuffle = (answer: string): Letter[] => {
  const letters = Array.from(answer, (value, id) => ({ id, value }));
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters;
};

/** One generated course term at a time, using a connected letter wheel. */
export function WordscapeScreen({ route, navigation }: Props<'Wordscape'>) {
  const { docId } = route.params;
  const { width, height } = useWindowDimensions();
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [letters, setLetters] = useState<Letter[]>([]);
  const [path, setPath] = useState<number[]>([]);
  const pathRef = useRef<number[]>([]);
  const previousPoint = useRef<Point | null>(null);
  const tailRef = useRef<Point | null>(null);
  const lineRef = useRef<Polyline>(null);
  const frameRef = useRef<number | null>(null);
  const paintRef = useRef<() => void>(() => {});
  const [message, setMessage] = useState('');
  const [correct, setCorrect] = useState(false);
  const [hints, setHints] = useState(0);
  const [tutorOpen, setTutorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const term = terms[index];
  const finished = terms.length > 0 && index >= terms.length;
  const layout = useMemo(
    () =>
      layoutLetterWheel(
        letters.length,
        Math.min(width - 32, height * 0.36, 320),
      ),
    [letters.length, width, height],
  );
  const wheelSize = layout.size;
  const nodeSize = layout.letterSize;
  const answerRows = useMemo(
    () => layoutAnswerRows(term?.answer.length ?? 0, width - 32),
    [term?.answer.length, width],
  );
  // Finger movement updates only the native SVG path, at most once per frame.
  const schedulePaint = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      paintRef.current();
    });
  }, []);
  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all([getTerms(docId), getWordscapeSolved(docId)])
      .then(([all, done]) => {
        if (!live) return;
        const eligible = all.filter(t => /^[A-Z]+$/.test(t.answer));
        setTerms(eligible);
        setSolved(new Set(eligible.filter(t => done.has(t.id)).map(t => t.id)));
        const next = eligible.findIndex(t => !done.has(t.id));
        setIndex(next < 0 ? eligible.length : next);
      })
      .catch(
        e =>
          live &&
          setError(
            e instanceof Error ? e.message : 'Could not load your game.',
          ),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [docId]);

  const clearPath = useCallback(() => {
    pathRef.current = [];
    previousPoint.current = null;
    setPath([]);
    tailRef.current = null;
    schedulePaint();
  }, [schedulePaint]);

  useEffect(() => {
    setLetters(shuffle(term?.answer ?? ''));
    setCorrect(false);
    setHints(0);
    setMessage('');
    clearPath();
  }, [term?.id, term?.answer, clearPath]);

  const nodes = useMemo(
    () => letters.map((letter, i) => ({ ...letter, ...layout.positions[i] })),
    [letters, layout],
  );
  const nodesById = useMemo(
    () => new Map(nodes.map(node => [node.id, node])),
    [nodes],
  );
  paintRef.current = () => {
    const selected = pathRef.current
      .map(id => nodesById.get(id))
      .filter((p): p is Letter & Point => !!p);
    const points = [
      ...selected,
      ...(tailRef.current && selected.length ? [tailRef.current] : []),
    ]
      .map(p => `${p.x},${p.y}`)
      .join(' ');
    lineRef.current?.setNativeProps({ points, d: points ? undefined : '' });
  };

  const submit = useCallback(
    async (selection: number[]) => {
      if (!term || correct || busy.current || !selection.length) return;
      const word = selection
        .map(id => letters.find(l => l.id === id)?.value ?? '')
        .join('');
      const right = word === term.answer;
      busy.current = true;
      setSaving(true);
      try {
        await logAttempt({
          term_id: term.id,
          mode: 'wordscape',
          correct: right ? 1 : 0,
          hints_used: hints,
          ts: Date.now(),
        });
        if (right) {
          setSolved(old => new Set([...old, term.id]));
          setCorrect(true);
          setMessage(`Correct! ${term.term}`);
        } else {
          setMessage(`${word} isn't the answer. Try the clue again.`);
          clearPath();
        }
      } catch {
        setMessage('Could not save your answer. Tap Check word to retry.');
      } finally {
        busy.current = false;
        setSaving(false);
        tailRef.current = null;
        schedulePaint();
      }
    },
    [term, correct, letters, hints, clearPath, schedulePaint],
  );

  const selectNode = useCallback((id: number) => {
    const selected = pathRef.current;
    if (selected[selected.length - 1] === id) return;
    if (selected.length > 1 && selected[selected.length - 2] === id) {
      pathRef.current = selected.slice(0, -1);
    } else if (!selected.includes(id)) {
      pathRef.current = [...selected, id];
    } else {
      return;
    }
    setPath([...pathRef.current]);
  }, []);

  const trace = useCallback(
    (point: Point) => {
      const from = previousPoint.current ?? point;
      const dx = point.x - from.x,
        dy = point.y - from.y;
      const lengthSquared = dx * dx + dy * dy;
      // Detect nodes crossed between move events, including quick swipes.
      const hits = nodes
        .map(node => {
          const t = lengthSquared
            ? Math.max(
                0,
                Math.min(
                  1,
                  ((node.x - from.x) * dx + (node.y - from.y) * dy) /
                    lengthSquared,
                ),
              )
            : 0;
          return {
            node,
            t,
            distance: Math.hypot(
              node.x - from.x - t * dx,
              node.y - from.y - t * dy,
            ),
          };
        })
        .filter(hit => hit.distance <= nodeSize / 2)
        .sort((a, b) => a.t - b.t);
      hits.forEach(hit => selectNode(hit.node.id));
      previousPoint.current = point;
      tailRef.current = point;
      schedulePaint();
    },
    [nodes, nodeSize, selectNode, schedulePaint],
  );

  const gestureStart = useRef<Point>({ x: 0, y: 0 });
  const dragged = useRef(false);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !correct && !busy.current,
        onMoveShouldSetPanResponder: () => !correct && !busy.current,
        onPanResponderGrant: event => {
          dragged.current = false;
          const point = {
            x: event.nativeEvent.locationX,
            y: event.nativeEvent.locationY,
          };
          gestureStart.current = point;
          previousPoint.current = null;
          trace(point);
        },
        onPanResponderMove: (_event, gesture) => {
          if (Math.hypot(gesture.dx, gesture.dy) > 8) dragged.current = true;
          trace({
            x: gestureStart.current.x + gesture.dx,
            y: gestureStart.current.y + gesture.dy,
          });
        },
        onPanResponderRelease: () => {
          tailRef.current = null;
          schedulePaint();
          previousPoint.current = null;
          if (dragged.current) void submit([...pathRef.current]);
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: clearPath,
      }),
    [correct, trace, submit, clearPath, schedulePaint],
  );

  const next = () => {
    const remaining = terms.findIndex(t => !solved.has(t.id));
    setIndex(remaining < 0 ? terms.length : remaining);
  };
  const preview = path
    .map(id => letters.find(l => l.id === id)?.value ?? '')
    .join('');
  const linePoints = path
    .map(id => nodes.find(n => n.id === id))
    .filter((p): p is (typeof nodes)[number] => !!p);
  const points = linePoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <Screen bg={images.bgLandscape} dim={0.2}>
      <Header
        title="Wordscape"
        subtitle="Form the course term from your notes"
        right={
          <Text style={styles.count}>
            {solved.size}/{terms.length}
          </Text>
        }
      />
      <DeckDropdown
        selectedDocId={docId}
        onSelect={id => {
          if (id === docId) return;
          setCurrentDeck(id);
          navigation.replace('Wordscape', { docId: id });
        }}
      />
      {loading ? (
        <ActivityIndicator style={styles.center} color="#fff" />
      ) : !term ? (
        <View style={styles.empty}>
          <Text style={styles.heading}>
            {finished ? 'Deck complete!' : 'No words available yet'}
          </Text>
          <Text style={styles.text}>
            {error ??
              (finished
                ? `You solved all ${terms.length} terms from your notes.`
                : 'Import notes and generate study games to create your letter wheel.')}
          </Text>
          {finished && (
            <Pressable
              style={styles.button}
              onPress={() => {
                setSolved(new Set());
                setIndex(0);
              }}
            >
              <Text style={styles.buttonText}>Practice again</Text>
            </Pressable>
          )}
          <Pressable
            style={styles.button}
            onPress={() => navigation.navigate(finished ? 'Tabs' : 'Ingest')}
          >
            <Text style={styles.buttonText}>
              {finished ? 'Back to home' : 'Scan or import notes'}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.top}
            contentContainerStyle={styles.topContent}
          >
            <View style={styles.clue}>
              <Text style={styles.clueLabel}>
                CLUE · {term.answer.length} LETTERS
              </Text>
              <Text style={styles.clueText}>{term.clue}</Text>
            </View>
            <View style={styles.slots}>
              {answerRows.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.slotRow}>
                  {row.map(i => (
                    <View
                      key={i}
                      style={[styles.slot, correct && styles.solvedSlot]}
                    >
                      <Text style={styles.slotText}>
                        {correct
                          ? term.answer[i]
                          : preview[i] ?? (i < hints ? term.answer[i] : '')}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
            <Text accessibilityLiveRegion="polite" style={styles.feedback}>
              {message ||
                'Connect the letters, then lift your finger to check.'}
            </Text>
            {correct && (
              <Text style={styles.text}>
                {term.description}
                {term.why ? `\n${term.why}` : ''}
              </Text>
            )}
          </ScrollView>

          <View
            style={[styles.wheel, { width: wheelSize, height: wheelSize }]}
            {...responder.panHandlers}
          >
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Svg
                width={wheelSize}
                height={wheelSize}
                style={StyleSheet.absoluteFill}
              >
                <Polyline
                  ref={lineRef}
                  points={points}
                  fill="none"
                  stroke="#FFD369"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </View>
            {nodes.map(node => (
              <Pressable
                pointerEvents="none"
                key={node.id}
                accessible
                accessibilityRole="button"
                accessibilityLabel={`Choose letter ${node.value}, position ${
                  node.id + 1
                }`}
                disabled={correct || saving}
                onPress={() => selectNode(node.id)}
                style={[
                  styles.letter,
                  {
                    left: node.x - nodeSize / 2,
                    top: node.y - nodeSize / 2,
                    width: nodeSize,
                    height: nodeSize,
                    borderRadius: nodeSize / 2,
                  },
                  path.includes(node.id) && styles.selectedLetter,
                ]}
              >
                <Text
                  style={[
                    styles.letterText,
                    { fontSize: Math.min(24, nodeSize * 0.6) },
                  ]}
                >
                  {node.value}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.controls}>
            {correct ? (
              <Pressable style={[styles.button, styles.primary]} onPress={next}>
                <Text style={styles.buttonText}>
                  {solved.size >= terms.length ? 'Finish game' : 'Next word'}
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  disabled={saving}
                  accessibilityLabel="Reveal next letter"
                  style={styles.tool}
                  onPress={() => {
                    setHints(n => Math.min(n + 1, term.answer.length));
                    setMessage('A letter is revealed in the answer tiles.');
                  }}
                >
                  <Lightbulb size={20} color="#FFD369" />
                  <Text style={styles.toolText}>Hint</Text>
                </Pressable>
                <Pressable
                  disabled={saving}
                  accessibilityLabel="Shuffle letters"
                  style={styles.tool}
                  onPress={() => {
                    clearPath();
                    setLetters(shuffle(term.answer));
                  }}
                >
                  <Shuffle size={20} color="#fff" />
                  <Text style={styles.toolText}>Shuffle</Text>
                </Pressable>
                <Pressable
                  disabled={saving || !path.length}
                  style={styles.tool}
                  onPress={clearPath}
                >
                  <Text style={styles.toolText}>Clear</Text>
                </Pressable>
                <Pressable
                  disabled={saving || !path.length}
                  style={[styles.button, styles.primary]}
                  onPress={() => submit([...pathRef.current])}
                >
                  <Text style={styles.buttonText}>
                    {saving ? 'Saving…' : 'Check word'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
          {!correct && (
            <Pressable
              style={styles.tutorButton}
              onPress={() => {
                clearPath();
                setTutorOpen(true);
              }}
            >
              <Text style={styles.toolText}>Ask tutor for a hint</Text>
            </Pressable>
          )}
          {tutorOpen && (
            <TutorSheet
              term={term}
              visible={tutorOpen}
              onClose={() => setTutorOpen(false)}
              onSolved={() => {
                setTutorOpen(false);
                setMessage('Connect the letters to solve this word.');
              }}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1 },
  count: { color: '#fff', fontWeight: '700' },
  empty: { padding: 24, gap: 20 },
  heading: { color: '#fff', fontSize: 24, fontWeight: '700' },
  text: { color: '#fff', fontSize: 14, lineHeight: 21 },
  top: { flexShrink: 1 },
  topContent: { paddingHorizontal: 16, gap: 14, paddingBottom: 8 },
  clue: {
    borderRadius: radius.lg,
    padding: 16,
    backgroundColor: 'rgba(22,45,99,0.9)',
  },
  clueLabel: {
    color: '#C5D6FF',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  clueText: { color: '#fff', fontSize: 17, lineHeight: 24 },
  slots: {
    alignItems: 'center',
    gap: 5,
  },
  slotRow: { flexDirection: 'row', justifyContent: 'center', gap: 5 },
  slot: {
    width: 30,
    height: 36,
    borderRadius: 6,
    backgroundColor: 'rgba(7,13,34,0.7)',
    borderWidth: 1,
    borderColor: '#AFC3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  solvedSlot: { backgroundColor: '#147D6A', borderColor: '#3EE2B9' },
  slotText: { color: '#fff', fontSize: 19, fontWeight: '700' },
  feedback: { color: '#fff', fontSize: 13, textAlign: 'center' },
  wheel: { alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  letter: {
    position: 'absolute',
    backgroundColor: '#F4F6FF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  selectedLetter: { backgroundColor: '#FFD369' },
  letterText: { color: colors.cardText, fontSize: 24, fontWeight: '800' },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    gap: 10,
    paddingVertical: 8,
  },
  tool: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(22,45,99,0.8)',
  },
  toolText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  button: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(22,45,99,0.9)',
    alignItems: 'center',
  },
  primary: { backgroundColor: colors.primary },
  buttonText: { color: '#fff', fontWeight: '700' },
  tutorButton: { alignItems: 'center', padding: 12, marginBottom: 8 },
});
