import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, ui } from '../app/theme';
import { ActionButton } from '../components/ActionButton';
import { getSelectedTerms, getTerms } from '../services/db/queries';
import {
  addToPuzzle,
  editProblem,
  editTerm,
  removeTerm,
} from '../services/ingest/review';
import {
  MAX_PUZZLE_TERMS,
  MIN_TERMS_TO_PLAY,
} from '../services/ingest/pipeline';
import { loadDecks, useDeckStore } from '../store/useDeckStore';
import type { TermRow } from '../types';

export type ReviewTermsScreenProps = {
  docId: string;
  onBack(): void;
  onPlay?(docId: string): void;
};

/**
 * Check the deck before playing: fix terms the camera misread, rewrite weak
 * clues, delete junk, or add a term the puzzle left out.
 */
export function ReviewTermsScreen({
  docId,
  onBack,
  onPlay,
}: ReviewTermsScreenProps) {
  const deck = useDeckStore(s => s.decks.find(d => d.id === docId));
  const [terms, setTerms] = useState<TermRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ term: '', clue: '' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [all, sel] = await Promise.all([
      getTerms(docId),
      getSelectedTerms(docId),
    ]);
    setTerms(all);
    setSelected(new Set(sel.map(t => t.id)));
  }, [docId]);

  useEffect(() => {
    reload().catch(e => setError(String(e)));
  }, [reload]);

  /** Runs a change, then refreshes this list and the Home deck counts. */
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(null);
      setConfirmDelete(null);
      await reload();
      await loadDecks();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (t: TermRow) => {
    setEditing(t.id);
    setDraft({ term: t.term, clue: t.clue });
    setConfirmDelete(null);
    setError(null);
  };

  const del = (id: string) =>
    confirmDelete === id ? act(() => removeTerm(id)) : setConfirmDelete(id);

  const inPuzzle = terms.filter(t => selected.has(t.id));
  const others = terms.filter(t => !selected.has(t.id));
  const draftProblem = editing ? editProblem(draft) : null;

  const row = (t: TermRow, puzzle: boolean) =>
    editing === t.id ? (
      <View key={t.id} style={[ui.card, ui.stack]} testID={`edit-${t.id}`}>
        <TextInput
          testID="edit-term"
          value={draft.term}
          onChangeText={term => setDraft(d => ({ ...d, term }))}
          placeholder="Term"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          testID="edit-clue"
          value={draft.clue}
          onChangeText={clue => setDraft(d => ({ ...d, clue }))}
          placeholder="Clue: what it means, without the term"
          placeholderTextColor={colors.muted}
          multiline
          style={[styles.input, styles.clue]}
        />
        {draftProblem && (
          <Text style={[ui.muted, ui.danger]} testID="edit-problem">
            {draftProblem}
          </Text>
        )}
        <View style={styles.row}>
          <ActionButton
            testID="save"
            label="Save"
            small
            disabled={!!draftProblem || busy}
            onPress={() => act(() => editTerm(t.id, draft))}
          />
          <ActionButton
            testID="cancel"
            label="Cancel"
            small
            ghost
            onPress={() => setEditing(null)}
          />
        </View>
      </View>
    ) : (
      <View key={t.id} style={[ui.card, ui.stack]} testID={`term-${t.id}`}>
        <Text style={ui.h2}>
          {t.term} <Text style={ui.muted}>({t.answer.length} letters)</Text>
        </Text>
        <Text style={ui.text}>{t.clue}</Text>
        <View style={styles.row}>
          <ActionButton
            testID={`edit-btn-${t.id}`}
            label="Edit"
            small
            ghost
            disabled={busy}
            onPress={() => startEdit(t)}
          />
          {!puzzle && (
            <ActionButton
              testID={`add-${t.id}`}
              label="Add to puzzle"
              small
              ghost
              disabled={busy}
              onPress={() => act(() => addToPuzzle(t.id))}
            />
          )}
          <ActionButton
            testID={`delete-${t.id}`}
            label={confirmDelete === t.id ? 'Tap again to delete' : 'Delete'}
            small
            ghost
            disabled={busy}
            onPress={() => del(t.id)}
          />
        </View>
      </View>
    );

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.content, ui.top]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={ui.title}>Review terms</Text>
      <Text style={ui.muted}>
        {deck ? `${deck.title} · ` : ''}Fix anything the camera misread before
        you play.
      </Text>
      {error && (
        <Text style={[ui.text, ui.danger]} testID="error">
          {error}
        </Text>
      )}

      <Text style={ui.h2} testID="puzzle-heading">
        In your puzzle ({inPuzzle.length}/{MAX_PUZZLE_TERMS})
      </Text>
      {inPuzzle.length === 0 && (
        <Text style={ui.muted}>No terms yet. Add a page with more notes.</Text>
      )}
      {inPuzzle.map(t => row(t, true))}

      {others.length > 0 && (
        <>
          <Text style={ui.h2} testID="others-heading">
            Other terms found ({others.length})
          </Text>
          {others.map(t => row(t, false))}
        </>
      )}

      {onPlay && (
        <ActionButton
          testID="play"
          label="▶ Play"
          disabled={inPuzzle.length < MIN_TERMS_TO_PLAY || busy}
          onPress={() => onPlay(docId)}
        />
      )}
      <ActionButton testID="back" label="Back" onPress={onBack} ghost />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  input: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clue: { minHeight: 70 },
});
