package com.gomirror

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.view.WindowManager
import java.io.BufferedOutputStream
import java.net.Socket
import java.nio.ByteBuffer
import java.util.concurrent.atomic.AtomicBoolean

class ScreenCaptureService : Service() {
    companion object {
        const val EXTRA_RESULT_CODE = "extra_result_code"
        const val EXTRA_RESULT_DATA = "extra_result_data"
        const val EXTRA_TARGET_IP = "extra_target_ip"
        const val EXTRA_TARGET_PORT = "extra_target_port"
        const val ACTION_STOP = "com.gomirror.action.STOP_CAPTURE"

        private const val NOTIFICATION_CHANNEL_ID = "gomirror_capture"
        private const val NOTIFICATION_ID = 1001
        private val START_CODE = byteArrayOf(0x00, 0x00, 0x00, 0x01)
        private val STREAM_MAGIC = byteArrayOf('G'.code.toByte(), 'O'.code.toByte(), 'M'.code.toByte(), 'I'.code.toByte(),
            'R'.code.toByte(), 'R'.code.toByte(), 'O'.code.toByte(), 'R'.code.toByte())
    }

    private val running = AtomicBoolean(false)
    private var projection: MediaProjection? = null
    private var encoder: MediaCodec? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var socket: Socket? = null
    private var outputStream: BufferedOutputStream? = null
    private var captureThread: Thread? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            return START_NOT_STICKY
        }

        if (intent.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        if (running.get()) {
            return START_STICKY
        }

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val resultData = intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
        val targetIp = intent.getStringExtra(EXTRA_TARGET_IP) ?: return START_NOT_STICKY
        val targetPort = intent.getIntExtra(EXTRA_TARGET_PORT, 7070)

        startForeground(NOTIFICATION_ID, buildNotification())

        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        projection = projectionManager.getMediaProjection(resultCode, resultData ?: return START_NOT_STICKY)

        val metrics = DisplayMetrics().apply {
            val windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            windowManager.defaultDisplay.getRealMetrics(this)
        }
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        val dpi = metrics.densityDpi

        encoder = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, 8_000_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, 30)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1)
        }
        encoder?.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
        val inputSurface = encoder?.createInputSurface()
        encoder?.start()

        virtualDisplay = projection?.createVirtualDisplay(
            "GoMirrorCapture",
            width,
            height,
            dpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_PUBLIC,
            inputSurface,
            null,
            null
        )

        try {
            socket = Socket(targetIp, targetPort)
            outputStream = BufferedOutputStream(socket?.getOutputStream())
            writeHeader(outputStream, width, height)
        } catch (ex: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }

        running.set(true)
        captureThread = Thread {
            drainEncoder()
        }.also { it.start() }

        return START_STICKY
    }

    override fun onDestroy() {
        running.set(false)
        captureThread?.interrupt()
        captureThread = null

        outputStream?.flush()
        outputStream?.close()
        outputStream = null

        socket?.close()
        socket = null

        virtualDisplay?.release()
        virtualDisplay = null

        encoder?.stop()
        encoder?.release()
        encoder = null

        projection?.stop()
        projection = null

        super.onDestroy()
    }

    private fun drainEncoder() {
        val codec = encoder ?: return
        val bufferInfo = MediaCodec.BufferInfo()
        val out = outputStream ?: return

        while (running.get()) {
            val outputIndex = codec.dequeueOutputBuffer(bufferInfo, 10_000)
            if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                val newFormat = codec.outputFormat
                writeCsd(out, newFormat.getByteBuffer("csd-0"))
                writeCsd(out, newFormat.getByteBuffer("csd-1"))
                continue
            }

            if (outputIndex >= 0) {
                val outputBuffer = codec.getOutputBuffer(outputIndex)
                if (outputBuffer != null && bufferInfo.size > 0) {
                    outputBuffer.position(bufferInfo.offset)
                    outputBuffer.limit(bufferInfo.offset + bufferInfo.size)
                    writeAnnexB(out, outputBuffer)
                }
                codec.releaseOutputBuffer(outputIndex, false)
            }
        }
    }

    private fun writeCsd(out: BufferedOutputStream, buffer: ByteBuffer?) {
        if (buffer == null) return
        val data = ByteArray(buffer.remaining())
        buffer.get(data)
        out.write(START_CODE)
        out.write(data)
        out.flush()
    }

    private fun writeAnnexB(out: BufferedOutputStream, buffer: ByteBuffer) {
        while (buffer.remaining() > 4) {
            val length = buffer.int
            if (length <= 0 || length > buffer.remaining()) {
                val remaining = ByteArray(buffer.remaining())
                buffer.get(remaining)
                out.write(START_CODE)
                out.write(remaining)
                out.flush()
                return
            }
            val nal = ByteArray(length)
            buffer.get(nal)
            out.write(START_CODE)
            out.write(nal)
        }
        out.flush()
    }

    private fun writeHeader(out: BufferedOutputStream?, width: Int, height: Int) {
        if (out == null) return
        val header = ByteBuffer.allocate(16)
        header.put(STREAM_MAGIC)
        header.putInt(width)
        header.putInt(height)
        out.write(header.array())
        out.flush()
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Go Mirror Capture",
                NotificationManager.IMPORTANCE_LOW
            )
            manager.createNotificationChannel(channel)
        }

        return Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Go Mirror")
            .setContentText("Screen capture is running")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .build()
    }
}
