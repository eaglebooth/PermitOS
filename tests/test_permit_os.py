import hashlib
import json
import time

import pytest

pytest.importorskip("gltest")
import gltest.direct.loader as direct_loader


CONTRACT = "contracts/permit_os.py"
COMMIT = "a" * 40
BASE = f"https://raw.githubusercontent.com/example/permit-fixtures/{COMMIT}"
PERMIT_URL = BASE + "/permit.txt"
EVIDENCE_URL = BASE + "/evidence.txt"
ORIGIN = "https://raw.githubusercontent.com/example/permit-fixtures"
PERMIT = (
    "DEMO PERMIT EP-204. Revision R1. Facility RIVER-17. Jurisdiction DEMO-NORTH. "
    "Reporting period 2026-Q3. Condition: Provide an authority receipt for the exact period."
)
PERMIT_CITATION = "Condition: Provide an authority receipt for the exact period."
EVIDENCE = (
    "Authority receipt for permit EP-204, facility RIVER-17, revision R1, reporting period 2026-Q3. "
    "The quarterly monitoring report was accepted for the exact reporting period."
)
EVIDENCE_CITATION = "The quarterly monitoring report was accepted for the exact reporting period."


@pytest.fixture(autouse=True)
def _windows_fd0_cleanup_workaround(monkeypatch):
    original = direct_loader._inject_message_to_fd0

    def inject(vm):
        try:
            original(vm)
        except PermissionError:
            pass

    monkeypatch.setattr(direct_loader, "_inject_message_to_fd0", inject)


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


def address(raw):
    return "0x" + raw.hex()


def deploy(direct_vm, direct_deploy, owner):
    direct_vm.strict_mocks = True
    direct_vm.check_pickling = True
    direct_vm.sender = owner
    return direct_deploy(CONTRACT)


def create(contract, permittee, permit_id="EP-204", condition_count=1):
    now = int(time.time())
    contract.create_permit(
        permit_id, "EP-204", address(permittee), "Synthetic discharge reporting permit", "R1",
        "RIVER-17", "DEMO-NORTH", "2026-Q3", 0, now + 3600,
        PERMIT_URL, sha(PERMIT), len(PERMIT.encode()),
    )
    for index in range(condition_count):
        contract.add_condition(
            permit_id, str(index), "Provide authority evidence for the exact permit, facility and reporting period.",
            PERMIT_CITATION, "MATERIAL", ORIGIN, "SYNTHETIC_AUTHORITY",
        )


def open_intake(contract, direct_vm, owner, permittee, condition_count=1, permit_id="EP-204"):
    direct_vm.sender = owner
    create(contract, permittee, permit_id, condition_count)
    digest = contract.seal_permit(permit_id)
    direct_vm.sender = permittee
    contract.accept_permit(permit_id, digest)
    return digest


def submit_select(contract, permit_id="EP-204", condition_id="0", text=EVIDENCE, citation=EVIDENCE_CITATION):
    attempt = contract.submit_evidence(
        permit_id, condition_id, EVIDENCE_URL, sha(text), len(text.encode()), citation,
    )
    contract.select_evidence(permit_id, condition_id, attempt)
    return attempt


def mock_assessment(direct_vm, result, evidence=EVIDENCE, permit=PERMIT):
    direct_vm.clear_mocks()
    direct_vm.mock_web(PERMIT_URL, {"status": 200, "body": permit})
    direct_vm.mock_web(EVIDENCE_URL, {"status": 200, "body": evidence})
    direct_vm.mock_llm(r".*", json.dumps(result))


MATCH = {
    "permit_relation": "MATCH", "facility_relation": "MATCH", "period_relation": "MATCH",
    "revision_relation": "MATCH", "jurisdiction_relation": "MATCH",
    "coverage": "SUFFICIENT", "contradiction": False,
    "reason": "The authority evidence addresses the sealed condition for the bound dossier.",
}


def ready_for_assessment(contract, direct_vm, owner, permittee):
    open_intake(contract, direct_vm, owner, permittee)
    submit_select(contract)
    contract.close_intake("EP-204")


def test_initial_version_and_counts(direct_vm, direct_deploy, direct_owner):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    assert json.loads(contract.get_contract_version()) == {
        "name": "PermitOS", "schema": "sealed-intake-v4", "version": 4,
    }
    assert json.loads(contract.get_counts()) == {
        "permit_count": 0, "condition_total": 0, "attempt_total": 0, "finalized_total": 0,
    }


def test_sealed_pack_acceptance_binds_all_conditions(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_owner
    create(contract, direct_alice, condition_count=3)
    digest = contract.seal_permit("EP-204")
    permit = json.loads(contract.get_permit("EP-204"))
    assert len(digest) == 64 and permit["condition_count"] == 3 and permit["status"] == "SEALED"
    direct_vm.sender = direct_alice
    contract.accept_permit("EP-204", digest)
    permit = json.loads(contract.get_permit("EP-204"))
    assert permit["status"] == "INTAKE_OPEN" and permit["accepted_digest"] == permit["pack_digest"]


def test_wrong_actor_and_digest_roll_back(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_owner
    create(contract, direct_alice)
    digest = contract.seal_permit("EP-204")
    before = contract.get_permit("EP-204")
    with pytest.raises(Exception, match="PERMITTEE_ONLY"):
        contract.accept_permit("EP-204", digest)
    assert contract.get_permit("EP-204") == before
    direct_vm.sender = direct_alice
    with pytest.raises(Exception, match="PACK_DIGEST_MISMATCH"):
        contract.accept_permit("EP-204", "0" * 64)
    assert contract.get_permit("EP-204") == before


def test_zero_permittee_is_rejected(direct_vm, direct_deploy, direct_owner):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    now = int(time.time())
    with pytest.raises(Exception, match="INVALID_PERMITTEE"):
        contract.create_permit(
            "EP-ZERO", "EP-204", "0x" + "0" * 40, "Synthetic permit", "R1",
            "RIVER-17", "DEMO-NORTH", "2026-Q3", 0, now + 3600,
            PERMIT_URL, sha(PERMIT), len(PERMIT.encode()),
        )
def test_condition_set_is_immutable_after_seal(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    direct_vm.sender = direct_owner
    create(contract, direct_alice)
    contract.seal_permit("EP-204")
    before = contract.get_permit("EP-204")
    with pytest.raises(Exception, match="CONDITION_SET_LOCKED"):
        contract.add_condition("EP-204", "1", "A sufficiently long late condition must be rejected.", PERMIT_CITATION, "ROUTINE", ORIGIN, "AUTHORITY")
    assert contract.get_permit("EP-204") == before


def test_two_attempt_limit_and_selection(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    open_intake(contract, direct_vm, direct_owner, direct_alice)
    first = contract.submit_evidence("EP-204", "0", EVIDENCE_URL, sha(EVIDENCE), len(EVIDENCE.encode()), EVIDENCE_CITATION)
    second_url = BASE + "/evidence-v2.txt"
    second = contract.submit_evidence("EP-204", "0", second_url, sha(EVIDENCE), len(EVIDENCE.encode()), EVIDENCE_CITATION)
    contract.select_evidence("EP-204", "0", second)
    assert first == "0" and second == "1"
    assert json.loads(contract.get_condition("EP-204", "0"))["selected_attempt_id"] == "1"
    with pytest.raises(Exception, match="ATTEMPT_LIMIT_REACHED"):
        contract.submit_evidence("EP-204", "0", EVIDENCE_URL, sha(EVIDENCE), len(EVIDENCE.encode()), EVIDENCE_CITATION)


def test_unauthorized_early_close_rolls_back(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    open_intake(contract, direct_vm, direct_owner, direct_alice)
    before = contract.get_permit("EP-204")
    direct_vm.sender = direct_owner
    with pytest.raises(Exception, match="INTAKE_STILL_OPEN"):
        contract.close_intake("EP-204")
    assert contract.get_permit("EP-204") == before


@pytest.mark.parametrize(("semantic", "outcome"), [
    (MATCH, "DEMONSTRATED"),
    ({**MATCH, "facility_relation": "MISMATCH"}, "NOT_DEMONSTRATED"),
    ({**MATCH, "revision_relation": "MISMATCH"}, "NOT_DEMONSTRATED"),
    ({**MATCH, "jurisdiction_relation": "UNKNOWN"}, "UNRESOLVED"),
    ({**MATCH, "coverage": "INSUFFICIENT"}, "NOT_DEMONSTRATED"),
    ({**MATCH, "contradiction": True}, "NOT_DEMONSTRATED"),
    ({**MATCH, "period_relation": "UNKNOWN"}, "UNRESOLVED"),
    ({**MATCH, "coverage": "PARTIAL"}, "UNRESOLVED"),
])
def test_semantic_tuple_derives_condition_outcome(
    direct_vm, direct_deploy, direct_owner, direct_alice, semantic, outcome,
):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    ready_for_assessment(contract, direct_vm, direct_owner, direct_alice)
    mock_assessment(direct_vm, semantic)
    assert contract.assess_condition("EP-204", "0") == outcome
    condition = json.loads(contract.get_condition("EP-204", "0"))
    assert condition["status"] == "ASSESSED" and condition["outcome"] == outcome


@pytest.mark.parametrize(("semantic", "expected"), [
    (MATCH, "READY_FOR_REGULATOR_REVIEW"),
    ({**MATCH, "permit_relation": "MISMATCH"}, "ACTION_REQUIRED"),
    ({**MATCH, "coverage": "PARTIAL"}, "HUMAN_REVIEW"),
])
def test_contract_derives_final_readiness(
    direct_vm, direct_deploy, direct_owner, direct_alice, semantic, expected,
):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    ready_for_assessment(contract, direct_vm, direct_owner, direct_alice)
    mock_assessment(direct_vm, semantic)
    contract.assess_condition("EP-204", "0")
    assert contract.finalize_readiness("EP-204") == expected
    permit = json.loads(contract.get_permit("EP-204"))
    assert permit["status"] == "FINALIZED" and permit["result"] == expected


@pytest.mark.parametrize(("permit_body", "evidence_body", "error"), [
    (PERMIT + " changed", EVIDENCE, "PERMIT_SOURCE_LENGTH_MISMATCH"),
    (PERMIT, EVIDENCE + " changed", "EVIDENCE_SOURCE_LENGTH_MISMATCH"),
    (PERMIT.replace(PERMIT_CITATION, "different condition"), EVIDENCE, "PERMIT_SOURCE_LENGTH_MISMATCH"),
])
def test_changed_source_bytes_fail_closed(
    direct_vm, direct_deploy, direct_owner, direct_alice, permit_body, evidence_body, error,
):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    ready_for_assessment(contract, direct_vm, direct_owner, direct_alice)
    before_permit = contract.get_permit("EP-204")
    before_condition = contract.get_condition("EP-204", "0")
    mock_assessment(direct_vm, MATCH, evidence=evidence_body, permit=permit_body)
    with pytest.raises(Exception, match=error):
        contract.assess_condition("EP-204", "0")
    assert contract.get_permit("EP-204") == before_permit
    assert contract.get_condition("EP-204", "0") == before_condition


def test_missing_or_duplicate_citation_fails_closed(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    open_intake(contract, direct_vm, direct_owner, direct_alice)
    duplicate = EVIDENCE + " " + EVIDENCE_CITATION
    submit_select(contract, text=duplicate)
    contract.close_intake("EP-204")
    mock_assessment(direct_vm, MATCH, evidence=duplicate)
    with pytest.raises(Exception, match="EVIDENCE_CITATION_NOT_UNIQUE"):
        contract.assess_condition("EP-204", "0")


def test_same_length_tampering_hits_digest_check(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    ready_for_assessment(contract, direct_vm, direct_owner, direct_alice)
    tampered = EVIDENCE[:-1] + ("X" if EVIDENCE[-1] != "X" else "Y")
    mock_assessment(direct_vm, MATCH, evidence=tampered)
    with pytest.raises(Exception, match="EVIDENCE_SOURCE_DIGEST_MISMATCH"):
        contract.assess_condition("EP-204", "0")


def test_evidence_outside_approved_repository_is_rejected(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    open_intake(contract, direct_vm, direct_owner, direct_alice)
    other = f"https://raw.githubusercontent.com/permittee/controlled/{COMMIT}/evidence.txt"
    with pytest.raises(Exception, match="INVALID_EVIDENCE"):
        contract.submit_evidence("EP-204", "0", other, sha(EVIDENCE), len(EVIDENCE.encode()), EVIDENCE_CITATION)


@pytest.mark.parametrize("bad", [
    {**MATCH, "coverage": "YES"},
    {**MATCH, "contradiction": "maybe"},
    {**MATCH, "permit_relation": "MAYBE"},
    {key: value for key, value in MATCH.items() if key != "period_relation"},
])
def test_malformed_model_output_rolls_back(direct_vm, direct_deploy, direct_owner, direct_alice, bad):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    ready_for_assessment(contract, direct_vm, direct_owner, direct_alice)
    before = contract.get_condition("EP-204", "0")
    mock_assessment(direct_vm, bad)
    with pytest.raises(Exception, match="INVALID_MODEL_OUTPUT"):
        contract.assess_condition("EP-204", "0")
    assert contract.get_condition("EP-204", "0") == before


def test_json_string_model_output_is_accepted(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    ready_for_assessment(contract, direct_vm, direct_owner, direct_alice)
    direct_vm.clear_mocks()
    direct_vm.mock_web(PERMIT_URL, {"status": 200, "body": PERMIT})
    direct_vm.mock_web(EVIDENCE_URL, {"status": 200, "body": EVIDENCE})
    direct_vm.mock_llm(r".*", json.dumps(json.dumps(MATCH)))
    assert contract.assess_condition("EP-204", "0") == "DEMONSTRATED"


def test_model_output_with_diagnostic_metadata_is_accepted(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    ready_for_assessment(contract, direct_vm, direct_owner, direct_alice)
    mock_assessment(direct_vm, {**MATCH, "diagnostic": "ignored non-consequential metadata"})
    assert contract.assess_condition("EP-204", "0") == "DEMONSTRATED"


def test_bounded_model_aliases_are_canonicalized(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    ready_for_assessment(contract, direct_vm, direct_owner, direct_alice)
    aliases = {**MATCH, "permit_relation": "MATCHED", "coverage": "COMPLETE", "contradiction": "false", "reason": "Clear."}
    mock_assessment(direct_vm, aliases)
    assert contract.assess_condition("EP-204", "0") == "DEMONSTRATED"


def test_reassessment_and_double_finalization_rejected(direct_vm, direct_deploy, direct_owner, direct_alice):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    ready_for_assessment(contract, direct_vm, direct_owner, direct_alice)
    mock_assessment(direct_vm, MATCH)
    contract.assess_condition("EP-204", "0")
    with pytest.raises(Exception, match="CONDITION_NOT_ASSESSABLE"):
        contract.assess_condition("EP-204", "0")
    contract.finalize_readiness("EP-204")
    with pytest.raises(Exception, match="PERMIT_NOT_FINALIZABLE"):
        contract.finalize_readiness("EP-204")


@pytest.mark.parametrize("url", [
    "https://raw.githubusercontent.com/example/permit-fixtures/main/evidence.txt",
    f"https://raw.githubusercontent.com@example.com/repo/{COMMIT}/evidence.txt",
    f"https://raw.githubusercontent.com/example/repo/{COMMIT}/../evidence.txt",
    f"https://raw.githubusercontent.com/example/repo/{COMMIT}/evidence.txt?raw=1",
])
def test_noncanonical_evidence_urls_rejected(direct_vm, direct_deploy, direct_owner, direct_alice, url):
    contract = deploy(direct_vm, direct_deploy, direct_owner)
    open_intake(contract, direct_vm, direct_owner, direct_alice)
    before = json.loads(contract.get_counts())
    with pytest.raises(Exception, match="INVALID_EVIDENCE"):
        contract.submit_evidence("EP-204", "0", url, sha(EVIDENCE), len(EVIDENCE.encode()), EVIDENCE_CITATION)
    assert json.loads(contract.get_counts()) == before
