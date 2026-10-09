import { NativeModules } from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type CameraOptions,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import { cleanOcr } from './chunker';

/**
 * Photo → text, entirely on the device: ML Kit (bundled model) on Android,
 * Apple Vision on iOS, both behind NativeModules.Ocr.recognize(uri).
 *
 * Android: the app must NOT declare the CAMERA permission. Without it, the
 * system camera app needs no permission; with it, launchCamera fails until a
 * runtime permission is granted.
 */

/** The student closed the camera or picker; the screen shows nothing. */
export class OcrCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'OcrCancelled';
  }
}

const PHOTO: CameraOptions = {
  mediaType: 'photo',
  quality: 0.9,
  maxWidth: 3000, // plenty for printed text; keeps OCR fast and memory low
  maxHeight: 3000,
  saveToPhotos: false,
};

const PICKER_ERRORS: Record<string, string> = {
  camera_unavailable: 'No camera is available on this phone.',
  permission:
    'Camera access is off. Allow it in Settings, or pick a photo instead.',
};

/** The photo's URI, or a readable error. */
export function photoUri(res: ImagePickerResponse): string {
  if (res.didCancel) throw new OcrCancelled();
  if (res.errorCode) {
    throw new Error(
      PICKER_ERRORS[res.errorCode] ??
        res.errorMessage ??
        'Could not open the camera.',
    );
  }
  const uri = res.assets?.[0]?.uri;
  if (!uri) throw new Error('No photo was taken.');
  return uri;
}

export const ocrAvailable = () => !!NativeModules.Ocr;

/** Runs OCR on an image file and tidies the text for chunking. */
export async function readImage(uri: string): Promise<string> {
  const Ocr = NativeModules.Ocr;
  if (!Ocr)
    throw new Error('Text recognition is not in this build of the app.');
  const text = cleanOcr(String(await Ocr.recognize(uri)));
  if (!/[A-Za-z]{2}/.test(text)) {
    throw new Error(
      'No text found. Try again with the page flat, filling the frame, in good light.',
    );
  }
  return text;
}

/** Opens the camera, then reads the photo. */
export const snapAndRead = async () =>
  readImage(photoUri(await launchCamera(PHOTO)));

/** Picks an existing photo (e.g. a pre-tested page for the demo), then reads it. */
export const pickAndRead = async () =>
  readImage(
    photoUri(await launchImageLibrary({ ...PHOTO, selectionLimit: 1 })),
  );
