import { beforeEach, describe, expect, it } from "vitest";
import {
  getTremplinStorageKey,
  readTremplinPersistedSet,
  writeTremplinPersistedSet,
} from "./tremplinPersistence";

describe("persistance Tremplin", () => {
  beforeEach(() => window.localStorage.clear());

  it("isole les suivis de chaque identité", () => {
    writeTremplinPersistedSet("followed-artists", "user:a", ["lunae", "maya", "lunae"]);
    writeTremplinPersistedSet("followed-artists", "user:b", ["sama-k"]);
    expect([...readTremplinPersistedSet("followed-artists", "user:a")]).toEqual(["lunae", "maya"]);
    expect([...readTremplinPersistedSet("followed-artists", "user:b")]).toEqual(["sama-k"]);
  });

  it("versionne et échappe le scope dans la clé", () => {
    expect(getTremplinStorageKey("room-reminders", "user:abc/123")).toBe(
      "meewav:tremplin:v2:user%3Aabc%2F123:room-reminders",
    );
  });

  it("retombe sur un ensemble vide lorsque le stockage est corrompu", () => {
    window.localStorage.setItem(getTremplinStorageKey("read-updates", "guest"), "{cassé");
    expect(readTremplinPersistedSet("read-updates", "guest").size).toBe(0);
  });

  it("migre les données de démonstration historiques sans les copier vers un vrai compte", () => {
    window.localStorage.setItem("meewav:tremplin:demo:followed-artists", JSON.stringify(["lunae"]));
    expect([...readTremplinPersistedSet("followed-artists", "preview:current_user")]).toEqual(["lunae"]);
    expect(readTremplinPersistedSet("followed-artists", "user:real").size).toBe(0);
  });
});
