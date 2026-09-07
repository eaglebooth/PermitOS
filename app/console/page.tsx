"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { connectWallet, contractAddress, explorerUrl, pendingTransaction, readContract, recoverTransaction, txUrl, unwrap, writeContract } from "@/lib/genlayer";
import { decodeReturnedText } from "@/lib/finality";

type PermitRecord = {
  permit_id: string; permit_reference: string; issuer: string; permittee: string; title: string; revision: string;
  facility_id: string; jurisdiction: string; reporting_period: string;
  intake_open_at: number; intake_deadline: number; permit_url: string; permit_sha256: string;
  permit_byte_length: number; status: string; result: string; pack_digest: string;
  accepted_digest: string; condition_count: number; assessed_count: number;
  demonstrated_count: number; action_count: number; unresolved_count: number;
};
type ConditionRecord = {
  condition_id: string; requirement: string; severity: string; publisher_class: string;
  attempt_count: number; selected_attempt_id: string; status: string; outcome: string;
  permit_relation: string; facility_relation: string; period_relation: string;
  coverage: string; contradiction: boolean; reason: string;
};

const now = Math.floor(Date.now() / 1000);
const initialPermit = {
  permitId: "EP-204-Q3", permitReference: "EP-204", permittee: "", title: "Synthetic discharge reporting permit",
  revision: "R1", facilityId: "RIVER-17", jurisdiction: "DEMO-NORTH",
  reportingPeriod: "2026-Q3", openAt: String(now - 60), deadline: String(now + 86400),
  permitUrl: "", permitSha: "", permitLength: "",
};
const initialCondition = {
  id: "0", requirement: "Provide authority evidence for the exact permit, facility and reporting period.",
  permitCitation: "", severity: "MATERIAL", origin: "https://raw.githubusercontent.com/authority/repository",
  publisherClass: "SYNTHETIC_AUTHORITY",
};
const initialEvidence = { conditionId: "0", url: "", sha: "", length: "", citation: "", attemptId: "" };

const short = (value: string): string => value ? `${value.slice(0, 7)}…${value.slice(-5)}` : "—";

export default function PermitConsole() {
  const [wallet, setWallet] = useState("");
  const [permitForm, setPermitForm] = useState(initialPermit);
  const [conditionForm, setConditionForm] = useState(initialCondition);
  const [evidenceForm, setEvidenceForm] = useState(initialEvidence);
  const [permit, setPermit] = useState<PermitRecord | null>(null);
  const [conditions, setConditions] = useState<ConditionRecord[]>([]);
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; text: string }>({ kind: "info", text: "Configure a deployed contract, connect the issuer wallet, then create a bounded permit intake." });
  const [busy, setBusy] = useState("");
  const [lastHash, setLastHash] = useState("");
  const [pendingHash, setPendingHash] = useState("");
  const isIssuer = Boolean(wallet && permit && wallet.toLowerCase() === permit.issuer.toLowerCase());
  const isPermittee = Boolean(wallet && permit && wallet.toLowerCase() === permit.permittee.toLowerCase());
  useEffect(() => {
    const task = window.setTimeout(() => setPendingHash(pendingTransaction()), 0);
    return () => window.clearTimeout(task);
  }, []);

  const permitId = permitForm.permitId.trim();
  const status = permit?.status ?? "NOT LOADED";
  const activeStep = useMemo(() => {
    if (!permit) return 0;
    if (permit.status === "DRAFT") return 1;
    if (permit.status === "SEALED") return 2;
    if (permit.status === "INTAKE_OPEN") return 3;
    if (["INTAKE_CLOSED", "ASSESSING"].includes(permit.status)) return 4;
    return 5;
  }, [permit]);

  const sync = useCallback(async () => {
    if (!permitId) return;
    setBusy("sync");
    const version = await readContract("get_contract_version");
    const schema = version.success ? unwrap<{ name: string; version: number }>(version.data) : null;
    if (!schema || schema.name !== "PermitOS" || schema.version !== 4) {
      setNotice({ kind: "error", text: version.error || "Contract version handshake failed. Writes remain disabled." });
      setBusy("");
      return;
    }
    const response = await readContract("get_permit", [permitId]);
    const record = response.success ? unwrap<PermitRecord>(response.data) : null;
    if (!record) {
      setPermit(null); setConditions([]);
      setNotice({ kind: response.success ? "info" : "error", text: response.success ? `No permit named ${permitId} exists yet.` : response.error || "Readback failed." });
      setBusy("");
      return;
    }
    const loaded: ConditionRecord[] = [];
    for (let index = 0; index < record.condition_count; index += 1) {
      const result = await readContract("get_condition", [permitId, String(index)]);
      const condition = result.success ? unwrap<ConditionRecord>(result.data) : null;
      if (!condition) {
        setNotice({ kind: "error", text: `Condition ${index} could not be read. State was not accepted as synchronized.` });
        setBusy("");
        return;
      }
      loaded.push(condition);
    }
    setPermit(record); setConditions(loaded);
    setNotice({ kind: "success", text: `Authoritative readback synchronized at ${record.status}.` });
    setBusy("");
  }, [permitId]);

  const transact = useCallback(async (label: string, method: string, args: unknown[], capture?: "digest" | "attempt") => {
    setBusy(label); setNotice({ kind: "info", text: `${label}: waiting for finality and consensus…` });
    const result = await writeContract(method, args);
    if (!result.success) {
      setLastHash(result.hash || "");
      setPendingHash(pendingTransaction());
      setNotice({ kind: "error", text: result.error || `${label} failed.` });
      setBusy("");
      return;
    }
    setLastHash(result.hash || "");
    setPendingHash(pendingTransaction());
    if (capture) {
      try {
        const returned = decodeReturnedText(result.transaction, result.receipt, result.data);
        if (capture === "attempt") setEvidenceForm((old) => ({ ...old, attemptId: returned }));
      } catch {
        setNotice({ kind: "error", text: `${label} finalized, but its returned value could not be authenticated. Sync before continuing.` });
        setBusy("");
        await sync();
        return;
      }
    }
    setNotice({ kind: "success", text: `${label} finalized successfully. Authoritative state was refreshed.` });
    setBusy("");
    await sync();
  }, [sync]);

  const connect = useCallback(async () => {
    setBusy("wallet");
    const result = await connectWallet();
    if (result.success) {
      const address = String(result.data);
      setWallet(address);
      setNotice({ kind: "success", text: `Connected ${short(address)}. Confirm the required role before each write.` });
    } else setNotice({ kind: "error", text: result.error || "Wallet connection failed." });
    setBusy("");
  }, []);

  const recover = useCallback(async () => {
    setBusy("recover");
    const result = await recoverTransaction();
    setPendingHash(pendingTransaction());
    setLastHash(result.hash || "");
    setNotice({ kind: result.success ? "success" : "error", text: result.success ? "Pending transaction reconciled. Contract state can now be refreshed." : result.error || "Recovery failed." });
    setBusy("");
    if (result.success) await sync();
  }, [sync]);

  const steps = ["Create", "Seal", "Accept", "Evidence", "Assess", "Finalized"];
  return <main className="console-shell">
    <header className="console-header">
      <Link className="brand" href="/"><Image src="/permitos-logo.png" width={40} height={40} alt="PermitOS logo"/><span>PermitOS</span></Link>
      <span className="network-pill">● STUDIONET / SEALED INTAKE V4</span>
      <div className="console-header-actions"><button className="wallet-button" onClick={connect} disabled={Boolean(busy)}><WalletCards size={15}/> {wallet ? short(wallet) : "Connect wallet"}</button></div>
    </header>
    <div className="console-grid">
      <aside className="lifecycle-rail">
        <Link href="/" className="back-link">← Product</Link>
        <div className="rail-label section-index">Evidence intake</div>
        <h1>Close the dossier.</h1>
        <p>Every positive result requires a sealed pack and independently fetched authority evidence.</p>
        <ol className="rail-steps">{steps.map((step,index)=><li className={index === activeStep ? "active" : ""} key={step}><span>{String(index+1).padStart(2,"0")}</span>{step}</li>)}</ol>
        <div className="rail-note"><strong>Claim boundary</strong><br/>Readiness for human regulator review. Never legal compliance, permit validity or operating authority.</div>
      </aside>

      <section className="docket">
        <div className="docket-heading"><div><div className="section-index">Permit control plane / {String(activeStep+1).padStart(2,"0")}</div><h2>{status.replaceAll("_", " ")}</h2><p>One facility. One revision. One reporting period. Three bounded documentary conditions.</p></div><button className="sync-button" onClick={sync} disabled={Boolean(busy)}><RefreshCw size={15}/> Sync contract</button></div>
        <div className={`notice ${notice.kind}`}>{notice.text}{lastHash && <> <a href={txUrl(lastHash)} target="_blank" rel="noreferrer">View transaction ↗</a></>}{pendingHash && <button className="inline-recover" onClick={recover}>Recover pending write</button>}</div>

        <article className="action-card"><div className="card-head"><div className="card-num">01</div><div><h3>Create permit identity</h3><p>Issuer action · all fields become part of the sealed pack.</p></div><span className="status-chip">{permit ? "RECORDED" : "OPEN"}</span></div><div className="card-body"><div className="field-grid">
          {([['Dossier ID','permitId'],['External permit reference','permitReference'],['Permittee wallet','permittee'],['Title','title'],['Revision','revision'],['Facility ID','facilityId'],['Jurisdiction','jurisdiction'],['Reporting period','reportingPeriod'],['Intake opens (unix)','openAt'],['Intake deadline (unix)','deadline'],['Permit source URL','permitUrl'],['Permit SHA-256','permitSha'],['Exact byte length','permitLength']] as const).map(([label,key])=><div className={`field ${['title','permitUrl','permitSha'].includes(key)?'wide':''}`} key={key}><label>{label}</label><input value={permitForm[key]} onChange={(event)=>{setPermitForm({...permitForm,[key]:event.target.value});if(key==='permitId'){setPermit(null);setConditions([]);}}}/></div>)}
        </div><div className="card-actions"><button className="action" disabled={Boolean(busy)||Boolean(permit)||!wallet} onClick={()=>transact("Create permit","create_permit",[permitId,permitForm.permitReference,permitForm.permittee,permitForm.title,permitForm.revision,permitForm.facilityId,permitForm.jurisdiction,permitForm.reportingPeriod,Number(permitForm.openAt),Number(permitForm.deadline),permitForm.permitUrl,permitForm.permitSha,Number(permitForm.permitLength)])}>Create permit</button></div></div></article>

        <article className="action-card"><div className="card-head"><div className="card-num">02</div><div><h3>Build and seal condition pack</h3><p>Issuer action · maximum three sequential conditions.</p></div><span className="status-chip">{permit?.status === "DRAFT" ? `${permit.condition_count}/3` : permit ? "LOCKED" : "WAITING"}</span></div><div className="card-body"><div className="field-grid">
          <div className="field"><label>Condition ID</label><input value={conditionForm.id} onChange={e=>setConditionForm({...conditionForm,id:e.target.value})}/></div><div className="field"><label>Severity</label><select value={conditionForm.severity} onChange={e=>setConditionForm({...conditionForm,severity:e.target.value})}><option>ROUTINE</option><option>MATERIAL</option><option>CRITICAL</option></select></div>
          <div className="field wide"><label>Bounded requirement</label><textarea value={conditionForm.requirement} onChange={e=>setConditionForm({...conditionForm,requirement:e.target.value})}/></div><div className="field wide"><label>Exact permit citation</label><textarea value={conditionForm.permitCitation} onChange={e=>setConditionForm({...conditionForm,permitCitation:e.target.value})}/></div>
          <div className="field"><label>Approved evidence repository prefix</label><input value={conditionForm.origin} onChange={e=>setConditionForm({...conditionForm,origin:e.target.value})}/></div><div className="field"><label>Publisher class (descriptive)</label><input value={conditionForm.publisherClass} onChange={e=>setConditionForm({...conditionForm,publisherClass:e.target.value})}/></div>
        </div><div className="card-actions"><button className="action secondary" disabled={Boolean(busy)||permit?.status!=="DRAFT"||!isIssuer} onClick={()=>transact("Add condition","add_condition",[permitId,conditionForm.id,conditionForm.requirement,conditionForm.permitCitation,conditionForm.severity,conditionForm.origin,conditionForm.publisherClass])}>Add condition</button><button className="action blue" disabled={Boolean(busy)||permit?.status!=="DRAFT"||permit.condition_count<1||!isIssuer} onClick={()=>transact("Seal permit pack","seal_permit",[permitId],"digest")}>Seal complete pack</button></div></div></article>

        <article className="action-card"><div className="card-head"><div className="card-num">03</div><div><h3>Accept exact pack</h3><p>Permittee action · acceptance binds identity, dates, conditions and policies.</p></div><span className="status-chip">{permit?.accepted_digest ? "ACCEPTED" : "UNACCEPTED"}</span></div><div className="card-body"><div className="field"><label>Pack digest from authoritative readback</label><input className="mono" value={permit?.pack_digest || "Seal and sync the permit first"} readOnly/></div><div className="card-actions"><button className="action" disabled={Boolean(busy)||permit?.status!=="SEALED"||!permit.pack_digest||!isPermittee} onClick={()=>transact("Accept permit pack","accept_permit",[permitId,permit?.pack_digest])}>Accept as permittee</button></div></div></article>

        <article className="action-card"><div className="card-head"><div className="card-num">04</div><div><h3>Submit and select evidence</h3><p>Permittee action · up to two immutable attempts per condition.</p></div><span className="status-chip">INTAKE</span></div><div className="card-body"><div className="field-grid">
          <div className="field"><label>Condition ID</label><input value={evidenceForm.conditionId} onChange={e=>setEvidenceForm({...evidenceForm,conditionId:e.target.value})}/></div><div className="field"><label>Returned attempt ID</label><input value={evidenceForm.attemptId} onChange={e=>setEvidenceForm({...evidenceForm,attemptId:e.target.value})}/></div><div className="field wide"><label>Commit-pinned evidence URL</label><input value={evidenceForm.url} onChange={e=>setEvidenceForm({...evidenceForm,url:e.target.value})}/></div><div className="field wide"><label>SHA-256</label><input className="mono" value={evidenceForm.sha} onChange={e=>setEvidenceForm({...evidenceForm,sha:e.target.value})}/></div><div className="field"><label>Exact byte length</label><input value={evidenceForm.length} onChange={e=>setEvidenceForm({...evidenceForm,length:e.target.value})}/></div><div className="field"><label>Exact evidence citation</label><input value={evidenceForm.citation} onChange={e=>setEvidenceForm({...evidenceForm,citation:e.target.value})}/></div>
        </div><div className="card-actions"><button className="action secondary" disabled={Boolean(busy)||permit?.status!=="INTAKE_OPEN"||!isPermittee} onClick={()=>transact("Submit evidence","submit_evidence",[permitId,evidenceForm.conditionId,evidenceForm.url,evidenceForm.sha,Number(evidenceForm.length),evidenceForm.citation],"attempt")}>Submit attempt</button><button className="action" disabled={Boolean(busy)||permit?.status!=="INTAKE_OPEN"||!isPermittee||!evidenceForm.attemptId} onClick={()=>transact("Select evidence","select_evidence",[permitId,evidenceForm.conditionId,evidenceForm.attemptId])}>Select attempt</button><button className="action blue" disabled={Boolean(busy)||permit?.status!=="INTAKE_OPEN"} onClick={()=>transact("Close intake","close_intake",[permitId])}>Close intake</button></div></div></article>

        <article className="action-card"><div className="card-head"><div className="card-num">05</div><div><h3>Assess and finalize</h3><p>Permissionless · validators recompute semantic relations; code derives readiness.</p></div><span className="status-chip">CONSENSUS</span></div><div className="card-body"><div className="field"><label>Condition ID to assess</label><input value={evidenceForm.conditionId} onChange={e=>setEvidenceForm({...evidenceForm,conditionId:e.target.value})}/></div><div className="card-actions"><button className="action secondary" disabled={Boolean(busy)||!permit||!["INTAKE_CLOSED","ASSESSING"].includes(permit.status)} onClick={()=>transact("Assess condition","assess_condition",[permitId,evidenceForm.conditionId])}>Run validator assessment</button><button className="action" disabled={Boolean(busy)||!permit||!["INTAKE_CLOSED","ASSESSING"].includes(permit.status)} onClick={()=>transact("Finalize readiness","finalize_readiness",[permitId])}>Finalize dossier</button><button className="action blue" disabled={Boolean(busy)||!permit||permit.status==="FINALIZED"} onClick={()=>transact("Expire to human review","expire_permit",[permitId])}>Expire after review deadline</button></div></div></article>
      </section>

      <aside className="readback"><div><div className="readback-top"><Image src="/permitos-logo.png" width={56} height={56} alt=""/><div><div className="section-index">Authoritative dossier</div><h2>{permit?.permit_id || "NO PERMIT"}</h2><span className="mono">{permit?.facility_id || "—"} / {permit?.revision || "—"}</span></div></div><div className="readback-status"><small>FINAL READINESS STATE</small><strong>{permit?.result?.replaceAll("_"," ") || "PENDING"}</strong></div><div className="data-list">
        {[['Contract',short(contractAddress())],['Issuer',short(permit?.issuer||'')],['Permittee',short(permit?.permittee||'')],['Period',permit?.reporting_period||'—'],['Conditions',permit?`${permit.assessed_count}/${permit.condition_count}`:'—'],['Deadline',permit?new Date(permit.intake_deadline*1000).toLocaleString():'—']].map(([key,value])=><div className="data-row" key={key}><span>{key}</span><strong>{value}</strong></div>)}
      </div><a className="explorer-link" href={explorerUrl()} target="_blank" rel="noreferrer">Contract Explorer <ExternalLink size={13}/></a></div><div className="condition-readback"><h3>CONDITION READBACK</h3>{conditions.length?conditions.map(item=><div className="mini-condition" key={item.condition_id}><div><strong>#{item.condition_id} · {item.severity}</strong><span>{item.outcome}</span></div><p>{item.requirement}</p><div><span>{item.status}</span><span>{item.coverage}</span></div></div>):<p className="mono">No condition records loaded.</p>}<div className="rail-note"><ShieldCheck size={15}/><br/>Positive readiness requires every condition to be demonstrated. Missing, mismatch and uncertainty cannot cross the consequence boundary.</div></div></aside>
    </div>
  </main>;
}
