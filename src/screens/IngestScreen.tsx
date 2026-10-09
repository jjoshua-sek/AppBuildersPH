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
import { SAMPLE_TEXT, SAMPLE_TITLE } from '../assets/sample';
import type { Profile } from '../services/device/deviceProfile';
import type { AiBridge } from '../types';
import {
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
  /** Camera + OCR (`ingest/ocr.ts`). The camera button is hidden until it is provided. */
  snapPage?: () => Promise<string>;
};

const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function progressLine(
  status: string,
  p: { chunk: number; total: number; found: number; selected: number } | null,
): string {
  if (status === 'reading') {
    return p
      ? `Reading chunk ${Math.min(p.chunk + 1, p.total)}/${p.total} · ${
          p.found
        } terms found`
      : 'Reading chunk 1…';
  }
  if (status === 'done' && p) {
    return p.selected >= 2
      ? `Done · ${p.found} terms found, ${p.selected} in your puzzle`
      : `Only ${p.found} term${
          p.found === 1 ? '' : 's'
        } found. Add more notes or snap another page.`;
  }
  return '';
}

export function IngestScreen({
  bridge,
  profile,
  onPlay,
  snapPage,
}: IngestScreenProps) {
  const c = useColors();
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

  const reading = status === 'reading';
  const words = wordCount(text);
  const canGenerate = !reading && !snapping && words >= MIN_WORDS;

  const edit = (t: string) => {
    setText(t);
    if (source === 'sample') setSource('paste');
    resetIngest();
  };

  const snap = async () => {
    if (!snapPage) return;
    setSnapping(true);
    setSnapError(null);
    try {
      const read = await snapPage();
      setText(prev => (prev.trim() ? `${prev.trim()}\n\n${read}` : read)); // pages add up
      setSource('camera');
      resetIngest();
    } catch (e) {
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

  const generate = () =>
    startIngest(bridge, profile, {
      title: title.trim() || `Notes ${new Date().toLocaleDateString('en-CA')}`,
      source,
      text,
    });

  const fraction = progress ? progress.chunk / progress.total : 0;

  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.h1, { color: c.text }]}>Add your notes</Text>
      <Text style={[styles.sub, { color: c.muted }]}>
        Snap a handout or paste text. Everything stays on this phone.
      </Text>

      <View style={styles.row}>
        {snapPage && (
          <Btn
            testID="snap"
            label={snapping ? 'Reading photo…' : '📷 Snap a page'}
            onPress={snap}
            disabled={reading || snapping}
            c={c}
          />
        )}
        <Btn
          testID="sample"
          label="Use sample handout"
          onPress={useSample}
          disabled={reading}
          c={c}
          kind="ghost"
        />
      </View>
      {snapError && (
        <Text style={[styles.note, { color: c.error }]}>{snapError}</Text>
      )}

      <TextInput
        testID="title"
        value={title}
        onChangeText={setTitle}
        placeholder="Title (optional), e.g. IT Audit Ch. 1"
        placeholderTextColor={c.muted}
        editable={!reading}
        style={[
          styles.input,
          { color: c.text, borderColor: c.border, backgroundColor: c.card },
        ]}
      />
      <TextInput
        testID="notes"
        value={text}
        onChangeText={edit}
        placeholder="Paste your notes here, or snap a page; the text you photograph shows up here to check and fix."
        placeholderTextColor={c.muted}
        editable={!reading}
        multiline
        textAlignVertical="top"
        style={[
          styles.input,
          styles.notes,
          { color: c.text, borderColor: c.border, backgroundColor: c.card },
        ]}
      />
      <Text
        style={[
          styles.note,
          { color: words && words < MIN_WORDS ? c.error : c.muted },
        ]}
      >
        {words} words
        {words < MIN_WORDS ? ` · at least ${MIN_WORDS} needed` : ''}
      </Text>

      <Btn
        testID="generate"
        label={reading ? 'Reading your notes…' : 'Generate puzzle'}
        onPress={generate}
        disabled={!canGenerate}
        c={c}
      />

      {(reading || progress) && (
        <View style={styles.progress} testID="progress">
          <View style={styles.row}>
            {reading && <ActivityIndicator color={c.accent} />}
            <Text
              style={[styles.progressText, { color: c.text }]}
              testID="progress-line"
            >
              {progressLine(status, progress)}
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.border }]}>
            <View
              style={[
                styles.fill,
                { backgroundColor: c.accent, width: `${fraction * 100}%` },
              ]}
            />
          </View>
        </View>
      )}
      {status === 'error' && (
        <Text style={[styles.note, { color: c.error }]} testID="error">
          Something went wrong: {error}
        </Text>
      )}

      <Btn
        testID="play"
        label={reading && playable ? '▶ Play now (still reading)' : '▶ Play'}
        onPress={() => docId && onPlay(docId)}
        disabled={!playable || !docId}
        c={c}
        kind="play"
      />
    </ScrollView>
  );
}

type Colors = ReturnType<typeof useColors>;

function Btn(props: {
  testID: string;
  label: string;
  onPress(): void;
  disabled?: boolean;
  c: Colors;
  kind?: 'primary' | 'ghost' | 'play';
}) {
  const { c, kind = 'primary', disabled } = props;
  const bg =
    kind === 'ghost' ? 'transparent' : kind === 'play' ? c.play : c.accent;
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: kind === 'ghost' ? c.accent : bg },
        (disabled || pressed) && { opacity: disabled ? 0.4 : 0.8 },
      ]}
    >
      <Text
        style={[
          styles.btnText,
          { color: kind === 'ghost' ? c.accent : c.onAccent },
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
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
        play: '#2fa86a',
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
        play: '#1f8a54',
        onAccent: '#ffffff',
        error: '#c4382a',
      };
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  h1: { fontSize: 26, fontWeight: '700' },
  sub: { fontSize: 15 },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  notes: { minHeight: 220, maxHeight: 360 },
  note: { fontSize: 13 },
  btn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '600' },
  progress: { gap: 8 },
  progressText: { fontSize: 15, flexShrink: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6 },
});
