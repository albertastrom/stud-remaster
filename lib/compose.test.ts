import { cacheScope, composeVerdict } from "./compose.ts";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

assert(
  composeVerdict({ relevant: 0.9, distraction: 0.1, workTool: 0.2 }) === "allow",
  "high relevance should allow",
);
assert(
  composeVerdict({ relevant: 0.1, distraction: 0.9, workTool: 0.1 }) === "block",
  "high distraction should block",
);
assert(
  composeVerdict({ relevant: 0.2, distraction: 0.2, workTool: 0.9 }) === "allow",
  "work tools should allow",
);
assert(
  composeVerdict({ relevant: 0.5, distraction: 0.5, workTool: 0.2 }) === "hold",
  "noul near 0.5 is hold, not medium intensity",
);
assert(
  cacheScope({ relevant: 0.2, distraction: 0.1, workTool: 0.9 }, "allow") === "host",
  "work tools cache at host",
);
assert(
  cacheScope({ relevant: 0.88, distraction: 0.1, workTool: 0.2 }, "allow") === "url",
  "topic-specific allow stays on the url",
);
assert(
  cacheScope({ relevant: 0.1, distraction: 0.92, workTool: 0.05 }, "block") === "url",
  "blocks stay on the url",
);

console.log("compose tests passed");
