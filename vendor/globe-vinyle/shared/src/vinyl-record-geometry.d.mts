import type { LatheGeometry, Vector3 } from "three";
export interface VinylRecordLayout {
  innerRadius: number;
  outerRadius: number;
  thickness: number;
  bevel: number;
  artworkInnerRatio: number;
  angularSegments: number;
  bevelSegments: number;
  bands: Array<{ id: number; inner: number; outer: number; height: number; crown: number; thickness: number }>;
}
export const VINYL_RECORD: Readonly<Omit<VinylRecordLayout, "angularSegments" | "bevelSegments" | "bands">>;
export function vinylRecordLayout(quality?: "low" | "high"): VinylRecordLayout;
export function createVinylRecordGeometry(layout: VinylRecordLayout): LatheGeometry;
export function sampleVinylRecord(layout: VinylRecordLayout, angle: number, radius: number): { position: Vector3; normal: Vector3; onBand: boolean };
