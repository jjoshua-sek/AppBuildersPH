package com.backpacktutor.school

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import net.openid.appauth.*
import java.security.KeyStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Tokens never cross the React Native bridge or enter the ordinary task database. */
object SchoolAuth {
  const val REDIRECT = "com.backpacktutor://oauth/microsoft"
  private const val KEY = "backpack-school-tokens"
  private val refreshLock = Any()
  val accountLock = Any()
  val scopes = listOf("openid", "profile", "offline_access", "https://graph.microsoft.com/User.Read", "https://graph.microsoft.com/EduAssignments.ReadBasic", "https://graph.microsoft.com/Team.ReadBasic.All", "https://graph.microsoft.com/Channel.ReadBasic.All", "https://graph.microsoft.com/ChannelMessage.Read.All")
  fun prefs(context: Context) = context.getSharedPreferences("school-agent", Context.MODE_PRIVATE)

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(KEY, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(KEY, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @Synchronized fun save(context: Context, state: AuthState) {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    val encrypted = cipher.doFinal(state.jsonSerializeString().toByteArray(Charsets.UTF_8))
    prefs(context).edit().putString("auth", Base64.encodeToString(cipher.iv + encrypted, Base64.NO_WRAP)).commit()
  }
  @Synchronized fun read(context: Context): AuthState? {
    val encoded = prefs(context).getString("auth", null) ?: return null
    return try {
      val bytes = Base64.decode(encoded, Base64.NO_WRAP)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12))) }
      AuthState.jsonDeserialize(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
    } catch (_: Exception) {
      prefs(context).edit().remove("auth").putString("error", "Please reconnect your school account.").commit()
      null
    }
  }

  fun begin(activity: Activity) {
    val p = prefs(activity)
    val client = p.getString("client", "") ?: ""
    val tenant = p.getString("tenant", "organizations") ?: "organizations"
    require(client.matches(Regex("[0-9a-fA-F-]{36}"))) { "The Microsoft connection has not been configured yet." }
    val config = AuthorizationServiceConfiguration(Uri.parse("https://login.microsoftonline.com/$tenant/oauth2/v2.0/authorize"), Uri.parse("https://login.microsoftonline.com/$tenant/oauth2/v2.0/token"))
    val request = AuthorizationRequest.Builder(config, client, ResponseTypeValues.CODE, Uri.parse(REDIRECT)).setScopes(scopes).setPrompt("select_account").build()
    val intent = Intent(activity, SchoolAuthActivity::class.java).putExtra("authGeneration", p.getLong("generation", 0))
    // AppAuth fills in the authorization response; the pending intent must be mutable.
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or if (android.os.Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0
    val done = PendingIntent.getActivity(activity, 9101, intent, flags)
    val service = AuthorizationService(activity)
    service.performAuthorizationRequest(request, done, done)
    service.dispose()
  }

  /** Called on a background executor; AppAuth handles PKCE, state checks and token refresh. */
  fun token(context: Context): String = synchronized(refreshLock) {
    val original = prefs(context).getString("auth", null)
    val state = read(context) ?: throw IllegalStateException("Connect Microsoft Teams first.")
    require(state.isAuthorized) { "Please reconnect Microsoft Teams." }
    val service = AuthorizationService(context)
    val latch = CountDownLatch(1)
    var access: String? = null
    var failure: AuthorizationException? = null
    state.performActionWithFreshTokens(service) { token, _, error ->
      access = token; failure = error
      // Do not resurrect credentials after the user disconnected during a refresh.
      if (prefs(context).getString("auth", null) == original) save(context, state)
      latch.countDown()
    }
    val completed = latch.await(45, TimeUnit.SECONDS)
    service.dispose()
    if (!completed) throw IllegalStateException("Microsoft sign-in timed out. Try again online.")
    if (failure != null || access.isNullOrBlank()) throw IllegalStateException("Your school account needs to reconnect.")
    access!!
  }
}

class SchoolAuthActivity : Activity() {
  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    val response = AuthorizationResponse.fromIntent(intent)
    val generation = intent.getLongExtra("authGeneration", -1)
    val failure = AuthorizationException.fromIntent(intent)
    if (response == null) {
      SchoolAuth.prefs(this).edit().putString("error", if (failure?.code == AuthorizationException.GeneralErrors.USER_CANCELED_AUTH_FLOW.code) "Sign-in cancelled." else "Microsoft sign-in was not completed. Check your school's app permissions.").apply()
      SchoolAgentModule.changed(); finish(); return
    }
    val service = AuthorizationService(this)
    service.performTokenRequest(response.createTokenExchangeRequest()) { tokens, error ->
      if (tokens == null) {
        SchoolAuth.prefs(this).edit().putString("error", "Microsoft could not complete sign-in. Check the app registration and school consent.").apply()
      } else {
        val state = AuthState(response, failure).apply { update(tokens, error) }
        synchronized(SchoolAuth.accountLock) {
          val preferences = SchoolAuth.prefs(this)
          if (generation != preferences.getLong("generation", 0)) {
            service.dispose(); SchoolAgentModule.changed(); finish(); return@performTokenRequest
          }
          preferences.edit().putString("provider", "microsoft").putLong("generation", preferences.getLong("generation", 0) + 1).remove("lastSync").remove("account").commit()
          SchoolCache(this).use { it.clearRemote() }
          SchoolAuth.save(this, state)
        }
        SchoolAuth.prefs(this).edit().remove("error").apply()
        AgentWork.enqueueSync(this)
      }
      service.dispose(); SchoolAgentModule.changed(); finish()
    }
  }
}
