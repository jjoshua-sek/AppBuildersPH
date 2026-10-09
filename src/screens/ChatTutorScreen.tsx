import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type ScrollViewInstance,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Camera, MessageCircle, Send } from 'lucide-react-native';
import type { RootStackParamList } from '../app/navigation';
import { brand, radius, space } from '../app/theme';
import { images } from '../assets/images';
import { DeckDropdown } from '../components/DeckDropdown';
import { Header, Screen } from '../components/ui';
import { bridge } from '../services/ai/llamaBridge';
import { askNotes } from '../services/ai/notesChat';
import type { NoteHit } from '../services/rag/retrieve';
import { setCurrentDeck, useDeckStore } from '../store/useDeckStore';
import type { Msg } from '../types';

type Bubble = { from: 'me' | 'ai'; text: string; sources?: NoteHit[] };

const SUGGESTIONS = [
  'Summarize these notes',
  'What are the key terms?',
  'Quiz me on this',
];

/**
 * Chat with one deck: the student attaches notes (photo, file or text) and every
 * answer is grounded in passages retrieved from them, on the device.
 */
export function ChatTutorScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const decks = useDeckStore(s => s.decks);
  const currentDocId = useDeckStore(s => s.currentDocId);
  const deck = decks.find(d => d.id === currentDocId) ?? decks[0];
  const [chats, setChats] = useState<Record<string, Bubble[]>>({});
  const [draft, setDraft] = useState('');
  const [live, setLive] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useRef<Record<string, Msg[]>>({});
  const scroll = useRef<ScrollViewInstance>(null);
  const bubbles = (deck && chats[deck.id]) || [];
  const canSend = !!deck && !busy && !!draft.trim();

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy || !deck) return;
    const id = deck.id;
    const add = (b: Bubble) =>
      setChats(c => ({ ...c, [id]: [...(c[id] ?? []), b] }));
    setDraft('');
    setLive('');
    setBusy(true);
    add({ from: 'me', text: q });
    try {
      const { reply, sources } = await askNotes(
        bridge,
        q,
        id,
        history.current[id] ?? [],
        setLive,
      );
      history.current[id] = [
        ...(history.current[id] ?? []),
        { role: 'user' as const, content: q },
        { role: 'assistant' as const, content: reply },
      ].slice(-8);
      add({ from: 'ai', text: reply, sources });
    } catch {
      add({
        from: 'ai',
        text: 'I could not answer just now. Please try again in a moment.',
      });
    } finally {
      setLive('');
      setBusy(false);
    }
  };

  return (
    <Screen bg={images.bgCabinNight} dim={0.15}>
      <Header
        title="AI Tutor"
        subtitle="Ask questions about your own notes, offline"
        icon={<MessageCircle color="#C4BCFF" size={25} />}
      />
      <View style={styles.attach}>
        <View style={styles.flex}>
          <DeckDropdown selectedDocId={deck?.id} onSelect={setCurrentDeck} />
        </View>
        <Pressable
          testID="attach-notes"
          accessibilityRole="button"
          accessibilityLabel="Attach a photo or file"
          style={styles.attachBtn}
          onPress={() => nav.navigate('Ingest')}
        >
          <Camera color="#fff" size={20} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            scroll.current?.scrollToEnd({ animated: true })
          }
        >
          <View style={[styles.bubble, styles.ai]}>
            <Text style={styles.text}>
              {deck
                ? `Hi! I have read "${deck.title}". Ask me anything about it and I will answer from your notes.`
                : 'Attach a photo or file of your notes with the camera button, then ask me about it.'}
            </Text>
          </View>
          {bubbles.map((b, i) => (
            <View
              key={i}
              style={[styles.bubble, b.from === 'me' ? styles.me : styles.ai]}
            >
              <Text style={styles.text}>{b.text}</Text>
              {!!b.sources?.length && (
                <Text style={styles.source}>
                  From your notes: part {b.sources.map(s => s.idx + 1).join(', ')}
                </Text>
              )}
            </View>
          ))}
          {busy && (
            <View testID="chat-pending" style={[styles.bubble, styles.ai]}>
              {live ? (
                <Text style={styles.text}>{live}</Text>
              ) : (
                <View style={styles.row}>
                  <ActivityIndicator size="small" color="#C4BCFF" />
                  <Text style={styles.source}>Reading your notes...</Text>
                </View>
              )}
            </View>
          )}
          {deck && bubbles.length === 0 && !busy && (
            <View style={styles.chips}>
              {SUGGESTIONS.map(s => (
                <Pressable
                  key={s}
                  accessibilityRole="button"
                  style={styles.chip}
                  onPress={() => send(s)}
                >
                  <Text style={styles.chipText}>{s}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            editable={!!deck && !busy}
            placeholder={deck ? 'Ask about your notes...' : 'Attach notes first'}
            placeholderTextColor="#A5AFCE"
            returnKeyType="send"
            onSubmitEditing={() => send(draft)}
          />
          <Pressable
            testID="chat-send"
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!canSend}
            style={[styles.send, !canSend && styles.dim]}
            onPress={() => send(draft)}
          >
            <Send color="#fff" size={19} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  attach: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
  },
  attachBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#7864DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: space.lg, gap: space.sm },
  bubble: {
    maxWidth: '88%',
    padding: space.md,
    borderRadius: radius.lg,
    gap: 6,
  },
  ai: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(22,34,74,0.92)',
    borderColor: brand.border,
    borderWidth: 1,
  },
  me: { alignSelf: 'flex-end', backgroundColor: '#7864DB' },
  text: { color: '#fff', fontSize: 15, lineHeight: 21 },
  source: { color: '#A5AFCE', fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#C4BCFF',
    borderRadius: radius.pill,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipText: { color: '#E2DDFF', fontSize: 13 },
  composer: {
    margin: space.lg,
    marginTop: 4,
    padding: 6,
    paddingLeft: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: 'rgba(22,34,74,0.95)',
  },
  input: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 8 },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#7864DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.4 },
});
