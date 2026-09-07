# PermitOS threat model

## Assets and consequence boundary

The contract protects the sealed dossier identity, permit source commitment,
condition list, evidence repository policy, selected attempts, semantic results,
and aggregate readiness state. The only consequence is a public documentary
readiness label. No funds, permits, penalties, or legal rights are transferred.

## Trust assumptions

- The dossier creator is treated as the issuer for that dossier.
- The permittee address is exact and distinct from the issuer.
- A configured GitHub owner/repository is an approved demo evidence namespace.
  GitHub account ownership is not proof of regulator identity.
- GenLayer validators can independently fetch public sources and recompute the
  bounded semantic tuple.

## Adversarial cases and controls

| Attempt | Contract control |
| --- | --- |
| Issuer adds a condition after acceptance | Conditions lock at `seal_permit`; acceptance checks the sealed digest. |
| Permittee substitutes its own evidence repository | Each condition binds a full owner/repository prefix before acceptance. |
| A mutable branch changes after submission | URLs require a 40-character Git commit. |
| Source bytes change or a citation is vague | Exact byte length, SHA-256, UTF-8 and exactly one citation occurrence are required. |
| Evidence belongs to another permit or period | Validators compare permit reference, revision, facility, jurisdiction and period separately. |
| Evidence contains prompt injection | The prompt labels documents untrusted; validators independently recompute consequential fields. |
| Leader hides a contradiction | A validator refetches both sources and must match all consequential fields. |
| Source is unavailable | Assessment rolls back without changing condition state; the call may be retried. |
| Source never recovers | After the bounded review grace period, anyone finalizes `HUMAN_REVIEW`. |
| User resends a transaction after a timeout | Frontend journals the transaction hash and requires recovery before another write. |
| Wrong frontend points at another contract | The schema handshake runs before every write. |

## Explicit limitations

PermitOS does not verify real-world regulator identity, private documents,
signatures, sensor readings, geography, legal compliance, safety, or authority to
operate. A production deployment needs an issuer registry and an approved source
registry managed by the relevant institution.
