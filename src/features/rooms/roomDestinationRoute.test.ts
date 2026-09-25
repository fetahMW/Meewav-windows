import { describe, expect, it } from "vitest";
import { getRoomDestinationFromPath } from "./roomDestinationRoute";

describe("room destination route", () => {
  it("opens La Loge from both canonical Rooms route prefixes", () => {
    expect(getRoomDestinationFromPath("/rooms/loge")).toBe("loge");
    expect(getRoomDestinationFromPath("/room/loge")).toBe("loge");
  });

  it("preserves La Place as the default Rooms destination", () => {
    expect(getRoomDestinationFromPath("/rooms")).toBe("place");
    expect(getRoomDestinationFromPath("/rooms/unknown")).toBe("place");
  });

  it("keeps collection walls inside the Rooms home destination", () => {
    expect(getRoomDestinationFromPath("/rooms/collections/buzz-maintenant")).toBe("home");
    expect(getRoomDestinationFromPath("/room/collections/pour-toi")).toBe("home");
  });
});
