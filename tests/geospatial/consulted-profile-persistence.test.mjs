import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const persistenceSource = await readFile(
  "src/features/globe/consultedProfilePersistence.ts",
  "utf8",
);
const persistenceJavaScript = ts.transpileModule(persistenceSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const persistence = await import(
  `data:text/javascript;base64,${Buffer.from(persistenceJavaScript).toString("base64")}`
);

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }
}

test("consulted avatars survive logout/login and remain isolated by Supabase user id", () => {
  const localStorage = new MemoryStorage();
  globalThis.window = { localStorage };

  try {
    persistence.persistConsultedProfileIds("account-a", ["artist-1", "artist-2", "artist-1"]);
    persistence.persistHideConsultedProfilesPreference("account-a", true);

    assert.deepEqual(
      persistence.readConsultedProfileIds("account-a"),
      ["artist-1", "artist-2"],
    );
    assert.equal(persistence.readHideConsultedProfilesPreference("account-a"), true);
    assert.deepEqual(persistence.readConsultedProfileIds("account-b"), []);
    assert.equal(persistence.readHideConsultedProfilesPreference("account-b"), false);

    persistence.persistConsultedProfileIds(null, ["must-not-leak"]);
    assert.equal(localStorage.length, 2);
    assert.deepEqual(persistence.readConsultedProfileIds("account-a"), ["artist-1", "artist-2"]);
  } finally {
    delete globalThis.window;
  }
});

test("consulted avatar persistence repairs malformed data and caps account history", () => {
  const localStorage = new MemoryStorage();
  globalThis.window = { localStorage };

  try {
    const key = persistence.getConsultedProfileIdsStorageKey("account-a");
    localStorage.setItem(key, "not-json");
    assert.deepEqual(persistence.readConsultedProfileIds("account-a"), []);

    const ids = Array.from({ length: 505 }, (_, index) => `artist-${index}`);
    persistence.persistConsultedProfileIds("account-a", ids);
    const restoredIds = persistence.readConsultedProfileIds("account-a");
    assert.equal(restoredIds.length, 500);
    assert.equal(restoredIds[0], "artist-5");
    assert.equal(restoredIds.at(-1), "artist-504");
  } finally {
    delete globalThis.window;
  }
});
