import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260820143000_loge_preview_pcm_peaks_v1.sql?raw";

describe("Loge preview PCM peaks SQL contract", () => {
  it("bounds persisted metadata and compact interleaved int16 peaks", () => {
    expect(sql).toContain("rooms_specialized_loge_preview_analysis_valid_v1");
    expect(sql).toContain("v_length > 1024");
    expect(sql).toContain("mod(v_length, 2) <> 0");
    expect(sql).toContain("v_minimum < -32768");
    expect(sql).toContain("v_maximum > 32767");
    expect(sql).toContain("v_minimum > v_maximum");
    expect(sql).toContain("not between 8000 and 384000");
    expect(sql).toContain("not between 1 and 8");
    expect(sql).toContain("validate constraint room_specialized_loge_preview_analysis_valid_v1");
  });

  it("removes recognizable audio analysis when the media is unavailable", () => {
    expect(sql).toContain("rooms_specialized_project_state_v2");
    expect(sql).toContain("v_projected := public.rooms_specialized_project_state_v2");
    expect(sql).toContain("'{loge,preview,durationSeconds}', 'null'::jsonb");
    expect(sql).toContain("'{loge,preview,channels}', 'null'::jsonb");
    expect(sql).toContain("'{loge,preview,sampleRate}', 'null'::jsonb");
    expect(sql).toContain("'{loge,preview,waveformPeaks}', '[]'::jsonb");
    expect(sql).toContain("'durationSeconds', null, 'channels', null, 'sampleRate', null, 'waveformPeaks', '[]'::jsonb");
  });
});
