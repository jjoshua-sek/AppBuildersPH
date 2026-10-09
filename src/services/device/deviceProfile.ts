import type { DeviceTier } from '../../types';

/**
 * Settings per phone class. Defaults are starting points: DevBench measures each
 * phone and the numbers that win go in docs/benchmarks.md and here.
 *
 * Our demo phones:
 * - iPhone 13 Pro Max: A15, 6 GB, Metal GPU                 -> 'ios-metal'
 * - iPhone 11: A13, 4 GB; below the Apple7 GPU family that
 *   llama.cpp's Metal kernels need, so CPU only               -> 'ios-cpu'
 * - Infinix Hot 50 Pro+ (Helio G100): 2x Cortex-A76 + 6x A55,
 *   8 GB, Mali GPU with no llama.rn backend, so CPU only      -> 'android-cpu'
 */
export type Profile = {
  tier: DeviceTier;
  n_gpu_layers: number;
  n_threads: number;
  n_ctx: number;
  chunkWords: number;
  termsPerChunk: number;
  extractTokens: number;
  tutorTokens: number;
  whyTokens: number;
};

export const PROFILES: Record<DeviceTier, Profile> = {
  'ios-metal': {
    tier: 'ios-metal',
    n_gpu_layers: 99,
    n_threads: 4,
    n_ctx: 2048,
    chunkWords: 180,
    termsPerChunk: 5,
    extractTokens: 360,
    tutorTokens: 90,
    whyTokens: 140,
  },
  'ios-cpu': {
    tier: 'ios-cpu',
    n_gpu_layers: 0,
    n_threads: 2, // A13 has 2 performance cores
    n_ctx: 1536, // stay well under iOS's per-app memory limit on a 4 GB phone
    chunkWords: 150,
    termsPerChunk: 4,
    extractTokens: 320,
    tutorTokens: 60,
    whyTokens: 110,
  },
  'android-cpu': {
    tier: 'android-cpu',
    n_gpu_layers: 0,
    n_threads: 2, // DevBench on the Infinix: 2 threads 12.2 tok/s, 4 → 11.2, 6 → 11.0
    n_ctx: 2048,
    chunkWords: 150,
    termsPerChunk: 4,
    extractTokens: 320, // 180 cut the JSON off mid-term (DevBench: 0/3 parsed)
    tutorTokens: 60,
    whyTokens: 110,
  },
};

/**
 * `deviceId` is the hardware identifier from react-native-device-info's
 * getDeviceId(), e.g. "iPhone14,3" for iPhone 13 Pro Max, "iPhone12,1" for
 * iPhone 11. "iPhone13,x" (A14, iPhone 12) is the first Apple7-family GPU.
 */
export function detectTier(os: 'ios' | 'android' | string, deviceId: string): DeviceTier {
  if (os !== 'ios') return 'android-cpu';
  const major = Number(/^iPhone(\d+),/.exec(deviceId)?.[1] ?? NaN);
  return major >= 13 ? 'ios-metal' : 'ios-cpu';
}

export const profileFor = (os: string, deviceId: string) => PROFILES[detectTier(os, deviceId)];
