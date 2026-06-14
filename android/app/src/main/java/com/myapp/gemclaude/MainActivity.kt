package com.myapp.gemclaude

import android.annotation.SuppressLint
import android.app.Activity
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.webkit.*
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var loadingText: TextView
    private var uploadMessage: ValueCallback<Array<Uri>>? = null
    private var doubleBackToExitPressedOnce = false

    // Target URL of your stock market web application
    private val webAppUrl = "https://gemclaude-1.onrender.com/"

    // Modern Activity Result Launcher for File Upload Picker
    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            val data = result.data
            val results = if (data != null) {
                val dataString = data.dataString
                val clipData = data.clipData
                if (clipData != null) {
                    Array(clipData.itemCount) { i -> clipData.getItemAt(i).uri }
                } else if (dataString != null) {
                    arrayOf(Uri.parse(dataString))
                } else {
                    null
                }
            } else {
                null
            }
            uploadMessage?.onReceiveValue(results)
        } else {
            uploadMessage?.onReceiveValue(null)
        }
        uploadMessage = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Initialize UI Elements
        webView = findViewById(R.id.webView)
        progressBar = findViewById(R.id.progressBar)
        loadingText = findViewById(R.id.loadingText)

        // Setup Back Button Navigation
        setupBackNavigation()

        // Configure WebView settings for HTML5 features
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        
        // Custom User Agent to identify as App
        settings.userAgentString = settings.userAgentString + " StockTerminalAndroid"

        // Set up WebApp Interface for custom Print function
        webView.addJavascriptInterface(WebAppInterface(this, webView), "AndroidPrint")

        // Set Custom WebViewClient to stay inside the app
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                progressBar.visibility = View.VISIBLE
                loadingText.visibility = View.VISIBLE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
                loadingText.visibility = View.GONE
                
                // Inject polyfill to redirect clean standard browser window.print() triggers to our Android native print
                webView.evaluateJavascript(
                    "window.print = function() { if (window.AndroidPrint) { window.AndroidPrint.printPage(); } else { console.log('Print not supported'); } };",
                    null
                )
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false // Load in WebView
                }
                
                // Handle external links (telephone dials, whatsapp, mailto etc)
                try {
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                    return true
                } catch (e: Exception) {
                    return false
                }
            }
        }

        // Set WebChromeClient to handle Upload (File input)
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                if (newProgress >= 100) {
                    progressBar.visibility = View.GONE
                    loadingText.visibility = View.GONE
                }
            }

            // File Chooser for Upload Support
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                uploadMessage?.onReceiveValue(null)
                uploadMessage = filePathCallback

                val intent = fileChooserParams?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).apply {
                    type = "*/*"
                    addCategory(Intent.CATEGORY_OPENABLE)
                }

                try {
                    fileChooserLauncher.launch(intent)
                } catch (e: Exception) {
                    uploadMessage?.onReceiveValue(null)
                    uploadMessage = null
                    Toast.makeText(this@MainActivity, "ફાઇલ પિકર ખોલવામાં અસમર્થ", Toast.LENGTH_SHORT).show()
                    return false
                }
                return true
            }
        }

        // Configure Download Listener to handle File Downloads
        setupDownloadListener()

        // Load targeted Render Web App
        webView.loadUrl(webAppUrl)
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack() // Go back in web view history
                } else {
                    // Double back tap to exit flow
                    if (doubleBackToExitPressedOnce) {
                        finish() // Exit code
                    } else {
                        doubleBackToExitPressedOnce = true
                        Toast.makeText(
                            this@MainActivity,
                            "બહાર નીકળવા માટે ફરીથી દબાવો (Press back again to exit)",
                            Toast.LENGTH_SHORT
                        ).show()
                        Handler(Looper.getMainLooper()).postDelayed({
                            doubleBackToExitPressedOnce = false
                        }, 2000)
                    }
                }
            }
        })
    }

    private fun setupDownloadListener() {
        webView.setDownloadListener { url, userAgent, contentDisposition, mimetype, contentLength ->
            try {
                val request = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimetype)
                    
                    // Include web cookies for auth downloads
                    val cookies = CookieManager.getInstance().getCookie(url)
                    addRequestHeader("cookie", cookies)
                    addRequestHeader("User-Agent", userAgent)
                    
                    setDescription("ફાઇલ ડાઉનલોડ થઈ રહી છે...")
                    setTitle(URLUtil.guessFileName(url, contentDisposition, mimetype))
                    
                    // Enqueue system download notification and set storage visibility
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(
                        Environment.DIRECTORY_DOWNLOADS,
                        URLUtil.guessFileName(url, contentDisposition, mimetype)
                    )
                }

                val downloadManager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
                downloadManager.enqueue(request)
                Toast.makeText(this, "ડાઉનલોડ શરૂ થયું...", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(this, "ડાઉનલોડ નિષ્ફળ: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    // Javascript Interface to bridge web window.print() to Android PrintManager
    class WebAppInterface(private val activity: Activity, private val webView: WebView) {
        @JavascriptInterface
        fun printPage() {
            activity.runOnUiThread {
                try {
                    val printManager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
                    val printAdapter = webView.createPrintDocumentAdapter("Stock Terminal Document")
                    val jobName = "${activity.getString(R.string.app_name)} Print"
                    printManager.print(jobName, printAdapter, PrintAttributes.Builder().build())
                } catch (e: Exception) {
                    Toast.makeText(activity, "પ્રિન્ટિંગ એરર: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}
