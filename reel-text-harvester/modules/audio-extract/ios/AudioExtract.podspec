Pod::Spec.new do |s|
  s.name           = 'AudioExtract'
  s.version        = '1.0.0'
  s.summary        = 'Decode a video audio track to 16 kHz mono WAV'
  s.description    = 'Decode a video audio track to 16 kHz mono WAV for on-device speech recognition'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
