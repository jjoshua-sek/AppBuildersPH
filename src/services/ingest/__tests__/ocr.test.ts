import { NativeModules } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import {
  OcrCancelled,
  ocrAvailable,
  photoUri,
  pickAndRead,
  readImage,
  snapAndRead,
} from '../ocr';

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));

const recognize = jest.fn();

beforeEach(() => {
  recognize.mockReset();
  (launchCamera as jest.Mock).mockReset();
  (launchImageLibrary as jest.Mock).mockReset();
  NativeModules.Ocr = { recognize };
});

afterAll(() => {
  delete NativeModules.Ocr;
});

describe('photoUri', () => {
  it('returns the first asset', () => {
    expect(photoUri({ assets: [{ uri: 'file:///a.jpg' }] })).toBe(
      'file:///a.jpg',
    );
  });
  it('throws OcrCancelled when the student backs out', () => {
    expect(() => photoUri({ didCancel: true })).toThrow(OcrCancelled);
    try {
      photoUri({ didCancel: true });
    } catch (e) {
      expect((e as Error).name).toBe('OcrCancelled'); // what IngestScreen checks
    }
  });
  it('explains picker errors', () => {
    expect(() => photoUri({ errorCode: 'permission' })).toThrow(/Settings/);
    expect(() => photoUri({ errorCode: 'camera_unavailable' })).toThrow(
      /No camera/,
    );
    expect(() =>
      photoUri({ errorCode: 'others', errorMessage: 'boom' }),
    ).toThrow('boom');
    expect(() => photoUri({ assets: [] })).toThrow(/No photo/);
  });
});

describe('readImage', () => {
  it('cleans the OCR text', async () => {
    recognize.mockResolvedValue(
      'An audit  trail is a chrono-\nlogical record.\n\n\n\nNext block',
    );
    expect(await readImage('file:///a.jpg')).toBe(
      'An audit trail is a chronological record.\n\nNext block',
    );
    expect(recognize).toHaveBeenCalledWith('file:///a.jpg');
  });
  it('rejects a photo with no text', async () => {
    recognize.mockResolvedValue('  \n ~ ');
    await expect(readImage('file:///a.jpg')).rejects.toThrow(/No text found/);
  });
  it('says so when the native module is missing', async () => {
    delete NativeModules.Ocr;
    expect(ocrAvailable()).toBe(false);
    await expect(readImage('file:///a.jpg')).rejects.toThrow(
      /not in this build/,
    );
  });
});

describe('snapAndRead / pickAndRead', () => {
  it('opens the camera without saving to the gallery, then reads the photo', async () => {
    (launchCamera as jest.Mock).mockResolvedValue({
      assets: [{ uri: 'file:///cam.jpg' }],
    });
    recognize.mockResolvedValue('Materiality decides what is worth reporting.');
    expect(await snapAndRead()).toBe(
      'Materiality decides what is worth reporting.',
    );
    expect(launchCamera).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'photo', saveToPhotos: false }),
    );
  });
  it('picks one photo from the library', async () => {
    (launchImageLibrary as jest.Mock).mockResolvedValue({
      assets: [{ uri: 'content://p/1' }],
    });
    recognize.mockResolvedValue('Sampling tests a subset.');
    expect(await pickAndRead()).toBe('Sampling tests a subset.');
    expect(launchImageLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ selectionLimit: 1 }),
    );
    expect(recognize).toHaveBeenCalledWith('content://p/1');
  });
  it('does not run OCR when cancelled', async () => {
    (launchCamera as jest.Mock).mockResolvedValue({ didCancel: true });
    await expect(snapAndRead()).rejects.toBeInstanceOf(OcrCancelled);
    expect(recognize).not.toHaveBeenCalled();
  });
});
