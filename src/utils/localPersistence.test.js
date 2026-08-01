import { describe, it, expect, beforeEach } from "vitest";
import {
  loadLocalSnapshot,
  saveLocalSnapshot,
  clearLocalSnapshot,
  LEGACY_STORAGE_KEY,
  STORAGE_PREFIX,
  STORAGE_VERSION,
} from "./localPersistence";

const USER_ID = "test-user-123";

describe("localPersistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  describe("loadLocalSnapshot", () => {
    it("returns null when nothing has ever been saved for this user", () => {
      expect(loadLocalSnapshot(USER_ID)).toBeNull();
    });

    it("round-trips a saved snapshot back out with the same data", () => {
      saveLocalSnapshot(
        { activeRid: "hale-ohana", currentRole: "manager", tablesByR: { "hale-ohana": [{ id: "t1" }] } },
        USER_ID
      );

      const loaded = loadLocalSnapshot(USER_ID);
      expect(loaded).not.toBeNull();
      expect(loaded.activeRid).toBe("hale-ohana");
      expect(loaded.currentRole).toBe("manager");
      expect(loaded.tablesByR).toEqual({ "hale-ohana": [{ id: "t1" }] });
      expect(loaded.version).toBe(STORAGE_VERSION);
      expect(typeof loaded.savedAt).toBe("string");
    });

    it("scopes storage per user — one account never sees another account's data", () => {
      saveLocalSnapshot({ activeRid: "venue-a" }, "user-a");
      saveLocalSnapshot({ activeRid: "venue-b" }, "user-b");

      expect(loadLocalSnapshot("user-a").activeRid).toBe("venue-a");
      expect(loadLocalSnapshot("user-b").activeRid).toBe("venue-b");
    });

    it("falls back to defaults for missing or invalid fields instead of crashing", () => {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}:${USER_ID}`,
        JSON.stringify({ currentRole: "not-a-real-role", restaurants: "not-an-array" })
      );

      const loaded = loadLocalSnapshot(USER_ID);
      expect(loaded.currentRole).toBe("server");
      expect(loaded.restaurants).toEqual([]);
      expect(loaded.tablesByR).toEqual({});
    });

    it("returns null (not a throw) when the stored JSON is corrupted", () => {
      window.localStorage.setItem(`${STORAGE_PREFIX}:${USER_ID}`, "{not valid json");
      expect(() => loadLocalSnapshot(USER_ID)).not.toThrow();
      expect(loadLocalSnapshot(USER_ID)).toBeNull();
    });

    it("does NOT migrate legacy shared data unless explicitly allowed", () => {
      window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ activeRid: "legacy-venue" }));

      const loaded = loadLocalSnapshot(USER_ID, { allowLegacyMigration: false });
      expect(loaded).toBeNull();
      // and it must not have copied the legacy data into this user's own key either
      expect(window.localStorage.getItem(`${STORAGE_PREFIX}:${USER_ID}`)).toBeNull();
    });

    it("migrates legacy data exactly once when allowed, then reuses the migrated copy", () => {
      window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ activeRid: "legacy-venue" }));

      const firstLoad = loadLocalSnapshot(USER_ID, { allowLegacyMigration: true });
      expect(firstLoad.activeRid).toBe("legacy-venue");

      // Now that it's migrated, it should load straight from the user key even
      // without the migration flag (and even if the legacy key later disappears).
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      const secondLoad = loadLocalSnapshot(USER_ID, { allowLegacyMigration: false });
      expect(secondLoad.activeRid).toBe("legacy-venue");
    });
  });

  describe("clearLocalSnapshot", () => {
    it("removes the saved snapshot so a later load returns null again", () => {
      saveLocalSnapshot({ activeRid: "hale-ohana" }, USER_ID);
      expect(loadLocalSnapshot(USER_ID)).not.toBeNull();

      clearLocalSnapshot(USER_ID);
      expect(loadLocalSnapshot(USER_ID)).toBeNull();
    });
  });
});
