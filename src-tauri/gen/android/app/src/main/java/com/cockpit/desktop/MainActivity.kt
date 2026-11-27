package com.cockpit.desktop

import android.app.Activity
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // Le pont vers l'interface (window.CockpitAndroid) : garder l'écran allumé pendant un focus.
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
}
