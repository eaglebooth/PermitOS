import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, FileCheck2, Fingerprint, LockKeyhole, Scale, Waves } from "lucide-react";

const outcomes = [
  ["01", "Ready for review", "Every mandatory evidence relation is demonstrated."],
  ["02", "Action required", "A condition is missing, mismatched, insufficient or contradictory."],
  ["03", "Human review", "The authenticated evidence remains partial or semantically unresolved."],
];

export default function Home() {
  return <main className="site-shell">
    <header className="topbar">
      <Link href="/" className="brand"><Image src="/permitos-logo.png" width={42} height={42} alt="PermitOS logo" priority/><span>PermitOS</span></Link>
      <nav><a href="#mechanism">Mechanism</a><a href="#boundary">Boundary</a><Link href="/console">Console</Link></nav>
      <Link href="/console" className="nav-cta">Open intake <ArrowUpRight size={16}/></Link>
    </header>

    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow"><span>StudioNet primitive</span> / Permit evidence readiness</p>
        <h1>Turn permit conditions into a <em>verifiable intake.</em></h1>
        <p className="hero-lede">Seal the exact condition pack. Accept it with the permittee. Select immutable evidence before the deadline. Let GenLayer validators resolve only the bounded semantic relations.</p>
        <div className="hero-actions"><Link href="/console" className="primary">Run the workflow <ArrowUpRight size={18}/></Link><a href="#mechanism" className="text-link">See how it works</a></div>
        <div className="boundary-line">
          <Scale size={18}/><span>Evidence readiness, not legal compliance or operating authority.</span>
        </div>
      </div>
      <div className="hero-art" aria-label="PermitOS brand mark">
        <div className="edition">INTAKE<br/>01—03</div>
        <Image src="/permitos-logo.png" width={640} height={640} alt="Permit checklist, water drop, leaf and shield" priority/>
        <div className="stamp"><Check size={22}/><span>BOUND<br/>EVIDENCE</span></div>
      </div>
    </section>

    <section className="mechanism" id="mechanism">
      <div className="section-index">HOW IT WORKS / 04 STEPS</div>
      <h2>A permit dossier that closes cleanly.</h2>
      <div className="mechanism-grid">
        <article><Fingerprint/><span>01</span><h3>Define identity</h3><p>Bind the exact permit, revision, facility, jurisdiction and reporting period.</p></article>
        <article><LockKeyhole/><span>02</span><h3>Seal and accept</h3><p>The issuer seals every condition and evidence policy; the permittee accepts one digest.</p></article>
        <article><FileCheck2/><span>03</span><h3>Select evidence</h3><p>Submit up to two immutable attempts and select the strongest source before intake closes.</p></article>
        <article><Waves/><span>04</span><h3>Resolve readiness</h3><p>Validators assess bounded relations. Contract code derives the aggregate outcome.</p></article>
      </div>
    </section>

    <section className="outcomes" id="boundary">
      <div><p className="eyebrow">Deterministic consequence</p><h2>Three honest outcomes.<br/>No fabricated certainty.</h2></div>
      <div className="outcome-list">{outcomes.map(([n,title,text])=><article key={n}><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
    </section>

    <footer><div className="brand"><Image src="/permitos-logo.png" width={36} height={36} alt=""/><span>PermitOS</span></div><p>Synthetic public evidence demo. Not regulator approval, legal advice or a safety system.</p><Link href="/console">Open console →</Link></footer>
  </main>;
}
