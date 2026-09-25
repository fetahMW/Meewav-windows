// System audio requires a separately validated signed macOS build and permissions.
module.exports = Object.freeze({
  runtime: 'desktop-macos',
  screenCapture: true,
  windowCapture: true,
  systemAudioCapture: false,
  professionalAudioDriver: false,
});
