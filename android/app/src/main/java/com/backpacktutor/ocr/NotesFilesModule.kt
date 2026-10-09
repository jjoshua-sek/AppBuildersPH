package com.backpacktutor.ocr

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.util.Xml
import com.facebook.react.bridge.*
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.xmlpull.v1.XmlPullParser
import java.io.File
import java.io.IOException
import java.util.concurrent.Executors
import java.util.zip.ZipInputStream

/** User-selected files only. PDF OCR, image OCR and document parsing run locally. */
class NotesFilesModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private val executor = Executors.newSingleThreadExecutor()
  private var pending: Promise? = null
  private val listener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST) return
      val promise = pending ?: return
      pending = null
      val uri = data?.data
      if (resultCode != Activity.RESULT_OK || uri == null) {
        promise.reject("IMPORT_CANCELLED", "Cancelled")
        return
      }
      executor.execute {
        try {
          val name = fileName(uri)
          val mime = ctx.contentResolver.getType(uri) ?: ""
          val text = when {
            mime.startsWith("image/") -> imageText(uri)
            mime == "application/pdf" || name.endsWith(".pdf", true) -> pdfText(uri)
            name.endsWith(".docx", true) || mime.contains("wordprocessingml") -> docxText(uri)
            mime.startsWith("text/") || name.endsWith(".txt", true) -> plainText(uri)
            else -> throw IOException("Choose a PDF, TXT, DOCX, or image file.")
          }
          val result = Arguments.createMap()
          result.putString("name", name)
          result.putString("text", text)
          promise.resolve(result)
        } catch (e: Exception) {
          promise.reject("IMPORT_FAILED", "Cannot read this file: ${e.message}", e)
        }
      }
    }
  }

  init { ctx.addActivityEventListener(listener) }
  override fun getName() = "NotesFiles"

  @ReactMethod
  fun pickAndRead(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val activity = ctx.currentActivity
      if (activity == null) { promise.reject("IMPORT_NO_ACTIVITY", "Open the app to import a file."); return@runOnUiThread }
      if (pending != null) { promise.reject("IMPORT_BUSY", "A file picker is already open."); return@runOnUiThread }
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/*"))
      }
      pending = promise
      try { activity.startActivityForResult(intent, REQUEST) }
      catch (e: Exception) { pending = null; promise.reject("IMPORT_PICKER_FAILED", e.message, e) }
    }
  }

  private fun fileName(uri: Uri): String {
    ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) return cursor.getString(0) ?: "Notes"
    }
    return "Notes"
  }

  private fun copyFile(uri: Uri): File {
    val file = File.createTempFile("notes-import-", ".tmp", ctx.cacheDir)
    try {
      val input = ctx.contentResolver.openInputStream(uri) ?: throw IOException("The file is unavailable.")
      input.use { source -> file.outputStream().use { output ->
        val buffer = ByteArray(8192)
        var total = 0
        while (true) {
          val size = source.read(buffer)
          if (size < 0) break
          total += size
          if (total > MAX_BYTES) throw IOException("Choose a file smaller than 25 MB.")
          output.write(buffer, 0, size)
        }
      } }
      return file
    } catch (e: Exception) { file.delete(); throw e }
  }

  private fun plainText(uri: Uri): String {
    val file = copyFile(uri)
    try {
      if (file.length() > MAX_CHARS * 4) throw IOException("Split these notes into smaller files.")
      val text = file.readText(Charsets.UTF_8)
      if (text.length > MAX_CHARS) throw IOException("Split these notes into smaller files.")
      return text
    } finally { file.delete() }
  }

  private fun docxText(uri: Uri): String {
    val file = copyFile(uri)
    try {
      ZipInputStream(file.inputStream()).use { zip ->
        while (true) {
          val entry = zip.nextEntry ?: break
          if (entry.name != "word/document.xml") continue
          val parser = Xml.newPullParser()
          parser.setInput(zip, "UTF-8")
          val text = StringBuilder()
          while (parser.eventType != XmlPullParser.END_DOCUMENT) {
            if (parser.eventType == XmlPullParser.START_TAG) {
              when (parser.name.substringAfter(':')) {
                "t" -> text.append(parser.nextText())
                "p" -> text.append('\n')
                "tab" -> text.append(' ')
                "br" -> text.append('\n')
              }
              if (text.length > MAX_CHARS) throw IOException("Split this document into smaller files.")
            }
            parser.next()
          }
          return text.toString()
        }
      }
      throw IOException("This DOCX does not contain readable document text.")
    } finally { file.delete() }
  }

  private fun imageText(uri: Uri): String {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try { return Tasks.await(recognizer.process(OcrModule(ctx).load(uri))).text }
    finally { recognizer.close() }
  }

  private fun pdfText(uri: Uri): String {
    val file = copyFile(uri)
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try {
      PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)).use { pdf ->
        if (pdf.pageCount > 25) throw IOException("Import up to 25 PDF pages at a time.")
        val text = StringBuilder()
        for (index in 0 until pdf.pageCount) {
          pdf.openPage(index).use { page ->
            val scale = minOf(1800f / page.width, 2400f / page.height)
            val bitmap = Bitmap.createBitmap(maxOf(1, (page.width * scale).toInt()), maxOf(1, (page.height * scale).toInt()), Bitmap.Config.ARGB_8888)
            try {
              Canvas(bitmap).drawColor(Color.WHITE)
              page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              val result = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)))
              text.append(result.text).append("\n\n")
              if (text.length > MAX_CHARS) throw IOException("Split this PDF into smaller files.")
            } finally { bitmap.recycle() }
          }
        }
        return text.toString()
      }
    } finally { recognizer.close(); file.delete() }
  }

  override fun invalidate() {
    ctx.removeActivityEventListener(listener)
    pending?.reject("IMPORT_CANCELLED", "The app closed.")
    pending = null
    executor.shutdownNow()
    super.invalidate()
  }

  companion object {
    private const val REQUEST = 7314
    private const val MAX_BYTES = 25 * 1024 * 1024
    private const val MAX_CHARS = 100000
  }
}
