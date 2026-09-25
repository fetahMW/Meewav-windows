// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "meewav:globe-collaboration-requests:v1";

describe("collaboration request bridge provenance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it("persists a Shorts request without changing the legacy key or Globe origin", async () => {
    const bridge = await import("./collaborationRequestBridge");
    const request = bridge.submitGlobeCollaborationRequest({
      senderProfileId: "shorts-current-user",
      recipientProfileId: "shorts-maya",
      recipientName: "Maya Nova",
      recipientRole: "Beatmaker",
      recipientAvatar: "/images/shorts/maya.webp",
      recipientGradeLevel: 5,
      requestSource: "shorts",
      message: "On crée une session live ensemble ?",
      attachments: [],
    });

    expect(bridge.getGlobeCollaborationRequests()[0]).toMatchObject({
      id: request.id,
      origin: "globe",
      requestSource: "shorts",
      name: "Maya Nova",
    });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")[0])
      .toMatchObject({ id: request.id, requestSource: "shorts" });

    bridge.removeGlobeCollaborationRequest(request.id);
    expect(bridge.getGlobeCollaborationRequests()).toEqual([]);
  });

  it("reads an old v1 request without requestSource as a Globe request", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([{
      id: "globe-collab-legacy",
      senderProfileId: "sender-legacy",
      recipientProfileId: "recipient-legacy",
      recipientName: "Legacy Artist",
      recipientRole: "Artiste",
      recipientAvatar: "/avatars/utilisateur.png",
      recipientGradeLevel: 2,
      message: "Ancienne demande compatible",
      createdAt: "2026-07-30T12:00:00.000Z",
      attachments: [],
    }]));

    const bridge = await import("./collaborationRequestBridge");
    expect(bridge.getGlobeCollaborationRequests()).toEqual([
      expect.objectContaining({
        id: "globe-collab-legacy",
        origin: "globe",
        requestSource: "globe",
      }),
    ]);
  });
});
