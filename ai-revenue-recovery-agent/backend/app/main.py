"""
FastAPI entrypoint for the AI Revenue Recovery Agent platform.

Run with:
    uvicorn app.main:app --reload --port 8000

Endpoints:
    GET  /api/health
    POST /api/batch/run              -> runs a full simulated batch, returns RecoveryBatch
    GET  /api/batch/{batch_id}       -> fetch a previously run batch
    GET  /api/batch/{batch_id}/cases/{case_id} -> single case detail (with audit trail)
    GET  /api/compliance/policy      -> current guardrail policy constants (for UI display)
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from . import compliance
from .batch_runner import run_batch
from .models import RecoveryBatch

app = FastAPI(
    title="AI Revenue Recovery Agent API",
    description="Detects, diagnoses, and executes bounded recovery workflows "
                "across payment failures, checkout drop-offs, failed subscriptions, "
                "and overdue B2B receivables.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # hackathon prototype: wide open; lock down in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# in-memory batch store (prototype-scale; swap for a real DB in production)
_BATCH_STORE: dict[str, RecoveryBatch] = {}


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ai-revenue-recovery-agent"}


@app.post("/api/batch/run")
def run_batch_endpoint(
    n_cases: int = Query(55, ge=5, le=300),
    seed: int = Query(42, ge=0),
):
    batch = run_batch(n_cases=n_cases, seed=seed)
    _BATCH_STORE[batch.batch_id] = batch
    return batch


@app.get("/api/batch/{batch_id}")
def get_batch(batch_id: str):
    batch = _BATCH_STORE.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found. Run a new batch first.")
    return batch


@app.get("/api/batch/{batch_id}/cases/{case_id}")
def get_case(batch_id: str, case_id: str):
    batch = _BATCH_STORE.get(batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found.")
    for case in batch.cases:
        if case.case_id == case_id:
            return case
    raise HTTPException(status_code=404, detail="Case not found in this batch.")


@app.get("/api/compliance/policy")
def get_policy():
    return {
        "max_contacts_per_window": compliance.MAX_CONTACTS_PER_WINDOW,
        "contact_window_days": compliance.CONTACT_WINDOW_DAYS,
        "grace_period_hours_b2c": compliance.GRACE_PERIOD_HOURS_B2C,
        "grace_period_hours_b2b": compliance.GRACE_PERIOD_HOURS_B2B,
        "quiet_hours_start": compliance.QUIET_HOURS_START.strftime("%H:%M"),
        "quiet_hours_end": compliance.QUIET_HOURS_END.strftime("%H:%M"),
        "max_voice_calls_per_case": compliance.MAX_VOICE_CALLS_PER_CASE,
        "termination_keywords": sorted(compliance.TERMINATION_KEYWORDS),
    }
