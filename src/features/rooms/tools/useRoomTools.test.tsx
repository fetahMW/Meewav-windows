import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { DemoRoomToolsRepository, type RoomToolsRepository } from "./roomTools.service";
import { useRoomTools } from "./useRoomTools";

describe("useRoomTools Classe live role", () => {
  it("promotes a server-projected seat occupant without using the common Guest role", async () => {
    const roomId = "51000000-0000-4000-8000-000000000097";
    const accountId = "61000000-0000-4000-8000-000000000097";
    const state = createRoomToolsFixture("classe", roomId);
    const occupiedSeat = state.classe?.seats.find((seat) => seat.person);
    if (!occupiedSeat?.person) throw new Error("classe_fixture_student_missing");
    occupiedSeat.person.id = accountId;
    state.audience = { eligible: true, actorRole: "premium_participant", classeSeatNumber: occupiedSeat.number, classeAccessKind: "paid_seat" };
    const execute = vi.fn(async () => state);
    const repository: RoomToolsRepository = {
      load: vi.fn(async () => state),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      execute,
      publicProjection: vi.fn(async () => state),
      projectionForRole: vi.fn(async () => state),
    };

    const { result } = renderHook(() => useRoomTools({
      roomType: "classe",
      roomId,
      role: "viewer",
      accountId,
      source: "live",
      repository,
    }));

    await waitFor(() => expect(result.current.role).toBe("premium_participant"));
    await act(() => result.current.execute({ type: "classe.hand.raise", personId: accountId }));

    expect(execute).toHaveBeenCalledWith(
      "classe",
      roomId,
      "premium_participant",
      { type: "classe.hand.raise", personId: accountId },
      accountId,
    );
  });

  it("keeps a live viewer read-only when the server does not stamp a Classe entitlement", async () => {
    const roomId = "51000000-0000-4000-8000-000000000098";
    const accountId = "61000000-0000-4000-8000-000000000098";
    const state = createRoomToolsFixture("classe", roomId);
    const occupiedSeat = state.classe?.seats.find((seat) => seat.person);
    if (!occupiedSeat?.person) throw new Error("classe_fixture_student_missing");
    occupiedSeat.person.id = accountId;
    state.audience = { eligible: false, actorRole: "viewer", classeSeatNumber: null, classeAccessKind: null };
    const repository: RoomToolsRepository = {
      load: vi.fn(async () => state),
      subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
      execute: vi.fn(async () => state),
      publicProjection: vi.fn(async () => state),
      projectionForRole: vi.fn(async () => state),
    };

    const { result } = renderHook(() => useRoomTools({
      roomType: "classe",
      roomId,
      role: "viewer",
      accountId,
      source: "live",
      repository,
    }));

    await waitFor(() => expect(result.current.state).not.toBeNull());
    expect(result.current.role).toBe("viewer");
  });
});

describe("useRoomTools · commandes de couche Wave", () => {
  it("rerend les deux consommateurs après Mute, Solo et gain", async () => {
    const repository = new DemoRoomToolsRepository();
    const roomId = `wave-layer-hooks-${crypto.randomUUID()}`;
    const options = {
      roomType: "wave" as const,
      roomId,
      role: "host" as const,
      accountId: "host-wave",
      source: "demo" as const,
      repository,
    };
    const ui = renderHook(() => useRoomTools(options));
    const controller = renderHook(() => useRoomTools(options));
    await waitFor(() => expect(ui.result.current.state?.wave?.layers[0]).toBeDefined());
    await waitFor(() => expect(controller.result.current.state?.wave?.layers[0]).toBeDefined());
    const layerId = ui.result.current.state!.wave!.layers[0].id;
    const initialRevision = controller.result.current.state!.revision;

    await act(async () => {
      await ui.result.current.execute({
        type: "wave.sequence.layer",
        layerId,
        patch: { muted: true, solo: true, gain: .29 },
      });
    });

    await waitFor(() => expect(controller.result.current.state?.wave?.layers.find((layer) => layer.id === layerId))
      .toMatchObject({ muted: true, solo: true, gain: .29 }));
    expect(controller.result.current.state!.revision).toBe(initialRevision + 1);
    expect(ui.result.current.state?.wave?.layers.find((layer) => layer.id === layerId))
      .toMatchObject({ muted: true, solo: true, gain: .29 });
    ui.unmount();
    controller.unmount();
  });
});
