# Verification guide

Run all local checks from the repository root:

```bash
python -m pytest -q
genvm-lint check contracts/permit_os.py
npx tsc --noEmit
npm run build
```

The local suite covers roles, exact pack acceptance, source namespace binding,
commit-pinned URL parsing, attempt limits, explicit selection, early closure,
all semantic derivations, malformed model output, exact length, same-length digest
tampering, duplicate citations, replay, and all three aggregate outcomes.

Before submission, repeat the following against one exact StudioNet deployment:

1. Confirm `get_contract_version` returns `PermitOS`, version `4`, schema
   `sealed-intake-v4`.
2. Run a ready dossier with all three positive fixtures.
3. Run a dossier using `actions-open.txt`; confirm `ACTION_REQUIRED`.
4. Run a dossier using `inspection-ambiguous.txt`; confirm `HUMAN_REVIEW`.
5. Attempt a wrong-role acceptance and an evidence URL from another repository;
   preserve the finalized rollback transaction links.
6. Attempt a same-length wrong source digest; confirm assessment rolls back without
   changing the condition. Evidence selection is sealed after intake closes, so a
   corrected source binding must be demonstrated in a new dossier. A transient
   fetch failure may be retried on the same selection within the review window.
7. Record the deployed contract address, exact repository commit, frontend URL,
   fixture raw URLs, and relevant transaction links in the release evidence.

StudioNet results are not claimed until those explorer transactions exist.
