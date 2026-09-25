export type DemoHostPosition = {
  id: string;
  label: string;
  zoneId: string;
  districtName: string;
  lngLat: [number, number];
  flyTarget: {
    center: [number, number];
    zoom: number;
    pitch: number;
    bearing: number;
  };
};

export const DEMO_HOST_POSITION: DemoHostPosition = {
  id: "demo_host_charonne",
  label: "Ma position",
  zoneId: "paris_20e_charonne",
  districtName: "Charonne",
  lngLat: [2.40743, 48.85476],
  flyTarget: {
    center: [2.40743, 48.85476],
    zoom: 17.97,
    pitch: 60,
    bearing: -55.3,
  },
};
