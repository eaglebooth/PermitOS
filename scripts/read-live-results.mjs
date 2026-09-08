import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const address = process.env.PERMITOS_CONTRACT_ADDRESS;
const tag = process.env.PERMITOS_RUN_TAG;
if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? "") || !/^\d+$/.test(tag ?? "")) throw new Error("Set PERMITOS_CONTRACT_ADDRESS and PERMITOS_RUN_TAG");
const client = createClient({ chain: studionet });
async function read(functionName, args = []) {
  const raw = await client.readContract({ address, functionName, args });
  let value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (value && typeof value === "object" && Object.keys(value).length === 1 && "result" in value) {
    value = typeof value.result === "string" ? JSON.parse(value.result) : value.result;
  }
  return value;
}
const expected = {
  READY: ["READY_FOR_REGULATOR_REVIEW", ["DEMONSTRATED", "DEMONSTRATED", "DEMONSTRATED"]],
  ACTION: ["ACTION_REQUIRED", ["DEMONSTRATED", "DEMONSTRATED", "NOT_DEMONSTRATED"]],
  HUMAN: ["HUMAN_REVIEW", ["DEMONSTRATED", "UNRESOLVED", "DEMONSTRATED"]],
};
const version = await read("get_contract_version");
if (version.version !== 4 || version.schema !== "sealed-intake-v4") throw new Error("Unexpected deployment");
const results = [];
for (const [name, [outcome, conditionOutcomes]] of Object.entries(expected)) {
  const id = `EP204-${name}-${tag}`;
  const permit = await read("get_permit", [id]);
  const conditions = await Promise.all([0, 1, 2].map(i => read("get_condition", [id, String(i)])));
  const passed = permit.status === "FINALIZED" && permit.result === outcome && permit.accepted_digest === permit.pack_digest && conditions.every((c, i) => c.status === "ASSESSED" && c.outcome === conditionOutcomes[i]);
  results.push({ name, id, passed, permit, conditions });
}
console.log(JSON.stringify({ address, version, results }, null, 2));
if (results.some(result => !result.passed)) process.exitCode = 1;
