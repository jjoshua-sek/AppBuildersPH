import { NativeModules } from 'react-native';
import { cleanOcr } from './chunker';
import { OcrCancelled } from './ocr';

export const fileImportAvailable = () => !!NativeModules.NotesFiles;

/** Android's file picker; reading and OCR happen on the phone. */
export async function importNotesFile(): Promise<string> {
  if (!fileImportAvailable())
    throw new Error('Install the updated Android build to import files.');
  try {
    const result = await NativeModules.NotesFiles.pickAndRead();
    const text = cleanOcr(String(result.text ?? ''));
    if (!/[A-Za-z]{2}/.test(text))
      throw new Error(
        'No readable text found. Try a clearer image or an unlocked PDF.',
      );
    return text;
  } catch (error) {
    if ((error as { code?: string }).code === 'IMPORT_CANCELLED')
      throw new OcrCancelled();
    throw error;
  }
}
