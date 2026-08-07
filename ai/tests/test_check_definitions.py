"""Konsistensi antara CHECK_DEFINITIONS (single source of truth) dan kontrak.

Tujuan: kalau dev tambah/ubah check di registry.py tapi lupa update file
JSON schema di contracts/, test ini akan gagal dengan diff yang jelas.
"""
import json
from pathlib import Path

from cctv_insight_ai.models.registry import (
    CHECK_DEFINITIONS,
    CHECK_NAMES,
    CHECK_TO_MODEL,
    MODEL_REGISTRY,
)

_AI_DIR = Path(__file__).resolve().parents[1]
_CONTRACTS_DIR = _AI_DIR / "contracts"


def _load_schema(name: str) -> dict:
    return json.loads((_CONTRACTS_DIR / name).read_text(encoding="utf-8"))


def test_check_definitions_keys_match_check_name_literal() -> None:
    assert set(CHECK_DEFINITIONS.keys()) == set(CHECK_NAMES)


def test_check_to_model_derived_from_definitions() -> None:
    expected = {name: spec.model_key for name, spec in CHECK_DEFINITIONS.items()}
    assert CHECK_TO_MODEL == expected


def test_every_check_points_to_registered_model() -> None:
    for name, spec in CHECK_DEFINITIONS.items():
        assert spec.model_key in MODEL_REGISTRY, (
            f"Check '{name}' refers to model '{spec.model_key}' "
            f"yang tidak ada di MODEL_REGISTRY"
        )


def test_every_aux_model_registered() -> None:
    for name, spec in CHECK_DEFINITIONS.items():
        for mk in spec.aux_models:
            assert mk in MODEL_REGISTRY, (
                f"Check '{name}' aux_model '{mk}' tidak ada di MODEL_REGISTRY"
            )


def test_every_check_has_at_least_one_category() -> None:
    for name, spec in CHECK_DEFINITIONS.items():
        assert len(spec.categories) >= 1, (
            f"Check '{name}' tidak punya category — `categories` minimal 1 entry"
        )


def test_category_keys_unique_per_check() -> None:
    for name, spec in CHECK_DEFINITIONS.items():
        keys = [cat.key for cat in spec.categories]
        assert len(keys) == len(set(keys)), (
            f"Check '{name}' punya category key duplikat: {keys}"
        )


def test_every_category_source_label_emitted_by_its_model() -> None:
    """Pastikan source_label tiap category muncul di class_labels model handler-nya.

    Kalau tidak, breakdown bakal selalu 0 — silent failure yang lebih cepat
    ketahuan dari runtime kalau ditest di sini.
    """
    for name, spec in CHECK_DEFINITIONS.items():
        model_spec = MODEL_REGISTRY[spec.model_key]
        emitted_labels = {cl.label for cl in model_spec.class_labels.values()}
        for cat in spec.categories:
            assert cat.source_label in emitted_labels, (
                f"Check '{name}' kategori '{cat.key}' butuh label "
                f"'{cat.source_label}' tapi model '{spec.model_key}' tidak "
                f"emit label itu. Labels yang di-emit: {sorted(emitted_labels)}"
            )


def test_request_schema_enum_matches_check_names() -> None:
    schema = _load_schema("inference_request.schema.json")
    enum_values = schema["properties"]["selected_checks"]["items"]["enum"]
    assert set(enum_values) == set(CHECK_NAMES), (
        "contracts/inference_request.schema.json enum tidak sinkron dengan "
        "CHECK_DEFINITIONS. Update file kontrak supaya match."
    )


def test_response_schema_check_enum_matches_check_names() -> None:
    schema = _load_schema("inference_response.schema.json")
    enum_values = schema["properties"]["check_results"]["items"]["properties"]["check"]["enum"]
    assert set(enum_values) == set(CHECK_NAMES), (
        "contracts/inference_response.schema.json enum tidak sinkron dengan "
        "CHECK_DEFINITIONS. Update file kontrak supaya match."
    )
