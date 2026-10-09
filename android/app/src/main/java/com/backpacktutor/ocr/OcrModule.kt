package com.backpacktutor.ocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.ExifInterface
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.IOException

/**
 * On-device OCR with ML Kit's *bundled* Latin model (com.google.mlkit:text-recognition).
 * The model ships inside the APK, so it works offline on a fresh install. Never switch to
 * play-services-mlkit-text-recognition: that one downloads the model on first use.
 *
 * JS: NativeModules.Ocr.recognize(uri) -> text, blocks separated by blank lines.
 */
class OcrModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private var recognizer: TextRecognizer? = null

  override fun getName() = NAME

  @ReactMethod
  fun recognize(uri: String, promise: Promise) {
    val image =
      try {
        load(Uri.parse(uri))
      } catch (e: Exception) {
        promise.reject("OCR_BAD_IMAGE", "Cannot read the photo: ${e.message}", e)
        return
      }
    val r = recognizer ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { recognizer = it }
    r.process(image)
      .addOnSuccessListener { result -> promise.resolve(result.textBlocks.joinToString("\n\n") { it.text }) }
      .addOnFailureListener { e -> promise.reject("OCR_FAILED", e.message, e) }
  }

  /**
   * Decodes the photo upright (camera photos store their rotation in EXIF) and at most
   * ~4k px on the long side, so a 100 MP camera can't run the app out of memory.
   * A page at 2-4k px is still well above ML Kit's 16 px-per-character guidance.
   */
  internal fun load(uri: Uri): InputImage {
    val resolver = ctx.contentResolver
    fun open() = resolver.openInputStream(uri) ?: throw IOException("No data at $uri")

    val rotation =
      open().use {
        when (ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
          ExifInterface.ORIENTATION_ROTATE_90 -> 90
          ExifInterface.ORIENTATION_ROTATE_180 -> 180
          ExifInterface.ORIENTATION_ROTATE_270 -> 270
          else -> 0
        }
      }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    open().use { BitmapFactory.decodeStream(it, null, bounds) }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) throw IOException("Not an image")

    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= MAX_SIDE) sample *= 2
    val opts = BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap: Bitmap = open().use { BitmapFactory.decodeStream(it, null, opts) } ?: throw IOException("Not an image")
    return InputImage.fromBitmap(bitmap, rotation)
  }

  override fun invalidate() {
    recognizer?.close()
    recognizer = null
    super.invalidate()
  }

  companion object {
    const val NAME = "Ocr"
    private const val MAX_SIDE = 2048
  }
}
