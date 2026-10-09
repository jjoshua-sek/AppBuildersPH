package com.backpacktutor.school

import android.content.Context
import com.google.android.gms.auth.api.identity.ClearTokenRequest
import com.google.android.gms.auth.api.identity.Identity
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import java.util.TimeZone

/** Read-only Classroom snapshot, with pagination and UTC due-date conversion. */
object GoogleClassroomSync {
  private val lock = Any()
  private fun get(url: String, token: String): JSONObject {
    val parsed = URL(url)
    require(parsed.protocol == "https" && parsed.host == "classroom.googleapis.com") { "Unexpected Classroom URL." }
    val connection = parsed.openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 20000; connection.readTimeout = 25000; connection.instanceFollowRedirects = false
      connection.setRequestProperty("Authorization", "Bearer $token")
      val status = connection.responseCode
      if (status !in 200..299) throw SchoolHttpError(status, connection.getHeaderField("Retry-After")?.toLongOrNull() ?: 0, when (status) {
        401 -> "Please reconnect Google Classroom."
        403 -> "Classroom access was denied. Check consent, the enabled API, test users, or school restrictions."
        429 -> "Google is limiting requests. Sync will retry later."
        else -> "Google Classroom is unavailable ($status). Saved tasks are still available."
      })
      return connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
    } finally { connection.disconnect() }
  }
  private fun collection(path: String, key: String, token: String, deadline: Long): List<JSONObject> {
    val rows = mutableListOf<JSONObject>()
    var page = ""
    val seen = mutableSetOf<String>()
    do {
      check(System.currentTimeMillis() < deadline) { "Classroom sync took too long. Try again later." }
      check(seen.add(page) && seen.size <= 200) { "Too many Classroom pages to sync at once." }
      val base = "https://classroom.googleapis.com/v1/$path"
      val url = base + (if (base.contains('?')) "&" else "?") + "pageSize=100" + if (page.isNotBlank()) "&pageToken=" + android.net.Uri.encode(page) else ""
      val json = get(url, token)
      val values = json.optJSONArray(key)
      if (values != null) for (i in 0 until values.length()) rows.add(values.getJSONObject(i))
      page = json.optString("nextPageToken", "")
    } while (page.isNotBlank())
    return rows
  }
  private fun due(row: JSONObject): Any {
    val date = row.optJSONObject("dueDate") ?: return JSONObject.NULL
    val time = row.optJSONObject("dueTime")
    return try {
      Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
        clear(); isLenient = false
        set(date.getInt("year"), date.getInt("month") - 1, date.getInt("day"), time?.optInt("hours", 0) ?: 0, time?.optInt("minutes", 0) ?: 0, time?.optInt("seconds", 0) ?: 0)
      }.timeInMillis
    } catch (_: Exception) { JSONObject.NULL }
  }
  fun run(context: Context): Int = synchronized(lock) {
    val prefs = SchoolAuth.prefs(context)
    val generation = prefs.getLong("generation", 0)
    check(System.currentTimeMillis() >= prefs.getLong("retryAt", 0)) { "Google asked us to wait before syncing again." }
    prefs.edit().putBoolean("syncing", true).putLong("syncStartedAt", System.currentTimeMillis()).remove("error").apply()
    SchoolAgentModule.changed()
    var access: String? = null
    try {
      val token = GoogleClassroomAuth.token(context)
      access = token
      val deadline = System.currentTimeMillis() + 7 * 60 * 1000
      val courses = collection("courses?studentId=me&courseStates=ACTIVE", "courses", token, deadline)
      val rows = mutableListOf<JSONObject>()
      val warnings = mutableListOf<String>()
      for (course in courses) {
        val courseId = android.net.Uri.encode(course.getString("id"))
        val work = collection("courses/$courseId/courseWork?courseWorkStates=PUBLISHED", "courseWork", token, deadline)
        for (item in work) {
          rows.add(JSONObject().put("id", "google:assignment:$courseId:${item.getString("id")}")
            .put("kind", "assignment").put("title", item.optString("title", "Assignment"))
            .put("body", item.optString("description", "")).put("course", course.optString("name", "Classroom"))
            .put("due", due(item)).put("url", item.optString("alternateLink", ""))
            .put("modified", item.optString("updateTime", item.optString("creationTime", ""))))
        }
        try {
          val posts = collection("courses/$courseId/announcements?announcementStates=PUBLISHED", "announcements", token, deadline)
          for (post in posts) {
            val body = post.optString("text", "")
            rows.add(JSONObject().put("id", "google:post:$courseId:${post.getString("id")}")
              .put("kind", "announcement").put("title", body.lineSequence().first().take(100).ifBlank { "Class announcement" })
              .put("body", body).put("course", course.optString("name", "Classroom"))
              .put("due", JSONObject.NULL).put("url", post.optString("alternateLink", ""))
              .put("modified", post.optString("updateTime", post.optString("creationTime", ""))))
          }
        } catch (e: SchoolHttpError) {
          if (e.status != 403) throw e
          warnings.add("Some announcements could not be read. Assignments were synced.")
        }
      }
      val changes = synchronized(SchoolAuth.accountLock) {
        check(generation == prefs.getLong("generation", 0) && SchoolConnection.provider(context) == "google" && GoogleClassroomAuth.connected(context)) { "Classroom connection changed. Sync cancelled." }
        val changed = SchoolCache(context).use { it.applyRemote(rows, true) }
        prefs.edit().putLong("lastSync", System.currentTimeMillis()).putString("warning", warnings.distinct().joinToString(" ")).remove("retryAt").commit()
        changed
      }
      AgentBubbleService.refresh(context)
      if (changes > 0) AgentWork.notifyChanges(context, changes)
      changes
    } catch (e: Exception) {
      prefs.edit().putString("error", e.message ?: "Could not sync Classroom. Your saved tasks are still available.").apply()
      if (e is SchoolHttpError && e.status == 401 && access != null) Identity.getAuthorizationClient(context).clearToken(ClearTokenRequest.builder().setToken(access).build())
      if (e is SchoolHttpError && e.status == 429) prefs.edit().putLong("retryAt", System.currentTimeMillis() + maxOf(60, e.retryAfter) * 1000).apply()
      throw e
    } finally { prefs.edit().putBoolean("syncing", false).apply(); SchoolAgentModule.changed() }
  }
}
