package com.backpacktutor.school

import android.content.Context

object SchoolConnection {
  fun provider(context: Context): String {
    val prefs = SchoolAuth.prefs(context)
    return prefs.getString("provider", if (prefs.contains("auth")) "microsoft" else "google") ?: "google"
  }
  fun connected(context: Context) = if (provider(context) == "google") GoogleClassroomAuth.connected(context) else SchoolAuth.read(context)?.isAuthorized == true
  fun sync(context: Context) = if (provider(context) == "google") GoogleClassroomSync.run(context) else SchoolSync.run(context)
}
