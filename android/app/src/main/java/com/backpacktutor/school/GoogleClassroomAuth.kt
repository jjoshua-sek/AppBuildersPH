package com.backpacktutor.school

import android.accounts.Account
import android.accounts.AccountManager
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.google.android.gms.auth.api.identity.AuthorizationRequest
import com.google.android.gms.auth.api.identity.AuthorizationResult
import com.google.android.gms.auth.api.identity.Identity
import com.google.android.gms.common.AccountPicker
import com.google.android.gms.common.api.Scope
import com.google.android.gms.tasks.Tasks
import java.util.concurrent.TimeUnit

/** Google Play services manages short-lived tokens; they are never persisted by our app or sent to JS. */
object GoogleClassroomAuth {
  val scopeNames = listOf(
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.coursework.me.readonly",
    "https://www.googleapis.com/auth/classroom.announcements.readonly"
  )
  fun connected(context: Context) = !SchoolAuth.prefs(context).getString("googleAccount", "").isNullOrBlank()
  fun request(email: String): AuthorizationRequest = AuthorizationRequest.builder()
    .setAccount(Account(email, "com.google")).setRequestedScopes(scopeNames.map { Scope(it) })
    .setOptOutIncludingGrantedScopes(true).build()
  fun begin(activity: Activity) {
    val prefs = SchoolAuth.prefs(activity)
    require(!prefs.getString("googleClient", "").isNullOrBlank()) { "Google Classroom needs its Android OAuth registration first." }
    activity.startActivity(Intent(activity, GoogleClassroomAuthActivity::class.java).putExtra("generation", prefs.getLong("generation", 0)))
  }
  /** Worker thread only. If consent is needed again, leave cached notes available and ask for reconnect. */
  fun token(context: Context): String {
    val email = SchoolAuth.prefs(context).getString("googleAccount", "") ?: ""
    require(email.isNotBlank()) { "Connect Google Classroom first." }
    val result = Tasks.await(Identity.getAuthorizationClient(context).authorize(request(email)), 45, TimeUnit.SECONDS)
    check(!result.hasResolution()) { "Please reconnect Google Classroom to renew read access." }
    check(result.grantedScopes.containsAll(scopeNames) && !result.accessToken.isNullOrBlank()) { "Google Classroom read access was not granted. Reconnect your account." }
    return result.accessToken!!
  }
}

class GoogleClassroomAuthActivity : Activity() {
  private var email = ""
  private var generation = 0L
  private var waiting = false
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    generation = savedInstanceState?.getLong("generation") ?: intent.getLongExtra("generation", -1)
    email = savedInstanceState?.getString("email") ?: ""
    waiting = savedInstanceState?.getBoolean("waiting") ?: false
    if (waiting) return
    if (email.isNotBlank()) authorize() else {
      try {
        waiting = true
        val options = AccountPicker.AccountChooserOptions.Builder().setAllowableAccountsTypes(listOf("com.google")).setAlwaysShowAccountPicker(true).setTitleOverrideText("Choose your Classroom account").build()
        startActivityForResult(AccountPicker.newChooseAccountIntent(options), 9103)
      } catch (_: Exception) { fail("Google account selection is unavailable. Check that Google Play services is installed.") }
    }
  }
  override fun onSaveInstanceState(out: Bundle) {
    out.putLong("generation", generation); out.putString("email", email); out.putBoolean("waiting", waiting)
    super.onSaveInstanceState(out)
  }
  private fun fail(message: String) {
    SchoolAuth.prefs(this).edit().putString("error", message).apply()
    SchoolAgentModule.changed(); finish()
  }
  private fun authorize() {
    waiting = false
    Identity.getAuthorizationClient(this).authorize(GoogleClassroomAuth.request(email))
      .addOnSuccessListener { result ->
        if (isFinishing || isDestroyed) return@addOnSuccessListener
        if (result.hasResolution()) {
          try {
            waiting = true
            startIntentSenderForResult(result.pendingIntent!!.intentSender, 9104, null, 0, 0, 0)
          } catch (_: Exception) { fail("Google could not open the Classroom consent screen.") }
        } else complete(result)
      }.addOnFailureListener {
        if (!isFinishing && !isDestroyed) fail("Google could not authorize Classroom. Check the Android OAuth registration, internet connection, test-user list, and school restrictions.")
      }
  }
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != 9103 && requestCode != 9104) return
    waiting = false
    if (resultCode != RESULT_OK) { fail("Google Classroom connection cancelled."); return }
    if (requestCode == 9103) {
      email = data?.getStringExtra(AccountManager.KEY_ACCOUNT_NAME) ?: ""
      if (email.isBlank()) fail("Choose a Google account to continue.") else authorize()
    } else try { complete(Identity.getAuthorizationClient(this).getAuthorizationResultFromIntent(data)) }
      catch (_: Exception) { fail("Google Classroom read access was not granted.") }
  }
  private fun complete(result: AuthorizationResult) {
    if (result.hasResolution() || result.accessToken.isNullOrBlank() || !result.grantedScopes.containsAll(GoogleClassroomAuth.scopeNames)) {
      fail("Allow read access to courses, your coursework, and announcements to connect Classroom."); return
    }
    synchronized(SchoolAuth.accountLock) {
      val prefs = SchoolAuth.prefs(this)
      if (generation != prefs.getLong("generation", 0)) { finish(); return }
      val sameAccount = prefs.getString("googleAccount", "") == email && SchoolConnection.provider(this) == "google"
      if (!sameAccount) SchoolCache(this).use { it.clearRemote() }
      val edit = prefs.edit().putString("provider", "google").putString("googleAccount", email)
        .putString("account", email).putLong("generation", generation + 1).remove("error").remove("warning")
      if (!sameAccount) edit.remove("lastSync")
      edit.commit()
    }
    AgentWork.enqueueSync(this); SchoolAgentModule.changed(); finish()
  }
}
