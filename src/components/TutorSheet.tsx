import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Bot, Send, X } from 'lucide-react-native';
import { brand as colors, radius, space } from '../app/theme';
import { images } from '../assets/images';
import { Gradient } from './Gradient';
import { bridge as llamaBridge, profile } from '../services/ai/llamaBridge';
import { askTutor } from '../services/ai/tutor';
import { getChunk } from '../services/db/queries';
import type { AiBridge, Msg, TermRow, TutorSheetProps } from '../types';

type Bubble = { from: 'tutor' | 'me' | 'note'; text: string };

/** The shared TutorSheetProps (src/types.ts) plus optional overrides, mainly for tests. */
export type TutorSheetFullProps = TutorSheetProps & {
  /** Defaults to the on-device llama.rn bridge. */
  bridge?: AiBridge;
  /** Max tokens per reply. Defaults to the device profile's tutorTokens. */
  tutorTokens?: number;
  /** Called once per tutor reply, so a game can count hints_used. */
  onHint?(): void;
  /** Where the term's source passage comes from. Defaults to getChunk(). */
  getPassage?(term: TermRow): Promise<string>;
};

export const QUICK_REPLIES = ['Give me a hint', "I'm stuck", 'Pa-hint po'];
const HISTORY_TURNS = 8; // askTutor sends the last 4 messages; keep a little more

/** The term's source passage. Falls back to the description or clue if the chunk is missing. */
async function defaultPassage(term: TermRow): Promise<string> {
  try {
    return (
      (await getChunk(term.chunk_id))?.text || term.description || term.clue
    );
  } catch {
    return term.description || term.clue;
  }
}

/**
 * The Socratic tutor, opened from a crossword entry or the Daily Term. It only
 * ever talks about one term, so the leak guard in askTutor() can mask it.
 */
export function TutorSheet({
  term,
  visible,
  onClose,
  onSolved,
  bridge = llamaBridge,
  tutorTokens = profile.tutorTokens,
  onHint,
  getPassage = defaultPassage,
}: TutorSheetFullProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState(''); // the reply being streamed
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [solved, setSolved] = useState(false);
  // Loaded on the first message and awaited, so a fast first question still gets the passage.
  const passage = useRef<Promise<string> | null>(null);
  const history = useRef<Msg[]>([]);
  const open = useRef(visible); // false once the sheet closes, so late tokens are dropped
  const scroll = useRef<{ scrollToEnd(): void }>(null);

  // A fresh conversation for each term.
  useEffect(() => {
    setBubbles([
      {
        from: 'tutor',
        text: `Stuck on "${term.clue}"? Ask me anything about it. I will guide you, but I will not give the answer away.`,
      },
    ]);
    setDraft('');
    setLive('');
    setStatus('');
    setBusy(false);
    setSolved(false);
    history.current = [];
    passage.current = null;
  }, [term.id, term.clue]);

  useEffect(() => {
    open.current = visible;
  }, [visible]);

  const close = useCallback(() => {
    open.current = false;
    if (busy) bridge.stopGeneration();
    onClose();
  }, [busy, bridge, onClose]);

  const send = async (raw: string) => {
    const msg = raw.trim();
    if (!msg || busy || solved) return;
    open.current = true;
    setDraft('');
    setBusy(true);
    setBubbles(b => [...b, { from: 'me', text: msg }]);
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
          setText: t => open.current && setLive(t),
          setStatus: t => open.current && setStatus(t),
          onSolved: () => {
            wasSolved = true;
          },
        },
        { n_predict: tutorTokens },
      );
      if (!open.current) return;
      if (wasSolved) {
        setSolved(true);
        setBubbles(b => [
          ...b,
          { from: 'note', text: `Tama! The answer is ${term.term}.` },
        ]);
      } else if (reply) {
        history.current = [
          ...history.current,
          { role: 'user' as const, content: msg },
          { role: 'assistant' as const, content: reply },
        ].slice(-HISTORY_TURNS);
        setBubbles(b => [...b, { from: 'tutor', text: reply }]);
        onHint?.();
      }
    } catch {
      if (open.current) {
        setBubbles(b => [
          ...b,
          {
            from: 'note',
            text: "The tutor couldn't answer just now. Try again in a moment.",
          },
        ]);
      }
    } finally {
      // Always reset, even if the sheet was closed mid-reply, so it isn't stuck when reopened.
      setLive('');
      setStatus('');
      setBusy(false);
    }
    if (wasSolved) onSolved();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Image
            source={images.bgCabinNight}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
          <Gradient
            colors={['rgba(7,13,34,0.12)', 'rgba(7,13,34,0.65)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.head}>
            <View style={styles.botIcon}>
              <Bot color="#fff" size={20} />
            </View>
            <Text style={styles.title}>AI Tutor</Text>
            <Pressable hitSlop={12} onPress={close} testID="tutor-close">
              <X color={colors.text} size={24} />
            </Pressable>
          </View>

          <ScrollView
            ref={scroll as never}
            contentContainerStyle={styles.chat}
            onContentSizeChange={() => scroll.current?.scrollToEnd()}
          >
            <Image
              source={images.mascot}
              style={styles.mascot}
              resizeMode="contain"
            />
            {bubbles.map((b, i) => (
              <View
                key={i}
                style={[
                  styles.bubble,
                  b.from === 'me' && styles.mine,
                  b.from === 'note' && styles.note,
                ]}
              >
                <Text style={styles.text}>{b.text}</Text>
              </View>
            ))}
            {(live !== '' || status !== '') && (
              <View testID="tutor-pending" style={styles.bubble}>
                <Text style={styles.text}>{live || status}</Text>
              </View>
            )}
          </ScrollView>

          {!solved && !busy && (
            <View style={styles.chips}>
              {QUICK_REPLIES.map(q => (
                <Pressable
                  key={q}
                  testID={`tutor-quick-${q}`}
                  style={styles.chip}
                  onPress={() => send(q)}
                >
                  <Text style={styles.chipText}>{q}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {!solved && (
            <View style={styles.inputBar}>
              <TextInput
                testID="tutor-input"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => send(draft)}
                placeholder="Type your question or guess..."
                placeholderTextColor={colors.textDim}
                style={styles.input}
                editable={!busy}
                returnKeyType="send"
              />
              <Pressable
                testID="tutor-send"
                style={[styles.send, busy && { opacity: 0.4 }]}
                onPress={() => send(draft)}
                disabled={busy}
              >
                <Send color="#fff" size={18} />
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '82%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: space.lg,
    gap: space.md,
  },
  botIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, color: colors.text, fontSize: 18, fontWeight: '700' },
  chat: { padding: space.lg, gap: space.md },
  mascot: { width: 176, height: 176, alignSelf: 'center', marginBottom: 8 },
  bubble: {
    backgroundColor: 'rgba(22,34,74,0.88)',
    borderRadius: radius.lg,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '88%',
    alignSelf: 'flex-start',
  },
  mine: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  note: { backgroundColor: 'rgba(31,200,166,0.25)', alignSelf: 'center' },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    paddingHorizontal: space.lg,
  },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(22,34,74,0.95)',
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  chipText: { color: colors.text, fontSize: 13 },
  text: { color: colors.text, fontSize: 15, lineHeight: 21 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: space.lg,
    paddingLeft: space.lg,
    padding: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(22,34,74,0.95)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
