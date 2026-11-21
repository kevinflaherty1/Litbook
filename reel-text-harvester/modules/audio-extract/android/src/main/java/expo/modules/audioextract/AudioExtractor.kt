package expo.modules.audioextract

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * Decodes a video's first audio track with MediaExtractor + MediaCodec, mixes
 * it to mono and resamples it to the target rate, then writes 16-bit PCM WAV.
 * MediaCodec has no resampler, so that part is done here.
 */
object AudioExtractor {
  private const val TIMEOUT_US = 10_000L

  fun extract(inputPath: String, outputPath: String, targetRate: Int): Map<String, Any> {
    val extractor = MediaExtractor()
    try {
      extractor.setDataSource(inputPath)
      var trackIndex = -1
      var format: MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val f = extractor.getTrackFormat(i)
        if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
          trackIndex = i
          format = f
          break
        }
      }
      if (trackIndex < 0 || format == null) return mapOf("hasAudio" to false, "durationMs" to 0.0)

      extractor.selectTrack(trackIndex)
      val mono = decodeToMono(extractor, format)
      val resampled = resample(mono.samples, mono.size, mono.sampleRate, targetRate)
      writeWav(File(outputPath), resampled, targetRate)
      return mapOf("hasAudio" to true, "durationMs" to resampled.size * 1000.0 / targetRate)
    } finally {
      extractor.release()
    }
  }

  private class MonoBuffer {
    var samples = FloatArray(1 shl 16)
    var size = 0
    var sampleRate = 0

    fun append(value: Float) {
      if (size == samples.size) samples = samples.copyOf(samples.size * 2)
      samples[size++] = value
    }
  }

  private fun decodeToMono(extractor: MediaExtractor, format: MediaFormat): MonoBuffer {
    val mime = format.getString(MediaFormat.KEY_MIME)!!
    val codec = MediaCodec.createDecoderByType(mime)
    val out = MonoBuffer()
    var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    out.sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    var floatPcm = false
    try {
      codec.configure(format, null, null, 0)
      codec.start()
      val info = MediaCodec.BufferInfo()
      var inputDone = false
      var outputDone = false
      while (!outputDone) {
        if (!inputDone) {
          val inIndex = codec.dequeueInputBuffer(TIMEOUT_US)
          if (inIndex >= 0) {
            val inBuf = codec.getInputBuffer(inIndex)!!
            val size = extractor.readSampleData(inBuf, 0)
            if (size < 0) {
              codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }

        val outIndex = codec.dequeueOutputBuffer(info, TIMEOUT_US)
        if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          val f = codec.outputFormat
          channels = f.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          out.sampleRate = f.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          floatPcm = f.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
            f.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
        } else if (outIndex >= 0) {
          if (info.size > 0) {
            val outBuf = codec.getOutputBuffer(outIndex)!!
            outBuf.position(info.offset)
            outBuf.limit(info.offset + info.size)
            mixDown(outBuf.slice().order(ByteOrder.nativeOrder()), channels, floatPcm, out)
          }
          codec.releaseOutputBuffer(outIndex, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
        }
      }
      codec.stop()
    } finally {
      codec.release()
    }
    return out
  }

  private fun mixDown(buf: ByteBuffer, channels: Int, floatPcm: Boolean, out: MonoBuffer) {
    val ch = max(1, channels)
    if (floatPcm) {
      val fb = buf.asFloatBuffer()
      while (fb.remaining() >= ch) {
        var sum = 0f
        repeat(ch) { sum += fb.get() }
        out.append(sum / ch)
      }
    } else {
      val sb = buf.asShortBuffer()
      while (sb.remaining() >= ch) {
        var sum = 0f
        repeat(ch) { sum += sb.get() / 32768f }
        out.append(sum / ch)
      }
    }
  }

  /**
   * Downsampling averages each output sample's source window (a box filter,
   * enough anti-aliasing for speech recognition); upsampling interpolates.
   */
  internal fun resample(src: FloatArray, size: Int, srcRate: Int, dstRate: Int): ShortArray {
    if (size == 0 || srcRate <= 0) return ShortArray(0)
    val ratio = srcRate.toDouble() / dstRate
    val outSize = floor(size / ratio).toInt()
    val dst = ShortArray(outSize)
    for (i in 0 until outSize) {
      val value: Float = if (ratio > 1.0) {
        val start = floor(i * ratio).toInt()
        val end = min(size, max(start + 1, floor((i + 1) * ratio).toInt()))
        var sum = 0f
        for (j in start until end) sum += src[j]
        sum / (end - start)
      } else {
        val pos = i * ratio
        val j = pos.toInt()
        val frac = (pos - j).toFloat()
        val a = src[min(j, size - 1)]
        val b = src[min(j + 1, size - 1)]
        a + (b - a) * frac
      }
      dst[i] = (value.coerceIn(-1f, 1f) * 32767f).toInt().toShort()
    }
    return dst
  }

  internal fun writeWav(file: File, pcm: ShortArray, sampleRate: Int) {
    val dataBytes = pcm.size * 2
    val buf = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN)
    buf.put("RIFF".toByteArray(Charsets.US_ASCII))
    buf.putInt(36 + dataBytes)
    buf.put("WAVE".toByteArray(Charsets.US_ASCII))
    buf.put("fmt ".toByteArray(Charsets.US_ASCII))
    buf.putInt(16)
    buf.putShort(1) // PCM
    buf.putShort(1) // mono
    buf.putInt(sampleRate)
    buf.putInt(sampleRate * 2) // byte rate
    buf.putShort(2) // block align
    buf.putShort(16) // bits per sample
    buf.put("data".toByteArray(Charsets.US_ASCII))
    buf.putInt(dataBytes)
    for (s in pcm) buf.putShort(s)
    file.parentFile?.mkdirs()
    FileOutputStream(file).use { it.write(buf.array()) }
  }
}
