import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Camera,
  ChevronRight,
  FileText,
  FileUp,
  Image,
} from 'lucide-react-native';
import { brand as colors, radius } from '../app/theme';
import { Screen } from '../components/ui';
import { ReviewNotesDialog } from '../components/ReviewNotesDialog';
import { SAMPLE_TEXT, SAMPLE_TITLE } from '../assets/sample';
import type { Profile } from '../services/device/deviceProfile';
import type { Progress } from '../services/ingest/pipeline';
import type { AiBridge } from '../types';
import {
  cancelIngest,
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
  onDailyPlay?: (docId: string) => void;
  onBack(): void;
  /** Camera + OCR: pass `snapAndRead` from `ingest/ocr.ts`. The button is hidden without it. */
  snapPage?: () => Promise<string>;
  /** Existing photo + OCR: pass `pickAndRead`. Safer on stage: a pre-tested page. */
  pickPage?: () => Promise<string>;
  pickFile?: () => Promise<string>;
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
  return p.found > 0
    ? `${head} · ${plural(p.found, 'term')} ready for Wordscape${skipped}`
    : `${head} · no terms found${skipped}. Add more notes or snap another page.`;
}

export function IngestScreen({
  bridge,
  profile,
  onPlay,
  onDailyPlay,
  onBack,
  snapPage,
  pickPage,
  pickFile,
}: IngestScreenProps) {
  const status = useDeckStore(s => s.status);
  const progress = useDeckStore(s => s.progress);
  const error = useDeckStore(s => s.error);
  const docId = useDeckStore(s => s.currentDocId);

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [source, setSource] = useState<'paste' | 'camera' | 'sample' | 'file'>(
    'paste',
  );
  const [snapping, setSnapping] = useState(false);
  const [snapError, setSnapError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const reading = status === 'reading';
  const words = wordCount(text);
  const canGenerate = !reading && !snapping && words >= MIN_WORDS;

  const edit = (t: string) => {
    setText(t);
    if (source === 'sample') setSource('paste');
    resetIngest();
  };

  const snap = async (
    readPage: () => Promise<string>,
    kind: 'camera' | 'file' = 'camera',
  ) => {
    setSnapping(true);
    setSnapError(null);
    try {
      const read = await readPage();
      setText(prev => (prev.trim() ? `${prev.trim()}\n\n${read}` : read)); // pages add up
      setSource(kind);
      resetIngest();
    } catch (e) {
      if (isCancel(e)) return;
      setSnapError(e instanceof Error ? e.message : 'Could not read the notes');
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
    <View style={styles.fill}>
      <Screen>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topBar}>
            <Pressable
              testID="back"
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
            >
              <ArrowLeft color={colors.text} size={22} />
            </Pressable>
            <Text style={styles.title} accessibilityRole="header">
              Scan Notes
            </Text>
          </View>
          <Text style={styles.muted}>
            Add a handout or paste your notes. Everything is processed on this
            phone.
          </Text>

          <View style={styles.group}>
            {snapPage && (
              <SourceRow
                testID="snap"
                Icon={Camera}
                label={snapping ? 'Reading photo…' : 'Snap a page'}
                onPress={() => snap(snapPage)}
                disabled={reading || snapping}
              />
            )}
            {pickPage && (
              <SourceRow
                testID="pick"
                Icon={Image}
                label="From photos"
                onPress={() => snap(pickPage)}
                disabled={reading || snapping}
              />
            )}
            {pickFile && (
              <SourceRow
                testID="pick-file"
                Icon={FileUp}
                label={snapping ? 'Reading notes…' : 'Import file'}
                onPress={() => snap(pickFile, 'file')}
                disabled={reading || snapping}
              />
            )}
          </View>
          {pickFile && (
            <Text style={styles.hint}>
              PDF, TXT, DOCX, or image · up to 25 MB / 25 PDF pages.
            </Text>
          )}
          {snapError && (
            <Text style={[styles.text, styles.danger]}>{snapError}</Text>
          )}

          <Pressable
            testID="review"
            onPress={() => setReviewOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.reviewRow,
              pressed && styles.pressed,
            ]}
          >
            <FileText color={colors.teal} size={20} />
            <Text style={styles.rowLabel}>Check the text</Text>
            <Text
              style={[
                styles.count,
                words > 0 && words < MIN_WORDS && styles.danger,
              ]}
              testID="word-count"
            >
              {words} words
            </Text>
            <ChevronRight color={colors.textDim} size={18} />
          </Pressable>

          <Pressable
            testID="sample"
            onPress={useSample}
            disabled={reading}
            accessibilityRole="button"
            accessibilityState={{ disabled: reading }}
            hitSlop={8}
            style={[styles.sampleLink, reading && styles.disabled]}
          >
            <Text style={styles.sampleText}>Use sample handout</Text>
          </Pressable>

          {reading ? (
            <Btn
              testID="stop"
              label={stopping ? 'Stopping after this chunk…' : 'Stop'}
              onPress={stop}
              disabled={stopping}
              kind="outline"
            />
          ) : (
            <Btn
              testID="generate"
              label="Generate study games"
              onPress={generate}
              disabled={!canGenerate}
            />
          )}

          {(reading || progress) && (
            <View style={styles.progress} testID="progress">
              <View style={styles.row}>
                {reading && <ActivityIndicator color={colors.teal} />}
                <Text
                  style={[styles.text, styles.shrink]}
                  testID="progress-line"
                >
                  {progressLine(status, progress)}
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${fraction * 100}%` }]} />
              </View>
            </View>
          )}
          {status === 'error' && (
            <Text style={[styles.text, styles.danger]} testID="error">
              Something went wrong: {error}
            </Text>
          )}

          <Btn
            testID="play"
            label="Play Wordscape"
            onPress={() => docId && onPlay(docId)}
            disabled={reading || snapping || !docId || !progress?.found}
          />
          {onDailyPlay && (
            <Btn
              testID="play-daily"
              label="Play Daily Term"
              onPress={() => docId && onDailyPlay(docId)}
              disabled={!docId || !progress?.found || snapping}
              kind="quiet"
            />
          )}
        </ScrollView>
      </Screen>

      <ReviewNotesDialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={title}
        onTitleChange={setTitle}
        text={text}
        onTextChange={edit}
        editable={!reading}
        words={words}
        minWords={MIN_WORDS}
      />
    </View>
  );
}

type IconType = React.ComponentType<{ color?: string; size?: number }>;

/** One import action: the same row treatment for camera, photos and files. */
function SourceRow(props: {
  testID: string;
  label: string;
  Icon: IconType;
  onPress(): void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      style={({ pressed }) => [
        styles.sourceRow,
        pressed && styles.pressed,
        props.disabled && styles.disabled,
      ]}
    >
      <props.Icon color={colors.teal} size={20} />
      <Text style={styles.rowLabel}>{props.label}</Text>
      <ChevronRight color={colors.textDim} size={18} />
    </Pressable>
  );
}

/** primary: solid; outline: teal outline; quiet: text only. */
function Btn(props: {
  testID: string;
  label: string;
  onPress(): void;
  disabled?: boolean;
  kind?: 'primary' | 'outline' | 'quiet';
}) {
  const kind = props.kind ?? 'primary';
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled }}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && styles.buttonPrimary,
        kind === 'outline' && styles.buttonOutline,
        pressed && styles.pressed,
        props.disabled && styles.disabled,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          kind === 'outline' && styles.buttonTextOutline,
          kind === 'quiet' && styles.buttonTextQuiet,
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 32 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  hint: { color: colors.textDim, fontSize: 12 },
  text: { color: colors.text, fontSize: 15 },
  danger: { color: colors.red },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    minHeight: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    minHeight: 54,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  count: { color: colors.textMuted, fontSize: 13 },
  sampleLink: { alignSelf: 'center', paddingVertical: 4 },
  sampleText: {
    color: colors.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  progress: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 10,
  },
  track: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.teal },
  button: {
    minHeight: 50,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonOutline: { borderWidth: 1.5, borderColor: colors.teal },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonTextOutline: { color: colors.teal },
  buttonTextQuiet: { color: colors.textMuted, fontWeight: '600' },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.4 },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  shrink: { flexShrink: 1 },
});
