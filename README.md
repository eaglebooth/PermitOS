# PermitOS — Permit Evidence Readiness Gate

PermitOS turns a small, sealed set of documentary permit conditions into a
time-bounded evidence intake on GenLayer. An issuer defines a dossier, a distinct
permittee accepts its complete digest, and validators independently fetch and
assess the selected evidence. Deterministic contract code produces one of three
states: `READY_FOR_REGULATOR_REVIEW`, `ACTION_REQUIRED`, or `HUMAN_REVIEW`.

The result describes documentary readiness for human review. It does not decide
legal compliance, permit validity, safety, breach, or operating authority.

## Why this is an Intelligent Contract

Each assessment fetches the commit-pinned permit and evidence files, verifies
their exact byte lengths, SHA-256 digests, and unique citations, then asks
validators to compare the permit reference, revision, facility, jurisdiction,
reporting period, coverage, and contradictions. Validators recompute every
consequential field. Contract code maps those fields to the condition and dossier
outcomes; the model never chooses the state transition directly.

## Bounded lifecycle

1. Any account can act as a demo issuer and create one dossier for a distinct
   permittee. The storage dossier ID and external permit reference are separate.
2. The issuer adds one to three sequential conditions. Each condition locks an
   exact GitHub `owner/repository` evidence prefix and descriptive publisher class.
3. The issuer seals the complete pack. The permittee accepts exactly that digest.
4. The permittee submits at most two commit-pinned attempts per condition and
   explicitly selects one. It may close early only when every condition is selected.
5. After closure, anyone can assess selected conditions and finalize the dossier.
   Missing or contradictory evidence cannot produce a positive result.
6. After the 24-hour review grace period, anyone can expire a stuck dossier to
   `HUMAN_REVIEW`. A source outage therefore cannot strand the state forever or
   become a false negative.

## Local setup

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Deploy `contracts/permit_os.py` in GenLayer Studio,
then set `NEXT_PUBLIC_CONTRACT_ADDRESS` in `.env.local` and restart Next.js.
Use two different wallet accounts for issuer and permittee actions.

The contract development checks use Python 3.12:

```bash
pip install -r requirements-dev.txt
python -m pytest -q
genvm-lint check contracts/permit_os.py
npm run lint
npm run build
```

## Evidence policy and demo fixtures

The issuer-approved policy is a full raw GitHub repository prefix such as
`https://raw.githubusercontent.com/example/permit-fixtures`. Submitted URLs must
continue with a 40-character Git commit and a file path under that repository.
The contract proves integrity and configured namespace provenance; it does not
authenticate that a GitHub account is a real regulator.

Files in `samples/` are deliberately synthetic. `samples/manifest.json` records
their exact byte lengths and SHA-256 digests. For a live demo, commit the fixtures,
replace the example repository prefix with the real repository, and use raw URLs
pinned to that full commit. Recalculate the manifest if any byte changes.

Suggested scenarios:

- Ready: receipt-ready + inspection-ready + actions-ready.
- Action required: select actions-open for condition 2.
- Human review: select inspection-ambiguous for condition 1.
- Retryable failure: use a correct committed URL with a deliberately wrong digest,
  demonstrate rollback, then submit a new correct attempt before the deadline.

## Adversarial properties

- Acceptance binds identity, dates, conditions, source repository policies, and
  the exact permit source in one canonical digest.
- Only the named permittee can submit or select evidence.
- Sources must use HTTPS raw GitHub URLs pinned to a full commit.
- The permittee cannot redirect evidence to another repository after acceptance.
- Exact bytes and citations are rechecked by every assessment.
- Any mismatch, insufficiency, or contradiction yields `NOT_DEMONSTRATED`.
- Any unknown or partial relation yields `UNRESOLVED`.
- Reassessment and double finalization are rejected.
- The frontend verifies the contract schema before every write, journals a
  broadcast transaction, waits for finality, checks execution success, and reads
  the authoritative state back before enabling the next lifecycle step.

## Repository map

- `contracts/permit_os.py` — Intelligent Contract.
- `tests/` — runtime and static adversarial checks.
- `samples/` — synthetic permit/evidence fixtures and byte manifest.
- `app/` — responsive Next.js landing page and lifecycle console.
- `lib/` — GenLayer read/write, finality, and returned-value handling.
- `docs/design-guidelines/` — visual direction derived from the supplied logo.

The supplied PermitOS logo remains unchanged at `public/permitos-logo.png`.

## StudioNet deployment

- Superseded V1 contract: [`0xfbA2E85aA023d0457C4Ac5b18522243093187414`](https://explorer-studio.genlayer.com/address/0xfbA2E85aA023d0457C4Ac5b18522243093187414). Live assessment exposed a JSON-string normalization bug; V2 fixes it and requires a new deployment.
- Verified source and fixture commit: [`d5bb8c3cd571f444b8921db007e442073450a0e1`](https://github.com/eaglebooth/PermitOS/commit/d5bb8c3cd571f444b8921db007e442073450a0e1)
- Fixture authority prefix: `https://raw.githubusercontent.com/eaglebooth/PermitOS`

The frontend validates `get_contract_version` against the configured deployment before
every write. The first public fixture set remains pinned to the full commit above,
so later documentation changes cannot alter the bytes assessed by validators.
