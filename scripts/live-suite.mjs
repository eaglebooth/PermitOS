import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus, transactionResultNumberToName } from "genlayer-js/types";

const contract = process.env.PERMITOS_CONTRACT_ADDRESS?.trim();
if (!contract || !/^0x[0-9a-fA-F]{40}$/.test(contract)) throw new Error("Missing PERMITOS_CONTRACT_ADDRESS");

async function readSecrets(count) {
  if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  const values = []; let value = "";
  for await (const chunk of process.stdin) {
    for (const character of String(chunk)) {
      if (character === "\r" || character === "\n") {
        if (value) { values.push(value.trim()); value = ""; if (values.length === count) { if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false); return values; } }
      } else value += character;
    }
  }
  return values;
}

const keys = await readSecrets(2);
if (keys.length !== 2) throw new Error("Pass issuer and permittee private keys as two stdin lines");
const issuerAccount = createAccount(keys[0].startsWith("0x") ? keys[0] : `0x${keys[0]}`);
const permitteeAccount = createAccount(keys[1].startsWith("0x") ? keys[1] : `0x${keys[1]}`);
keys.fill("");
if (issuerAccount.address.toLowerCase() === permitteeAccount.address.toLowerCase()) throw new Error("Issuer and permittee must differ");
const issuer = createClient({ chain: studionet, account: issuerAccount });
const permittee = createClient({ chain: studionet, account: permitteeAccount });

const commit = "6297207931378e885179b5f4eeae511aec95a80a";
const base = `https://raw.githubusercontent.com/eaglebooth/PermitOS/${commit}/samples`;
const authority = "https://raw.githubusercontent.com/eaglebooth/PermitOS";
const permitSource = { url: `${base}/permit.txt`, sha: "14a52e7a246061fd6ba6143349daed1cf4a0f4eea10a72db34e633a51996af95", bytes: 617 };
const fixtures = {
  receipt: { url: `${base}/receipt-ready.txt`, sha: "f9d5abb13560289d942a30b112dc5e3afff68de0fba55ce4aad51444dcd4510d", bytes: 385, citation: "The quarterly monitoring report for permit EP-204 and facility RIVER-17 was accepted for 2026-Q3." },
  inspection: { url: `${base}/inspection-ready.txt`, sha: "382e8ed283ceac3cec48f6656b97f43491e44bc079de0b573eadb332127ac552", bytes: 432, citation: "This inspection certificate covers permit EP-204, facility RIVER-17, revision R1, jurisdiction DEMO-NORTH, and reporting period 2026-Q3." },
  ambiguous: { url: `${base}/inspection-ambiguous.txt`, sha: "dd0465b5b2854a95d29e81028edd101bb9f3092c54553cf6798411850873e201", bytes: 313, citation: "The note references permit EP-204 and facility RIVER-17 in jurisdiction DEMO-NORTH but does not identify the permit revision or reporting period." },
  actionsReady: { url: `${base}/actions-ready.txt`, sha: "e547afcac2e1e25e15ddd0a24d05bc4d3d9dd1394f0054891d271221dc647ddd", bytes: 345, citation: "No corrective action remains open for permit EP-204 during 2026-Q3." },
  actionsOpen: { url: `${base}/actions-open.txt`, sha: "0052b1bfcc5a7f3289571f30e909103c5681051128433263055b0d26d6da5db0", bytes: 348, citation: "Corrective action CA-77 remains open for permit EP-204 during 2026-Q3." },
};
const conditions = [
  { requirement: "An authority receipt must state that the quarterly monitoring report for permit EP-204 and facility RIVER-17 was accepted for 2026-Q3.", citation: "Condition 0: An authority receipt must state that the quarterly monitoring report for permit EP-204 and facility RIVER-17 was accepted for 2026-Q3.", severity: "MATERIAL", publisher: "SYNTHETIC_AUTHORITY" },
  { requirement: "An independent inspection certificate must cover permit EP-204, facility RIVER-17, revision R1, and reporting period 2026-Q3.", citation: "Condition 1: An independent inspection certificate must cover permit EP-204, facility RIVER-17, revision R1, and reporting period 2026-Q3.", severity: "CRITICAL", publisher: "SYNTHETIC_INSPECTOR" },
  { requirement: "The authority corrective-action register must state that no corrective action remains open for permit EP-204 during 2026-Q3.", citation: "Condition 2: The authority corrective-action register must state that no corrective action remains open for permit EP-204 during 2026-Q3.", severity: "MATERIAL", publisher: "SYNTHETIC_AUTHORITY" },
];

function failure(tx, receipt) {
  const leader = tx?.consensus_data?.leader_receipt?.[0];
  const execution = String(leader?.execution_result ?? "").toUpperCase();
  const resultStatus = String(leader?.result?.status ?? "").toUpperCase();
  const finalized = String(tx?.statusName ?? receipt?.statusName ?? "").toUpperCase();
  const consensus = String(tx?.resultName ?? transactionResultNumberToName?.[String(tx?.result)] ?? "").toUpperCase();
  if (execution && execution !== "SUCCESS") return String(leader?.result?.payload?.readable ?? leader?.result?.payload ?? leader?.error_description ?? execution);
  if (["ROLLBACK", "ERROR", "FAILED"].some(x => resultStatus.includes(x))) return String(leader?.result?.payload?.readable ?? leader?.result?.payload ?? resultStatus);
  if (finalized && finalized !== "FINALIZED") return `status ${finalized}`;
  if (consensus && !["AGREE", "MAJORITY_AGREE"].includes(consensus)) return `consensus ${consensus}`;
  return "";
}

async function retry(label, operation, attempts = 12) {
  let last;
  for (let index = 0; index < attempts; index++) {
    try { return await operation(); }
    catch (error) {
      last = error;
      process.stdout.write(`${label}: RPC retry ${index + 1}/${attempts}\n`);
      await new Promise(resolve => setTimeout(resolve, Math.min(2 + index, 10) * 1000));
    }
  }
  throw last;
}

async function finalized(client, hash) {
  const receipt = await retry("finality", () => client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 2000, retries: 40 }));
  let tx = receipt;
  try { tx = await retry("transaction readback", () => client.getTransaction({ hash })); } catch { /* receipt remains fallback */ }
  return { receipt, tx };
}

async function read(functionName, args = []) {
  const raw = await issuer.readContract({ address: contract, functionName, args });
  let value = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (value && typeof value === "object" && Object.keys(value).length === 1 && "result" in value) {
    const inner = value.result;
    if (typeof inner !== "string") return inner;
    try { return JSON.parse(inner); } catch { return inner; }
  }
  return value;
}

async function write(label, functionName, args, client = issuer) {
  const hash = await client.writeContract({ address: contract, functionName, args, value: 0n });
  process.stdout.write(`${label}: submitted ${hash}\n`);
  const { receipt, tx } = await finalized(client, hash);
  const rejected = failure(tx, receipt);
  if (rejected) throw new Error(`${label}: ${rejected}`);
  process.stdout.write(`${label}: FINALIZED\n`);
  return hash;
}

async function expectRollback(label, functionName, args, client, expectedError) {
  const before = await read("get_counts");
  const beforePermit = await read("get_permit", [args[0]]);
  const beforeConditions = await Promise.all(conditions.map((_, i) => read("get_condition", [args[0], String(i)])));
  const hash = await client.writeContract({ address: contract, functionName, args, value: 0n });
  process.stdout.write(`${label}: submitted ${hash}\n`);
  const { receipt, tx } = await finalized(client, hash);
  const rejected = failure(tx, receipt);
  if (!rejected || !rejected.includes(expectedError) || String(tx?.statusName ?? receipt?.statusName).toUpperCase() !== "FINALIZED") throw new Error(`${label}: expected finalized ${expectedError}, got ${rejected}`);
  const after = await read("get_counts");
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`${label}: rollback changed counts`);
  const afterPermit = await read("get_permit", [args[0]]);
  const afterConditions = await Promise.all(conditions.map((_, i) => read("get_condition", [args[0], String(i)])));
  if (JSON.stringify(beforePermit) !== JSON.stringify(afterPermit) || JSON.stringify(beforeConditions) !== JSON.stringify(afterConditions)) throw new Error(`${label}: rollback changed dossier state`);
  process.stdout.write(`${label}: FINALIZED rollback (${rejected})\n`);
  return hash;
}

const version = await read("get_contract_version");
if (version.name !== "PermitOS" || version.version !== 4 || version.schema !== "sealed-intake-v4") throw new Error("Contract handshake failed");
process.stdout.write(`HANDSHAKE_OK issuer=${issuerAccount.address} permittee=${permitteeAccount.address}\n`);

const runTag = String(Date.now());
const transactions = [];
async function runScenario(name, evidenceList, expected) {
  const id = `EP204-${name}-${runTag}`;
  process.stdout.write(`${name}.dossier: ${id}\n`);
  const now = Math.floor(Date.now() / 1000);
  transactions.push(await write(`${name}.create`, "create_permit", [id, "EP-204", permitteeAccount.address, "Synthetic discharge reporting permit", "R1", "RIVER-17", "DEMO-NORTH", "2026-Q3", 0, now + 7200, permitSource.url, permitSource.sha, permitSource.bytes]));
  for (let i = 0; i < conditions.length; i++) {
    const c = conditions[i];
    transactions.push(await write(`${name}.condition${i}`, "add_condition", [id, String(i), c.requirement, c.citation, c.severity, authority, c.publisher]));
  }
  transactions.push(await write(`${name}.seal`, "seal_permit", [id]));
  const sealed = await read("get_permit", [id]);
  if (sealed.status !== "SEALED" || !/^[0-9a-f]{64}$/.test(sealed.pack_digest)) throw new Error(`${name}: invalid sealed readback`);
  if (name === "READY") transactions.push(await expectRollback(`${name}.wrong_digest`, "accept_permit", [id, "0".repeat(64)], permittee, "PACK_DIGEST_MISMATCH"));
  transactions.push(await write(`${name}.accept`, "accept_permit", [id, sealed.pack_digest], permittee));
  if (name === "READY") transactions.push(await expectRollback(`${name}.wrong_role_submit`, "submit_evidence", [id, "0", fixtures.receipt.url, fixtures.receipt.sha, fixtures.receipt.bytes, fixtures.receipt.citation], issuer, "PERMITTEE_ONLY"));
  for (let i = 0; i < evidenceList.length; i++) {
    const evidence = evidenceList[i];
    transactions.push(await write(`${name}.submit${i}`, "submit_evidence", [id, String(i), evidence.url, evidence.sha, evidence.bytes, evidence.citation], permittee));
    const attempt = await read("get_evidence_attempt", [id, String(i), "0"]);
    if (attempt.source_url !== evidence.url || attempt.source_sha256 !== evidence.sha) throw new Error(`${name}: attempt ${i} readback mismatch`);
    transactions.push(await write(`${name}.select${i}`, "select_evidence", [id, String(i), "0"], permittee));
  }
  transactions.push(await write(`${name}.close`, "close_intake", [id], permittee));
  for (let i = 0; i < conditions.length; i++) transactions.push(await write(`${name}.assess${i}`, "assess_condition", [id, String(i)]));
  transactions.push(await write(`${name}.finalize`, "finalize_readiness", [id]));
  const final = await read("get_permit", [id]);
  if (final.status !== "FINALIZED" || final.result !== expected) throw new Error(`${name}: expected ${expected}, got ${final.status}/${final.result}`);
  const resolved = [];
  for (let i = 0; i < conditions.length; i++) resolved.push(await read("get_condition", [id, String(i)]));
  const expectedConditions = name === "ACTION" ? ["DEMONSTRATED", "DEMONSTRATED", "NOT_DEMONSTRATED"] : name === "HUMAN" ? ["DEMONSTRATED", "UNRESOLVED", "DEMONSTRATED"] : ["DEMONSTRATED", "DEMONSTRATED", "DEMONSTRATED"];
  if (resolved.some((condition, i) => condition.status !== "ASSESSED" || condition.outcome !== expectedConditions[i])) throw new Error(`${name}: unexpected condition outcomes ${JSON.stringify(resolved)}`);
  process.stdout.write(`SCENARIO_COMPLETE ${JSON.stringify({ name, id, expected, final, conditions: resolved })}\n`);
  return id;
}

const ready = await runScenario("READY", [fixtures.receipt, fixtures.inspection, fixtures.actionsReady], "READY_FOR_REGULATOR_REVIEW");
const action = await runScenario("ACTION", [fixtures.receipt, fixtures.inspection, fixtures.actionsOpen], "ACTION_REQUIRED");
const human = await runScenario("HUMAN", [fixtures.receipt, fixtures.ambiguous, fixtures.actionsReady], "HUMAN_REVIEW");
process.stdout.write(`LIVE_SUITE_COMPLETE ${JSON.stringify({ contract, commit, issuer: issuerAccount.address, permittee: permitteeAccount.address, dossiers: { ready, action, human }, transactions }, null, 2)}\n`);
