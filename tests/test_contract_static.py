import ast
from pathlib import Path


SOURCE = Path("contracts/permit_os.py").read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)


def test_deploy_header_and_ascii_source():
    assert SOURCE.startswith("# v0.2.16\n# { \"Depends\":")
    SOURCE.encode("ascii")


def test_public_method_surface():
    methods = {
        node.name for node in ast.walk(TREE) if isinstance(node, ast.FunctionDef)
        and any(isinstance(d, ast.Attribute) and d.attr in {"write", "view"} for d in node.decorator_list)
    }
    assert methods == {
        "create_permit", "add_condition", "seal_permit", "accept_permit",
        "submit_evidence", "select_evidence", "close_intake", "assess_condition",
        "finalize_readiness", "get_contract_version", "get_permit", "get_condition",
        "get_evidence_attempt", "get_counts", "expire_permit",
    }


def test_security_critical_primitives_are_present():
    for token in (
        "hashlib.sha256(raw).hexdigest()", "gl.vm.run_nondet_unsafe",
        "SOURCE_DIGEST_MISMATCH", "PACK_DIGEST_MISMATCH", "CITATION_NOT_UNIQUE",
        "READY_FOR_REGULATOR_REVIEW", "ACTION_REQUIRED", "HUMAN_REVIEW",
    ):
        assert token in SOURCE
