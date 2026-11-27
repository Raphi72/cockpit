package com.cockpit.desktop

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import java.io.File
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    // L'appli se tient entre les barres d'Android (état en haut, navigation en bas), à l'écart de
    // l'encoche, et au-dessus du clavier quand il s'ouvre : rien ne passe dessous, dès le lancement.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }
  }

  // Le pont vers l'interface (window.CockpitAndroid) : garder l'écran allumé pendant un focus, installer une mise à jour.
  override fun onWebViewCreate(webView: WebView) {
    webView.addJavascriptInterface(CockpitBridge(this), "CockpitAndroid")
  }
}

class CockpitBridge(private val activity: Activity) {
  @JavascriptInterface
  fun keepScreenOn(on: Boolean) {
    activity.runOnUiThread {
      if (on) {
        activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      } else {
        activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
    }
  }

  /** Ouvre l'écran « Installer » d'Android pour un APK téléchargé dans le cache de l'appli (et seulement là). */
  @JavascriptInterface
  fun installApk(path: String) {
    val file = File(path).canonicalFile
    if (!file.path.startsWith(activity.cacheDir.canonicalPath) || !file.name.endsWith(".apk") || !file.exists()) return
    activity.runOnUiThread {
      val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      activity.startActivity(intent)
    }
  }
}
