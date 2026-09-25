export type RoomDevicePreferences = { cameraId?: string; microphoneId?: string };
const key = "meewav.room.devices.v1";

export function readRoomDevicePreferences(): RoomDevicePreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}");
    return { cameraId: typeof value.cameraId === "string" ? value.cameraId : undefined,
      microphoneId: typeof value.microphoneId === "string" ? value.microphoneId : undefined };
  } catch { return {}; }
}

export function saveRoomDevicePreferences(value: RoomDevicePreferences) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode may disable storage. */ }
}

export function roomMicrophoneConstraint(): MediaTrackConstraints {
  const { microphoneId } = readRoomDevicePreferences();
  return microphoneId ? { deviceId: { exact: microphoneId } } : {};
}
