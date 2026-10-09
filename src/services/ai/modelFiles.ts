import { Platform } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';

/**
 * Where the models live on each platform:
 * - Android: /sdcard/Android/data/com.backpacktutor/files/models (adb push, see scripts/push-models.sh)
 * - iOS: the app's Documents/models (Finder → iPhone → Files → BackpackTutor)
 */
export const MODEL_DIR = `${
  Platform.OS === 'ios' ? RNFS.DocumentDirectoryPath : RNFS.ExternalDirectoryPath
}/models`;
export const GEN_PATH = `${MODEL_DIR}/gen.gguf`;
export const EMB_PATH = `${MODEL_DIR}/emb.gguf`;

export type ModelCheck = { path: string; ok: boolean; sizeMb: number };

export async function checkModels(): Promise<{ gen: ModelCheck; emb: ModelCheck }> {
  const check = async (path: string): Promise<ModelCheck> => {
    if (!(await RNFS.exists(path))) return { path, ok: false, sizeMb: 0 };
    const { size } = await RNFS.stat(path);
    return { path, ok: size > 0, sizeMb: Math.round(Number(size) / 1e6) };
  };
  await RNFS.mkdir(MODEL_DIR).catch(() => {});
  return { gen: await check(GEN_PATH), emb: await check(EMB_PATH) };
}

export const toFileUri = (path: string) => (path.startsWith('file://') ? path : `file://${path}`);

/**
 * Fallback when a path is wrong on some phone: let the user pick the .gguf file
 * and copy it into place. Copying a ~1 GB file takes a while.
 */
export async function pickModelFile(target: 'gen' | 'emb'): Promise<boolean> {
  const [picked] = await RNFS.pickFile({ mimeTypes: ['*/*'] });
  if (!picked) return false;
  const dest = target === 'gen' ? GEN_PATH : EMB_PATH;
  await RNFS.mkdir(MODEL_DIR).catch(() => {});
  if (await RNFS.exists(dest)) await RNFS.unlink(dest);
  await RNFS.copyFile(picked, dest);
  return true;
}
