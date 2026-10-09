package com.backpacktutor.school

import android.content.Context
import android.text.Html
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class SchoolHttpError(val status: Int, val retryAfter: Long, message: String) : Exception(message)

/** Read-only Microsoft Graph requests. Nothing here submits assignments or sends messages. */
object SchoolSync {
  private val lock = Any()
  private fun get(url: String, token: String): JSONObject {
    val parsed = URL(url)
    require(parsed.protocol == "https" && parsed.host == "graph.microsoft.com") { "Unexpected Microsoft Graph URL." }
    val connection = parsed.openConnection() as HttpURLConnection
    try {
      connection.connectTimeout = 20000; connection.readTimeout = 25000
      connection.instanceFollowRedirects = false
      connection.setRequestProperty("Authorization", "Bearer $token")
      val status = connection.responseCode
      if (status !in 200..299) throw SchoolHttpError(status, connection.getHeaderField("Retry-After")?.toLongOrNull() ?: 0, when (status) {
        401 -> "Please reconnect your school account."
        403 -> "Your school has not granted permission to read this Teams data."
        429 -> "Microsoft is limiting requests. Sync will retry later."
        else -> "Microsoft Teams is unavailable ($status). Saved tasks are still available."
      })
      return connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
    } finally { connection.disconnect() }
  }
  private fun collection(path: String, token: String, deadline: Long): List<JSONObject> {
    val result = mutableListOf<JSONObject>()
    var url = "https://graph.microsoft.com/v1.0/$path"
    val seen = mutableSetOf<String>()
    while (url.isNotBlank()) {
      check(System.currentTimeMillis() < deadline) { "Sync took too long. It will retry later." }
      check(seen.add(url) && seen.size <= 200) { "Too many pages to sync in one pass." }
      val json = get(url, token)
      val rows = json.optJSONArray("value") ?: throw IllegalStateException("Microsoft returned an incomplete list.")
      for (i in 0 until rows.length()) result.add(rows.getJSONObject(i))
      url = json.optString("@odata.nextLink", "")
    }
    return result
  }
  private fun plain(body: JSONObject?): String {
    val text = body?.optString("content", "") ?: ""
    return if (body?.optString("contentType") == "html") Html.fromHtml(text, Html.FROM_HTML_MODE_LEGACY).toString().trim() else text.trim()
  }
  private fun due(value: String): Long? = try {
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }.parse(value.take(19))?.time
  } catch (_: Exception) { null }
  private fun segment(value: String) = android.net.Uri.encode(value)

  fun run(context: Context): Int = synchronized(lock) {
    val p = SchoolAuth.prefs(context)
    val generation = p.getLong("generation", 0)
    val blockedUntil = p.getLong("retryAt", 0)
    check(System.currentTimeMillis() >= blockedUntil) { "Microsoft asked us to wait before syncing again." }
    val deadline = System.currentTimeMillis() + 7 * 60 * 1000
    p.edit().putBoolean("syncing", true).putLong("syncStartedAt", System.currentTimeMillis()).remove("error").apply()
    SchoolAgentModule.changed()
    try {
      val token = SchoolAuth.token(context)
      val account = get("https://graph.microsoft.com/v1.0/me?\$select=id,displayName", token)
      val assignments = collection("education/me/assignments?\$top=100", token, deadline)
      val rows = mutableListOf<JSONObject>()
      for (a in assignments) {
        if (a.optString("status") == "draft") continue
        rows.add(JSONObject().put("id", "teams:assignment:${a.optString("classId")}:${a.getString("id")}")
          .put("kind", "assignment").put("title", a.optString("displayName", "Assignment"))
          .put("body", plain(a.optJSONObject("instructions"))).put("course", "Teams assignment")
          .put("due", due(a.optString("dueDateTime")) ?: JSONObject.NULL)
          .put("url", a.optString("webUrl", "")).put("modified", a.optString("lastModifiedDateTime", "")))
      }
      val warnings = mutableListOf<String>()
      try {
        val teams = collection("me/joinedTeams?\$select=id,displayName", token, deadline)
        val names = teams.associate { it.getString("id") to it.optString("displayName", "Class") }
        assignments.forEach { a ->
          rows.find { it.optString("id") == "teams:assignment:${a.optString("classId")}:${a.optString("id")}" }?.put("course", names[a.optString("classId")] ?: "Teams assignment")
        }
        for (team in teams) {
          val teamId = segment(team.getString("id"))
          try {
            val channels = collection("teams/$teamId/channels?\$select=id,displayName", token, deadline)
            for (channel in channels) {
              check(System.currentTimeMillis() < deadline) { "Post sync took too long." }
              val channelId = segment(channel.getString("id"))
              // A bounded latest-post snapshot per channel; assignment pagination above is complete.
              val messages = get("https://graph.microsoft.com/v1.0/teams/$teamId/channels/$channelId/messages?\$top=50", token).optJSONArray("value") ?: continue
              for (i in 0 until messages.length()) {
                val message = messages.getJSONObject(i)
                if (message.optString("messageType", "message") != "message" || !message.isNull("deletedDateTime")) continue
                val body = plain(message.optJSONObject("body"))
                if (body.isBlank()) continue
                val subject = message.optString("subject", "").takeIf { it != "null" && it.isNotBlank() }
                rows.add(JSONObject().put("id", "teams:post:$teamId:$channelId:${message.getString("id")}")
                  .put("kind", "announcement").put("title", subject ?: body.lineSequence().first().take(100))
                  .put("body", body).put("course", team.optString("displayName") + " · " + channel.optString("displayName"))
                  .put("due", JSONObject.NULL).put("url", message.optString("webUrl", ""))
                  .put("modified", message.optString("lastModifiedDateTime", "")))
              }
            }
          } catch (e: SchoolHttpError) {
            if (e.status == 429) throw e
            warnings.add("Some channel posts could not be read. Assignments were synced.")
          }
        }
      } catch (e: SchoolHttpError) {
        if (e.status == 429 || e.status == 401) throw e
        warnings.add("Channel posts need additional school permission. Assignments were synced.")
      } catch (_: IllegalStateException) {
        warnings.add("The post refresh was incomplete. Assignments were synced.")
      }
      val changes = synchronized(SchoolAuth.accountLock) {
        check(generation == p.getLong("generation", 0) && p.contains("auth")) { "School connection changed. Sync cancelled." }
        val changed = SchoolCache(context).use { it.applyRemote(rows, true) }
        p.edit().putLong("lastSync", System.currentTimeMillis()).putString("account", account.optString("displayName", "School account"))
          .putString("warning", warnings.distinct().joinToString(" ")).remove("retryAt").commit()
        changed
      }
      AgentBubbleService.refresh(context)
      if (changes > 0) AgentWork.notifyChanges(context, changes)
      changes
    } catch (e: Exception) {
      p.edit().putString("error", e.message ?: "Could not sync Teams. Your saved tasks are still available.").apply()
      if (e is SchoolHttpError && e.status == 429) p.edit().putLong("retryAt", System.currentTimeMillis() + maxOf(60, e.retryAfter) * 1000).apply()
      throw e
    } finally {
      p.edit().putBoolean("syncing", false).apply()
      SchoolAgentModule.changed()
    }
  }
}
