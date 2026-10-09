import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from 'react-native';
import { Send } from 'lucide-react-native';
import { colors } from '../../app/theme';
import { askTutor } from '../../services/ai/tutor';
import { getChunk } from '../../services/db/queries';
import type { AiBridge, Msg, TermRow, TutorSheetProps } from '../../types';

/**
 * The shared TutorSheetProps (src/types.ts) plus what the sheet needs to run.
 * Lane C passes `bridge` (from llamaBridge) and, optionally, `tutorTokens`
 * (profile.tutorTokens) and `onHint` (to count hints_used for logAttempt).
 */
export type TutorSheetFullProps = TutorSheetProps & {
  bridge: AiBridge;
  /** Max tokens per reply; use the device profile's tutorTokens. */
  tutorTokens?: number;
  /** Called once per tutor reply, so the game can log hints_used. */
  onHint?(): void;
  /** Where the term's source passage comes from. Defaults to Lane B's getChunk(). */
  getPassage?(term: TermRow): Promise<string>;
};

type Bubble = { role: 'student' | 'tutor' | 'note'; text: string };

export const GREETING =
  "Stuck? Tell me what you're thinking, or ask for a hint. I'll help you work it out.";
export const QUICK_REPLIES = ['Give me a hint', "I'm stuck", 'Pa-hint po'];
// Emoji as code points, so the file stays plain ASCII with no escape sequences.
const CHECK = String.fromCodePoint(0x2705);
const OWL = String.fromCodePoint(0x1f989);
const HISTORY_TURNS = 8; // askTutor sends the last 4 messages; keep a little more

/** The term's source passage. Falls back to the clue if the chunk isn't in the DB (e.g. sample terms). */
async function defaultPassage(term: TermRow): Promise<string> {
  try {
    return (await getChunk(term.chunk_id))?.text || term.clue;
  } catch {
    return term.clue;
  }
}

/**
 * Socratic tutor for one hidden term, opened from a crossword or Daily Term
 * entry. All the answer-hiding happens in askTutor() (masking, StreamGuard,
 * retry, template fallback); this sheet only shows what the guard lets through.
 */
export function TutorSheet({
  term,
  visible,
  onClose,
  onSolved,
  bridge,
  tutorTokens = 90,
  onHint,
  getPassage = defaultPassage,
}: TutorSheetFullProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [streaming, setStreaming] = useState('');
  const [status, setStatus] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(false);
  const history = useRef<Msg[]>([]);
  const passage = useRef<Promise<string> | null>(null);
  const live = useRef(visible); // false once the sheet closes, so late tokens are dropped
  const scroll = useRef<ScrollViewInstance>(null);

  // A new term starts a fresh conversation.
  useEffect(() => {
    setBubbles([{ role: 'tutor', text: GREETING }]);
    setStreaming('');
    setStatus('');
    setInput('');
    setBusy(false);
    setSolved(false);
    history.current = [];
    passage.current = null;
  }, [term.id]);

  useEffect(() => {
    live.current = visible;
  }, [visible]);

  const close = useCallback(() => {
    live.current = false;
    if (busy) bridge.stopGeneration();
    onClose();
  }, [busy, bridge, onClose]);

  const send = useCallback(
    async (raw: string) => {
      const msg = raw.trim();
      if (!msg || busy || solved) return;
      live.current = true;
      setInput('');
      setBusy(true);
      setStreaming('');
      setBubbles(b => [...b, { role: 'student', text: msg }]);

      let wasSolved = false;
      try {
        passage.current ??= getPassage(term);
        const text = await passage.current;
        const reply = await askTutor(
          bridge,
          term,
          text,
          msg,
          history.current,
          {
            setText: s => live.current && setStreaming(s),
            setStatus: s => live.current && setStatus(s),
            onSolved: () => {
              wasSolved = true;
            },
          },
          { n_predict: tutorTokens },
        );
        if (!live.current) return;
        if (wasSolved) {
          setSolved(true);
          const card: Bubble[] = [];
          if (term.description)
            card.push({ role: 'tutor', text: term.description });
          if (term.why)
            card.push({ role: 'tutor', text: `Why it matters: ${term.why}` });
          setBubbles(b => [
            ...b,
            {
              role: 'note',
              text: `${CHECK} Tama! The answer is ${term.term}.`,
            },
            ...card,
          ]);
          onSolved();
        } else if (reply) {
          const turn: Msg[] = [
            { role: 'user', content: msg },
            { role: 'assistant', content: reply },
          ];
          history.current = [...history.current, ...turn].slice(-HISTORY_TURNS);
          setBubbles(b => [...b, { role: 'tutor', text: reply }]);
          onHint?.();
        }
      } catch {
        if (live.current) {
          setBubbles(b => [
            ...b,
            {
              role: 'note',
              text: "The tutor couldn't answer just now. Try again in a moment.",
            },
          ]);
        }
      } finally {
        // Always reset, even if the sheet was closed mid-reply, so it isn't stuck when reopened.
        setStreaming('');
        setStatus('');
        setBusy(false);
      }
    },
    [busy, solved, bridge, term, tutorTokens, getPassage, onSolved, onHint],
  );

  const canSend = !busy && !!input.trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          testID="tutor-dismiss"
          style={styles.dismiss}
          onPress={close}
          accessibilityLabel="Close tutor"
        />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{`${OWL} Tutor`}</Text>
            <Pressable
              testID="tutor-close"
              onPress={close}
              hitSlop={12}
              accessibilityRole="button"
            >
              <Text style={styles.link}>{solved ? 'Done' : 'Close'}</Text>
            </Pressable>
          </View>
          <Text testID="tutor-clue" style={styles.clue}>
            Clue ({term.answer.length} letters): {term.clue}
          </Text>

          <ScrollView
            ref={scroll}
            style={styles.chat}
            contentContainerStyle={styles.chatContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              scroll.current?.scrollToEnd({ animated: true })
            }
          >
            {bubbles.map((b, i) => (
              <View key={i} style={[styles.bubble, bubbleStyle[b.role]]}>
                <Text
                  style={
                    b.role === 'student'
                      ? styles.studentText
                      : styles.bubbleText
                  }
                >
                  {b.text}
                </Text>
              </View>
            ))}
            {busy && (
              <View
                testID="tutor-pending"
                style={[styles.bubble, styles.tutor]}
              >
                {streaming ? (
                  <Text style={styles.bubbleText}>{streaming}</Text>
                ) : (
                  <View style={styles.row}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={styles.status}>{status || 'Thinking...'}</Text>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {!solved && (
            <>
              <View style={styles.quick}>
                {QUICK_REPLIES.map(q => (
                  <Pressable
                    key={q}
                    testID={`tutor-quick-${q}`}
                    style={[styles.chip, busy && styles.dim]}
                    disabled={busy}
                    onPress={() => send(q)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.chipText}>{q}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.inputBar}>
                <TextInput
                  testID="tutor-input"
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Type your guess or question..."
                  placeholderTextColor={colors.muted}
                  editable={!busy}
                  returnKeyType="send"
                  onSubmitEditing={() => send(input)}
                />
                <Pressable
                  testID="tutor-send"
                  style={[styles.send, !canSend && styles.dim]}
                  disabled={!canSend}
                  onPress={() => send(input)}
                  accessibilityRole="button"
                  accessibilityLabel="Send"
                >
                  <Send color={colors.bg} size={18} />
                </Pressable>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dismiss: { flex: 1 },
  sheet: {
    maxHeight: '80%',
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  link: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  clue: { marginTop: 6, color: colors.muted, fontSize: 14, lineHeight: 20 },
  chat: { marginTop: 12, flexGrow: 0 },
  chatContent: { gap: 8, paddingBottom: 8 },
  bubble: {
    maxWidth: '88%',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tutor: {
    alignSelf: 'flex-start',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  student: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  note: { alignSelf: 'center', backgroundColor: colors.border },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  studentText: {
    color: colors.bg,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  status: { marginLeft: 8, color: colors.muted },
  row: { flexDirection: 'row', alignItems: 'center' },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  chip: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { color: colors.accent, fontSize: 13 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    paddingLeft: 14,
    padding: 4,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 8 },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.4 },
});

const bubbleStyle = {
  tutor: styles.tutor,
  student: styles.student,
  note: styles.note,
};
