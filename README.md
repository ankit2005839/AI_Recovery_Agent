# Ledger — AI Revenue Recovery Agent

A full-stack prototype built for **Track 03: AI Revenue Recovery**. Ledger detects
revenue at risk, diagnoses the root cause, selects a compliant intervention, and
executes a bounded recovery workflow — across failed subscriptions, abandoned
checkouts, degraded payment gateways, and overdue B2B receivables — with a fully
immutable, explainable audit trail behind every action.
---
Website- https://steadfast-growth-production-e9b4.up.railway.app/
---

## 1. System Architecture

```
ai-revenue-recovery-agent/
├── backend/                     # Python / FastAPI — the agent itself
│   ├── app/
│   │   ├── models.py             # Customer, Transaction, InterventionLog,
│   │   │                         # AuditTrailEntry, RecoveryCase, RecoveryBatch
│   │   ├── mock_data.py          # 55+ realistic cases incl. deliberate edge cases
│   │   ├── decision_engine.py    # Root-cause classifier + intervention selector matrix
│   │   ├── compliance.py         # Guardrails: max contacts, quiet hours, opt-out,
│   │   │                         # dispute routing, instant-termination keywords
│   │   ├── retry_sequencer.py    # Smart Mandate Retry Sequencer
│   │   ├── messaging.py          # Hinglish / English / Hindi message generator
│   │   ├── p2p_state_machine.py  # Promise-to-Pay lifecycle
│   │   ├── orchestrator.py       # Per-case state machine, wires everything together
│   │   ├── batch_runner.py       # Runs the full batch, computes executive metrics
│   │   └── main.py               # FastAPI routes
│   └── requirements.txt
│
├── frontend/                    # Next.js (App Router) — the dashboard
│   ├── app/
│   │   ├── layout.tsx / page.tsx / globals.css
│   ├── components/
│   │   ├── ExecutiveMetrics.tsx      # ₹ at risk, ₹ recovered, recovery %, audit %
│   │   ├── RecoveryCharts.tsx        # Recharts: recovery by scenario, outcome mix
│   │   ├── BatchControls.tsx         # Run / reseed the simulation
│   │   ├── CaseLedger.tsx            # Batch Execution Visualizer (live reveal)
│   │   ├── CaseDetailPanel.tsx       # Case Detail & Audit Log Viewer
│   │   ├── CompliancePolicyPanel.tsx # Guardrail policy, shown transparently
│   │   └── StatusPill.tsx
│   ├── lib/
│   │   ├── types.ts   # mirrors backend/app/models.py exactly (snake_case)
│   │   ├── api.ts      # fetch helpers
│   │   └── format.ts   # ₹ formatting, status/label/color maps
│   └── package.json / tailwind.config.ts / tsconfig.json
│
└── README.md
```

### How this maps to the judging bar

| Judging criterion | Where it lives |
|---|---|
| **Measured money recovered** ($/₹ total & rate %) | `batch_runner.py` computes `total_recovered`, `recovery_rate_pct` from real per-case outcomes; surfaced live in `ExecutiveMetrics.tsx` |
| **Compliant escalation matrix** | `decision_engine.select_intervention()` — cadence intensifies gradually (silent retry → SMS → voice/email → discount) and **de-escalates automatically** for irate, premium, or enterprise customers |
| **Strict stopping rules & guardrails** | `compliance.py` — every single customer-facing action passes through `check_compliance()` before execution; nothing bypasses it |
| **Immutable audit trail** | `AuditTrailEntry` is a frozen Pydantic model; `RecoveryCase.add_audit()` is the only way to append one, and every diagnosis, compliance check, intervention, and P2P event writes one |

### Why the decision logic is a rule engine, not an LLM call

The root-cause classifier and intervention selector are **deterministic**, so
every decision is reproducible and auditable end-to-end — a hard requirement for
a fintech compliance story. An LLM is a legitimate fit for turning `reasoning`
into more advanced conversational text (see `messaging.py` for where that layer
would slot in), but the money-moving decision logic itself should not be a
non-reproducible black box.

---

## 2. Quickstart Setup

### Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate   # optional but recommended
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Verify it's up: `curl http://localhost:8000/api/health`

Interactive API docs: `http://localhost:8000/docs`

### Frontend (Next.js)

```bash
cd frontend
cp .env.example .env.local     # points the UI at http://localhost:8000 by default
npm install
npm run dev
```

Open `http://localhost:3000`. On load it automatically runs a 55-case batch
against the backend (seed `42`) — use the **Run batch simulation** / **New seed**
controls in the header to re-run or regenerate with different mock data.

### One-shot batch run without the UI

```bash
curl -X POST "http://localhost:8000/api/batch/run?n_cases=55&seed=42" | python3 -m json.tool
```

---

## 3. Feature Summary

### Smart Mandate Retry Sequencer (`retry_sequencer.py`)
Predicts the optimal next retry timestamp per case by combining:
- **Decline-code semantics** — soft declines (insufficient funds, issuer down,
  gateway timeout) get scheduled retries; hard declines (expired/lost card) are
  never blindly retried and instead route to an update-payment-method action.
- **Salary-cycle alignment** — for `insufficient_funds` declines, retry is
  re-timed to T+1 after the customer's known payday instead of a flat backoff,
  bounded so it never delays recovery by more than ~10 days.
- **Bank/gateway downtime avoidance** — candidate timestamps are nudged out of
  known nightly-settlement and NEFT/RTGS maintenance windows.
- **Bounded exponential backoff** (4h → 1d → 3d → 7d) as the fallback, capped by
  the guardrail's `max_retries`.

Every prediction returns a `reasoning` string that is written straight into the
audit trail — nothing is scheduled silently.

### Hinglish & Localization Generator (`messaging.py`)
Deterministic, parameterized templates across English / Hinglish / Hindi, tuned
by scenario, channel (SMS / email / voice script / B2B email), and customer
segment. Tone automatically softens for customers flagged irate, and B2B
templates stay formal English with finance-team CC. Exactly what was generated
is logged verbatim in `InterventionLog.message_text` for audit purposes — no
"the AI probably said something like…".

### Compliance & Stopping Rules Guardrail (`compliance.py`)
Enforced **before** every customer-facing action, in order:
1. Permanent opt-out list (never contacted again, full stop)
2. Active dispute flag → routed to a human, agent never auto-contacts
3. Max **3 contacts per rolling 7-day window**
4. Max **1 voice call per case**, and never to an irate customer
5. Regulatory grace period before first contact (2h B2C / 24h B2B)
6. Quiet-hours contact window (09:00–20:00 local)
7. Enterprise auto-escalation cap (3+ touches requires human sign-off)
8. Instant termination on inbound keywords: `stop`, `unsubscribe`, `lawyer`,
   `dispute`, `fraud`, `harassment`, `complaint`, `police`, and others — see
   `GET /api/compliance/policy` for the live list, also rendered in the UI.

Blocked actions are **logged, not hidden** — they show up as `compliance_check:
blocked` entries in the audit trail with the exact rule that fired.

### Promise-to-Pay State Machine (`p2p_state_machine.py`)
`NONE → PROMISED → REMINDED → {KEPT | BROKEN}`. While a case sits in
`PROMISED`, the normal escalation cadence is suspended — the customer gets at
most one soft, non-pressuring reminder 24h before the promised date, and the
case resolves automatically once that date passes.

### Batch Simulator & Audit Visualizer (frontend)
- **Executive Metrics** — animated count-up of ₹ at risk, ₹ recovered, recovery
  rate, and audit compliance rate.
- **Batch Execution Visualizer** — a ledger-style table of all cases with a
  staggered live-reveal animation, filterable by terminal status, click any row
  to inspect it.
- **Case Detail & Audit Log Viewer** — side-by-side: transaction + customer +
  diagnosis summary on the left; the full timestamped reasoning/compliance
  timeline and every exact message sent (with confidence score) on the right.

---

## 4. Benchmark Stats (verified, reproducible run)

Command used: `POST /api/batch/run?n_cases=55&seed=42`

| Metric | Value |
|---|---|
| Batch size | 55 cases |
| **Total revenue at risk** | **₹39,59,106.86** |
| **Total recovered** | **₹20,17,739.06** |
| **Recovery rate** | **50.96%** |
| **Audit compliance rate** | **100.00%** (every logged action passed through a checked compliance gate — nothing executed ungated) |
| Compliance checks: passed / correctly blocked | 82 / 69 |
| Outcomes | 33 recovered · 12 exhausted · 5 stopped (max attempts) · 3 stopped (compliance) · 2 escalated to human |
| Scenario mix | 18 failed subscription · 15 abandoned checkout · 11 B2B overdue invoice · 11 payment degradation |

These numbers are deterministic for `seed=42` and will reproduce exactly on
re-run — use the **New seed** control (or a different `seed` query param) to see
the range across other randomized batches. The 69 "correctly blocked" checks are
not failures — they are the guardrail successfully stopping opted-out, disputed,
over-contacted, or out-of-hours actions before they could happen, which is
exactly what the compliance criterion is scoring.

---

## 5. Notes on Production Hardening (out of scope for this prototype)

- Swap the in-memory `_BATCH_STORE` in `main.py` for a real database (Postgres)
  with the `AuditTrailEntry` table append-only / write-once at the DB level.
- Replace `orchestrator._simulate_outcome()` with real webhook listeners from
  the payment gateway (Razorpay/Stripe) and inbound SMS/email/voice-transcript
  events for the termination-keyword scanner.
- Move the compliance policy constants into a config service so legal/compliance
  teams can tune them without a code deploy.
- Add authentication and per-tenant isolation before this touches real customers.
