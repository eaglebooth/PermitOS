import { transactionResultNumberToName } from "genlayer-js/types";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

export function finalizedFailure(transaction: Record<string, unknown>): string {
  if (transaction.statusName !== "FINALIZED") {
    return "Transaction is not finalized. Check the transaction before retrying.";
  }
  const names: Readonly<Record<string, string>> = transactionResultNumberToName;
  const consensus = transaction.resultName ?? names[String(transaction.result)];
  if (consensus !== "AGREE" && consensus !== "MAJORITY_AGREE") {
    return "Finalized transaction did not reach successful consensus.";
  }
  const leaders = object(transaction.consensus_data).leader_receipt;
  const leader = object(Array.isArray(leaders) ? leaders[0] : undefined);
  const result = object(leader.result);
  if (result.status === "rollback") {
    return `Contract rejected this action: ${String(result.payload ?? "ROLLBACK")}`;
  }
  if (leader.execution_result !== "SUCCESS" || result.status !== "return") {
    return "Finalized execution success could not be verified.";
  }
  return "";
}

function candidates(source: unknown): unknown[] {
  if (!source || typeof source !== "object") return [source];
  const record = source as Record<string, unknown>;
  const consensus = object(record.consensus_data);
  const leaders = consensus.leader_receipt;
  const result = object(record.result);
  const payload = object(result.payload);
  return [
    ...(Array.isArray(leaders) ? leaders.flatMap(candidates) : []),
    payload.readable, result.readable, record.returnValue, record.return_value,
    record.output, record.readable, typeof record.result === "string" ? record.result : undefined,
  ];
}

export function decodeReturnedText(...sources: unknown[]): string {
  for (const source of sources) {
    for (const candidate of candidates(source)) {
      if (typeof candidate === "number" && Number.isSafeInteger(candidate)) return String(candidate);
      if (typeof candidate === "bigint") return candidate.toString();
      if (typeof candidate !== "string") continue;
      const clean = candidate.trim().replace(/^"|"$/g, "");
      if (/^[0-9]+$/.test(clean) || /^[0-9a-f]{64}$/i.test(clean)) return clean;
      try {
        const nested = decodeReturnedText(JSON.parse(candidate));
        if (nested) return nested;
      } catch { /* not JSON */ }
    }
  }
  throw new Error("FINALIZED_RETURN_VALUE_NOT_FOUND");
}
