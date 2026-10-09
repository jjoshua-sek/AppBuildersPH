package com.backpacktutor.school

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class SchoolCache(context: Context) : SQLiteOpenHelper(context, "school-agent.sqlite", null, 1) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE items (id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, course TEXT NOT NULL, due INTEGER, url TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, remote INTEGER NOT NULL DEFAULT 0, modified TEXT NOT NULL DEFAULT '')")
  }
  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit

  @Synchronized fun items(): JSONArray {
    val result = JSONArray()
    readableDatabase.rawQuery("SELECT * FROM items ORDER BY done, CASE WHEN kind='assignment' OR kind='task' THEN 0 ELSE 1 END, due IS NULL, due, title", null).use { c ->
      while (c.moveToNext()) {
        val row = JSONObject()
        for (name in arrayOf("id", "kind", "title", "body", "course", "url", "modified")) row.put(name, c.getString(c.getColumnIndexOrThrow(name)))
        val due = c.getColumnIndexOrThrow("due")
        row.put("due", if (c.isNull(due)) JSONObject.NULL else c.getLong(due))
        row.put("done", c.getInt(c.getColumnIndexOrThrow("done")) != 0)
        row.put("remote", c.getInt(c.getColumnIndexOrThrow("remote")) != 0)
        result.put(row)
      }
    }
    return result
  }

  @Synchronized fun add(title: String, due: Double?) {
    require(title.isNotBlank()) { "Add a task title." }
    val values = ContentValues().apply {
      put("id", "local:" + UUID.randomUUID()); put("kind", "task"); put("title", title.take(300)); put("body", ""); put("course", "My tasks"); put("url", "")
      if (due != null && due.isFinite() && due > 0) put("due", due.toLong())
    }
    writableDatabase.insertOrThrow("items", null, values)
  }

  @Synchronized fun mark(id: String, done: Boolean) {
    writableDatabase.update("items", ContentValues().apply { put("done", if (done) 1 else 0) }, "id=?", arrayOf(id))
  }

  @Synchronized fun clearRemote() { writableDatabase.delete("items", "remote=1", null) }

  /** Apply only a complete assignment snapshot; preserve the student's local checkboxes. */
  @Synchronized fun applyRemote(rows: List<JSONObject>, assignmentsComplete: Boolean): Int {
    val db = writableDatabase
    var changed = 0
    db.beginTransaction()
    try {
      for (row in rows) {
        val id = row.getString("id")
        val existing = db.rawQuery("SELECT title,body,due,modified FROM items WHERE id=?", arrayOf(id)).use { c ->
          if (!c.moveToFirst()) null else listOf(c.getString(0), c.getString(1), if (c.isNull(2)) "" else c.getLong(2).toString(), c.getString(3))
        }
        val due = if (row.isNull("due")) null else row.getLong("due")
        val comparison = listOf(row.getString("title"), row.getString("body"), due?.toString() ?: "", row.optString("modified"))
        if (existing != comparison) changed++
        val values = ContentValues().apply {
          put("id", id); put("remote", 1)
          for (key in arrayOf("kind", "title", "body", "course", "url", "modified")) put(key, row.optString(key))
          if (due == null) putNull("due") else put("due", due)
        }
        if (existing == null) db.insertOrThrow("items", null, values) else db.update("items", values, "id=?", arrayOf(id))
      }
      if (assignmentsComplete) {
        val ids = rows.filter { it.optString("kind") == "assignment" }.map { it.getString("id") }.toSet()
        val stale = mutableListOf<String>()
        db.rawQuery("SELECT id FROM items WHERE remote=1 AND kind='assignment'", null).use { c -> while (c.moveToNext()) if (c.getString(0) !in ids) stale.add(c.getString(0)) }
        stale.forEach { db.delete("items", "id=?", arrayOf(it)) }
      }
      // Keep the latest channel posts without allowing the offline cache to grow forever.
      db.execSQL("DELETE FROM items WHERE kind='announcement' AND id NOT IN (SELECT id FROM items WHERE kind='announcement' ORDER BY modified DESC LIMIT 500)")
      db.setTransactionSuccessful()
    } finally { db.endTransaction() }
    return changed
  }
}
