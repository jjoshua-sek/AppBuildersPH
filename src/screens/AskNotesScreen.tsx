import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, ui } from '../app/theme';
import { answerFromNotes, type NotesAnswer } from '../services/rag/answer';
import { searchNotes, type NoteHit } from '../services/rag/retrieve';
import { useDeckStore } from '../store/useDeckStore';
import type { AiBridge } from '../types';

export type AskNotesScreenProps = {
  bridge: AiBridge;
  /** Search one deck; omit to search every deck. */
  docId?: string;
  onBack(): void;
};

/**
 * "Ask my notes" (P1): type a question, get the passages from your own notes
 * that answer it (on-device embedding search), then a short written answer from
 * the on-device LLM that cites the passage it used.
 */
export function AskNotesScreen({ bridge, docId, onBack }: AskNotesScreenProps) {
  const c = colors;
  const decks = useDeckStore(s => s.decks);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<NoteHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState('');
  const [answer, setAnswer] = useState<NotesAnswer | null>(null);
  const [answering, setAnswering] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim() || busy || answering) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    setAnswerText('');
    setAnswerError(null);
    let found: NoteHit[] = [];
    try {
      found = await searchNotes(bridge, query, { docId, k: 3 });
      setHits(found);
      setOpen(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    } finally {
      setBusy(false);
    }
    if (!found.length) return;
    // The passages show right away; the written answer streams in above them.
    setAnswering(true);
    try {
      setAnswer(
        await answerFromNotes(bridge, query, found, { onText: setAnswerText }),
      );
    } catch (e) {
      setAnswerError(e instanceof Error ? e.message : String(e));
    } finally {
      setAnswering(false);
    }
  };

  const titleOf = (id: string) => decks.find(d => d.id === id)?.title;

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.content, ui.top]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={ui.title}>Ask my notes</Text>
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
        disabled={busy || answering || !query.trim()}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || answering || !query.trim() }}
        style={[
          styles.btn,
          { backgroundColor: c.accent },
          (busy || answering || !query.trim()) && styles.dim,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={ui.buttonText}>Search</Text>
        )}
      </Pressable>

      {error && (
        <Text testID="error" style={[styles.note, { color: c.danger }]}>
          {error}
        </Text>
      )}
      {hits && hits.length === 0 && (
        <Text testID="empty" style={[styles.note, { color: c.muted }]}>
          Nothing in your notes yet. Add a handout first.
        </Text>
      )}

      {(answering || answer || answerError) && (
        <View
          testID="answer"
          style={[
            styles.card,
            { backgroundColor: c.card, borderColor: c.accent },
          ]}
        >
          <View style={styles.row}>
            <Text style={[styles.meta, { color: c.accent }]}>Answer</Text>
            {answering && <ActivityIndicator color={c.accent} size="small" />}
          </View>
          {answerError ? (
            <Text
              testID="answer-error"
              style={[styles.body, { color: c.danger }]}
            >
              Couldn't write an answer: {answerError}. The passages below are
              still from your notes.
            </Text>
          ) : (
            <Text testID="answer-text" style={[styles.body, { color: c.text }]}>
              {answerText ||
                (answering ? 'Writing an answer from your notes…' : '')}
            </Text>
          )}
          {answer?.sources.map(src => (
            <Pressable
              key={src.chunkId}
              testID={`source-${src.chunkId}`}
              onPress={() => setOpen(src.chunkId)}
            >
              <Text style={[styles.meta, { color: c.accent }]}>
                From: {titleOf(src.docId) ?? 'your notes'} · part {src.idx + 1}
              </Text>
            </Pressable>
          ))}
        </View>
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
      <Pressable
        testID="back"
        onPress={onBack}
        accessibilityRole="button"
        style={[styles.btn, styles.ghost]}
      >
        <Text style={[styles.btnText, { color: c.accent }]}>Back</Text>
      </Pressable>
      <View style={styles.spacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  ghost: { borderWidth: 1.5, borderColor: colors.accent },
  note: { fontSize: 14 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 6 },
  meta: { fontSize: 13 },
  body: { fontSize: 16, lineHeight: 22 },
  spacer: { height: 24 },
});
