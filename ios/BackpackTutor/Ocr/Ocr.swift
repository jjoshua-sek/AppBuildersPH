import Foundation
import ImageIO
import Vision

/// On-device OCR with Apple Vision (no download, works offline).
/// JS: NativeModules.Ocr.recognize(uri) -> text, one recognized line per line.
@objc(Ocr)
class Ocr: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(recognize:resolver:rejecter:)
  func recognize(_ uri: String,
                 resolver resolve: @escaping RCTPromiseResolveBlock,
                 rejecter reject: @escaping RCTPromiseRejectBlock) {
    let url = URL(string: uri) ?? URL(fileURLWithPath: uri)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
      reject("OCR_BAD_IMAGE", "Cannot read the photo at \(uri)", nil)
      return
    }
    // Camera photos store their rotation in EXIF; Vision needs it to read the text upright.
    let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
    let raw = props?[kCGImagePropertyOrientation] as? UInt32 ?? 1
    let orientation = CGImagePropertyOrientation(rawValue: raw) ?? .up

    var settled = false // resolve or reject exactly once
    let request = VNRecognizeTextRequest { req, err in
      guard !settled else { return }
      settled = true
      if let err = err {
        reject("OCR_FAILED", err.localizedDescription, err)
        return
      }
      let lines = (req.results as? [VNRecognizedTextObservation] ?? [])
        .compactMap { $0.topCandidates(1).first?.string }
      resolve(lines.joined(separator: "\n"))
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:]).perform([request])
      } catch {
        if !settled {
          settled = true
          reject("OCR_FAILED", error.localizedDescription, error)
        }
      }
    }
  }
}
