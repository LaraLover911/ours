// Unit test for the Listen Together clock (no network). Run: node --experimental-strip-types scripts/test-sync.mjs
import assert from "node:assert/strict";
import { decide, targetPosition } from "../src/lib/listen/sync.ts";

const at = (ms) => new Date(ms).toISOString();
const t0 = 1_800_000_000_000;
// Server is 2 s ahead of this device; song started at server time t0 at position 10 s.
const room = { status: "playing", base_pos_ms: 10_000, base_at: at(t0) };
assert.equal(targetPosition(room, t0 - 2000 + 5000, 2000), 15_000, "playing: base + elapsed on the server clock");
assert.equal(targetPosition({ ...room, status: "paused" }, t0 + 99_999, 0), 10_000, "paused: position frozen");
assert.equal(targetPosition(room, t0 + 999_999, 0, 180_000), 180_000, "clamped to duration");

assert.deepEqual(decide({ room, target: 15_000, position: 15_300, playing: true, durationMs: 200_000 }), [], "small drift: leave it");
assert.deepEqual(decide({ room, target: 15_000, position: 17_000, playing: true, durationMs: 200_000 }), [{ type: "seek", ms: 15_000 }], "big drift: seek");
assert.deepEqual(decide({ room, target: 15_000, position: 15_000, playing: false, durationMs: 200_000 }), [{ type: "play" }], "should play");
assert.deepEqual(decide({ room: { ...room, status: "paused" }, target: 10_000, position: 10_100, playing: true, durationMs: null }), [{ type: "pause" }], "should pause");
assert.deepEqual(decide({ room, target: 199_900, position: 199_000, playing: true, durationMs: 200_000 }), [{ type: "ended" }], "end of song");
console.log("✓ listen sync: 8 checks passed");
