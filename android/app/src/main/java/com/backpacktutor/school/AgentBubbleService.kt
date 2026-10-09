package com.backpacktutor.school

import android.app.*
import android.content.*
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.*
import android.widget.*
import androidx.core.app.NotificationCompat
import com.backpacktutor.MainActivity
import com.backpacktutor.R
import java.text.DateFormat
import java.util.Date

/** Native floating bubble: the cached checklist works even without Metro or an AI session. */
class AgentBubbleService : Service() {
  companion object {
    @Volatile var running = false
    private const val REFRESH = "com.backpacktutor.SCHOOL_REFRESH"
    fun refresh(context: Context) { context.sendBroadcast(Intent(REFRESH).setPackage(context.packageName)) }
  }
  private lateinit var manager: WindowManager
  private lateinit var root: LinearLayout
  private lateinit var params: WindowManager.LayoutParams
  private var expanded = false
  private var registered = false
  private val receiver = object : BroadcastReceiver() { override fun onReceive(context: Context?, intent: Intent?) { render() } }
  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun background(color: String, radius: Int) = GradientDrawable().apply { setColor(Color.parseColor(color)); cornerRadius = dp(radius).toFloat() }
  private fun label(text: String, size: Float = 14f, bold: Boolean = false) = TextView(this).apply {
    this.text = text; textSize = size; setTextColor(Color.WHITE); if (bold) setTypeface(typeface, Typeface.BOLD)
    setPadding(dp(12), dp(8), dp(12), dp(8))
  }
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onCreate() {
    super.onCreate()
    if (!Settings.canDrawOverlays(this)) { stopSelf(); return }
    val notifications = getSystemService(NotificationManager::class.java)
    notifications.createNotificationChannel(NotificationChannel("study-bubble", "Floating study assistant", NotificationManager.IMPORTANCE_LOW))
    val stop = PendingIntent.getService(this, 4201, Intent(this, AgentBubbleService::class.java).setAction("STOP"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val open = PendingIntent.getActivity(this, 4202, Intent(this, MainActivity::class.java).putExtra("openSchoolPlanner", true), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    startForeground(4201, NotificationCompat.Builder(this, "study-bubble").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Backpack study assistant")
      .setContentText("Tap the floating bubble for your saved tasks.").setContentIntent(open).setOngoing(true).addAction(0, "Hide bubble", stop).build())
    manager = getSystemService(WindowManager::class.java)
    root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    params = WindowManager.LayoutParams(dp(56), dp(56), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT).apply {
        gravity = Gravity.TOP or Gravity.START; x = resources.displayMetrics.widthPixels - dp(72); y = dp(180)
      }
    try { manager.addView(root, params) } catch (_: Exception) { stopSelf(); return }
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, IntentFilter(REFRESH), Context.RECEIVER_NOT_EXPORTED) else registerReceiver(receiver, IntentFilter(REFRESH))
    registered = true; running = true; render(); SchoolAgentModule.changed()
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == "STOP") stopSelf()
    return START_NOT_STICKY
  }
  private fun drag(view: View, onClick: () -> Unit) {
    var x = 0; var y = 0; var touchX = 0f; var touchY = 0f; var moved = false
    view.setOnTouchListener { _, event ->
      when (event.action) {
        MotionEvent.ACTION_DOWN -> { x = params.x; y = params.y; touchX = event.rawX; touchY = event.rawY; moved = false; true }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - touchX; val dy = event.rawY - touchY
          if (kotlin.math.abs(dx) + kotlin.math.abs(dy) > dp(6)) moved = true
          params.x = (x + dx.toInt()).coerceIn(0, maxOf(0, resources.displayMetrics.widthPixels - params.width))
          params.y = (y + dy.toInt()).coerceIn(dp(24), maxOf(dp(24), resources.displayMetrics.heightPixels - params.height - dp(24)))
          manager.updateViewLayout(root, params); true
        }
        MotionEvent.ACTION_UP -> { if (!moved) onClick(); true }
        else -> false
      }
    }
  }
  private fun render() {
    if (!::root.isInitialized) return
    if (!Settings.canDrawOverlays(this)) { stopSelf(); return }
    root.removeAllViews()
    if (!expanded) {
      params.width = dp(56); params.height = dp(56)
      root.background = null
      val bubble = ImageView(this).apply {
        setImageResource(R.drawable.tutor_bubble_robot)
        scaleType = ImageView.ScaleType.FIT_CENTER
        contentDescription = "Open saved school tasks"
      }
      root.addView(bubble, LinearLayout.LayoutParams(-1, -1))
      drag(bubble) { expanded = true; render() }
    } else {
      params.width = minOf(dp(330), resources.displayMetrics.widthPixels - dp(24))
      params.height = minOf(dp(460), resources.displayMetrics.heightPixels - dp(100))
      params.x = params.x.coerceAtMost(maxOf(0, resources.displayMetrics.widthPixels - params.width))
      params.y = params.y.coerceAtMost(maxOf(dp(24), resources.displayMetrics.heightPixels - params.height - dp(24)))
      root.background = background("#16224A", 20)
      val heading = label("Your to-do list   ·   Tap to collapse", 16f, true)
      root.addView(heading); drag(heading) { expanded = false; render() }
      val last = SchoolAuth.prefs(this).getLong("lastSync", 0)
      root.addView(label(if (last == 0L) "Saved on this phone" else "Last synced " + DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(last)), 11f))
      val scroll = ScrollView(this)
      val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
      scroll.addView(list); root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
      val items = SchoolCache(this).use { it.items() }
      var count = 0
      for (i in 0 until items.length()) {
        val item = items.getJSONObject(i)
        if (item.getBoolean("done")) continue
        count++
        if (item.getString("kind") == "announcement") {
          list.addView(label(item.getString("course"), 11f))
          list.addView(label(item.getString("title"), 14f, true))
          list.addView(label(item.getString("body").take(220), 12f))
          val read = label("Mark read", 12f).apply { setTextColor(Color.parseColor("#67DDD5")) }
          read.setOnClickListener { SchoolCache(this).use { it.mark(item.getString("id"), true) }; render(); SchoolAgentModule.changed() }
          list.addView(read)
        } else {
          val due = if (item.isNull("due")) "" else "\nDue " + DateFormat.getDateInstance(DateFormat.SHORT).format(Date(item.getLong("due")))
          val box = CheckBox(this).apply { text = item.getString("title") + due; textSize = 14f; setTextColor(Color.WHITE); setPadding(dp(12), dp(8), dp(12), dp(8)) }
          box.setOnCheckedChangeListener { _, checked -> if (checked) { SchoolCache(this).use { it.mark(item.getString("id"), true) }; render(); SchoolAgentModule.changed() } }
          list.addView(box)
        }
      }
      if (count == 0) list.addView(label("You're all caught up. Add a task or connect your school account in the app."))
      val hide = label("Hide bubble", 12f).apply { gravity = Gravity.CENTER }
      hide.setOnClickListener { stopSelf() }; root.addView(hide)
    }
    if (running) manager.updateViewLayout(root, params)
  }
  override fun onDestroy() {
    if (registered) unregisterReceiver(receiver)
    if (::root.isInitialized) try { manager.removeView(root) } catch (_: Exception) { }
    running = false; SchoolAgentModule.changed(); super.onDestroy()
  }
}
