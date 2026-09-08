# PermitOS V4 — StudioNet verification

Contract: [0x44A1105e6c3036502Ec59d8246495E863753307D](https://explorer-studio.genlayer.com/address/0x44A1105e6c3036502Ec59d8246495E863753307D).

Frontend: [permitos-two.vercel.app](https://permitos-two.vercel.app). Both `/` and
`/console` returned HTTP 200 after production deployment, and the production
JavaScript bundle contains the V4 address above.

Source: [6916644](https://github.com/eaglebooth/PermitOS/blob/6916644cce94e6324a6ccbe0201f9bae6a171544/contracts/permit_os.py).
Fixture bytes: [6297207](https://github.com/eaglebooth/PermitOS/tree/6297207931378e885179b5f4eeae511aec95a80a/samples).
The handshake returned `PermitOS`, version `4`, schema `sealed-intake-v4`.

These records are synthetic demonstrations. Repository namespace approval and
digest verification do not establish that a publisher is a real regulator.

## Finalized scenarios

| Dossier ID | Result | Condition 0 / 1 / 2 |
| --- | --- | --- |
| `EP204-READY-1788825875731` | `READY_FOR_REGULATOR_REVIEW` | DEMONSTRATED / DEMONSTRATED / DEMONSTRATED |
| `EP204-ACTION-1788825875731` | `ACTION_REQUIRED` | DEMONSTRATED / DEMONSTRATED / NOT_DEMONSTRATED |
| `EP204-HUMAN-1788825875731` | `ACTION_REQUIRED` (expected HUMAN_REVIEW; failed assertion) | DEMONSTRATED / NOT_DEMONSTRATED / DEMONSTRATED |
| `EP204-HUMAN-1788828436149` | `HUMAN_REVIEW` | DEMONSTRATED / UNRESOLVED / DEMONSTRATED |

- READY finalization: [transaction](https://explorer-studio.genlayer.com/tx/0xb400dfafec73b07110c117a0371f069c26f87917e1b3f4d8dfc063465d0b2def).
- ACTION finalization: [transaction](https://explorer-studio.genlayer.com/tx/0x259d6796050c595e15e0c04a2c7e077e56439b8b08d784512fa98efcbb2b9b21).
- HUMAN finalization: [transaction](https://explorer-studio.genlayer.com/tx/0xacbbb9d70caee03dfd274cba891e838055fe2d24de3a736f2f5440dcdbded125). Condition 1 stored UNKNOWN revision/period, false contradiction, and INSUFFICIENT coverage. V4 prioritizes insufficient coverage over unknown identity, producing NOT_DEMONSTRATED. This is a failed expected-outcome test, not a successful HUMAN scenario.
- Targeted HUMAN finalization: [transaction](https://explorer-studio.genlayer.com/tx/0xeceb8a86c933c28973d963ca802f7a601ba901983a64eade7e08abf33a16fff7). Condition 1 stored `jurisdiction_relation=UNKNOWN`, `coverage=SUFFICIENT`, `contradiction=false`, and `outcome=UNRESOLVED`; the aggregate result is `HUMAN_REVIEW`.
- ACTION condition 2: [assessment](https://explorer-studio.genlayer.com/tx/0x6f9f0dab16392bfb00d21f7708f6888c8a50440389a67e90b285aeb408af2a70). The selected register states that CA-77 remains open; the stored result has `contradiction=true` and `coverage=INSUFFICIENT`.

## Finalized rejection paths

- Incorrect acceptance digest: [transaction](https://explorer-studio.genlayer.com/tx/0x2dda67032d118cacc5aa5a03b41a3a930d40b1160e534ae7df68f56eab941245), `PACK_DIGEST_MISMATCH`.
- Issuer submitting as permittee: [transaction](https://explorer-studio.genlayer.com/tx/0xc3360e5a2d47b962321e545b11a563616d768d45274c197772186e2bf1a68b15), `PERMITTEE_ONLY`.

The executed runner checked the rejection messages and unchanged aggregate counts.
Later runner hardening adds exact expected-error assertions and before/after
dossier and condition snapshots; those added checks are not retroactively claimed
for this run.

## Initial fixture issue retained for transparency

`EP204-READY-1788824669373` finalized as `HUMAN_REVIEW` using the original
`d5bb8c3cd571f444b8921db007e442073450a0e1` fixtures. Receipt and inspection
records omitted jurisdiction, and their scope disclaimers caused partial coverage.
The contract did not approve these ambiguous records. The corrected synthetic
fixtures explicitly include jurisdiction and their bounded demonstration scope.
The contract source was unchanged between these two runs.

## Verification scope

39 local tests passed. They include source integrity, roles, replay, lifecycle,
model normalization, and outcome derivation. Local mocks do not prove live
validator behavior; only the transactions above establish the listed live cases.
Independent readback confirmed READY and ACTION including every condition and
accepted digest. The first HUMAN fixture failed its expected outcome, then the
targeted fixture isolated missing jurisdiction and passed with exit code 0.
Source-digest rollback, namespace
rejection, and review expiry are not claimed as live-verified here.

The next targeted HUMAN run uses fixture commit `f1ab9ca5b4b2c0fd25f8a04be28dd6673a87c461`.
Its inspection certificate covers every sealed requirement field but omits
jurisdiction, isolating an `UNKNOWN` identity relation without asserting
insufficient requirement coverage.

Read all three successful dossiers without a wallet using
`scripts/read-live-results.mjs` with `PERMITOS_CONTRACT_ADDRESS` set to the contract
above, `PERMITOS_RUN_TAG=1788825875731`, and
`PERMITOS_HUMAN_TAG=1788828436149`. It checks each condition as well as the
aggregate outcome and accepted pack digest.
