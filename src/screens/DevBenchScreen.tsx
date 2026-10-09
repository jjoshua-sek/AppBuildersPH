import React, { useState } from 'react';
import { Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { colors, ui } from '../app/theme';
import { Button } from '../components/Button';
import { BENCH_CHUNKS, LEAK_MESSAGES, LEAK_TERMS } from '../assets/sample/benchData';
import { benchLlm, bridge, profile, reloadLlm, stats } from '../services/ai/llamaBridge';
import { chunk, cleanOcr } from '../services/ingest/chunker';
import {
  benchExtraction,
  benchLeaks,
  formatReport,
  type ExtractionResult,
  type LeakResult,
  type SpeedResult,
} from '../services/ai/devBench';

/**
 * Hour-1 benchmark (BUILD_SPEC §5.3). Run it on every phone for every candidate
 * model, then copy the report into docs/benchmarks.md.
 */
export function DevBenchScreen({ onBack }: { onBack(): void }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [speed, setSpeed] = useState<SpeedResult[]>([]);
  const [extraction, setExtraction] = useState<ExtractionResult>();
  const [leak, setLeak] = useState<LeakResult>();

  const say = (s: string) => setLog(l => [...l.slice(-40), s]);
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      say(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const speedTest = run(async () => {
    say('llama-bench: 128 prompt tokens, 64 generated…');
    const r = await benchLlm();
    setSpeed(s => [...s, { threads: stats.nThreads, gpuLayers: stats.gpu ? 99 : 0, ...r }]);
    say(`prompt ${r.promptTps.toFixed(1)} tok/s, generation ${r.genTps.toFixed(1)} tok/s`);
  });

  const threadSweep = run(async () => {
    const results: SpeedResult[] = [];
    for (const t of [2, 4, 6]) {
      say(`reloading with ${t} threads…`);
      await reloadLlm({ n_threads: t, n_gpu_layers: 0 });
      const r = await benchLlm();
      results.push({ threads: t, gpuLayers: 0, ...r });
      say(`${t} threads: generation ${r.genTps.toFixed(1)} tok/s`);
    }
    setSpeed(s => [...s, ...results]);
    await reloadLlm({});
    say(`restored profile settings (${profile.n_threads} threads)`);
  });

  const extractionTest = run(async () => {
    say('term extraction on 3 fixed chunks…');
    setExtraction(
      await benchExtraction(
        bridge,
        BENCH_CHUNKS,
        { maxTerms: profile.termsPerChunk, n_predict: profile.extractTokens },
        say,
      ),
    );
  });

  const [pasted, setPasted] = useState('');
  const pastedTest = run(async () => {
    const parts = chunk(cleanOcr(pasted), profile.chunkWords, 30);
    say(`pasted text: ${parts.length} chunk(s), same settings as Add notes…`);
    setExtraction(
      await benchExtraction(
        bridge,
        parts,
        { maxTerms: profile.termsPerChunk, n_predict: profile.extractTokens },
        say,
      ),
    );
  });

  const leakTest = run(async () => {
    const cases = LEAK_TERMS.slice(0, 4).map(t => ({ ...t, passage: BENCH_CHUNKS[t.chunk] }));
    say(`tutor leak test: ${cases.length} terms × ${LEAK_MESSAGES.length} messages…`);
    setLeak(await benchLeaks(bridge, cases, LEAK_MESSAGES, { n_predict: profile.tutorTokens }, say));
  });

  const report = formatReport({
    device: stats.device,
    tier: stats.tier,
    model: stats.modelName,
    modelSizeMb: stats.modelSizeMb,
    loadMs: stats.loadMs,
    backend: stats.gpu ? 'GPU' : `CPU ${stats.nThreads} threads`,
    speed,
    extraction,
    leak,
  });

  return (
    <ScrollView style={ui.screen} contentContainerStyle={ui.content}>
      <Text style={ui.title}>DevBench</Text>
      <Text style={ui.muted}>
        {stats.device} · {stats.tier} · {stats.modelName}
      </Text>

      <Button title="1. Speed (llama-bench)" onPress={speedTest} disabled={busy} />
      {Platform.OS === 'android' && (
        <Button title="2. Thread sweep 2 / 4 / 6" onPress={threadSweep} disabled={busy} />
      )}
      <Button title="3. Term extraction (3 chunks)" onPress={extractionTest} disabled={busy} />
      <Button title="4. Tutor leak test (20 attempts)" onPress={leakTest} disabled={busy} />

      <Text style={ui.h2}>5. Term extraction on your own text</Text>
      <Text style={ui.muted}>
        Paste text (e.g. what OCR read from a photo) to see every term kept or rejected, and why.
      </Text>
      <TextInput
        multiline
        value={pasted}
        onChangeText={setPasted}
        placeholder="Paste notes here"
        placeholderTextColor={colors.muted}
        style={[ui.card, ui.text, ui.input]}
      />
      <Button title="5. Run on pasted text" onPress={pastedTest} disabled={busy || !pasted.trim()} />

      <Text style={ui.h2}>Log</Text>
      <View style={ui.card}>
        {log.map((l, i) => (
          <Text key={i} style={ui.mono}>
            {l}
          </Text>
        ))}
      </View>

      <Text style={ui.h2}>Report (long-press to copy into docs/benchmarks.md)</Text>
      <View style={ui.card}>
        <Text selectable style={ui.mono}>
          {report}
        </Text>
      </View>

      <Button title="Back" onPress={onBack} disabled={busy} />
    </ScrollView>
  );
}
