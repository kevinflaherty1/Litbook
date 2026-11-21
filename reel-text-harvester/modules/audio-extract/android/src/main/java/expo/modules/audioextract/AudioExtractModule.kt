package expo.modules.audioextract

import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioExtractModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioExtract")

    // AsyncFunction bodies run off the JS thread, so blocking decode is fine here.
    AsyncFunction("extractWavAsync") { inputUri: String, outputUri: String, sampleRate: Int ->
      AudioExtractor.extract(toPath(inputUri), toPath(outputUri), sampleRate)
    }
  }

  private fun toPath(uri: String): String =
    if (uri.startsWith("file://")) Uri.parse(uri).path ?: uri else uri
}
