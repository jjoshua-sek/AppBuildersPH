import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, ui } from '../app/theme';
import { Button } from '../components/Button';
import { profile } from '../services/ai/llamaBridge';
import { countWords, MIN_TERMS_TO_PLAY, MIN_WORDS } from '../services/ingest/pipeline';
import { canPlay, useDeckStore } from '../store/useDeckStore';

/**
 * Paste notes (camera comes later) -> terms. Shows how many terms were found,
 * never which ones: they are the crossword's answers.
 */
export function IngestScreen({ onBack, onPlay }: { onBack(): void; onPlay(docId: string): void }) {
  const { status, progress, error, start, cancel, loadSample, reset } = useDeckStore();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  const words = countWords(text);
  const running = status === 'running';
  const chunks = Math.max(1, Math.ceil((words - 30) / (profile.chunkWords - 30)));
  const playable = canPlay(progress);

  const playSample = async () => {
    await loadSample();
    const id = useDeckStore.getState().currentDocId;
    if (id) onPlay(id);
  };

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.content, ui.top]}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable onPress={onBack} accessibilityRole="button" hitSlop={12}>
        <Text style={ui.muted}>‹ Back</Text>
      </Pressable>
      <Text style={ui.title}>Add notes</Text>
      <Text style={ui.muted}>Read on this phone. Your notes never leave it.</Text>

      <TextInput
        style={styles.input}
        placeholder="Title, e.g. IT Audit Chapter 1"
        placeholderTextColor={colors.muted}
        value={title}
        onChangeText={setTitle}
        editable={!running}
      />
      <TextInput
        style={[styles.input, styles.notes]}
        placeholder="Paste a page of your handout or notes here"
        placeholderTextColor={colors.muted}
        value={text}
        onChangeText={t => {
          setText(t);
          if (status !== 'running') reset();
        }}
        editable={!running}
        multiline
        textAlignVertical="top"
      />
      <Text style={ui.muted}>
        {words} words
        {words >= MIN_WORDS ? ` · about ${chunks} part${chunks > 1 ? 's' : ''} to read` : ` · at least ${MIN_WORDS} needed`}
      </Text>

      {!running && (
        <Button
          title="Make my puzzle"
          disabled={words < MIN_WORDS}
          onPress={() => start({ title, text, source: 'paste' })}
        />
      )}

      {progress && (status === 'running' || status === 'done') && (
        <View style={ui.card} accessibilityLiveRegion="polite">
          <Text style={ui.text}>{statusLine(status, progress)}</Text>
          <View style={ui.track}>
            <View style={[ui.fill, { width: `${(100 * progress.chunk) / progress.total}%` }]} />
          </View>
          {status === 'done' && progress.failedChunks > 0 && (
            <Text style={[ui.muted, styles.gap]}>
              {progress.failedChunks} part{progress.failedChunks > 1 ? 's' : ''} couldn't be read.
            </Text>
          )}
          {status === 'done' && progress.terms === 0 && (
            <Text style={[ui.danger, styles.gap]}>
              No study terms found. Try a page that defines or explains key terms.
            </Text>
          )}
          {status === 'done' && progress.terms > 0 && progress.terms < MIN_TERMS_TO_PLAY && (
            <Text style={[ui.muted, styles.gap]}>Not enough for a full crossword, so you'll get a clue list.</Text>
          )}
        </View>
      )}

      {status === 'error' && <Text style={ui.danger}>{error}</Text>}

      {playable && progress && <Button title="Play" onPress={() => onPlay(progress.docId)} />}
      {running && (
        <Pressable onPress={cancel} accessibilityRole="button" style={styles.secondary}>
          <Text style={ui.text}>Stop reading</Text>
        </Pressable>
      )}

      {!running && (
        <Pressable onPress={playSample} accessibilityRole="button" style={styles.secondary}>
          <Text style={ui.text}>Use the sample IT Audit handout</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

function statusLine(status: string, p: { chunk: number; total: number; terms: number; cancelled: boolean }) {
  const found = `${p.terms} term${p.terms === 1 ? '' : 's'} found`;
  if (status === 'running') return `Reading part ${Math.min(p.chunk + 1, p.total)} of ${p.total} · ${found}`;
  return p.cancelled ? `Stopped · ${found}` : `Done · ${found}`;
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.card,
    color: colors.text,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
  },
  notes: { minHeight: 180, maxHeight: 320 },
  gap: { marginTop: 8 },
  secondary: {
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
