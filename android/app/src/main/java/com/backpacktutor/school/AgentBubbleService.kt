package com.backpacktutor.school

import android.app.*
import android.content.*
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.*
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.*
import androidx.core.app.NotificationCompat
import com.backpacktutor.MainActivity
import com.backpacktutor.R
import com.facebook.react.ReactApplication
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.UUID

/**
 * Native floating bubble with two tabs. To-do shows the saved checklist (it works
 * without Metro or an AI session). Chat sends each question to the JS side, which
 * answers deadline questions from these same saved tasks and other questions from
 * the student's notes, and sends the reply back through reply().
 */
class AgentBubbleService : Service() {
  companion object {
    @Volatile var running = false
    private const val REFRESH = "com.backpacktutor.SCHOOL_REFRESH"
    private const val REPLY = "com.backpacktutor.BUBBLE_REPLY"
    private const val DAY = 86_400_000L
    fun refresh(context: Context) { context.sendBroadcast(Intent(REFRESH).setPackage(context.packageName)) }
    /** Called from JS when a chat answer is ready. */
    fun reply(context: Context, id: String, text: String) {
      context.sendBroadcast(Intent(REPLY).setPackage(context.packageName).putExtra("id", id).putExtra("text", text))
    }
  }

  private class Msg(val mine: Boolean, val text: String)

  /** The overlay root; Back collapses the panel instead of being swallowed. */
  private inner class Root : LinearLayout(this@AgentBubbleService) {
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
      if (event.keyCode == KeyEvent.KEYCODE_BACK && expanded) {
        if (event.action == KeyEvent.ACTION_UP) { collapse() }
        return true
      }
      return super.dispatchKeyEvent(event)
    }
  }

  private lateinit var manager: WindowManager
  private lateinit var root: Root
  private lateinit var params: WindowManager.LayoutParams
  private val handler = Handler(Looper.getMainLooper())
  private var expanded = false
  private var registered = false
  private var tab = 0 // 0 = To-do, 1 = Chat
  private val messages = mutableListOf<Msg>()
  private var waitingId: String? = null
  private var draft = ""
  private var messagesBox: LinearLayout? = null
  private var messagesScroll: ScrollView? = null
  private var sendButton: TextView? = null

  private val timeout = Runnable {
    if (waitingId != null) {
      waitingId = null
      messages.add(Msg(false, "I couldn't reach the tutor. Open Backpack Tutor and try again."))
      showMessages()
    }
  }

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context?, intent: Intent?) {
      if (intent?.action == REPLY) {
        val text = intent.getStringExtra("text")
        if (!text.isNullOrBlank()) messages.add(Msg(false, text))
        if (intent.getStringExtra("id") == waitingId) { waitingId = null; handler.removeCallbacks(timeout) }
        if (expanded && tab == 1) showMessages() else render()
      } else if (!(expanded && tab == 1)) {
        render() // task changes never rebuild the chat, so typing is not interrupted
      }
    }
  }

  private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
  private fun shape(color: String, radius: Int, stroke: String? = null) = GradientDrawable().apply {
    setColor(Color.parseColor(color)); cornerRadius = dp(radius).toFloat()
    if (stroke != null) setStroke(dp(1), Color.parseColor(stroke))
  }
  private fun text(value: String, size: Float = 14f, bold: Boolean = false, color: String = "#FFFFFF") = TextView(this).apply {
    this.text = value; textSize = size; setTextColor(Color.parseColor(color)); if (bold) setTypeface(typeface, Typeface.BOLD)
  }
  private fun lp(w: Int, h: Int, top: Int = 0, bottom: Int = 0) = LinearLayout.LayoutParams(w, h).apply { setMargins(0, dp(top), 0, dp(bottom)) }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    if (!Settings.canDrawOverlays(this)) { stopSelf(); return }
    val notifications = getSystemService(NotificationManager::class.java)
    notifications.createNotificationChannel(NotificationChannel("study-bubble", "Floating study assistant", NotificationManager.IMPORTANCE_LOW))
    val stop = PendingIntent.getService(this, 4201, Intent(this, AgentBubbleService::class.java).setAction("STOP"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val open = PendingIntent.getActivity(this, 4202, Intent(this, MainActivity::class.java).putExtra("openSchoolPlanner", true), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    startForeground(4201, NotificationCompat.Builder(this, "study-bubble").setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Backpack study assistant")
      .setContentText("Tap the floating bubble for your tasks and the tutor chat.").setContentIntent(open).setOngoing(true).addAction(0, "Hide bubble", stop).build())
    manager = getSystemService(WindowManager::class.java)
    root = Root().apply { orientation = LinearLayout.VERTICAL }
    params = WindowManager.LayoutParams(dp(56), dp(56), WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN, PixelFormat.TRANSLUCENT).apply {
        gravity = Gravity.TOP or Gravity.START; x = resources.displayMetrics.widthPixels - dp(72); y = dp(180)
      }
    try { manager.addView(root, params) } catch (_: Exception) { stopSelf(); return }
    messages.add(Msg(false, "Hi! Ask me what you've missed, what to do first, or anything about your notes."))
    val filter = IntentFilter().apply { addAction(REFRESH); addAction(REPLY) }
    if (Build.VERSION.SDK_INT >= 33) registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED) else registerReceiver(receiver, filter)
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

  private fun collapse() {
    hideKeyboard(); expanded = false; render()
  }

  private fun hideKeyboard() {
    getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(root.windowToken, 0)
  }

  // ---- dates ----------------------------------------------------------------------------------

  private fun startOfDay(t: Long) = Calendar.getInstance().apply {
    timeInMillis = t; set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
  }.timeInMillis
  private fun dayDiff(due: Long, now: Long) = Math.round((startOfDay(due) - startOfDay(now)) / DAY.toDouble()).toInt()
  private fun fmtDate(t: Long) = SimpleDateFormat("MMM d", Locale.US).format(Date(t))
  private fun fmtTime(t: Long) = SimpleDateFormat("h:mm a", Locale.US).format(Date(t))

  /** The chip text and colour for a due date. */
  private fun dueChip(due: Long, now: Long): Pair<String, String> {
    val days = dayDiff(due, now)
    return when {
      due < now && days == 0 -> "Was due today ${fmtTime(due)}" to "#FF4B55"
      due < now -> "Overdue · ${fmtDate(due)}" to "#FF4B55"
      days == 0 -> "Due today ${fmtTime(due)}" to "#FFB020"
      days == 1 -> "Due tomorrow" to "#1FC8A6"
      days <= 3 -> "Due ${fmtDate(due)}" to "#1FC8A6"
      else -> "Due ${fmtDate(due)}" to "#5B6488"
    }
  }

  // ---- layout ---------------------------------------------------------------------------------

  private fun applyWindow() {
    val screenW = resources.displayMetrics.widthPixels
    val screenH = resources.displayMetrics.heightPixels
    if (!expanded) {
      params.width = dp(56); params.height = dp(56)
      params.flags = params.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
    } else {
      params.width = minOf(dp(340), screenW - dp(24))
      if (tab == 1) {
        // Chat needs the keyboard: make the window focusable and keep it in the top half.
        params.height = minOf(dp(440), (screenH * 0.52).toInt())
        params.y = dp(36)
        params.flags = params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()
        params.softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
      } else {
        params.height = minOf(dp(520), screenH - dp(100))
        params.flags = params.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
      }
      params.x = params.x.coerceAtMost(maxOf(0, screenW - params.width))
      params.y = params.y.coerceAtMost(maxOf(dp(24), screenH - params.height - dp(24)))
    }
  }

  private fun render() {
    if (!::root.isInitialized) return
    if (!Settings.canDrawOverlays(this)) { stopSelf(); return }
    root.removeAllViews()
    messagesBox = null; messagesScroll = null; sendButton = null
    applyWindow()
    if (!expanded) renderBubble() else renderPanel()
    if (running) manager.updateViewLayout(root, params)
  }

  private fun renderBubble() {
    root.background = null
    root.setPadding(0, 0, 0, 0)
    val now = System.currentTimeMillis()
    var late = 0; var today = 0
    val items = SchoolCache(this).use { it.items() }
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      if (item.getBoolean("done") || item.getString("kind") == "announcement" || item.isNull("due")) continue
      val due = item.getLong("due")
      if (due < now) late++ else if (dayDiff(due, now) == 0) today++
    }
    val frame = FrameLayout(this)
    val robot = ImageView(this).apply {
      setImageResource(R.drawable.tutor_bubble_robot)
      scaleType = ImageView.ScaleType.FIT_CENTER
      contentDescription = "Open Backpack Tutor assistant"
    }
    frame.addView(robot, FrameLayout.LayoutParams(-1, -1))
    val count = if (late > 0) late else today
    if (count > 0) {
      val badge = text(if (count > 9) "9+" else count.toString(), 10f, true).apply {
        gravity = Gravity.CENTER
        background = shape(if (late > 0) "#FF4B55" else "#FFB020", 10)
        setPadding(dp(5), dp(1), dp(5), dp(1))
        contentDescription = if (late > 0) "$late overdue" else "$today due today"
      }
      frame.addView(badge, FrameLayout.LayoutParams(-2, -2, Gravity.TOP or Gravity.END))
    }
    root.addView(frame, LinearLayout.LayoutParams(-1, -1))
    drag(frame) { expanded = true; render() }
  }

  private fun renderPanel() {
    root.background = shape("#0E1838", 22, "#2B3A73")
    root.setPadding(dp(10), dp(10), dp(10), dp(8))

    // Header: robot, title, collapse. The whole row drags the panel.
    val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val face = ImageView(this).apply { setImageResource(R.drawable.tutor_bubble_robot); scaleType = ImageView.ScaleType.FIT_CENTER }
    header.addView(face, LinearLayout.LayoutParams(dp(34), dp(34)))
    val titles = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(8), 0, 0, 0) }
    titles.addView(text("Backpack Tutor", 15f, true))
    titles.addView(text(summary(), 11f, false, "#AEB8DA"))
    header.addView(titles, LinearLayout.LayoutParams(0, -2, 1f))
    val close = text("✕", 16f, true, "#AEB8DA").apply {
      setPadding(dp(10), dp(6), dp(6), dp(6)); contentDescription = "Collapse"
      setOnClickListener { collapse() }
    }
    header.addView(close)
    root.addView(header, lp(-1, -2, 0, 8))
    drag(header) { }

    // Tabs.
    val tabs = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    for ((index, name) in listOf("To-do", "Chat").withIndex()) {
      val selected = tab == index
      val pill = text(name, 13f, true, if (selected) "#FFFFFF" else "#AEB8DA").apply {
        gravity = Gravity.CENTER
        background = if (selected) shape("#7864DB", 16) else shape("#16224A", 16, "#2B3A73")
        setPadding(dp(14), dp(7), dp(14), dp(7))
        setOnClickListener { if (tab != index) { hideKeyboard(); tab = index; render() } }
      }
      tabs.addView(pill, LinearLayout.LayoutParams(0, -2, 1f).apply { setMargins(0, 0, if (index == 0) dp(6) else 0, 0) })
    }
    root.addView(tabs, lp(-1, -2, 0, 8))

    val content = FrameLayout(this)
    root.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))
    if (tab == 0) content.addView(todoView(), FrameLayout.LayoutParams(-1, -1)) else content.addView(chatView(), FrameLayout.LayoutParams(-1, -1))

    val hide = text("Hide bubble", 12f, false, "#AEB8DA").apply {
      gravity = Gravity.CENTER; setPadding(dp(8), dp(8), dp(8), dp(2))
      setOnClickListener { stopSelf() }
    }
    root.addView(hide, lp(-1, -2))
  }

  private fun summary(): String {
    val now = System.currentTimeMillis()
    var open = 0; var late = 0
    val items = SchoolCache(this).use { it.items() }
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      if (item.getBoolean("done") || item.getString("kind") == "announcement") continue
      open++
      if (!item.isNull("due") && item.getLong("due") < now) late++
    }
    val last = SchoolAuth.prefs(this).getLong("lastSync", 0)
    val synced = if (last == 0L) "saved on this phone" else "synced " + SimpleDateFormat("MMM d, h:mm a", Locale.US).format(Date(last))
    return (if (open == 0) "All caught up" else "$open open" + (if (late > 0) " · $late overdue" else "")) + " · " + synced
  }

  // ---- To-do tab ------------------------------------------------------------------------------

  private fun heading(value: String, color: String) = text(value.uppercase(Locale.US), 11f, true, color).apply { setPadding(dp(4), dp(8), 0, dp(4)) }

  private fun taskRow(item: JSONObject, now: Long): View {
    val row = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
      background = shape("#16224A", 14, "#2B3A73"); setPadding(dp(6), dp(8), dp(12), dp(8))
    }
    val box = CheckBox(this).apply {
      buttonTintList = ColorStateList.valueOf(Color.parseColor("#67DDD5"))
      contentDescription = "Mark done"
      setOnCheckedChangeListener { _, checked ->
        if (checked) { SchoolCache(this@AgentBubbleService).use { it.mark(item.getString("id"), true) }; render(); SchoolAgentModule.changed() }
      }
    }
    val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    column.addView(text(item.getString("title"), 14f, true))
    val course = item.getString("course")
    if (course.isNotBlank() && course != "My tasks") column.addView(text(course, 11f, false, "#AEB8DA"))
    if (!item.isNull("due")) {
      val (label, color) = dueChip(item.getLong("due"), now)
      val chip = text(label, 11f, true, "#FFFFFF").apply { background = shape(color, 10); setPadding(dp(8), dp(2), dp(8), dp(2)) }
      column.addView(chip, lp(-2, -2, 4))
    }
    row.addView(box)
    row.addView(column, LinearLayout.LayoutParams(0, -2, 1f))
    return row
  }

  private fun todoView(): View {
    val scroll = ScrollView(this)
    val list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    scroll.addView(list)
    val now = System.currentTimeMillis()
    val items = SchoolCache(this).use { it.items() }
    val groups = linkedMapOf(
      "Overdue" to (mutableListOf<JSONObject>() to "#FF4B55"),
      "Next 7 days" to (mutableListOf<JSONObject>() to "#FFB020"),
      "Later" to (mutableListOf<JSONObject>() to "#67DDD5"),
      "No due date" to (mutableListOf<JSONObject>() to "#AEB8DA"),
    )
    val posts = mutableListOf<JSONObject>()
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      if (item.getBoolean("done")) continue
      if (item.getString("kind") == "announcement") { posts.add(item); continue }
      val key = when {
        item.isNull("due") -> "No due date"
        item.getLong("due") < now -> "Overdue"
        item.getLong("due") < now + 7 * DAY -> "Next 7 days"
        else -> "Later"
      }
      groups.getValue(key).first.add(item)
    }
    var any = false
    for ((name, pair) in groups) {
      val (rows, color) = pair
      if (rows.isEmpty()) continue
      any = true
      list.addView(heading("$name · ${rows.size}", color))
      for (item in rows) list.addView(taskRow(item, now), lp(-1, -2, 0, 6))
    }
    if (posts.isNotEmpty()) {
      list.addView(heading("Announcements · ${posts.size}", "#AEB8DA"))
      for (post in posts.take(5)) {
        val card = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; background = shape("#16224A", 14, "#2B3A73"); setPadding(dp(12), dp(8), dp(12), dp(8)) }
        card.addView(text(post.getString("course"), 11f, false, "#AEB8DA"))
        card.addView(text(post.getString("title"), 14f, true))
        card.addView(text(post.getString("body").take(160), 12f, false, "#D7DFF8"))
        card.addView(text("Mark read", 12f, true, "#67DDD5").apply {
          setPadding(0, dp(6), 0, 0)
          setOnClickListener { SchoolCache(this@AgentBubbleService).use { it.mark(post.getString("id"), true) }; render(); SchoolAgentModule.changed() }
        })
        list.addView(card, lp(-1, -2, 0, 6))
      }
    }
    if (!any && posts.isEmpty()) {
      list.addView(text("You're all caught up. Add a task or connect your school account in the app.", 13f, false, "#AEB8DA").apply { setPadding(dp(4), dp(16), dp(4), dp(16)) })
    }
    return scroll
  }

  // ---- Chat tab -------------------------------------------------------------------------------

  private fun bubbleView(value: String, mine: Boolean): View {
    val message = text(value, 14f).apply {
      maxWidth = dp(250)
      background = if (mine) shape("#7864DB", 16) else shape("#243366", 16)
      setPadding(dp(12), dp(8), dp(12), dp(8))
    }
    val wrap = LinearLayout(this).apply { gravity = if (mine) Gravity.END else Gravity.START }
    wrap.addView(message)
    return wrap
  }

  private fun showMessages() {
    val box = messagesBox ?: return
    box.removeAllViews()
    for (m in messages) box.addView(bubbleView(m.text, m.mine), lp(-1, -2, 0, 6))
    if (waitingId != null) box.addView(bubbleView("Thinking…", false), lp(-1, -2, 0, 6))
    sendButton?.alpha = if (waitingId != null) 0.4f else 1f
    messagesScroll?.post { messagesScroll?.fullScroll(View.FOCUS_DOWN) }
  }

  private fun startJs() {
    // The bubble can outlive the app screen: make sure the JS side is running to answer.
    try { (application as? ReactApplication)?.reactHost?.start() } catch (_: Exception) { }
  }

  private fun ask(question: String) {
    val q = question.trim()
    if (q.isEmpty() || waitingId != null) return
    val id = UUID.randomUUID().toString()
    messages.add(Msg(true, q)); waitingId = id; draft = ""
    handler.removeCallbacks(timeout); handler.postDelayed(timeout, 60_000)
    startJs()
    SchoolAgentModule.ask(id, q)
    showMessages()
  }

  private fun chatView(): View {
    val column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    val scroll = ScrollView(this)
    val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
    scroll.addView(box)
    column.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
    messagesBox = box; messagesScroll = scroll

    val chips = HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false }
    val chipRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    for (q in listOf("What did I miss?", "What should I prioritize?", "Due this week?")) {
      val chip = text(q, 12f, true, "#67DDD5").apply {
        background = shape("#16224A", 14, "#67DDD5"); setPadding(dp(10), dp(5), dp(10), dp(5))
        setOnClickListener { ask(q) }
      }
      chipRow.addView(chip, LinearLayout.LayoutParams(-2, -2).apply { setMargins(0, 0, dp(6), 0) })
    }
    chips.addView(chipRow)
    column.addView(chips, lp(-1, -2, 4, 6))

    val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val input = EditText(this).apply {
      hint = "Ask about your tasks or notes"
      setHintTextColor(Color.parseColor("#7C87B0")); setTextColor(Color.WHITE); textSize = 14f
      background = shape("#16224A", 20, "#2B3A73"); setPadding(dp(14), dp(8), dp(14), dp(8))
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
      imeOptions = EditorInfo.IME_ACTION_SEND; setSingleLine(true)
      setText(draft)
      addTextChangedListener(object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) { draft = s?.toString() ?: "" }
        override fun afterTextChanged(s: Editable?) = Unit
      })
      setOnEditorActionListener { view, actionId, _ ->
        if (actionId == EditorInfo.IME_ACTION_SEND) { val q = view.text.toString(); view.setText(""); ask(q); true } else false
      }
    }
    val send = text("➤", 18f, true).apply {
      gravity = Gravity.CENTER; background = shape("#7864DB", 20); contentDescription = "Send"
      setOnClickListener { val q = input.text.toString(); input.setText(""); ask(q) }
    }
    sendButton = send
    bar.addView(input, LinearLayout.LayoutParams(0, -2, 1f))
    bar.addView(send, LinearLayout.LayoutParams(dp(40), dp(40)).apply { setMargins(dp(6), 0, 0, 0) })
    column.addView(bar)

    showMessages()
    return column
  }

  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    if (registered) unregisterReceiver(receiver)
    if (::root.isInitialized) try { manager.removeView(root) } catch (_: Exception) { }
    running = false; SchoolAgentModule.changed(); super.onDestroy()
  }
}
