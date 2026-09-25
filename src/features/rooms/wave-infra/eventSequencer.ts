import type { WaveEventCursor, WaveRealtimeEvent } from "./contracts";

export type WaveEventSequenceDecision =
  | { kind: "apply"; cursor: WaveEventCursor }
  | { kind: "duplicate"; cursor: WaveEventCursor }
  | { kind: "gap"; cursor: WaveEventCursor; expectedSequence: number; receivedSequence: number };

/**
 * Orders the durable event stream without pretending Realtime is the source of
 * truth. A gap is deliberately not skipped: the caller must recover a server
 * snapshot before applying further events.
 */
export class WaveEventSequencer {
  private cursor: WaveEventCursor;

  constructor(waveId: string, cursor?: WaveEventCursor) {
    if (cursor && cursor.waveId !== waveId) throw new Error("wave_cursor_mismatch");
    this.cursor = cursor ?? { waveId, sequence: 0, eventId: null };
  }

  current() {
    return { ...this.cursor };
  }

  reset(cursor: WaveEventCursor) {
    if (cursor.waveId !== this.cursor.waveId) throw new Error("wave_cursor_mismatch");
    this.cursor = { ...cursor };
  }

  inspect(event: WaveRealtimeEvent): WaveEventSequenceDecision {
    if (event.waveId !== this.cursor.waveId) throw new Error("wave_event_wave_mismatch");
    if (event.sequence <= this.cursor.sequence) return { kind: "duplicate", cursor: this.current() };
    const expectedSequence = this.cursor.sequence + 1;
    if (event.sequence !== expectedSequence) {
      return {
        kind: "gap",
        cursor: this.current(),
        expectedSequence,
        receivedSequence: event.sequence,
      };
    }
    this.cursor = { waveId: event.waveId, sequence: event.sequence, eventId: event.id };
    return { kind: "apply", cursor: this.current() };
  }
}
