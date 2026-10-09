import React, { useEffect, useRef, useState } from 'react';
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
import { bridge } from '../services/ai/llamaBridge';
import { askTutor } from '../services/ai/tutor';
import { getChunk } from '../services/db/queries';
import type { Msg, TutorSheetProps } from '../types';

type Bubble = { from: 'tutor' | 'me'; text: string };

/**
 * The Socratic tutor, opened from a crossword entry or the Daily Term. It only
 * ever talks about one term, so the leak guard in askTutor() can mask it.
 */
export function TutorSheet({ term, visible, onClose, onSolved }: TutorSheetProps) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState(''); // the reply being streamed
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const passage = useRef('');
  const history = useRef<Msg[]>([]);
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
    history.current = [];
    passage.current = '';
    getChunk(term.chunk_id)
      .then(c => {
        passage.current = c?.text ?? term.description ?? term.clue;
      })
      .catch(() => {
        passage.current = term.clue;
      });
  }, [term.id, term.chunk_id, term.clue, term.description]);

  const send = async () => {
    const msg = draft.trim();
    if (!msg || busy) return;
    setDraft('');
    setBusy(true);
    setBubbles(b => [...b, { from: 'me', text: msg }]);
    let solved = false;
    try {
      const reply = await askTutor(
        bridge,
        term,
        passage.current,
        msg,
        history.current,
        {
          setText: setLive,
          setStatus,
          onSolved: () => {
            solved = true;
          },
        },
      );
      if (reply) {
        history.current = [
          ...history.current,
          { role: 'user', content: msg },
          { role: 'assistant', content: reply },
        ];
        setBubbles(b => [...b, { from: 'tutor', text: reply }]);
      }
    } catch (e) {
      setBubbles(b => [
        ...b,
        {
          from: 'tutor',
          text: `Sorry, I could not answer: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setLive('');
      setStatus('');
      setBusy(false);
    }
    if (solved) onSolved();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.sheet}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Image source={images.bgCabinNight} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <Gradient colors={['rgba(7,13,34,0.12)', 'rgba(7,13,34,0.65)']} style={StyleSheet.absoluteFill} />
          <View style={styles.head}>
            <View style={styles.botIcon}>
              <Bot color="#fff" size={20} />
            </View>
            <Text style={styles.title}>AI Tutor</Text>
            <Pressable hitSlop={12} onPress={onClose} testID="tutor-close">
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
                style={[styles.bubble, b.from === 'me' && styles.mine]}
              >
                <Text style={styles.text}>{b.text}</Text>
              </View>
            ))}
            {(live !== '' || status !== '') && (
              <View style={styles.bubble}>
                <Text style={styles.text}>{live || status}</Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.inputBar}>
            <TextInput
              testID="tutor-input"
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={send}
              placeholder="Type your question or guess..."
              placeholderTextColor={colors.textDim}
              style={styles.input}
              editable={!busy}
              returnKeyType="send"
            />
            <Pressable
              testID="tutor-send"
              style={[styles.send, busy && { opacity: 0.4 }]}
              onPress={send}
              disabled={busy}
            >
              <Send color="#fff" size={18} />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
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
