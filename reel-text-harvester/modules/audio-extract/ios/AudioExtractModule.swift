import AVFoundation
import ExpoModulesCore

public class AudioExtractModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioExtract")

    AsyncFunction("extractWavAsync") { (inputUri: String, outputUri: String, sampleRate: Int) -> [String: Any] in
      guard let input = URL(string: inputUri), let output = URL(string: outputUri) else {
        throw InvalidUriException(inputUri)
      }
      return try AudioExtractor.extract(input: input, output: output, sampleRate: sampleRate)
    }
  }
}

final class InvalidUriException: GenericException<String> {
  override var reason: String { "Invalid file URI: \(param)" }
}

final class DecodeException: GenericException<String> {
  override var reason: String { "Could not decode audio: \(param)" }
}

enum AudioExtractor {
  /// AVAssetReader does the decoding, down-mixing and resampling: asking the
  /// track output for mono 16-bit LPCM at `sampleRate` is enough.
  static func extract(input: URL, output: URL, sampleRate: Int) throws -> [String: Any] {
    let asset = AVURLAsset(url: input)
    guard let track = asset.tracks(withMediaType: .audio).first else {
      return ["hasAudio": false, "durationMs": 0]
    }

    let reader = try AVAssetReader(asset: asset)
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let trackOutput = AVAssetReaderTrackOutput(track: track, outputSettings: settings)
    trackOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(trackOutput) else { throw DecodeException("reader rejected the output settings") }
    reader.add(trackOutput)
    guard reader.startReading() else {
      throw DecodeException(reader.error?.localizedDescription ?? "startReading failed")
    }

    var pcm = Data()
    while let sampleBuffer = trackOutput.copyNextSampleBuffer() {
      if let block = CMSampleBufferGetDataBuffer(sampleBuffer) {
        let length = CMBlockBufferGetDataLength(block)
        var chunk = Data(count: length)
        let status = chunk.withUnsafeMutableBytes { raw -> OSStatus in
          guard let base = raw.baseAddress else { return -1 }
          return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: base)
        }
        if status == kCMBlockBufferNoErr { pcm.append(chunk) }
      }
      CMSampleBufferInvalidate(sampleBuffer)
    }
    if reader.status == .failed {
      throw DecodeException(reader.error?.localizedDescription ?? "reading failed")
    }

    var wav = wavHeader(dataBytes: pcm.count, sampleRate: sampleRate)
    wav.append(pcm)
    try? FileManager.default.removeItem(at: output)
    try wav.write(to: output, options: .atomic)

    let durationMs = Double(pcm.count / 2) / Double(sampleRate) * 1000
    return ["hasAudio": true, "durationMs": durationMs]
  }

  /// Canonical 44-byte RIFF header for mono 16-bit PCM.
  static func wavHeader(dataBytes: Int, sampleRate: Int) -> Data {
    var header = Data()
    func append(_ string: String) { header.append(contentsOf: Array(string.utf8)) }
    func append32(_ value: UInt32) { withUnsafeBytes(of: value.littleEndian) { header.append(contentsOf: $0) } }
    func append16(_ value: UInt16) { withUnsafeBytes(of: value.littleEndian) { header.append(contentsOf: $0) } }
    let channels: UInt16 = 1
    let bitsPerSample: UInt16 = 16
    let blockAlign = channels * bitsPerSample / 8
    append("RIFF")
    append32(UInt32(36 + dataBytes))
    append("WAVE")
    append("fmt ")
    append32(16)
    append16(1)  // PCM
    append16(channels)
    append32(UInt32(sampleRate))
    append32(UInt32(sampleRate) * UInt32(blockAlign))
    append16(blockAlign)
    append16(bitsPerSample)
    append("data")
    append32(UInt32(dataBytes))
    return header
  }
}
