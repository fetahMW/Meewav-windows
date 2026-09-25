cmake_minimum_required(VERSION 3.25)

project(meewav_audio_engine VERSION 0.1.0 LANGUAGES CXX)

option(MEEWAV_AUDIO_BUILD_ENGINE "Build the MeeWav Audio Engine process" ON)
option(MEEWAV_AUDIO_BUILD_SCANNER "Build the isolated VST3 scanner process" ON)
option(MEEWAV_AUDIO_BUILD_TESTS "Build dependency-free internal audio contract tests" OFF)
option(MEEWAV_AUDIO_BUILD_CONTROL_POC "Build the internal authenticated loopback control POC" OFF)
option(MEEWAV_AUDIO_WITH_JUCE "Enable the JUCE device/plugin backend after licensing approval" OFF)
option(MEEWAV_AUDIO_WITH_VST3_SDK "Enable the native Steinberg VST3 hosting backend" OFF)

set(MEEWAV_JUCE_SOURCE_DIR "" CACHE PATH "Path to a licensed JUCE source tree")
set(MEEWAV_VST3_SDK_DIR "" CACHE PATH "Path to an approved Steinberg VST3 SDK source tree")

if(MEEWAV_AUDIO_WITH_JUCE)
  if(NOT EXISTS "${MEEWAV_JUCE_SOURCE_DIR}/CMakeLists.txt")
    message(FATAL_ERROR "MEEWAV_AUDIO_WITH_JUCE requires MEEWAV_JUCE_SOURCE_DIR. Review JUCE licensing before enabling it.")
  endif()
  add_subdirectory("${MEEWAV_JUCE_SOURCE_DIR}" "${CMAKE_BINARY_DIR}/juce" EXCLUDE_FROM_ALL)
  message(FATAL_ERROR "JUCE was found, but the MeeWav JUCE backend adapter has not been implemented. Refusing to produce a misleading binary.")
endif()

if(MEEWAV_AUDIO_WITH_VST3_SDK)
  if(NOT EXISTS "${MEEWAV_VST3_SDK_DIR}/CMakeLists.txt")
    message(FATAL_ERROR "MEEWAV_AUDIO_WITH_VST3_SDK requires MEEWAV_VST3_SDK_DIR.")
  endif()
  set(SMTG_ENABLE_VST3_PLUGIN_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(SMTG_ENABLE_VST3_HOSTING_EXAMPLES OFF CACHE BOOL "" FORCE)
  set(SMTG_ENABLE_VSTGUI_SUPPORT OFF CACHE BOOL "" FORCE)
  set(SMTG_CREATE_PLUGIN_LINK OFF CACHE BOOL "" FORCE)
  set(SMTG_RUN_VST_VALIDATOR OFF CACHE BOOL "" FORCE)
  add_subdirectory("${MEEWAV_VST3_SDK_DIR}" "${CMAKE_BINARY_DIR}/vst3sdk" EXCLUDE_FROM_ALL)
endif()

set(MEEWAV_AUDIO_CORE_SOURCES
  src/audio/AudioDeviceManager.cpp
  src/audio/AudioEngine.cpp
  src/audio/AudioGraph.cpp
  src/audio/AudioMeter.cpp
  src/audio/MeeWavReverb.cpp
  src/audio/SafetyLimiter.cpp
  src/plugins/PluginRegistry.cpp
  src/plugins/PluginScanner.cpp
  src/plugins/StandardPluginLocations.cpp
  src/plugins/PluginHost.cpp
  src/plugins/adapters/AntaresAdapter.cpp
  src/plugins/adapters/VolocoAdapter.cpp
  src/bridge/ControlServer.cpp
  src/bridge/CommandAuthenticator.cpp
  src/bridge/LocalControlApi.cpp
  src/bridge/SessionAuth.cpp
  src/monitoring/MonitorRouter.cpp
  src/diagnostics/Diagnostics.cpp
  src/diagnostics/Watchdog.cpp
)

if(WIN32)
  list(APPEND MEEWAV_AUDIO_CORE_SOURCES
    src/bridge/windows/WindowsCommandCrypto.cpp
    src/bridge/windows/WindowsLoopbackHttpTransport.cpp
  )
endif()

add_library(meewav_audio_core STATIC ${MEEWAV_AUDIO_CORE_SOURCES})
target_include_directories(meewav_audio_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_compile_features(meewav_audio_core PUBLIC cxx_std_20)

target_compile_definitions(meewav_audio_core PUBLIC
  $<$<BOOL:${MEEWAV_AUDIO_WITH_JUCE}>:MEEWAV_AUDIO_WITH_JUCE=1>
  $<$<BOOL:${MEEWAV_AUDIO_WITH_VST3_SDK}>:MEEWAV_AUDIO_WITH_VST3_SDK=1>
)

if(MSVC)
  target_compile_options(meewav_audio_core PRIVATE /W4 /permissive- /EHsc)
else()
  target_compile_options(meewav_audio_core PRIVATE -Wall -Wextra -Wpedantic -Wconversion)
endif()

if(WIN32)
  target_link_libraries(meewav_audio_core PRIVATE bcrypt ws2_32)
endif()

if(MEEWAV_AUDIO_BUILD_ENGINE)
  add_executable(meewav-audio-engine src/main.cpp)
  target_link_libraries(meewav-audio-engine PRIVATE meewav_audio_core)
endif()

if(MEEWAV_AUDIO_BUILD_SCANNER)
  add_executable(meewav-plugin-scanner src/plugins/scanner_main.cpp)
  target_link_libraries(meewav-plugin-scanner PRIVATE meewav_audio_core)
endif()

if(MEEWAV_AUDIO_BUILD_TESTS)
  enable_testing()
  add_executable(meewav-audio-contract-tests tests/PluginSecurityContractTests.cpp)
  target_link_libraries(meewav-audio-contract-tests PRIVATE meewav_audio_core)
  add_test(NAME meewav-audio-contract-tests COMMAND meewav-audio-contract-tests)
  add_executable(meewav-control-contract-tests tests/ControlBridgeContractTests.cpp)
  target_link_libraries(meewav-control-contract-tests PRIVATE meewav_audio_core)
  add_test(NAME meewav-control-contract-tests COMMAND meewav-control-contract-tests)
  add_executable(meewav-realtime-audio-telemetry-tests tests/RealtimeAudioTelemetryTests.cpp)
  target_include_directories(meewav-realtime-audio-telemetry-tests PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
  )
  target_compile_features(meewav-realtime-audio-telemetry-tests PRIVATE cxx_std_20)
  add_test(NAME meewav-realtime-audio-telemetry-tests
    COMMAND meewav-realtime-audio-telemetry-tests
  )
  add_executable(meewav-wasapi-shared-period-tests tests/WasapiSharedPeriodTests.cpp)
  target_include_directories(meewav-wasapi-shared-period-tests PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
  )
  target_compile_features(meewav-wasapi-shared-period-tests PRIVATE cxx_std_20)
  add_test(NAME meewav-wasapi-shared-period-tests
    COMMAND meewav-wasapi-shared-period-tests
  )
  add_executable(meewav-reverb-tests
    tests/MeeWavReverbTests.cpp
    src/audio/MeeWavReverb.cpp
    src/audio/SafetyLimiter.cpp
  )
  target_include_directories(meewav-reverb-tests PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
  )
  target_compile_features(meewav-reverb-tests PRIVATE cxx_std_20)
  add_test(NAME meewav-reverb-tests COMMAND meewav-reverb-tests)
  add_executable(meewav-native-vst3-control-protocol-tests
    tests/NativeVst3ControlProtocolTests.cpp
  )
  target_include_directories(meewav-native-vst3-control-protocol-tests PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
  )
  target_compile_features(meewav-native-vst3-control-protocol-tests PRIVATE cxx_std_20)
  add_test(NAME meewav-native-vst3-control-protocol-tests
    COMMAND meewav-native-vst3-control-protocol-tests
  )
endif()

if(MEEWAV_AUDIO_BUILD_CONTROL_POC)
  if(NOT WIN32)
    message(FATAL_ERROR "The current authenticated loopback control POC is Windows-only.")
  endif()
  add_executable(meewav-control-poc src/poc/windows/LocalControlPocMain.cpp)
  target_link_libraries(meewav-control-poc PRIVATE meewav_audio_core)
  if(MSVC)
    target_compile_options(meewav-control-poc PRIVATE /W4 /permissive- /EHsc)
  endif()
endif()

if(MEEWAV_AUDIO_WITH_VST3_SDK)
  if(NOT WIN32)
    message(FATAL_ERROR "The current native VST3 proof of concept is Windows-only.")
  endif()

  add_executable(meewav-vst3-poc
    src/plugins/vst3/Vst3PocMain.cpp
    "${MEEWAV_VST3_SDK_DIR}/public.sdk/source/vst/hosting/plugprovider.cpp"
    "${MEEWAV_VST3_SDK_DIR}/public.sdk/source/vst/hosting/module_win32.cpp"
  )
  target_compile_features(meewav-vst3-poc PRIVATE cxx_std_20)
  target_include_directories(meewav-vst3-poc PRIVATE "${MEEWAV_VST3_SDK_DIR}")
  target_link_libraries(meewav-vst3-poc PRIVATE sdk_hosting)
  target_compile_definitions(meewav-vst3-poc PRIVATE MEEWAV_VST3_POC=1)
  if(MSVC)
    target_compile_options(meewav-vst3-poc PRIVATE /W4 /permissive- /EHsc /Zc:char8_t-)
    target_compile_definitions(meewav-vst3-poc PRIVATE
      _SILENCE_CXX20_U8PATH_DEPRECATION_WARNING=1
    )
  endif()

  add_executable(meewav-vst3-live-poc
    src/poc/windows/LiveAudioPocMain.cpp
    src/poc/windows/WasapiLiveMonitor.cpp
    src/plugins/vst3/Vst3LiveProcessor.cpp
    "${MEEWAV_VST3_SDK_DIR}/public.sdk/source/vst/hosting/plugprovider.cpp"
    "${MEEWAV_VST3_SDK_DIR}/public.sdk/source/vst/hosting/module_win32.cpp"
  )
  target_compile_features(meewav-vst3-live-poc PRIVATE cxx_std_20)
  target_include_directories(meewav-vst3-live-poc PRIVATE
    "${CMAKE_CURRENT_SOURCE_DIR}/src"
    "${MEEWAV_VST3_SDK_DIR}"
  )
  target_link_libraries(meewav-vst3-live-poc PRIVATE
    meewav_audio_core
    sdk_hosting
    ole32
    uuid
    propsys
    avrt
  )
  target_compile_definitions(meewav-vst3-live-poc PRIVATE MEEWAV_VST3_POC=1)
  if(MSVC)
    target_compile_options(meewav-vst3-live-poc PRIVATE /W4 /permissive- /EHsc /Zc:char8_t-)
    target_compile_definitions(meewav-vst3-live-poc PRIVATE
      _SILENCE_CXX20_U8PATH_DEPRECATION_WARNING=1
    )
  endif()
endif()
