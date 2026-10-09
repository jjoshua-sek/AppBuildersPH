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
import { SAMPLE_TEXT, SAMPLE_TITLE } from '../assets/sample';
import type { Profile } from '../services/device/deviceProfile';
import { MIN_TERMS_TO_PLAY, type Progress } from '../services/ingest/pipeline';
import type { AiBridge } from '../types';
import {
  cancelIngest,
  canPlay,
  resetIngest,
  startIngest,
  useDeckStore,
} from '../store/useDeckStore';

/** Below this, a passage rarely yields enough terms for a crossword. */
export const MIN_WORDS = 40;

export type IngestScreenProps = {
  bridge: AiBridge;
  profile: Profile;
  onPlay(docId: string): void;
  onBack(): void;
  /** Camera + OCR: pass `snapAndRead` from `ingest/ocr.ts`. The button is hidden without it. */
  snapPage?: () => Promise<string>;
  /** Existing photo + OCR: pass `pickAndRead`. Safer on stage: a pre-tested page. */
  pickPage?: () => Promise<string>;
};

/** Thrown by ingest/ocr.ts when the student backs out of the camera or picker. */
const isCancel = (e: unknown) =>
  e instanceof Error && e.name === 'OcrCancelled';

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function progressLine(
  status: string,
  p: Pick<
    Progress,
    'chunk' | 'total' | 'found' | 'selected' | 'failedChunks' | 'cancelled'
  > | null,
): string {
  if (status === 'reading') {
    return p
      ? `Reading chunk ${Math.min(p.chunk + 1, p.total)}/${p.total} · ${plural(
          p.found,
          'term',
        )} found`
      : 'Reading chunk 1…';
  }
  if (status !== 'done' || !p) return '';
  const head = p.cancelled
    ? `Stopped after ${p.chunk}/${p.total} chunks`
    : 'Done';
  const skipped = p.failedChunks
    ? ` · ${plural(p.failedChunks, 'chunk')} skipped`
    : '';
  return p.selected >= MIN_TERMS_TO_PLAY
    ? `${head} · ${plural(p.found, 'term')} found, ${
        p.selected
      } in your puzzle${skipped}`
    : `${head} · only ${plural(
        p.found,
        'term',
      )} found${skipped}. Add more notes or snap another page.`;
}

export function IngestScreen({
  bridge,
  profile,
  onPlay,
  onBack,
  snapPage,
  pickPage,
}: IngestScreenProps) {
  const status = useDeckStore(s => s.status);
  const progress = useDeckStore(s => s.progress);
  const error = useDeckStore(s => s.error);
  const docId = useDeckStore(s => s.currentDocId);
  const playable = useDeckStore(canPlay);

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [source, setSource] = useState<'paste' | 'camera' | 'sample'>('paste');
  const [snapping, setSnapping] = useState(false);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);

  const reading = status === 'reading';
  const words = wordCount(text);
  const canGenerate = !reading && !snapping && words >= MIN_WORDS;

  const edit = (t: string) => {
    setText(t);
    if (source === 'sample') setSource('paste');
    resetIngest();
  };

  const snap = async (readPage: () => Promise<string>) => {
    setSnapping(true);
    setSnapError(null);
    try {
      const read = await readPage();
      setText(prev => (prev.trim() ? `${prev.trim()}\n\n${read}` : read)); // pages add up
      setSource('camera');
      resetIngest();
    } catch (e) {
      if (isCancel(e)) return;
      setSnapError(e instanceof Error ? e.message : 'Could not read the photo');
    } finally {
      setSnapping(false);
    }
  };

  const useSample = () => {
    setTitle(SAMPLE_TITLE);
    setText(SAMPLE_TEXT);
    setSource('sample');
    resetIngest();
  };

  const generate = async () => {
    setStopping(false);
    await startIngest(bridge, profile, {
      title: title.trim() || `Notes ${new Date().toLocaleDateString('en-CA')}`,
      source,
      text,
    });
  };

  const stop = () => {
    setStopping(true);
    cancelIngest();
  };

  const fraction = progress ? progress.chunk / progress.total : 0;

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={[ui.content, ui.top]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={ui.title}>Add your notes</Text>
      <Text style={ui.muted}>
        Snap a handout or paste text. Everything stays on this phone.
      </Text>

      <View style={styles.row}>
        {snapPage && (
          <Btn
            testID="snap"
            label={snapping ? 'Reading photo…' : '📷 Snap a page'}
            onPress={() => snap(snapPage)}
            disabled={reading || snapping}
          />
        )}
        {pickPage && (
          <Btn
            testID="pick"
            label="🖼 From photos"
            onPress={() => snap(pickPage)}
            disabled={reading || snapping}
            ghost
          />
        )}
        <Btn
          testID="sample"
          label="Use sample handout"
          onPress={useSample}
          disabled={reading}
          ghost
        />
      </View>
      {snapError && <Text style={[ui.text, ui.danger]}>{snapError}</Text>}

      <TextInput
        testID="title"
        value={title}
        onChangeText={setTitle}
        placeholder="Title (optional), e.g. IT Audit Ch. 1"
        placeholderTextColor={colors.muted}
        editable={!reading}
        style={styles.input}
      />
      <TextInput
        testID="notes"
        value={text}
        onChangeText={edit}
        placeholder="Paste your notes here, or snap a page; the text you photograph shows up here to check and fix."
        placeholderTextColor={colors.muted}
        editable={!reading}
        multiline
        textAlignVertical="top"
        style={[styles.input, styles.notes]}
      />
      <Text style={[ui.muted, words > 0 && words < MIN_WORDS && ui.danger]}>
        {words} words
        {words < MIN_WORDS ? ` · at least ${MIN_WORDS} needed` : ''}
      </Text>

      {reading ? (
        <Btn
          testID="stop"
          label={stopping ? 'Stopping after this chunk…' : '■ Stop'}
          onPress={stop}
          disabled={stopping}
          ghost
        />
      ) : (
        <Btn
          testID="generate"
          label="Generate puzzle"
          onPress={generate}
          disabled={!canGenerate}
        />
      )}

      {(reading || progress) && (
        <View style={ui.card} testID="progress">
          <View style={styles.row}>
            {reading && <ActivityIndicator color={colors.accent} />}
            <Text style={[ui.text, styles.shrink]} testID="progress-line">
              {progressLine(status, progress)}
            </Text>
          </View>
          <View style={ui.track}>
            <View style={[ui.fill, { width: `${fraction * 100}%` }]} />
          </View>
        </View>
      )}
      {status === 'error' && (
        <Text style={[ui.text, ui.danger]} testID="error">
          Something went wrong: {error}
        </Text>
      )}

      <Btn
        testID="play"
        label={reading && playable ? '▶ Play now (still reading)' : '▶ Play'}
        onPress={() => docId && onPlay(docId)}
        disabled={!playable || !docId}
      />
      <Btn testID="back" label="Back" onPress={onBack} ghost />
    </ScrollView>
  );
}

/** Like components/Button, plus a testID and an outlined style. */
function Btn(props: {
  testID: string;
  label: string;
  onPress(): void;
  disabled?: boolean;
  ghost?: boolean;
}) {
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      style={[
        ui.button,
        props.ghost && styles.ghost,
        props.disabled && ui.buttonDisabled,
      ]}
    >
      <Text style={[ui.buttonText, props.ghost && styles.ghostText]}>
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  shrink: { flexShrink: 1 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  notes: { minHeight: 220, maxHeight: 360 },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.accent,
    borderWidth: 1.5,
  },
  ghostText: { color: colors.accent },
});
