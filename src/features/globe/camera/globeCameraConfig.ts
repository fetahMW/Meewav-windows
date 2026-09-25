export const INTRO_ALREADY_PLAYED_KEY = "meewave_globe_intro_played_v3";

export const PARIS_CENTER: [number, number] = [2.3522, 48.8566];

export const GLOBE_INTRO_START_CAMERA = {
  center: [8.0, 25.0] as [number, number],
  zoom: 1.25,
  pitch: 0,
  bearing: 0,
};

export const EUROPE_APPROACH_CAMERA = {
  center: [5.0, 47.0] as [number, number],
  zoom: 4.8,
  pitch: 18,
  bearing: -12,
};

export const PARIS_DESCENT_CAMERA = {
  center: PARIS_CENTER,
  zoom: 11.6,
  pitch: 42,
  bearing: -34,
};

export const PARIS_FINAL_CAMERA = {
  center: PARIS_CENTER,
  zoom: 15.85,
  pitch: 60,
  bearing: -28,
};
