package com.backpacktutor.school

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.*
import com.backpacktutor.MainActivity
import java.util.concurrent.TimeUnit

object AgentWork {
  const val CHANNEL = "school-updates"
  private fun network() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
  fun schedule(context: Context) {
    val work = WorkManager.getInstance(context)
    work.enqueueUniquePeriodicWork("school-sync", ExistingPeriodicWorkPolicy.KEEP,
      PeriodicWorkRequest.Builder(SchoolSyncWorker::class.java, 15, TimeUnit.MINUTES).setConstraints(network()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES).build())
    // Reminders read the cache, so they also work when the phone has no network.
    work.enqueueUniquePeriodicWork("school-reminders", ExistingPeriodicWorkPolicy.KEEP,
      PeriodicWorkRequest.Builder(SchoolReminderWorker::class.java, 15, TimeUnit.MINUTES).build())
  }
  fun enqueueSync(context: Context) {
    schedule(context)
    WorkManager.getInstance(context).enqueueUniqueWork("school-sync-now", ExistingWorkPolicy.KEEP,
      OneTimeWorkRequest.Builder(SchoolSyncWorker::class.java).setConstraints(network()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES).build())
  }
  fun notifyChanges(context: Context, changes: Int) = notify(context, "School updates", "$changes new or updated school items. Open your study planner.", 4102)
  fun notify(context: Context, title: String, body: String, id: Int) {
    if (!SchoolAuth.prefs(context).getBoolean("notifications", false)) return
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "School updates and reminders", NotificationManager.IMPORTANCE_DEFAULT))
    val intent = Intent(context, MainActivity::class.java).putExtra("openSchoolPlanner", true)
    val pending = PendingIntent.getActivity(context, 4102, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    manager.notify(id, NotificationCompat.Builder(context, CHANNEL).setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body)).setContentIntent(pending).setAutoCancel(true).build())
  }
}

class SchoolSyncWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    if (!SchoolConnection.connected(applicationContext)) return Result.success()
    return try { SchoolConnection.sync(applicationContext); Result.success() }
    catch (e: SchoolHttpError) { if (e.status == 401 || e.status == 403) Result.failure() else Result.retry() }
    catch (_: Exception) { if (runAttemptCount < 4) Result.retry() else Result.failure() }
  }
}

class SchoolReminderWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
  override fun doWork(): Result {
    val p = SchoolAuth.prefs(applicationContext)
    if (!p.getBoolean("notifications", false)) return Result.success()
    return try {
      val items = SchoolCache(applicationContext).use { it.items() }
      val now = System.currentTimeMillis()
      var due = 0
      for (i in 0 until items.length()) {
        val item = items.getJSONObject(i)
        if (!item.getBoolean("done") && !item.isNull("due") && item.getLong("due") in now..(now + 24 * 60 * 60 * 1000)) due++
      }
      if (due > 0 && now - p.getLong("lastReminder", 0) > 12 * 60 * 60 * 1000) {
        AgentWork.notify(applicationContext, "Due soon", "$due saved tasks are due within the next 24 hours.", 4103)
        p.edit().putLong("lastReminder", now).apply()
      }
      Result.success()
    } catch (_: Exception) { Result.retry() }
  }
}
