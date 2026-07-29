package com.cavoti.bar

import android.annotation.SuppressLint
import android.app.Dialog
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.enableEdgeToEdge
import androidx.annotation.Keep
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject

class MainActivity : TauriActivity() {
    private var sessionAdapter: WebViewSessionAdapter? = null

    private companion object {
        @Volatile
        private var currentActivity: MainActivity? = null

        init {
            System.loadLibrary("cavoti_bar_lib")
        }

        @JvmStatic
        @Keep
        fun dispatchStartProbe(collectionId: String, script: String, show: Boolean): Boolean {
            return currentActivity?.sessionAdapter?.dispatchStartProbe(collectionId, script, show) == true
        }

        @JvmStatic
        @Keep
        fun dispatchAbortProbe(collectionId: String): Boolean {
            return currentActivity?.sessionAdapter?.dispatchAbortProbe(collectionId) == true
        }

        @JvmStatic
        @Keep
        fun dispatchHideSession(collectionId: String): Boolean {
            return currentActivity?.sessionAdapter?.dispatchHideSession(collectionId) == true
        }

        @JvmStatic
        @Keep
        fun dispatchPrepareForLogin(collectionId: String): Boolean {
            return currentActivity?.sessionAdapter?.dispatchPrepareForLogin(collectionId) == true
        }
    }

    private external fun nativeActivityReady(activity: MainActivity)

    private external fun nativeSubmitAuthResult(payload: String): Boolean

    private external fun nativeAbortAuthCollection(collectionId: String)

    private external fun nativeSessionDocumentReady()

    private external fun nativeAuthCollectionBridgeUnavailable()

    internal fun submitAuthResult(payload: String): Boolean {
        return nativeSubmitAuthResult(payload)
    }

    internal fun abortAuthCollection(collectionId: String) {
        nativeAbortAuthCollection(collectionId)
    }

    internal fun sessionDocumentReady() {
        nativeSessionDocumentReady()
    }

    internal fun authCollectionBridgeUnavailable() {
        nativeAuthCollectionBridgeUnavailable()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        currentActivity = this
        nativeActivityReady(this)
    }

    override fun onWebViewCreate(webView: WebView) {
        val adapter = WebViewSessionAdapter(this, webView)
        sessionAdapter = adapter
    }

    override fun onDestroy() {
        sessionAdapter?.abortNativeCollection()
        sessionAdapter?.destroy()
        sessionAdapter = null
        if (currentActivity === this) currentActivity = null
        super.onDestroy()
    }
}

@Keep
private class LegacyResultBridge(
    private val adapter: WebViewSessionAdapter,
) {
    @JavascriptInterface
    @Keep
    fun postMessage(payload: String) {
        Log.i("CavotiSession", "legacy result received bytes=${payload.toByteArray().size}")
        adapter.handleAuthCollectionResult(payload)
    }
}

@SuppressLint("SetJavaScriptEnabled")
internal class WebViewSessionAdapter(
    private val activity: MainActivity,
    private val mainWebView: WebView,
) {
    private companion object {
        const val LOGIN_URL = "https://cavoti.com/login"
        const val MAX_PAYLOAD_BYTES = 1024 * 1024
        const val MAX_RESULT_BYTES = 64 * 1024
        const val MAX_COLLECTION_ID_BYTES = 128
        const val MAX_PHASE_BYTES = 32
        const val MAX_SESSION_STATE_BYTES = 32
        val REQUIRED_ENDPOINTS = setOf("me", "subscriptions", "stats", "models", "snapshot")
        val KNOWN_ENDPOINTS = setOf(
            "me",
            "subscriptions",
            "stats",
            "models",
            "snapshot",
            "usage",
            "errors",
            "keys",
            "quota",
            "banner",
            "announcements",
            "status",
            "groups",
        )
    }

    private val sessionWebView = WebView(activity)
    private val sessionDialog = Dialog(activity)
    private val resultGate = SessionResultGate()
    private var pendingProbe: String? = null
    @Volatile private var pendingNativeCollectionId: String? = null
    private var awaitingDocumentReadyProbe = false
    private var destroyed = false
    private val webMessageListenerSupported = WebViewFeature.isFeatureSupported(
        WebViewFeature.WEB_MESSAGE_LISTENER,
    )

    init {
        Log.i("CavotiSession", "adapter init webMessageSupported=$webMessageListenerSupported")
        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(sessionWebView, true)

        sessionWebView.settings.javaScriptEnabled = true
        sessionWebView.settings.domStorageEnabled = true
        sessionWebView.settings.databaseEnabled = true
        sessionWebView.settings.loadsImagesAutomatically = true
        sessionWebView.setBackgroundColor(Color.TRANSPARENT)
        sessionWebView.isFocusable = false
        sessionWebView.isFocusableInTouchMode = false
        sessionWebView.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        // The JavaScript interface is available on every supported Android WebView
        // and avoids provider-specific WebMessage delivery failures.
        sessionWebView.addJavascriptInterface(LegacyResultBridge(this), "CavotiAndroidResult")
        if (webMessageListenerSupported) {
            WebViewCompat.addWebMessageListener(
                sessionWebView,
                "CavotiAndroidWebMessageResult",
                setOf("https://cavoti.com"),
                object : WebViewCompat.WebMessageListener {
                    override fun onPostMessage(
                        view: WebView,
                        message: WebMessageCompat,
                        sourceOrigin: Uri,
                        isMainFrame: Boolean,
                        replyProxy: JavaScriptReplyProxy,
                    ) {
                        if (!isMainFrame || !isCavotiOrigin(sourceOrigin)) return
                        message.data?.let(::handleAuthCollectionResult)
                    }
                },
            )
        }
        sessionWebView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest,
            ): Boolean = !isAllowedAuthNavigation(request.url)

            override fun onPageFinished(view: WebView, url: String) {
                val uri = Uri.parse(url)
                val safeUrl = uri.buildUpon().clearQuery().fragment(null).build()
                Log.i("CavotiSession", "page finished url=$safeUrl visible=${sessionWebView.visibility}")
                if (destroyed || !isCavotiOrigin(uri)) return
                if (isOAuthCallback(uri) && !awaitingDocumentReadyProbe &&
                    sessionWebView.visibility == View.VISIBLE
                ) {
                    Log.i("CavotiSession", "OAuth callback received; hiding login layer")
                    setSessionVisible(false)
                }
                if (awaitingDocumentReadyProbe && isProbeDocument(uri) &&
                    sessionWebView.visibility == View.VISIBLE
                ) {
                    awaitingDocumentReadyProbe = false
                    pendingProbe = null
                    activity.sessionDocumentReady()
                    return
                }
                if (!isProbeDocument(uri) && !isOAuthCallback(uri) &&
                    sessionWebView.visibility == View.VISIBLE
                ) return
                pendingProbe?.let { script ->
                    view.evaluateJavascript(script, null)
                }
            }
        }

        sessionDialog.setContentView(sessionWebView)
        sessionDialog.setCancelable(false)
        sessionDialog.setCanceledOnTouchOutside(false)
        setSessionVisible(false)
    }

    internal fun dispatchStartProbe(collectionId: String, script: String, show: Boolean): Boolean =
        startProbe(collectionId, script, show)

    private fun startProbe(collectionId: String, script: String, show: Boolean): Boolean {
        Log.i("CavotiSession", "start requested id=$collectionId show=$show")
        if (collectionId.isBlank()) return false
        synchronized(this) {
            pendingNativeCollectionId = collectionId
        }
        activity.runOnUiThread {
            Log.i("CavotiSession", "start UI callback id=$collectionId destroyed=$destroyed")
            if (destroyed) {
                synchronized(this) {
                    if (pendingNativeCollectionId == collectionId) pendingNativeCollectionId = null
                }
                activity.abortAuthCollection(collectionId)
                return@runOnUiThread
            }
            synchronized(this) {
                if (pendingNativeCollectionId != collectionId) {
                    activity.abortAuthCollection(collectionId)
                    return@runOnUiThread
                }
            }
            sessionWebView.evaluateJavascript("window.__cavotiAuthAbort?.();", null)
            resultGate.begin(collectionId)
            pendingProbe = script
            awaitingDocumentReadyProbe = false
            setSessionVisible(show)
            Log.i("CavotiSession", "session visibility=${sessionWebView.visibility} url=${sessionWebView.url}")
            val current = sessionWebView.url?.let(Uri::parse)
            val shouldProbeCurrentDocument = current != null &&
                (isProbeDocument(current) || (!show && current.path == "/login"))
            if (shouldProbeCurrentDocument) {
                sessionWebView.evaluateJavascript(script, null)
            } else if (show && current?.path == "/login") {
                sessionWebView.loadUrl(LOGIN_URL)
            } else if (current == null || current.host != "cavoti.com") {
                sessionWebView.loadUrl(LOGIN_URL)
            }
        }
        return true
    }

    internal fun dispatchAbortProbe(collectionId: String): Boolean = abortProbe(collectionId)

    private fun abortProbe(collectionId: String): Boolean {
        if (collectionId.isBlank()) return false
        activity.runOnUiThread {
            if (destroyed) return@runOnUiThread
            if (!resultGate.isCurrentGeneration(collectionId)) {
                synchronized(this) {
                    if (pendingNativeCollectionId == collectionId) pendingNativeCollectionId = null
                }
                return@runOnUiThread
            }
            resultGate.abort()
            pendingProbe = null
            awaitingDocumentReadyProbe = false
            sessionWebView.evaluateJavascript("window.__cavotiAuthAbort?.();", null)
            setSessionVisible(false)
        }
        return true
    }

    internal fun dispatchHideSession(collectionId: String): Boolean = hideSession(collectionId)

    private fun hideSession(collectionId: String): Boolean {
        if (collectionId.isBlank()) return false
        activity.runOnUiThread {
            if (!destroyed && resultGate.isCurrentGeneration(collectionId)) {
                resultGate.abort()
                pendingProbe = null
                awaitingDocumentReadyProbe = false
                setSessionVisible(false)
            }
        }
        return true
    }

    internal fun handleAuthCollectionResult(payload: String) {
        activity.runOnUiThread {
            if (destroyed) return@runOnUiThread
            if (payload.toByteArray(Charsets.UTF_8).size > MAX_PAYLOAD_BYTES) {
                rejectRemoteResult()
                return@runOnUiThread
            }
            if (!isCavotiOrigin(sessionWebView.url?.let(Uri::parse))) {
                rejectRemoteResult()
                return@runOnUiThread
            }
            val result = runCatching { JSONObject(payload) }.getOrNull()
                ?: run {
                    rejectRemoteResult()
                    return@runOnUiThread
                }
            val collectionId = result.opt("collectionId") as? String
            val collectionIdValue = collectionId ?: ""
            val phase = result.optString("phase", "")
            val complete = runCatching { result.getBoolean("complete") }.getOrNull()
                ?: run {
                    rejectRemoteResult(collectionId)
                    return@runOnUiThread
                }
            val sessionState = result.optString("sessionState", "")
            val sanitized = sanitizePayload(result)
                ?: run {
                    rejectRemoteResult(collectionId)
                    return@runOnUiThread
                }
            val sanitizedPayload = sanitized.toString()
            if (sanitizedPayload.toByteArray(Charsets.UTF_8).size > MAX_PAYLOAD_BYTES) {
                rejectRemoteResult()
                return@runOnUiThread
            }
            when (resultGate.accept(collectionIdValue, phase, complete, sessionState)) {
                SessionResultGate.Decision.Accepted -> Unit
                SessionResultGate.Decision.Ignored -> return@runOnUiThread
                SessionResultGate.Decision.Invalid -> {
                    rejectRemoteResult(collectionId)
                    return@runOnUiThread
                }
            }
            if (!resultGate.hasActiveCollection()) {
                pendingProbe = null
                if (pendingNativeCollectionId == collectionIdValue) {
                    pendingNativeCollectionId = null
                }
            }
            CookieManager.getInstance().flush()
            if (!activity.submitAuthResult(sanitizedPayload)) {
                rejectRemoteResult(collectionIdValue)
            }
        }
    }

    private fun rejectRemoteResult(collectionId: String? = null) {
        val activeCollectionId = resultGate.activeCollectionId()
        // Do not let a malformed callback without the active collection ID
        // cancel a probe.
        if (collectionId == null || collectionId != activeCollectionId) return
        resultGate.abort()
        pendingProbe = null
        awaitingDocumentReadyProbe = false
        activity.abortAuthCollection(activeCollectionId)
    }

    fun abortNativeCollection() {
        val collectionId = resultGate.activeCollectionId() ?: pendingNativeCollectionId
        resultGate.abort()
        pendingProbe = null
        awaitingDocumentReadyProbe = false
        pendingNativeCollectionId = null
        collectionId?.let(activity::abortAuthCollection)
    }

    internal fun dispatchPrepareForLogin(collectionId: String): Boolean =
        prepareForLogin(collectionId)

    private fun prepareForLogin(collectionId: String): Boolean {
        if (collectionId.isBlank()) return false
        activity.runOnUiThread {
            if (destroyed || !resultGate.isCurrentGeneration(collectionId)) return@runOnUiThread
            resultGate.abort()
            pendingProbe = null
            if (sessionWebView.visibility != View.VISIBLE) {
                awaitingDocumentReadyProbe = false
                return@runOnUiThread
            }
            awaitingDocumentReadyProbe = true
            val current = sessionWebView.url?.let(Uri::parse)
            if (current == null || current.path != "/login") sessionWebView.loadUrl(LOGIN_URL)
        }
        return true
    }

    fun destroy() {
        destroyed = true
        resultGate.abort()
        pendingProbe = null
        pendingNativeCollectionId = null
        awaitingDocumentReadyProbe = false
        sessionWebView.stopLoading()
        if (webMessageListenerSupported) {
            WebViewCompat.removeWebMessageListener(sessionWebView, "CavotiAndroidWebMessageResult")
        }
        sessionDialog.dismiss()
        sessionWebView.destroy()
    }

    private fun setSessionVisible(visible: Boolean) {
        if (visible) {
            sessionWebView.layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            sessionWebView.alpha = 1f
            sessionWebView.visibility = View.VISIBLE
            sessionWebView.isFocusable = true
            sessionWebView.isFocusableInTouchMode = true
            if (!sessionDialog.isShowing) {
                sessionDialog.show()
            }
            sessionDialog.window?.apply {
                setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
                clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
                clearFlags(
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                )
                attributes = attributes.apply { alpha = 1f }
                setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
            }
            sessionWebView.requestFocus()
        } else {
            sessionWebView.alpha = 1f
            sessionWebView.visibility = View.VISIBLE
            sessionWebView.isFocusable = false
            sessionWebView.isFocusableInTouchMode = false
            sessionWebView.clearFocus()
            if (!sessionDialog.isShowing) {
                sessionDialog.show()
            }
            sessionDialog.window?.apply {
                setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
                clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
                addFlags(
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                )
                attributes = attributes.apply { alpha = 0f }
                setLayout(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
            }
        }
    }

    private fun isOAuthCallback(uri: Uri): Boolean =
        isCavotiOrigin(uri) && uri.path?.trimEnd('/') == "/auth/oauth/callback"

    private fun isProbeDocument(uri: Uri): Boolean {
        if (!isCavotiOrigin(uri)) return false
        val path = uri.path?.trimEnd('/') ?: ""
        return path != "/login" && path != "/auth/oauth/callback"
    }

    private fun isCavotiOrigin(uri: Uri?): Boolean =
        uri != null && uri.scheme == "https" && uri.host.equals("cavoti.com", true) &&
            (uri.port == -1 || uri.port == 443)

    private fun isAllowedAuthNavigation(uri: Uri): Boolean {
        if (uri.scheme != "https" || (uri.port != -1 && uri.port != 443)) return false
        return when (uri.host?.lowercase()) {
            "cavoti.com",
            "accounts.google.com",
            "accounts.youtube.com",
            "oauth2.googleapis.com",
            "x.com",
            "twitter.com",
            "api.x.com",
            "api.twitter.com" -> true
            else -> false
        }
    }

    private fun sanitizePayload(result: JSONObject): JSONObject? {
        val allowedTopLevel = setOf(
            "type",
            "collectionId",
            "phase",
            "complete",
            "sessionState",
            "results",
        )
        if (result.length() != allowedTopLevel.size) return null
        val topLevelKeys = result.keys()
        while (topLevelKeys.hasNext()) {
            if (topLevelKeys.next() !in allowedTopLevel) return null
        }
        val type = result.opt("type") as? String ?: return null
        val collectionId = result.opt("collectionId") as? String ?: return null
        val phase = result.opt("phase") as? String ?: return null
        val complete = result.opt("complete") as? Boolean ?: return null
        val sessionState = result.opt("sessionState") as? String ?: return null
        if (collectionId.isEmpty() ||
            collectionId.toByteArray(Charsets.UTF_8).size > MAX_COLLECTION_ID_BYTES ||
            phase.toByteArray(Charsets.UTF_8).size > MAX_PHASE_BYTES ||
            sessionState.toByteArray(Charsets.UTF_8).size > MAX_SESSION_STATE_BYTES
        ) return null
        val rawResults = result.opt("results") as? JSONObject ?: return null
        if (rawResults.length() > KNOWN_ENDPOINTS.size) return null

        val sanitizedResults = JSONObject()
        val endpointNames = rawResults.keys()
        while (endpointNames.hasNext()) {
            val name = endpointNames.next()
            if (name !in KNOWN_ENDPOINTS) return null
            val endpoint = rawResults.opt(name) as? JSONObject ?: return null
            val allowedEndpointFields = setOf("status", "ok", "text", "timedOut")
            if (endpoint.length() != allowedEndpointFields.size) return null
            val endpointFields = endpoint.keys()
            while (endpointFields.hasNext()) {
                if (endpointFields.next() !in allowedEndpointFields) return null
            }
            val statusValue = endpoint.opt("status")
            val status = when (statusValue) {
                is Int -> statusValue
                is Long -> statusValue.toInt().takeIf { it.toLong() == statusValue }
                else -> null
            }?.takeIf { it in 0..65535 } ?: return null
            val ok = endpoint.opt("ok") as? Boolean ?: return null
            val text = endpoint.opt("text") as? String ?: return null
            if (text.toByteArray(Charsets.UTF_8).size > MAX_RESULT_BYTES) return null
            val timedOut = endpoint.opt("timedOut") as? Boolean ?: return null
            sanitizedResults.put(
                name,
                JSONObject()
                    .put("status", status)
                    .put("ok", ok)
                    .put("text", text)
                    .put("timedOut", timedOut),
            )
        }
        if (phase == "core" && !REQUIRED_ENDPOINTS.all { sanitizedResults.has(it) }) return null
        return JSONObject()
            .put("type", type)
            .put("collectionId", collectionId)
            .put("phase", phase)
            .put("complete", complete)
            .put("sessionState", sessionState)
            .put("results", sanitizedResults)
    }

}

internal class SessionResultGate {
    enum class Decision {
        Accepted,
        Ignored,
        Invalid,
    }

    private var activeCollectionId: String? = null
    private var latestGenerationId: String? = null
    private var acceptedCore = false
    private var acceptedEnrichment = false

        fun begin(collectionId: String) {
            activeCollectionId = collectionId
            latestGenerationId = collectionId
            acceptedCore = false
            acceptedEnrichment = false
    }

    fun abort() {
        activeCollectionId = null
        acceptedCore = false
        acceptedEnrichment = false
    }

    fun hasActiveCollection(): Boolean = activeCollectionId != null

    fun activeCollectionId(): String? = activeCollectionId

    fun latestGenerationId(): String? = latestGenerationId

    fun isCurrentGeneration(collectionId: String): Boolean =
        collectionId.isNotEmpty() && latestGenerationId == collectionId

    fun accept(collectionId: String, phase: String, complete: Boolean, sessionState: String): Decision {
        if (activeCollectionId != collectionId) return Decision.Ignored
        return when (phase) {
            "core" -> {
                if (acceptedCore || acceptedEnrichment) return Decision.Ignored
                if (complete == (sessionState == "authenticated")) return Decision.Invalid
                acceptedCore = true
                if (complete) abort()
                Decision.Accepted
            }
            "enrichment" -> {
                if (!acceptedCore || acceptedEnrichment || !complete || sessionState != "authenticated")
                    return Decision.Invalid
                acceptedEnrichment = true
                abort()
                Decision.Accepted
            }
            else -> Decision.Invalid
        }
    }
}
