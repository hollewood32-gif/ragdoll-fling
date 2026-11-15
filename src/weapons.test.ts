// Tests for weapon prices, levels and saving. Run with: npm test

import { describe, expect, it } from "vitest";
import type { ScoreStorage } from "./bestScore";
import {
  blastFalloff,
  buyWeapon,
  cooldownLeft,
  DEFAULT_ORDER,
  keyForSlot,
  loadOrder,
  moveWeapon,
  saveOrder,
  WEAPON_ORDER_KEY,
  loadSelectedWeapon,
  launchAngle,
  loadWeapons,
  MAX_WEAPON_LEVEL,
  nextWeaponPrice,
  saveSelectedWeapon,
  saveWeapons,
  selectableWeapons,
  spikesMultiplier,
  STARTING_WEAPONS,
  weaponPower,
  WEAPONS_KEY,
} from "./weapons";

function memory(initial: Record<string, string> = {}): ScoreStorage {
  const data = { ...initial };
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe("starting weapons", () => {
  it("gives everyone the Fist, and nothing else", () => {
    expect(Object.entries(STARTING_WEAPONS).filter(([, level]) => level > 0)).toEqual([["fist", 1]]);
  });
});

describe("prices", () => {
  it("charges the buy price, then 0.5x, 1x, 1.5x and 2x of it", () => {
    expect(nextWeaponPrice("spikes", 0)).toBe(3000);
    expect(nextWeaponPrice("spikes", 1)).toBe(1500);
    expect(nextWeaponPrice("spikes", 2)).toBe(3000);
    expect(nextWeaponPrice("spikes", 3)).toBe(4500);
    expect(nextWeaponPrice("spikes", 4)).toBe(6000);
    expect(nextWeaponPrice("spikes", MAX_WEAPON_LEVEL)).toBeNull();
  });

  it("prices the free Fist's level-ups like a 1,000-coin weapon", () => {
    expect(nextWeaponPrice("fist", 1)).toBe(500);
    expect(nextWeaponPrice("fist", 4)).toBe(2000);
  });
});

describe("buying", () => {
  it("buys a weapon and takes the coins", () => {
    expect(buyWeapon(STARTING_WEAPONS, "spikes", 3500)).toEqual({ levels: { ...STARTING_WEAPONS, spikes: 1 }, coins: 500 });
  });

  it("refuses when the player can't afford it or it's maxed", () => {
    expect(buyWeapon(STARTING_WEAPONS, "spikes", 2999)).toBeNull();
    expect(buyWeapon({ ...STARTING_WEAPONS, fist: MAX_WEAPON_LEVEL }, "fist", 99999)).toBeNull();
  });
});

describe("power", () => {
  it("adds 15% per level after the first", () => {
    expect(weaponPower(1)).toBe(1);
    expect(weaponPower(5)).toBeCloseTo(1.6);
  });

  it("spiked walls add 25%, then 10% per level, and nothing when not owned", () => {
    expect(spikesMultiplier(0)).toBe(1);
    expect(spikesMultiplier(1)).toBeCloseTo(1.25);
    expect(spikesMultiplier(5)).toBeCloseTo(1.65);
  });
});

describe("selecting", () => {
  it("only lists owned weapons that have a key", () => {
    expect(selectableWeapons({ ...STARTING_WEAPONS, axe: 2, spikes: 3 }).map((w) => w.id)).toEqual(["fist", "axe"]);
  });

  it("remembers the selected weapon and falls back to the first one", () => {
    const storage = memory();
    expect(loadSelectedWeapon(storage, STARTING_WEAPONS)).toBe("fist");
    saveSelectedWeapon(storage, "spikes"); // not selectable
    expect(loadSelectedWeapon(storage, STARTING_WEAPONS)).toBe("fist");
  });
});

describe("saving", () => {
  it("saves and loads levels", () => {
    const storage = memory();
    saveWeapons(storage, { ...STARTING_WEAPONS, fist: 3, bat: 1, spikes: 2 });
    expect(loadWeapons(storage)).toEqual({ ...STARTING_WEAPONS, fist: 3, bat: 1, spikes: 2 });
  });

  it("repairs broken or out-of-range saves", () => {
    expect(loadWeapons(memory({ [WEAPONS_KEY]: "not json" }))).toEqual(STARTING_WEAPONS);
    expect(loadWeapons(memory({ [WEAPONS_KEY]: '{"fist":0,"spikes":99}' }))).toEqual({ ...STARTING_WEAPONS, spikes: 5 });
    expect(loadWeapons(memory({ [WEAPONS_KEY]: '{"fist":2.5,"spikes":"3"}' }))).toEqual(STARTING_WEAPONS);
  });
});

describe("bat and axe", () => {
  it("cost 1,000 and 2,000, and use keys 2 and 3", () => {
    expect(nextWeaponPrice("bat", 0)).toBe(1000);
    expect(nextWeaponPrice("axe", 0)).toBe(2000);
    expect(nextWeaponPrice("axe", 1)).toBe(1000);
    const keys = selectableWeapons({ ...STARTING_WEAPONS, bat: 1, axe: 1, spikes: 1 }).map((_, i) => keyForSlot(i));
    expect(keys).toEqual([1, 2, 3]);
  });
});

describe("guns", () => {
  it("cost 1,500 and 3,000, and use keys 4 and 5", () => {
    expect(nextWeaponPrice("pistol", 0)).toBe(1500);
    expect(nextWeaponPrice("revolver", 0)).toBe(3000);
    const all = { ...STARTING_WEAPONS, bat: 1, axe: 1, pistol: 1, revolver: 1, spikes: 1 };
    expect(selectableWeapons(all).map((_, i) => keyForSlot(i))).toEqual([1, 2, 3, 4, 5]);
  });

  it("reports how much cooldown is left", () => {
    expect(cooldownLeft(1000, 1000, 500)).toBe(1);
    expect(cooldownLeft(1250, 1000, 500)).toBeCloseTo(0.5);
    expect(cooldownLeft(2000, 1000, 500)).toBe(0);
    expect(cooldownLeft(0, -Infinity, 500)).toBe(0);
  });
});

describe("explosives", () => {
  it("cost 2,500 to 7,500 and use keys 6 to 9", () => {
    expect(nextWeaponPrice("grenade", 0)).toBe(2500);
    expect(nextWeaponPrice("cluster", 0)).toBe(5000);
    expect(nextWeaponPrice("cannon", 0)).toBe(4000);
    expect(nextWeaponPrice("rpg", 0)).toBe(7500);
    const all = Object.fromEntries(Object.keys(STARTING_WEAPONS).map((id) => [id, 1])) as typeof STARTING_WEAPONS;
    expect(selectableWeapons(all).map((_, i) => keyForSlot(i))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, null, null, null]);
  });

  it("blasts hit hardest at the center and fade to a quarter at the edge", () => {
    expect(blastFalloff(0, 100)).toBe(1);
    expect(blastFalloff(50, 100)).toBeCloseTo(0.625);
    expect(blastFalloff(99.9, 100)).toBeCloseTo(0.25, 2);
    expect(blastFalloff(100, 100)).toBe(0);
  });

  it("aims a cannonball so gravity drops it on the target", () => {
    const speed = 20;
    const gravity = 0.3;
    for (const [dx, dy] of [[400, 0], [-300, 100], [250, -80]]) {
      const angle = launchAngle(dx, dy, speed, gravity)!;
      // Fly it step by step and check it passes close to the target.
      let x = 0;
      let y = 0;
      let vx = Math.cos(angle) * speed;
      let vy = Math.sin(angle) * speed;
      let closest = Infinity;
      for (let step = 0; step < 200; step++) {
        x += vx;
        y += vy;
        vy += gravity;
        closest = Math.min(closest, Math.hypot(x - dx, y - dy));
      }
      expect(closest).toBeLessThan(speed); // within one step of travel
    }
  });

  it("says when a target is out of range", () => {
    expect(launchAngle(5000, 0, 10, 0.3)).toBeNull();
  });
});

describe("katana and shotgun", () => {
  it("cost 2,000 and 3,500, and take the next free keys", () => {
    expect(nextWeaponPrice("katana", 0)).toBe(2000);
    expect(nextWeaponPrice("shotgun", 0)).toBe(3500);
    const owned = { ...STARTING_WEAPONS, katana: 1, shotgun: 1 };
    expect(selectableWeapons(owned).map((w, i) => [w.id, keyForSlot(i)])).toEqual([
      ["fist", 1],
      ["katana", 2],
      ["shotgun", 3],
    ]);
  });
});

describe("flamethrower and boomerang", () => {
  it("cost 6,000 and 3,000, and take the next free keys", () => {
    expect(nextWeaponPrice("flamethrower", 0)).toBe(6000);
    expect(nextWeaponPrice("boomerang", 0)).toBe(3000);
    const owned = { ...STARTING_WEAPONS, flamethrower: 1, boomerang: 1 };
    expect(selectableWeapons(owned).map((w, i) => [w.id, keyForSlot(i)])).toEqual([
      ["fist", 1],
      ["flamethrower", 2],
      ["boomerang", 3],
    ]);
  });
});

describe("weapon order (Loadout)", () => {
  it("numbers the slots 1 to 9, then 0, then no key", () => {
    expect([0, 8, 9, 10].map(keyForSlot)).toEqual([1, 9, 0, null]);
  });

  it("lists owned weapons in the chosen order, so keys follow it", () => {
    const owned = { ...STARTING_WEAPONS, bat: 1, rpg: 1 };
    const custom = ["rpg", ...DEFAULT_ORDER.filter((id) => id !== "rpg")] as typeof DEFAULT_ORDER;
    expect(selectableWeapons(owned, custom).map((w, i) => [w.id, keyForSlot(i)])).toEqual([
      ["rpg", 1],
      ["fist", 2],
      ["bat", 3],
    ]);
  });

  it("moves a weapon one place, and ignores moves past the ends", () => {
    expect(moveWeapon(["fist", "bat", "axe"], "axe", -1)).toEqual(["fist", "axe", "bat"]);
    expect(moveWeapon(["fist", "bat", "axe"], "fist", -1)).toEqual(["fist", "bat", "axe"]);
    expect(moveWeapon(["fist", "bat", "axe"], "axe", 1)).toEqual(["fist", "bat", "axe"]);
  });

  it("saves and loads the order, repairing bad saves and adding new weapons", () => {
    const data: Record<string, string> = {};
    const storage = { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
    expect(loadOrder(storage)).toEqual(DEFAULT_ORDER);
    const custom = moveWeapon(DEFAULT_ORDER, "bat", -1);
    saveOrder(storage, custom);
    expect(loadOrder(storage)).toEqual(custom);
    // A save with junk, a repeat, and only two weapons: keep those two first, then the rest.
    data[WEAPON_ORDER_KEY] = JSON.stringify(["rpg", "nope", "rpg", "bat"]);
    const repaired = loadOrder(storage);
    expect(repaired.slice(0, 2)).toEqual(["rpg", "bat"]);
    expect(new Set(repaired)).toEqual(new Set(DEFAULT_ORDER)); // every weapon, once
    expect(repaired).toHaveLength(DEFAULT_ORDER.length);
    data[WEAPON_ORDER_KEY] = "not json";
    expect(loadOrder(storage)).toEqual(DEFAULT_ORDER);
  });
});
