import { createClient } from "genlayer-js";
import { localnet, studionet, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { finalizedFailure } from "./finality";

type NetworkName = "localnet" | "studionet" | "testnetBradbury";
declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}
const network = (process.env.NEXT_PUBLIC_NETWORK as NetworkName) || "studionet";
const chains = { localnet, studionet, testnetBradbury };
const readClient = createClient({ chain: chains[network] ?? studionet });

type RuntimeClient = {
  connect?: (name: NetworkName) => Promise<unknown>;
  readContract: (args: { address: string; functionName: string; args: unknown[] }) => Promise<unknown>;
  writeContract: (args: { address: string; functionName: string; args: unknown[]; value: bigint }) => Promise<string | { txId: string }>;
  waitForTransactionReceipt: (args: { hash: `0x${string}`; status: string; interval?: number; retries?: number }) => Promise<Record<string, unknown>>;
  getTransaction: (args: { hash: `0x${string}` }) => Promise<Record<string, unknown>>;
};

export type ChainResult = {
  success: boolean;
  data?: unknown;
  hash?: string;
  error?: string;
  receipt?: Record<string, unknown>;
  transaction?: Record<string, unknown>;
};

export const contractAddress = (): string => process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
export const explorerUrl = (): string => `${process.env.NEXT_PUBLIC_EXPLORER_BASE || "https://explorer-studio.genlayer.com/address/"}${contractAddress()}`;
export const txUrl = (hash: string): string => `${process.env.NEXT_PUBLIC_EXPLORER_TX_BASE || "https://explorer-studio.genlayer.com/tx/"}${hash}`;
const journalKey = () => `permitos:pending:${network}:${contractAddress().toLowerCase()}`;
export function pendingTransaction(): string {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(journalKey()) || "";
}

export async function recoverTransaction(): Promise<ChainResult> {
  let hash = "";
  try {
    hash = pendingTransaction();
    if (!hash) return { success: true };
    const transaction = await (readClient as unknown as RuntimeClient).getTransaction({ hash: hash as `0x${string}` });
    if (transaction.statusName !== "FINALIZED") return { success: false, hash, error: "This transaction is still pending. Do not submit it again." };
    const error = finalizedFailure(transaction);
    window.localStorage.removeItem(journalKey());
    return { success: !error, hash, transaction, error };
  } catch (error) {
    return { success: false, hash, error: error instanceof Error ? error.message : "Cannot verify pending transaction." };
  }
}

export async function connectWallet(): Promise<ChainResult> {
  if (!window.ethereum) return { success: false, error: "Install or unlock an EVM wallet." };
  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
    return accounts[0] ? { success: true, data: accounts[0] } : { success: false, error: "No account selected." };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Wallet connection failed." };
  }
}

export async function readContract(functionName: string, args: unknown[] = []): Promise<ChainResult> {
  const address = contractAddress();
  if (!address || /^0x0{40}$/i.test(address)) return { success: false, error: "Deploy and configure PermitOS first." };
  try {
    const data = await (readClient as unknown as RuntimeClient).readContract({ address, functionName, args });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Contract read failed." };
  }
}

export async function writeContract(functionName: string, args: unknown[] = []): Promise<ChainResult> {
  const address = contractAddress();
  if (!window.ethereum) return { success: false, error: "Connect a wallet before writing." };
  if (!address || /^0x0{40}$/i.test(address)) return { success: false, error: "Deploy and configure PermitOS first." };
  let hash = "";
  try {
    const pending = pendingTransaction();
    if (pending) return { success: false, hash: pending, error: "Recover the pending transaction before another write." };
    const handshake = await readContract("get_contract_version");
    const version = handshake.success ? unwrap<{ name: string; version: number; schema: string }>(handshake.data) : null;
    if (version?.name !== "PermitOS" || version.version !== 2 || version.schema !== "sealed-intake-v2") {
      return { success: false, error: handshake.error || "PermitOS contract version verification failed." };
    }
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
    if (!accounts[0]) return { success: false, error: "No wallet account selected." };
    const client = createClient({
      chain: chains[network] ?? studionet,
      provider: window.ethereum,
      account: accounts[0] as `0x${string}`,
    }) as unknown as RuntimeClient;
    if (client.connect) await client.connect(network);
    const raw = await client.writeContract({ address, functionName, args, value: BigInt(0) });
    hash = typeof raw === "string" ? raw : raw.txId;
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Missing transaction hash. Verify wallet activity before retrying.");
    window.localStorage.setItem(journalKey(), hash);
    const receipt = await client.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
      status: TransactionStatus.FINALIZED,
      interval: 2000,
      retries: 600,
    });
    const transaction = await client.getTransaction({ hash: hash as `0x${string}` });
    const failure = finalizedFailure(transaction);
    if (transaction.statusName === "FINALIZED") window.localStorage.removeItem(journalKey());
    if (failure) return { success: false, hash, error: failure, receipt, transaction };
    return { success: true, hash, data: receipt, receipt, transaction };
  } catch (error) {
    return { success: false, hash, error: error instanceof Error ? error.message : "Contract write failed." };
  }
}

export function unwrap<T>(value: unknown): T | null {
  try {
    if (typeof value === "string") return JSON.parse(value) as T;
    if (value && typeof value === "object" && "result" in value) {
      return unwrap<T>((value as { result: unknown }).result);
    }
    return value as T;
  } catch {
    return null;
  }
}
