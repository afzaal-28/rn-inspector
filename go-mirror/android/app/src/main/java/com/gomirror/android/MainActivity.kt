package com.gomirror

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private val projectionManager by lazy {
        getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
    }

    private val captureLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode != RESULT_OK || result.data == null) {
            statusView?.text = "Screen capture permission denied."
            return@registerForActivityResult
        }

        val ip = ipInput?.text?.toString()?.trim().orEmpty()
        val portText = portInput?.text?.toString()?.trim().orEmpty()
        val port = portText.toIntOrNull() ?: 7070

        if (ip.isEmpty()) {
            statusView?.text = "Enter desktop IP address before starting."
            return@registerForActivityResult
        }

        val serviceIntent = Intent(this, ScreenCaptureService::class.java).apply {
            putExtra(ScreenCaptureService.EXTRA_RESULT_CODE, result.resultCode)
            putExtra(ScreenCaptureService.EXTRA_RESULT_DATA, result.data)
            putExtra(ScreenCaptureService.EXTRA_TARGET_IP, ip)
            putExtra(ScreenCaptureService.EXTRA_TARGET_PORT, port)
        }
        startForegroundService(serviceIntent)
        statusView?.text = "Capturing screen → $ip:$port"
    }

    private var ipInput: EditText? = null
    private var portInput: EditText? = null
    private var statusView: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 32, 32, 32)
        }

        val title = TextView(this).apply {
            text = "Go Mirror Android"
            textSize = 20f
        }
        root.addView(title)

        ipInput = EditText(this).apply {
            hint = "Desktop IP (e.g. 192.168.0.10)"
        }
        root.addView(ipInput)

        portInput = EditText(this).apply {
            hint = "Port (default 7070)"
            setText("7070")
        }
        root.addView(portInput)

        val startButton = Button(this).apply {
            text = "Start Screen Capture"
            setOnClickListener {
                val intent = projectionManager.createScreenCaptureIntent()
                captureLauncher.launch(intent)
            }
        }
        root.addView(startButton)

        val stopButton = Button(this).apply {
            text = "Stop Capture"
            setOnClickListener {
                val intent = Intent(this@MainActivity, ScreenCaptureService::class.java).apply {
                    action = ScreenCaptureService.ACTION_STOP
                }
                startService(intent)
                statusView?.text = "Stopped"
            }
        }
        root.addView(stopButton)

        statusView = TextView(this).apply {
            text = "Idle"
        }
        root.addView(statusView)

        setContentView(root)
    }
}
