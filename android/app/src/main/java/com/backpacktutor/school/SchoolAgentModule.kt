package com.backpacktutor.school

import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject
import java.lang.ref.WeakReference
import java.util.concurrent.Executors

class SchoolAgentModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  private val executor = Executors.newSingleThreadExecutor()
  init { active = WeakReference(this) }
  override fun getName() = "SchoolAgent"
  companion object {
    private var active = WeakReference<SchoolAgentModule>(null)
    fun changed() {
      val module = active.get() ?: return
      if (module.context.hasActiveReactInstance()) module.context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("SchoolAgentChanged", null)
    }
  }
  private fun run(promise: Promise, action: () -> Any?) {
    executor.execute { try { promise.resolve(action()) } catch (e: Exception) { promise.reject("SCHOOL_AGENT", e.message ?: "School assistant is unavailable.") } }
  }
  private fun snapshot(): String {
    val p = SchoolAuth.prefs(context)
    val manager = context.getSystemService(ConnectivityManager::class.java)
    val capabilities = manager.getNetworkCapabilities(manager.activeNetwork)
    val provider = SchoolConnection.provider(context)
    val state = JSONObject().put("provider", provider)
      .put("googleConfigured", !p.getString("googleClient", "").isNullOrBlank())
      .put("microsoftConfigured", !p.getString("client", "").isNullOrBlank())
      .put("configured", !p.getString(if (provider == "google") "googleClient" else "client", "").isNullOrBlank())
      .put("connected", SchoolConnection.connected(context))
      .put("account", p.getString("account", "School account"))
      .put("online", capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true)
      .put("lastSync", p.getLong("lastSync", 0)).put("syncing", p.getBoolean("syncing", false) && System.currentTimeMillis() - p.getLong("syncStartedAt", 0) < 10 * 60 * 1000)
      .put("error", p.getString("error", "")).put("warning", p.getString("warning", ""))
      .put("overlayAllowed", Settings.canDrawOverlays(context)).put("bubbleEnabled", AgentBubbleService.running)
      .put("notificationsEnabled", p.getBoolean("notifications", false))
      .put("items", SchoolCache(context).use { it.items() })
    return state.toString()
  }
  @ReactMethod fun getState(promise: Promise) = run(promise) { snapshot() }
  @ReactMethod fun configure(clientId: String, tenant: String, promise: Promise) = run(promise) {
    if (clientId.isNotBlank()) {
      require(clientId.matches(Regex("[0-9a-fA-F-]{36}"))) { "Invalid Microsoft application ID." }
      require(tenant == "organizations" || tenant.matches(Regex("[0-9a-fA-F-]{36}"))) { "Use your school's tenant ID or organizations." }
      val p = SchoolAuth.prefs(context)
      val old = p.getString("client", "")
      if (!old.isNullOrBlank() && old != clientId && p.contains("auth")) throw IllegalStateException("Disconnect the current school account before changing the app registration.")
      p.edit().putString("client", clientId).putString("tenant", tenant).commit()
    }
    AgentWork.schedule(context)
    snapshot()
  }
  @ReactMethod fun signIn(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val activity = context.currentActivity ?: throw IllegalStateException("Open Backpack Tutor to connect your account.")
        if (SchoolConnection.provider(context) == "google") GoogleClassroomAuth.begin(activity) else SchoolAuth.begin(activity)
        promise.resolve(null)
      } catch (e: Exception) { promise.reject("SCHOOL_SIGNIN", e.message) }
    }
  }
  @ReactMethod fun configureGoogle(clientId: String, promise: Promise) = run(promise) {
    if (clientId.isNotBlank()) {
      require(clientId.matches(Regex("[A-Za-z0-9._-]+\\.apps\\.googleusercontent\\.com"))) { "Use the Google Android OAuth client ID." }
      val prefs = SchoolAuth.prefs(context)
      val previous = prefs.getString("googleClient", "")
      if (!previous.isNullOrBlank() && previous != clientId && GoogleClassroomAuth.connected(context)) throw IllegalStateException("Disconnect Classroom before changing its app registration.")
      prefs.edit().putString("googleClient", clientId).commit()
    }
    snapshot()
  }
  @ReactMethod fun setProvider(provider: String, promise: Promise) = run(promise) {
    require(provider == "google" || provider == "microsoft") { "Unknown school provider." }
    synchronized(SchoolAuth.accountLock) {
      if (provider != SchoolConnection.provider(context)) {
        require(!SchoolConnection.connected(context)) { "Disconnect the current school account before switching providers." }
        val prefs = SchoolAuth.prefs(context)
        prefs.edit().putString("provider", provider).putLong("generation", prefs.getLong("generation", 0) + 1).remove("error").remove("warning").remove("retryAt").commit()
      }
    }
    snapshot()
  }
  @ReactMethod fun disconnect(promise: Promise) = run(promise) {
    val p = SchoolAuth.prefs(context)
    synchronized(SchoolAuth.accountLock) {
      p.edit().putLong("generation", p.getLong("generation", 0) + 1).remove("auth").remove("googleAccount").remove("account").remove("lastSync").remove("error").remove("warning").remove("retryAt").putBoolean("syncing", false).commit()
      SchoolCache(context).use { it.clearRemote() }
    }
    androidx.work.WorkManager.getInstance(context).cancelUniqueWork("school-sync-now")
    androidx.work.WorkManager.getInstance(context).cancelUniqueWork("school-sync")
    AgentBubbleService.refresh(context); changed(); snapshot()
  }
  @ReactMethod fun sync(promise: Promise) = run(promise) {
    require(SchoolConnection.connected(context)) { "Connect your school account first." }
    AgentWork.enqueueSync(context); snapshot()
  }
  @ReactMethod fun addTask(title: String, due: Double?, promise: Promise) = run(promise) {
    SchoolCache(context).use { it.add(title, due) }; AgentWork.schedule(context); AgentBubbleService.refresh(context); changed(); snapshot()
  }
  @ReactMethod fun markDone(id: String, done: Boolean, promise: Promise) = run(promise) {
    SchoolCache(context).use { it.mark(id, done) }; AgentBubbleService.refresh(context); changed(); snapshot()
  }
  @ReactMethod fun setNotifications(enabled: Boolean, promise: Promise) = run(promise) {
    SchoolAuth.prefs(context).edit().putBoolean("notifications", enabled).apply(); AgentWork.schedule(context); snapshot()
  }
  @ReactMethod fun openBubblePermission(promise: Promise) {
    try {
      context.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      promise.resolve(null)
    } catch (e: Exception) { promise.reject("BUBBLE_PERMISSION", "Open Android Settings → Apps → Backpack Tutor → Display over other apps.") }
  }
  @ReactMethod fun setBubble(enabled: Boolean, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      try {
        val intent = Intent(context, AgentBubbleService::class.java)
        if (enabled) {
          require(Settings.canDrawOverlays(context)) { "Allow Backpack Tutor to display over other apps first." }
          if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
        } else context.stopService(intent)
        promise.resolve(null)
      } catch (e: Exception) { promise.reject("BUBBLE", e.message) }
    }
  }
  @ReactMethod fun consumePlannerRequest(promise: Promise) {
    UiThreadUtil.runOnUiThread {
      val intent = context.currentActivity?.intent
      val requested = intent?.getBooleanExtra("openSchoolPlanner", false) == true
      intent?.removeExtra("openSchoolPlanner")
      promise.resolve(requested)
    }
  }
  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit
  override fun invalidate() { executor.shutdown(); super.invalidate() }
}

class SchoolAgentPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(SchoolAgentModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
