// Regression test for the HeyGen failure-reason extraction.
//
// The bug: routes/heygen.js read `data.message`. HeyGen's avatar_video.fail
// event carries the reason in `msg` (confirmed in HeyGen's webhook docs), so
// every failure was stored as the bare string "heygen reported failure" —
// 194 production rows with no diagnosable cause.
//
// This mirrors the extraction expression in routes/heygen.js. Keep the two in
// sync; if that expression changes, change this and re-run.

function extractReason(data) {
  return (
    data.msg || data.message || data.error || data.reason ||
    (Object.keys(data).length
      ? `heygen reported failure (no message field); event_data=${JSON.stringify(data).slice(0, 400)}`
      : "heygen reported failure (empty event_data)")
  );
}

const cases = [
  {
    name: "real HeyGen shape — reason in msg (THE BUG)",
    data: { video_id: "abc123", msg: "Insufficient credit. This operation requires 10 credits.", callback_id: "vj_x" },
    expect: (r) => r.includes("Insufficient credit"),
  },
  {
    name: "msg wins over other spellings",
    data: { msg: "real reason", message: "wrong", error: "also wrong" },
    expect: (r) => r === "real reason",
  },
  {
    name: "legacy/alternate: message",
    data: { video_id: "x", message: "quota exceeded" },
    expect: (r) => r === "quota exceeded",
  },
  {
    name: "alternate: error",
    data: { video_id: "x", error: "avatar not found" },
    expect: (r) => r === "avatar not found",
  },
  {
    name: "no reason field at all — must NOT lose the payload",
    data: { video_id: "abc123", callback_id: "vj_x", code: 40012 },
    expect: (r) => r.includes("event_data=") && r.includes("40012") && r.includes("abc123"),
  },
  {
    name: "empty event_data — must be explicit, not silently generic",
    data: {},
    expect: (r) => r === "heygen reported failure (empty event_data)",
  },
  {
    name: "long payload is truncated, not unbounded",
    data: { blob: "x".repeat(5000) },
    expect: (r) => r.length < 600,
  },
];

const fails = [];
for (const c of cases) {
  let reason;
  try {
    reason = extractReason(c.data);
  } catch (e) {
    fails.push(`${c.name}: threw ${e.message}`);
    continue;
  }
  if (!c.expect(reason)) fails.push(`${c.name}\n    got: ${String(reason).slice(0, 200)}`);
  // The regression we are guarding against: the bare, useless string.
  if (reason === "heygen reported failure") {
    fails.push(`${c.name}: produced the bare pre-fix string`);
  }
}

console.log(
  fails.length
    ? `FAIL (${fails.length}/${cases.length}):\n` + fails.join("\n")
    : `PASS - ${cases.length}/${cases.length}: failure reasons are captured, never the bare "heygen reported failure"`
);
process.exit(fails.length ? 1 : 0);
