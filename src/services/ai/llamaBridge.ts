import { Platform } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { initLlama, loadLlamaModelInfo, type LlamaContext } from 'llama.rn';
import type { AiBridge, CompleteOptions } from '../../types';
import { profileFor, type Profile } from '../device/deviceProfile';
import { EMB_PATH, GEN_PATH, checkModels, toFileUri } from './modelFiles';
import { WorkQueue } from './workQueue';
import { stripTurnMarkers, turnMarkerFilter } from './chatText';

const STOP = ['<|im_end|>', '<end_of_turn>', '<|eot_id|>', '<|endoftext|>'];

export const profile: Profile = profileFor(Platform.OS, DeviceInfo.getDeviceId());

/** Live numbers for the Proof panel and DevBench. */
export const stats = {
  device: `${DeviceInfo.getBrand()} ${DeviceInfo.getModel()}`,
  tier: profile.tier,
  modelName: '',
  modelSizeMb: 0,
  nThreads: profile.n_threads,
  gpu: false,
  reasonNoGPU: '',
  devices: [] as string[],
  loadMs: 0,
  lastTtftMs: 0,
  lastTps: 0,
  lastPromptTps: 0,
  lastTokensCached: 0,
  embedDims: 0,
  chatTemplate: '' as '' | 'jinja' | 'built-in',
  lastIngestMs: 0,
};

let gen: LlamaContext | null = null;
let emb: LlamaContext | null = null;

const queue = new WorkQueue(() => {
  gen?.stopCompletion();
});

export const isLoaded = () => !!gen && !!emb;

export type LoadProgress = { stage: 'checking' | 'llm' | 'embedder' | 'ready'; pct: number };

/** Loads both models once, at app start. Settings come from the phone's tier. */
export async function loadModels(
  onProgress: (p: LoadProgress) => void = () => {},
  overrides: Partial<Pick<Profile, 'n_threads' | 'n_gpu_layers'>> = {},
) {
  onProgress({ stage: 'checking', pct: 0 });
  const files = await checkModels();
  if (!files.gen.ok) throw new Error(`Missing LLM: ${files.gen.path}`);
  if (!files.emb.ok) throw new Error(`Missing embedder: ${files.emb.path}`);

  const info: any = await loadLlamaModelInfo(toFileUri(GEN_PATH));
  stats.modelName = info?.['general.name'] ?? 'gen.gguf';
  stats.modelSizeMb = files.gen.sizeMb;

  const nThreads = overrides.n_threads ?? profile.n_threads;
  const nGpuLayers = overrides.n_gpu_layers ?? profile.n_gpu_layers;
  await gen?.release();
  gen = null;
  const t0 = Date.now();
  gen = await initLlama(
    {
      model: toFileUri(GEN_PATH),
      n_ctx: profile.n_ctx,
      n_gpu_layers: nGpuLayers,
      n_threads: nThreads,
      use_mlock: false,
    },
    pct => onProgress({ stage: 'llm', pct }),
  );
  stats.loadMs = Date.now() - t0;
  stats.nThreads = nThreads;
  stats.gpu = gen.gpu;
  stats.reasonNoGPU = gen.reasonNoGPU ?? '';
  stats.devices = gen.devices ?? [];
  // Jinja: llama.rn applies the GGUF's own chat template. Built-in: its fallback format.
  stats.chatTemplate = gen.isJinjaSupported() ? 'jinja' : 'built-in';

  if (!emb) {
    onProgress({ stage: 'embedder', pct: 0 });
    emb = await initLlama(
      { model: toFileUri(EMB_PATH), embedding: true, n_ctx: 512, n_gpu_layers: 0, n_threads: 2 },
      pct => onProgress({ stage: 'embedder', pct }),
    );
  }
  onProgress({ stage: 'ready', pct: 100 });
}

/** Reloads only the LLM with different settings (DevBench thread sweep). */
export const reloadLlm = (overrides: Partial<Pick<Profile, 'n_threads' | 'n_gpu_layers'>>) =>
  loadModels(() => {}, overrides);

/** llama.cpp's built-in benchmark: prompt and generation tokens per second. */
export async function benchLlm(pp = 128, tg = 64) {
  if (!gen) throw new Error('LLM not loaded');
  const ctx = gen;
  const r = await queue.run('normal', () => ctx.bench(pp, tg, 1, 1));
  return { promptTps: r.speedPp, genTps: r.speedTg };
}

export const bridge: AiBridge = {
  complete: (o: CompleteOptions) =>
    queue.run(o.priority ?? 'normal', async () => {
      if (!gen) throw new Error('LLM not loaded');
      const t0 = Date.now();
      let tFirst = 0;
      const emit = turnMarkerFilter(t => o.onToken?.(t));
      const res = await gen.completion(
        {
          messages: o.messages,
          n_predict: o.n_predict ?? 256,
          temperature: o.temperature ?? 0.4,
          stop: STOP,
          enable_thinking: false, // Qwen3.5; ignored by other templates
          // End the prompt with the model's turn marker; without it Gemma writes
          // "<start_of_turn>model" itself and stops following the instructions.
          add_generation_prompt: true,
          ...(o.jsonSchema
            ? {
                response_format: { type: 'json_schema', json_schema: { schema: o.jsonSchema } },
                // Also as a raw grammar: llama.rn's built-in (non-Jinja) template path
                // ignores response_format, so the JSON was not constrained on the Infinix.
                json_schema: JSON.stringify(o.jsonSchema),
              }
            : {}),
        },
        d => {
          if (!tFirst) tFirst = Date.now();
          emit(d.token);
        },
      );
      stats.lastTtftMs = tFirst ? tFirst - t0 : 0;
      stats.lastTps = res.timings?.predicted_per_second ?? 0;
      stats.lastPromptTps = res.timings?.prompt_per_second ?? 0;
      stats.lastTokensCached = res.tokens_cached ?? 0;
      return stripTurnMarkers(res.text.replace(/<think>[\s\S]*?<\/think>/g, '')).trim();
    }),

  stopGeneration: () => {
    gen?.stopCompletion();
  },

  embed: (text: string) =>
    queue.run('normal', async () => {
      if (!emb) throw new Error('Embedder not loaded');
      const { embedding } = await emb.embedding(text);
      const v = Float32Array.from(embedding);
      let n = 0;
      for (let i = 0; i < v.length; i++) n += v[i] * v[i];
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < v.length; i++) v[i] /= n;
      stats.embedDims = v.length;
      return v;
    }),
};
