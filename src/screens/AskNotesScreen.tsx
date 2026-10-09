import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { searchNotes, type NoteHit } from '../services/rag/retrieve';
import { useDeckStore } from '../store/useDeckStore';
import type { AiBridge } from '../types';

export type AskNotesScreenProps = {
  bridge: AiBridge;
  /** Search one deck; omit to search every deck. */
  docId?: string;
};

/**
 * "Ask my notes" (P1): type a question, get the passages from your own notes
 * that answer it, found by the on-device embedding model.
 */
export function AskNotesScreen({ bridge, docId }: AskNotesScreenProps) {
  const c = useColors();
  const decks = useDeckStore(s => s.decks);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<NoteHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      setHits(await searchNotes(bridge, query, { docId, k: 3 }));
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const titleOf = (id: string) => decks.find(d => d.id === id)?.title;

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.h1, { color: c.text }]}>Ask my notes</Text>
      <Text style={[styles.sub, { color: c.muted }]}>
        Finds the part of your notes that answers your question, offline.
      </Text>

      <TextInput
        testID="query"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={search}
        returnKeyType="search"
        placeholder="e.g. Why does an auditor need to be independent?"
        placeholderTextColor={c.muted}
        style={[
          styles.input,
          { color: c.text, borderColor: c.border, backgroundColor: c.card },
        ]}
      />
      <Pressable
        testID="search"
        onPress={search}
        disabled={busy || !query.trim()}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !query.trim() }}
        style={[
          styles.btn,
          { backgroundColor: c.accent },
          (busy || !query.trim()) && styles.dim,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={c.onAccent} />
        ) : (
          <Text style={[styles.btnText, { color: c.onAccent }]}>Search</Text>
        )}
      </Pressable>

      {error && (
        <Text testID="error" style={[styles.note, { color: c.error }]}>
          {error}
        </Text>
      )}
      {hits && hits.length === 0 && (
        <Text testID="empty" style={[styles.note, { color: c.muted }]}>
          Nothing in your notes yet. Add a handout first.
        </Text>
      )}

      {hits?.map((h, i) => {
        const expanded = open === h.chunkId;
        const deck = !docId ? titleOf(h.docId) : undefined;
        return (
          <Pressable
            key={h.chunkId}
            testID={`hit-${i}`}
            onPress={() => setOpen(expanded ? null : h.chunkId)}
            style={[
              styles.card,
              { backgroundColor: c.card, borderColor: c.border },
            ]}
          >
            <Text style={[styles.meta, { color: c.muted }]}>
              {deck ? `${deck} · ` : ''}part {h.idx + 1}
              {h.keyword ? ' · keyword match' : ''}
            </Text>
            <Text style={[styles.body, { color: c.text }]}>
              {expanded ? h.text : h.snippet}
            </Text>
            <Text style={[styles.meta, { color: c.accent }]}>
              {expanded ? 'Show less' : 'Show the whole passage'}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.spacer} />
    </ScrollView>
  );
}

function useColors() {
  const dark = useColorScheme() === 'dark';
  return dark
    ? {
        bg: '#111418',
        card: '#1b2026',
        text: '#eef1f4',
        muted: '#9aa4ae',
        border: '#2c333b',
        accent: '#5b9cf5',
        onAccent: '#ffffff',
        error: '#ff7a6b',
      }
    : {
        bg: '#f6f7f9',
        card: '#ffffff',
        text: '#15191e',
        muted: '#5f6b76',
        border: '#d9dee3',
        accent: '#2563c9',
        onAccent: '#ffffff',
        error: '#c4382a',
      };
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  h1: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 15 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  btn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '600' },
  dim: { opacity: 0.4 },
  note: { fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 6 },
  meta: { fontSize: 13 },
  body: { fontSize: 16, lineHeight: 22 },
  spacer: { height: 24 },
});
