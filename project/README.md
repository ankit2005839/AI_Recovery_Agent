# AI Revenue Recovery Agent
### Track 03: AI Revenue Recovery

An autonomous agent platform that **detects revenue at risk, diagnoses root causes, selects a compliant intervention, and executes a bounded recovery workflow** across four scenarios: failed subscriptions, abandoned checkouts, B2B overdue receivables, and payment-gateway degradation.

This is a **single, self-contained Next.js application**. The "agent orchestrator" is a TypeScript state-machine engine (`lib/`) invoked from a Next.js API route — this satisfies the brief's "TypeScript agent orchestrator with explicit state machine transition logic" while keeping the whole stack to one `npm run dev`. (A Python/FastAPI service could sit behind the same API contract without changing the frontend — see **"Swapping in a FastAPI backend"** at the bottom.)

---

## 1. Architecture

```
ai-revenue-recovery-agent/
├── app/
│   ├── layout.tsx                 # Root HTML shell
│   ├── globals.css                # Tailwind + design tokens
│   ├── page.tsx                   # Dashboard (client component) — wires everything together
│   └── api/
│       └── batch/
│           ├── data/route.ts      # GET  -> generates the mock case batch
│           └── run/route.ts       # POST -> runs the batch through the agent orchestrator
│
├── components/
│   ├── ControlBar.tsx              # Run / reset controls, audit-chain verification badge
│   ├── ExecutiveMetrics.tsx        # KPI cards: revenue at risk, recovered, recovery %, compliance %
│   ├── RecoveryChart.tsx           # Recharts bar + pie charts by scenario
│   ├── BatchVisualizer.tsx         # Live table: Detected -> Diagnosed -> Contacted -> Recovered/Stopped
│   └── AuditLogViewer.tsx          # Case detail: diagnosis, P2P status, messages sent, full audit trail
│
├── lib/
│   ├── types.ts                   # ALL schema definitions (Customer, Transaction, InterventionLog,
│   │                               #  AuditTrailEntry, RecoveryBatch, etc.)
│   ├── mockData.ts                # 20 curated edge cases + randomized fill to 50-100+ cases
│   ├── diagnosticEngine.ts        # Root-cause classification (soft/hard/fraud/infra decline logic)
│   ├── retrySequencer.ts          # Smart mandate retry sequencer (salary cycle, bank downtime, backoff)
│   ├── interventionSelector.ts    # Root cause + segment + attempt count -> intervention matrix
│   ├── messageGenerator.ts        # Hinglish / Hindi / English message & voice-script templates
│   ├── p2pStateMachine.ts         # Promise-to-Pay state machine (PENDING -> REMINDER -> FULFILLED/BROKEN)
│   ├── compliance.ts              # Guardrails: stop keywords, contact caps, time windows, grace periods
│   ├── auditTrail.ts              # Hash-chained, tamper-evident immutable audit log
│   ├── agentOrchestrator.ts       # Ties everything into the case + batch state machine
│   └── uiHelpers.ts               # Formatting / label / color helpers shared by components
│
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── README.md   (this file)
```

### Data model summary (`lib/types.ts`)

| Type | Purpose |
|---|---|
| `Customer` | identity, segment, language, salary cycle day, opt-out/dispute flags, loyalty score |
| `Transaction` | the at-risk revenue unit — scenario, amount, gateway error code, attempt count, overdue days |
| `DiagnosisResult` | root cause + decline class + confidence + reasoning trace |
| `InterventionDecision` / `InterventionLog` | the chosen action + the actual message sent + outcome |
| `PromiseToPay` | P2P state machine record |
| `ComplianceCheckResult` | pass/hardStop + every guardrail check run + human-readable reasons |
| `AuditTrailEntry` | one immutable, hash-chained step in a case's lifecycle |
| `RecoveryCase` | full per-case record: customer + transaction + diagnosis + interventions + audit trail |
| `RecoveryBatch` / `BatchMetrics` | the aggregate run + all judging-criteria metrics |

---

## 2. The Agent Pipeline (state machine)

```
DETECTED → DIAGNOSING → DIAGNOSED → SELECTING_INTERVENTION → COMPLIANCE_CHECK
                                                                     │
                        ┌────────────────────┬───────────────────────┼───────────────────────┐
                        ▼                    ▼                       ▼                       ▼
                   HARD STOP            HUMAN ESCALATION        SOFT BLOCK              CONTACTING
              (STOPPED / ESCALATED)     (fraud / dispute)   (outside window/grace)   → AWAITING_RESPONSE
                                                                                             │
                                                                          ┌──────────────────┼──────────────────┐
                                                                          ▼                  ▼                  ▼
                                                                     RECOVERED           PROMISED           FAILED
                                                                                       (P2P state machine
                                                                                        → RECOVERED / FAILED)
```

Every single transition above is written to `lib/auditTrail.ts` as a **hash-chained** `AuditTrailEntry` (FNV-1a chaining of `prevHash + payload`). `verifyAuditChain()` walks every case's chain after each batch run and the UI shows a live **"Audit chain verified"** badge — this is the "complete immutable audit trail" requirement made concrete and checkable, not just asserted.

---

## 3. How each judging criterion is met

**1. Measured money recovered ($/₹ total & recovery rate %)**
`lib/agentOrchestrator.ts → computeBatchMetrics()` aggregates `totalRevenueAtRisk`, `totalRecovered` (including P2P-fulfilled amounts), and `recoveryRatePct`, broken down by scenario. Rendered live in `ExecutiveMetrics.tsx` and `RecoveryChart.tsx`, and it updates in real time as the batch visualizer plays out case-by-case.

**2. Compliant escalation matrix (preventing spam/harassment)**
`lib/interventionSelector.ts` never escalates straight to aggressive channels — it ladders from silent auto-retry → SMS/WhatsApp → discount → voice call, and routes fraud/dispute cases straight to a human instead of automated contact. `lib/compliance.ts` enforces the ceiling on top of that (see #3).

**3. Strict stopping rules & guardrails**
`lib/compliance.ts` enforces, on every single contact attempt:
- **Opt-outs** — permanent suppression.
- **Instant-termination keywords** — "stop", "lawyer", "dispute", "harassment", "sue", "police", etc. — checked against the customer's last inbound message.
- **Max 3 contacts per rolling 7-day window.**
- **Time-of-day contact window** (9:00–20:00 customer-local-time).
- **Grace periods** before any human-facing contact (0.5h–24h depending on scenario) so silent auto-retries get a fair chance first.
- **B2B escalation-email cooldown** (3 days between formal escalation emails).

Every check's pass/fail and the exact reasoning is written into the audit trail (`ComplianceCheckResult`).

**4. Complete immutable audit trail**
See the pipeline diagram above — literally every state transition, every compliance check, every message sent, and every outcome is an `AuditTrailEntry` with a chained hash. `AuditLogViewer.tsx` renders the full trace per case, including the hash of each entry.

---

## 4. Outperform differentiators

- **Multi-scenario handlers** — `SUBSCRIPTION_RETRY`, `ABANDONED_CHECKOUT`, `B2B_OVERDUE`, `GATEWAY_DEGRADATION` all flow through the same pipeline but branch on scenario-specific logic in `diagnosticEngine.ts`, `retrySequencer.ts`, and `interventionSelector.ts`.
- **Smart mandate retry sequencer** (`lib/retrySequencer.ts`) — soft declines get scheduled around the customer's salary cycle day; hard declines skip retry entirely and go straight to a card-update request; infra failures (bank/gateway downtime) get a short 30-minute cooldown clear of the 2–6 AM maintenance window; repeated attempts get escalating backoff.
- **Hinglish & localization generator** (`lib/messageGenerator.ts`) — every intervention type has English, Hindi, and natural Hinglish variants (including a first-person Hinglish voice-call script), selected by the customer's stored language preference.
- **Promise-to-Pay state machine** (`lib/p2pStateMachine.ts`) — `PENDING → REMINDER_SCHEDULED → FULFILLED/BROKEN`, with a distinct, gentler "soft reminder" template (`generateP2PSoftReminder`) that's never confused with a dunning message.
- **Interactive batch simulator + audit visualizer** — `app/page.tsx` runs 55+ mock cases (configurable up to 100), reveals them progressively like a live run, and lets you click into any case to see the agent's full reasoning trace, confidence scores, exact message text, and every compliance check it ran.

---

## 5. Setup & run instructions

```bash
# 1. Install dependencies
npm install

# 2. Run the dev server
npm run dev

# 3. Open the dashboard
# http://localhost:3000
```

Then click **"Run Batch Simulation"**. The batch (default 55 cases — 20 hand-authored edge cases + randomized fill) will:
1. Be generated by `GET /api/batch/data`
2. Be run through the full agent pipeline by `POST /api/batch/run`
3. Play back progressively in the UI so you can watch cases move through `Detected → Diagnosed → Contacted → Recovered/Stopped`
4. Click any row to open the full audit trail / reasoning / message-template viewer on the right.

**Build for production:**
```bash
npm run build
npm run start
```

No environment variables or external services are required — everything (including the "customer's response") is simulated deterministically via a seeded PRNG, so runs are reproducible for demo purposes.

---

## 6. Swapping in a FastAPI backend (optional, for judges who want to see Python)

The API contract is intentionally thin and framework-agnostic:

- `GET /api/batch/data?count=55` → `{ pairs: { customer, transaction }[] }`
- `POST /api/batch/run` with `{ pairs, seed }` → `{ batch: RecoveryBatch, auditIntegrity }`

To swap in a Python/FastAPI backend, port `lib/diagnosticEngine.ts`, `lib/retrySequencer.ts`, `lib/interventionSelector.ts`, `lib/compliance.ts`, `lib/messageGenerator.ts`, `lib/p2pStateMachine.ts`, and `lib/agentOrchestrator.ts` 1:1 (they're pure functions with no framework dependencies — a direct Python port is mechanical), expose the same two endpoints via `uvicorn main:app --reload`, and point the two `fetch()` calls in `app/page.tsx` at the FastAPI host. The frontend and data contracts do not need to change.
