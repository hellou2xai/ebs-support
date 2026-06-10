# Oracle EBS AMS Support Agentic App: Analysis and Design

Author: working notes for the Vertiv / CG demo
Last updated: 2026-06-10

---

## Part 1: Ticket dump analysis

### What the file is

`Truncated_High_Impact_Ticket_Dump.xlsx` is not a normal Excel workbook despite the
extension. It is an OLE2 compound file (magic bytes `D0CF11E0`) wrapping a Microsoft
Information Rights Management (IRM / Azure RMS) encrypted package.

Internal streams:

- `EncryptedPackage`: the real workbook, AES-encrypted.
- `\x06DataSpaces\...\DRMEncryptedTransform\\x06Primary`: the XrML rights label
  (readable metadata, not the data).
- `DataSpaceMap`, `DataSpaceInfo`, `DRMEncryptedDataSpace`: the IRM plumbing.

### Protection details (from the XrML rights label)

- Protection: Azure Information Protection / Microsoft RMS.
- Issued: 2026-06-08 21:43.
- Tenant: Capgemini, tenant ID `76a2ae5a-9f00-4f6b-95ed-5d33d77c4d61`.
- Region: EU (`rms.eu.aadrm.com`).
- Owner: `pradeep-bhargav.kottur-gururaj@capgemini.com`.
- License acquisition URL:
  `https://a41930de-feee-4d8d-ba95-d2171497bdb6.rms.eu.aadrm.com/_wmcs/licensing`.
- Policy markers: `RequireRmsAwareApplication=true`, an `OWNER` right, usage window
  2026-06-07 to 2026-07-08.

### Why it cannot be read here

The ticket rows live only in the `EncryptedPackage` stream. The content key is sealed
inside the XrML `ENABLINGBITS` (sealed-key-v2) blobs, which are sealed to Capgemini's
RSA private key held by Microsoft's RMS service. Unsealing requires authenticating to
that RMS server as an authorised identity. No password, parsing, or local tool recovers
the plaintext, and defeating the rights protection is not an option.

### How to get a readable copy

Someone with rights under the policy (the owner above, or anyone the policy grants) has
to open it and export an unprotected version:

1. Open in Excel signed into an authorised Capgemini M365 account (decrypts via RMS).
2. File > Info > Protect Workbook > Restrict Access > Unrestricted Access, then Save As
   a new `.xlsx`. Or Save As > CSV, which strips the protection.
3. Drop the unprotected file in this folder for analysis.

Once a readable copy lands, the dump becomes the seed corpus for the triage and
retrieval layers described below: labelled examples for classification and the
nearest-neighbour set for "have we seen this before".

### Now unencrypted and analysed (2026-06-10)

The dump was refreshed as an unprotected `.xlsx` and read directly. It is a ServiceNow
export, sheet `Target_Incidents`, 20 real incidents, 8 columns: `BUSINESS_IMPACT_THEME,
INCIDENT_NUMBER, SHORT_DESCRIPTION, ASSIGNMENT_GROUP, OPENED_AT, CLOSED_AT, CLOSE_CODE,
CLOSE_NOTES`. The real 20 are saved verbatim to `data/incidents_real.csv` and carried
through into `data/incidents.csv`.

**The real data supersedes the assumed model.** Parts 2 to 6 (the agent architecture and
the ITSM flow) still hold. But the assumed "five tracks" in Part 7 were a best guess
before the data was readable. The actual structure is in **Part 11, which is now the
authoritative ground truth.** Read Part 11 first; treat Part 7 as superseded background.

Headline findings:

- Program codename **Alice**. Support is organised by value stream, not my assumed
  tracks: **Item-MDM, QTD (Quote-to-Delivery), PTM (Plan-to-Manufacture), PTC
  (Plan-to-Cash), Services.**
- Real systems: **Agile PLM (PD), Item MDM integration, EBS, CPQ, BluJay (transport),
  Cloud2EBS/DropShip.**
- The biggest cluster is **Item-MDM**: PD-to-EBS item and revision sync (CO/CCO/NRCO/ECO
  change orders, CCB reports, Item Workbench).
- **Recurrence is explicit in the data.** Tickets are recreated and cross-referenced, and
  two DropShip data-corruption tickets share an identical root cause. This is the
  evidence base for the "resolve at source" goal.

---

## Part 2: The problem an EBS AMS agentic app solves

EBS AMS support is mostly the same shapes repeating: a concurrent program failed, a
workflow is stuck, an interface rejected rows, a period will not close, someone lost a
responsibility, a custom RICEW object broke after a patch. L1 and L2 spend hours on
triage, log-reading, and My Oracle Support (MOS) note hunting before anyone touches the
real fix.

The app should collapse diagnostic time and auto-resolve the repeatable tier, while
keeping humans on anything that writes to the database.

---

## Part 3: The agents

Think of it as a pipeline of specialised agents, not one big chatbot.

| Agent | Job | Writes to EBS? |
|---|---|---|
| Intake | Parse ticket into a structured object | No |
| Triage | Classify, prioritise, match to past tickets | No |
| Retrieval | Pull KB, runbooks, MOS, instance config | No |
| Diagnostic | Confirm root cause via read-only queries | No |
| Remediation | Execute scoped fixes | Yes, guardrailed |
| Comms | Draft updates, update ticket | Ticket only |
| Learning | Capture new patterns | KB only |

### Stage detail

1. **Intake and normalise.** Extract structured signal: module (AP/AR/GL/INV/HRMS/SCM),
   object type (concurrent request, workflow, interface, form/OAF page, responsibility),
   error text, request ID, instance (PROD/UAT), user, business impact.
2. **Triage and classify.** Map to a known problem pattern and SLA priority. Answer:
   what category, seen before, auto-resolvable or human-only. The ticket dump is the
   labelled example set here.
3. **Retrieve context (RAG over four corpora):** past resolved tickets, internal
   runbooks/SOPs, MOS notes and patch readme's, the instance's own config
   (responsibilities, request sets, interface mappings).
4. **Diagnose (read-only tools):**
   - `FND_CONCURRENT_REQUESTS` and request logs for failed programs.
   - `WF_NOTIFICATIONS` / workflow status for stuck items.
   - Interface error tables (`AP_INTERFACE_REJECTIONS`, GL/AR equivalents).
   - `FND_USER` / responsibility assignments for access issues.
   Returns root cause with evidence, not a guess. Highest-value agent; build first.
5. **Resolve, by risk:**
   - Auto-resolve (guardrailed): resubmit a failed request, bounce the WF mailer,
     requeue rejected interface rows, re-run a stuck program, grant a standard
     responsibility from an approved list. Scoped, logged, reversible where possible.
   - Assisted: draft the exact fix (data-fix SQL, FNDLOAD command, patch) and route to
     L3 with the diagnosis attached. A human approves and executes.
   - Escalate: novel or Oracle-bug territory goes to a human with a full context bundle.
6. **Respond and update.** Draft user-facing update and internal work note, set
   resolution code. Humans approve customer-facing messages early on.
7. **Learn.** Every resolved ticket feeds back a new pattern, runbook entry, or
   classification correction. The knowledge base compounds.

---

## Part 4: How it touches EBS safely

- **Read path:** dedicated read-only DB account plus named, parameterised queries
  exposed as tools (MCP server in front of EBS). No ad-hoc SQL against PROD.
- **Write path:** a fixed, code-reviewed, versioned catalogue of approved actions
  (resubmit request, requeue interface, assign responsibility), each audited, each with
  a blast radius you can state in one sentence. Anything outside the catalogue is a human
  task.
- **Environments:** full autonomy in DEV/UAT, approval-gated in PROD. High-impact tickets
  always have a human approver regardless of environment.
- **Everything logged:** every tool call, query, and decision is traceable for audit.

### Build notes

- Claude Opus 4.8 for diagnostic and remediation reasoning (the hard judgement calls);
  Haiku 4.5 for intake parsing and classification at volume. Route by stage.
- Tool use plus an MCP server wrapping EBS read queries, the ITSM, and the action
  catalogue. Agents call tools, not raw connections.
- Adding a new auto-resolve action is a deliberate, reviewed change, not a prompt tweak.

---

## Part 5: End-to-end flow including the ITSM

Reference platform: ServiceNow (shape holds for Remedy, Jira Service Management, or
Oracle SR). Principle: the ITSM owns state, SLA, audit, and assignment. The agentic app
reads from it, acts, and writes everything back. It never becomes a parallel source of
truth.

```
  +---------------------------------------------------------------------+
  |                        ITSM (ServiceNow)                            |
  |   system of record: state - SLA clock - assignment - audit - CMDB   |
  +---------------------------------------------------------------------+
        | 1. ticket lands           ^ 6. work notes, state, resolution
        |    + routed to AMS queue   |    written back continuously
        v                            |
  +--------------+  webhook /  +--------------------------------------+
  |  Trigger /   |--event----->|         Agentic App (orchestrator)   |
  |  Integration |             |  Intake>Triage>Retrieve>Diagnose>Act |
  |  layer (MID) |<--API-------|         ^          |         |       |
  +--------------+             +---------|----------|---------|-------+
                                         |          |         |
                          +--------------+          |         +-----------+
                          v                         v                     v
                   +------------+          +--------------+       +--------------+
                   | Knowledge  |          |  EBS (read-  |       | Action       |
                   | base + KB  |          |  only MCP)   |       | catalogue +  |
                   | + MOS notes|          | logs, tables |       | approvals    |
                   +------------+          +--------------+       +--------------+
```

### Lifecycle, step by step

1. **Creation and routing (ITSM).** User, monitoring tool, or email creates an incident.
   ServiceNow categorises and routes to the EBS AMS assignment group. SLA clock starts.
   Native ITSM, no agent yet.
2. **Trigger (integration layer).** When the ticket hits the AMS queue, a business rule
   or Flow Designer action fires a webhook (via MID Server / IntegrationHub for on-prem
   reach) to the app with the ticket sys_id and core fields. Event-driven, not polling.
3. **Intake and triage (app).** App pulls the full record via the Table/REST API,
   normalises it, classifies against ticket history, and writes a work note back. Ticket
   moves to In Progress, assigned to a virtual agent user for a clean audit trail.
4. **Retrieve and diagnose (app).** App queries the knowledge layer and runs read-only
   EBS queries via MCP to confirm root cause, then posts the diagnosis with evidence
   (failed request log, interface rejection rows, stuck workflow item).
5. **Resolve, three branches:**
   - Auto-resolvable, low risk: execute a scoped catalogue action, verify with a
     follow-up read, write resolution and closure code, move to Resolved.
   - Assisted (PROD write or high impact): raise a Change Request in the ITSM with the
     proposed fix attached (data-fix SQL, FNDLOAD, patch). Normal CAB / standard-change
     path. On approval, the app executes or an engineer runs it. Approval lives in the
     ITSM.
   - Escalate: reassign to human L3 with the full context bundle attached.
6. **Communicate and close (ITSM).** App drafts the customer-facing update (human-
   approved at first, auto-sent later for safe categories), sets resolution notes, and
   the ticket follows Resolved > Closed with the contractual confirmation window.
7. **Learn (app + ITSM).** On closure the app captures the pattern. New resolutions
   become draft Knowledge Base articles in ServiceNow Knowledge, routed for human review
   before publish. The KB the app reads and the KB humans read are the same one.

### What syncs in each direction

| ITSM to App | App to ITSM |
|---|---|
| New ticket event + fields | Work notes (diagnosis, actions, evidence) |
| Reassignment / reopen | State transitions (In Progress, Resolved) |
| Change approval decisions | Resolution code + close notes |
| CMDB / CI data (which EBS instance) | Change Requests for risky fixes |
| Priority / SLA changes | Draft KB articles |

### Three integration points that matter

- **CMDB.** Link the ticket to the EBS instance as a Configuration Item. That governs
  which environment the app may touch and with what autonomy. Do not infer the instance
  from free text when the CMDB knows it.
- **Change management.** Every PROD database write flows through the ITSM change process.
  Non-negotiable for AMS audit, and the core safety rail: app proposes, change record
  approves, action executes. No approval, no write.
- **SLA and reporting.** Because the ITSM stays the system of record, existing SLA
  dashboards and AMS reporting keep working. Auto-resolution rate, mean time to diagnose,
  and assist-vs-escalate ratios come out of the same reporting you already run.

---

## Part 6: Build sequence

1. **Read and write-back only.** Wire the webhook, post diagnosis work notes, never act.
   Pure assist. Proves the integration, builds trust, zero PROD risk.
2. **Auto-resolve the safe tier** in non-PROD and read-only PROD actions (resubmits,
   requeues).
3. **Change-gated PROD writes** through the ITSM change process.
4. **KB write-back and the learning loop.**

Start with the diagnostic bundle: within minutes of a ticket arriving, a human gets root
cause, evidence, relevant past tickets, and a proposed fix. That alone cuts handle time
and earns the right to switch on auto-resolve later.

---

## Part 7: The five high-impact tracks mapped to the agentic flow

> SUPERSEDED. This part was written before the dump was readable and reflects an assumed
> model (EBOM/CPQ/RevRec/DataFix/Sync). The real data is in **Part 11**, which is
> authoritative. Kept here only to show the original hypothesis. The agentic *mechanics*
> described below (diagnose, auto-resolve, assisted, escalate) still apply; only the
> categories changed.

These are the actual categories from the high-impact ticket dump. Each one below gives
the scope, the representative incidents, the failure modes, the business impact, and how
the agentic app handles it: the diagnostic signals it reads, which actions are
auto-resolvable, which are assisted (change-gated), and which escalate. Systems in play
across all tracks: **PD/PLM, CPQ, EBS, BOM, item master, trade/GTM.**

### Track 1: EBOM / Hold Release Automation

- **Scope:** engineering BOM and order holds that block order progression, delay
  manufacturing and shipping, and need repetitive manual release.
- **Representative incidents:** INC1080014, INC0885484, INC0885542, INC0933785,
  INC0931721, INC1022003, INC0976643, INC0974633, INC0941702.
- **Failure modes:** orders stuck on holds, BOM not released or out of sync, repeated
  manual hold release.
- **Business impact: HIGH.** Direct revenue delay, operational bottleneck, high ticket
  volume, customer delivery risk. Flagged a strong automation candidate.
- **Agentic handling:**
  - *Diagnose (read-only):* query `OE_ORDER_HOLDS_ALL` and `OE_HOLD_SOURCES_ALL` for the
    held order, identify hold type and source; check BOM release status and PD-to-EBS BOM
    sync state; confirm whether the hold condition still applies.
  - *Auto-resolve (guardrailed):* release holds that match an approved rule set (the
    condition has cleared), re-trigger BOM release, re-progress the order. This is the
    flagship auto-resolve win given the volume and the "strong automation candidate" note.
  - *Assisted:* holds tied to a genuine data or config problem get a drafted fix routed
    for approval.
  - *Escalate:* novel hold reasons or BOM structure defects.
- **Why first:** highest combination of volume, business pain, and automation feasibility.
  Build this track end to end before anything else.

### Track 2: CPQ to EBS Integration Failures

- **Scope:** failures on the path from CPQ into EBS that stop quoting and order booking.
- **Representative incidents:** INC0959444, INC0958719, INC0963122, INC1079474,
  INC1079457, INC1079471, INC0910475, INC0910476, INC0941092.
- **Failure modes:** invalid item / serviceability mappings, warehouse / item mismatches,
  contract coverage validation failures, quote submission failures.
- **Business impact: VERY HIGH.** Stops the sales cycle, delays bookings, hits revenue
  recognition, drives customer escalation.
- **Agentic handling:**
  - *Diagnose (read-only):* read the CPQ-to-EBS integration error log / message queue;
    validate the item exists and is assigned to the target inventory org / warehouse;
    check service contract coverage; compare the failing item/warehouse against the
    master mappings.
  - *Auto-resolve (guardrailed):* requeue or resubmit a failed integration message once
    the underlying mapping is confirmed valid; re-sync a single item mapping from the
    approved source.
  - *Assisted:* mapping corrections (warehouse/item, serviceability, coverage rules)
    drafted and change-gated, since they alter master data.
  - *Escalate:* structural mapping gaps or CPQ-side config defects.

### Track 3: Revenue Recognition / Financial Blocking

- **Scope:** incidents affecting revenue recognition, financial close, billing, and audit
  exposure.
- **Representative incidents:** INC0927799, INC1057052, INC1057148, INC0941190,
  INC0885752, INC1034927, INC0968698, INC0936614.
- **Failure modes:** invoice interface failures, obligation publishing errors, stuck AR
  transactions, credit memo inconsistencies, agreement / sales-order mismatches.
- **Business impact: CRITICAL.** Direct cash-flow impact, CFO visibility, quarter-close
  risk, compliance implications.
- **Agentic handling:**
  - *Diagnose (read-only):* read `RA_INTERFACE_LINES_ALL` and `RA_INTERFACE_ERRORS_ALL`
    for AutoInvoice rejects; check stuck AR transactions and revenue obligation publishing
    status; compare agreement vs sales order for the mismatch.
  - *Auto-resolve (very limited):* only re-running AutoInvoice import after a human-
    approved data correction. Nothing here writes financial data autonomously.
  - *Assisted (default):* drafted data-fix and resubmission scripts, always change-gated,
    always human-approved, given compliance and close exposure.
  - *Escalate:* anything touching revenue recognition policy or period close.
  - *Note:* this is the track where the diagnostic bundle alone delivers most of the
    value. Speed to root cause matters more than autonomy because the writes stay human.

### Track 4: Data Corruption / Data Fix Dependency

- **Scope:** heavy reliance on manual "data fixes", which signals weak transactional
  resilience and poor referential integrity controls.
- **Representative incidents:** INC0999687, INC0999691, INC1021530, INC0903801,
  INC0962942, INC0965154, INC0999986, INC0907524, INC0907556.
- **Business impact: HIGH.** Production instability, increased audit risk, expensive
  support model, repeatable downstream failures.
- **Agentic handling:** this track is cross-cutting. Many incidents in Tracks 1 to 3
  ultimately resolve via a data fix. The agentic asset here is a **data-fix catalogue**:
  the recurring fixes turned into named, parameterised, code-reviewed, change-gated
  scripts with a stated blast radius and a verification read.
  - *Diagnose (read-only):* detect the corruption signature (orphaned rows, broken
    referential links, status mismatches) and match it to a catalogued fix.
  - *Assisted:* propose the matching catalogued fix with the affected row count and the
    rollback note; execute only on change approval.
  - *Escalate:* corruption patterns not yet in the catalogue, which then become candidates
    for a new catalogue entry via the learning loop.
  - *Longer game:* every catalogued fix is also a flag for a root-cause defect to feed
    back to the development or config team, so the dependency shrinks over time rather
    than being automated forever.

### Track 5: Integration and Sync Failures Across Platforms

- **Scope:** asynchronous failures between PD, EBS, CPQ, BOM systems, item master, and
  trade systems. The connective-tissue track.
- **Business impact: HIGH** and systemic, because it underlies symptoms seen in Tracks 1,
  2, and 3.
- **Agentic handling:** this needs an **integration-monitoring agent** rather than pure
  ticket reaction.
  - *Diagnose (read-only):* watch the queues and error stores between systems; correlate a
    failure to the source and target object; detect partial / stalled syncs before a
    ticket is even raised.
  - *Auto-resolve (guardrailed):* requeue or replay a failed message once the payload is
    confirmed valid; re-trigger a stalled sync.
  - *Assisted:* payload or mapping corrections, change-gated.
  - *Proactive angle:* this is where the app shifts from reactive to preventive. Catching
    a sync failure and replaying it before it surfaces as a stuck order (Track 1) or a
    blocked invoice (Track 3) prevents downstream tickets entirely.

### Cross-track prioritisation

| Track | Impact | Automation feasibility | First move |
|---|---|---|---|
| 1. EBOM / Hold Release | High | High | **Build first, end to end.** Flagship auto-resolve. |
| 2. CPQ to EBS | Very High | Medium-High | Diagnose + requeue; assisted mapping fixes. |
| 3. Revenue Recognition | Critical | Low | Diagnostic bundle; writes stay human. |
| 4. Data Fix Dependency | High | Medium | Build the data-fix catalogue (serves all tracks). |
| 5. Integration Sync | High | Medium-High | Integration-monitoring agent; go proactive. |

**Recommended order:** Track 1 first (best volume-times-feasibility, builds trust),
the Track 4 data-fix catalogue in parallel (it is reused by every other track), then
Track 5 monitoring (prevents tickets), then Track 2, with Track 3 staying assist-only
throughout because of compliance.

### What this changes in the architecture

- The read and action tools span **multiple systems**, not just EBS. The MCP layer needs
  read connectors to PD/PLM, CPQ, BOM, item master, and trade, alongside EBS.
- The **data-fix catalogue** (Track 4) becomes a first-class, versioned asset, not an
  afterthought. It is the single biggest lever on the "expensive support model".
- Track 5 justifies an **event-monitoring** mode in addition to ticket-driven mode. The
  app should be allowed to open its own incident in the ITSM when it catches a sync
  failure proactively, so the same audit and SLA machinery still applies.

---

## Part 8: Demo implementation approach (file-based, synthetic)

This is a demo, not a live integration. The constraints:

- **No live system connections.** PD/PLM, CPQ, EBS, BOM, item master, trade, and the ITSM
  are all represented by CSV files. The "read tools" read those CSVs; the "action
  catalogue" writes back to them (flip a hold status, set a requeue flag, append a work
  note).
- **Markdown and CSV only.** Design, runbooks, and the diagnostic bundles are markdown.
  All structured data is CSV.
- **Synthetic data only.** No real Vertiv data. The real incident numbers from the dump
  are reused as labels so the demo ties to the five tracks, but every row of detail is
  fabricated.
- **Claude API for all AI workloads, including the agent flows.** Opus 4.8 for the
  diagnostic and remediation reasoning, Haiku 4.5 for high-volume intake and
  classification. Tool use is wired to the CSV read/write layer rather than a live MCP to
  real systems.
- **All data lives under `data/`.**

### How the architecture maps to the demo

> File names below were realigned to the real data. The current, authoritative list is
> the data dictionary in `data/README.md`. Summary mapping:

| Design concept | Demo realisation |
|---|---|
| ITSM (system of record) | `data/incidents.csv` (real 20 + synthetic) |
| Item-MDM revision sync | `data/item_revisions.csv` |
| Order holds (QTD) | `data/order_holds.csv` |
| DropShip data corruption (QTD) | `data/dropship_orders.csv` |
| Receiving stuck (PTM) | `data/rcv_interface.csv` |
| CPQ submission (QTD) | `data/cpq_submissions.csv` |
| BluJay transmission (PTM) | `data/blujay_transmissions.csv` |
| Revenue obligations (PTC) | `data/revenue_obligations.csv` |
| Root cause / permanent fix | `data/root_cause_analysis.csv` |
| Repetitive-issue classification | `data/issue_patterns.csv` |
| Data-fix catalogue | `data/data_fix_catalogue.csv` |
| Action catalogue (write path) | `data/action_catalogue.csv` |
| Knowledge base / runbooks | `data/knowledge_base.csv` |
| Knowledge graph | `data/kg_nodes.csv`, `data/kg_edges.csv` |
| Work notes / agent decisions | appended to `data/agent_worklog.csv` |

The agent loop in the demo: read the open incident from `itsm_incidents.csv`, classify it
to a track via the Claude API, pull the matching detail rows from the track CSV, produce a
diagnosis, then either flip a status in the CSV (auto-resolve), append a proposed fix from
the data-fix catalogue for approval (assisted), or mark it for escalation. Every step is
written to `agent_worklog.csv`, mirroring the ITSM write-back in Part 5.

See `data/README.md` for the full data dictionary.

### MCP-based architecture

The demo still uses real MCP. Each system stays behind its own MCP server, with the CSV
files as the backing store instead of a live database. That keeps the demo honest: the
same tool contracts would point at real systems in production by swapping the server
implementation, not the agent logic.

Suggested MCP servers and their tools:

| MCP server | Backing CSV(s) | Tools (read) | Tools (write) |
|---|---|---|---|
| `itsm-mcp` | `itsm_incidents.csv`, `agent_worklog.csv` | `get_incident`, `list_open_incidents`, `search_incidents` | `add_worknote`, `set_state`, `set_resolution` |
| `ebs-mcp` | `order_holds.csv`, `revenue_blocking.csv` | `get_order_holds`, `get_ar_interface_errors` | `release_hold`, `resubmit_autoinvoice` (guardrailed) |
| `cpq-mcp` | `cpq_ebs_integration_errors.csv` | `get_integration_errors`, `validate_item_mapping` | `requeue_message`, `resync_item_mapping` |
| `integration-mcp` | `integration_sync_log.csv` | `get_sync_failures`, `correlate_sync` | `replay_sync` |
| `datafix-mcp` | `data_fix_catalogue.csv` | `match_fix_signature`, `get_fix` | `propose_fix` (change-gated, never auto-executes) |
| `kb-mcp` | `knowledge_base.csv` | `search_kb` | `draft_kb_article` |

The orchestrator (Claude API, Opus 4.8) discovers and calls these tools. Different tools
get added as new tracks or actions are needed, without touching the core agent loop. Write
tools enforce the same guardrails as Part 4: auto-resolve tools are scoped and logged,
`propose_fix` only ever drafts for approval.

### Frontend (React)

A React support console is the human surface. It is read-mostly: the agents do the work,
the human supervises and approves.

Core views:

- **Incident queue:** open incidents from `itsm-mcp`, with the agent's track
  classification, status (auto-resolved / awaiting approval / escalated), and SLA timer.
- **Incident detail / diagnostic bundle:** the agent's root cause, the evidence rows it
  read, matched past tickets, and the proposed action. This is the Part 5 work-note view.
- **Approval panel:** for assisted and PROD-write actions. Shows the proposed fix from
  `datafix-mcp`, the affected row count, and the rollback note. Approve or reject maps to
  the change-gate in Part 4. Approval triggers the write tool.
- **Track dashboard:** the five tracks with volumes, auto-resolution rate, and
  assist-vs-escalate ratios, sourced from `agent_worklog.csv`.

The React app talks to a thin backend that hosts the Claude API orchestration and the MCP
client; the browser never holds the API key. Streaming responses give the live "agent is
diagnosing" feel in the detail view.

### Roles and personas

The demo shows the same incidents through different lenses. Role drives what each persona
sees in the React console and, more importantly, what they are allowed to approve. This
also demonstrates the human-in-the-loop guardrails from Part 4 as actual UI, not just
policy. Users live in `data/users.csv`; the role-to-permission mapping below is the
authorisation model.

| Role | Persona in demo | Sees | Can approve / do |
|---|---|---|---|
| Business user / requester | Plant or sales user who raised the ticket | Own incidents and status only | Raise incidents, confirm resolution |
| L1 support analyst | Front-line AMS analyst | Full incident queue, agent classifications | Acknowledge, route, nothing that writes to a system |
| L2 support engineer | EBS / CPQ support engineer | Queue, diagnostic bundles, evidence | Approve safe auto-resolve actions; run assisted fixes in non-PROD |
| L3 / SME | Functional or technical specialist | Everything, including the data-fix catalogue | Approve PROD data fixes; own escalations; author catalogue entries |
| Finance controller | Revenue / close owner (Track 3) | Track 3 incidents and financial-blocking detail | Approve revenue-recognition and financial fixes (compliance gate) |
| Change approver / CAB | Change manager | Change requests raised by the agent | Approve or reject PROD-write change requests |
| AMS service manager | Engagement lead | Track dashboard, SLA, auto-resolution metrics | No fix approvals; owns reporting and trend view |
| Platform admin | App / platform owner | MCP config, action and data-fix catalogues | Manage tools, catalogues, autonomy settings |

How the personas exercise the five tracks in a demo script:

- **Track 1 (EBOM / hold release):** L1 sees the held order, the agent auto-releases a
  rule-matched hold, L2 confirms. Shows high-volume auto-resolution.
- **Track 2 (CPQ to EBS):** L2 reviews the agent's mapping diagnosis, approves a requeue;
  a mapping correction routes to L3.
- **Track 3 (revenue):** agent produces the diagnosis, the finance controller is the
  required approver before any write. Shows the compliance gate.
- **Track 4 (data fix):** L3 reviews a proposed catalogue fix with the affected row count,
  the change approver signs off, the agent executes. Shows the change-gated write path.
- **Track 5 (sync):** the agent opens its own incident from a detected sync failure, the
  service manager sees it land on the dashboard before any user complained. Shows the
  proactive mode.

---

## Part 11: Real ticket data (authoritative ground truth)

This supersedes Part 7. It is built from the actual 20 incidents in the dump, now in
`data/incidents_real.csv` and enriched in `data/incidents.csv`.

### Value streams (from the real assignment groups, program "Alice")

| Value stream | Assignment groups | Primary systems | What breaks |
|---|---|---|---|
| **Item-MDM** | `Oracle-Alice-Item-MDM` | Agile PD, Item MDM, EBS | Item/revision sync, CO/CCO/NRCO/ECO, CCB reports, Item Workbench |
| **QTD** (Quote-to-Delivery) | `OMCS-ERP-Alice-QTD`, `*-OSA-QTD`, `*-QTD` | CPQ, EBS, Cloud2EBS/DropShip | Order holds, CPQ submission, plant/warehouse, DropShip data corruption |
| **PTM** (Plan-to-Manufacture) | `*-PTM`, `*-OSA-PTM` | EBS, BluJay | Planning/pegging, receiving (RCV_INTERFACE), BluJay transmission, APPTREE_EVENT |
| **PTC** (Plan-to-Cash) | `Oracle-EBS-Alice-PTC` | EBS Projects/AR | Revenue recognition, obligations, billing |
| **Services** | `Oracle-EBS-Alice-Services` | EBS Service Contracts | Order-to-contract generation anomalies |

Item-MDM is the largest cluster in the sample (6 of 20). It is also the richest
auto-resolve and resolve-at-source target because the close notes give exact root causes.

### Repetitive-issue classification (`data/issue_patterns.csv`)

Each recurring signature, its frequency in the dataset, and whether it is auto-resolvable:

| Pattern | Value stream | Auto? | Root cause |
|---|---|---|---|
| PD revision not interfaced to EBS (00 vs A) | Item-MDM | Yes (replay) | RCA-01 |
| CCO created with no/incorrect revised items | Item-MDM | No (assisted) | RCA-02 |
| CCB revision-sequence error | Item-MDM | No (guidance) | RCA-03 |
| Order lines stuck on auto-applied holds | QTD | Yes (rule-based) | RCA-04 |
| Receiving stuck in RCV_INTERFACE | PTM | Yes (data fix SBM-090351) | RCA-05 |
| EBS-to-BluJay transmission failure | PTM | Yes (replay) | RCA-06 |
| CPQ-to-EBS submission failure | QTD | Partial | RCA-07 |
| APPTREE_EVENT daily processing error | PTM | No (code fix) | RCA-08 |
| DropShip PO-not-unlinked data corruption | QTD | Yes (data fix) | RCA-12 |
| Revenue obligation blocking recognition | PTC | No (finance-approved) | RCA-13 |

### Resolve at source: the two-loop model

The goal is not only to clear the ticket in front of you. It is to walk back to the source
and remove the ticket stream. The app runs two loops:

1. **Resolution loop (incident):** classify to a pattern, diagnose, then auto-resolve,
   assist, or escalate. This clears the live ticket. Mirrors Part 5.
2. **Problem loop (source):** every incident links to a root cause in
   `data/root_cause_analysis.csv`, which carries the **source system, source object, and
   the permanent fix** that removes the cause. The app accumulates recurrence (how many
   incidents trace to the same root cause) and raises a Problem record with the permanent
   fix and the expected ticket reduction. This is standard ITIL Problem Management, driven
   by the data.

Worked examples straight from the real close notes:

- **Revision sync (RCA-01):** symptom is EBS revision stuck at 00 while PD shows A. Root
  cause: the NRCO was never interfaced (integration failure), and Item Workbench used
  afterwards does not change revision. Immediate fix: replay the interface or apply
  `DFX-REVSYNC-01`. **Permanent fix:** idempotent CO/NRCO interface with retry and
  alerting, plus a guard that blocks Item Workbench edits on items with a pending CO
  interface. Source: Item MDM + Agile.
- **DropShip data corruption (RCA-12):** two tickets, identical root cause. The PO is not
  unlinked after a DropShip cancellation, leaving corrupt links. Immediate fix: data fix.
  **Permanent fix:** correct the cancellation flow to unlink the PO and add a referential
  check. Source: Cloud2EBS/DropShip + EBS.
- **Receiving stuck (RCA-05):** rows stuck in `RCV_INTERFACE`, quantity shows 0.
  Immediate fix: catalogued data fix `SBM-090351`. **Permanent fix:** monitor
  `RCV_INTERFACE` and auto-reprocess errored rows. Source: EBS INV/PO.

### Recurrence is the business case

The data shows tickets being recreated and cross-referenced (INC0903771 to INC0877704,
INC0998890 to INC0985197, INC0899839 to INC0890340, INC0978839 to INC0925593). That
recurrence, captured as `RECURRENCE_OF` edges in the knowledge graph, is the quantified
argument for funding the permanent fixes: each closed root cause stops a stream of
repeat tickets rather than one incident.

### Knowledge graph (`data/kg_nodes.csv`, `data/kg_edges.csv`)

Node types: Incident, IssuePattern, RootCause, PermanentFix, Item, System, ValueStream,
DataFix. Edge types: `IN_VALUE_STREAM`, `MATCHES_PATTERN`, `CAUSED_BY`,
`HAS_ROOT_CAUSE`, `RESOLVED_AT_SOURCE_BY`, `TARGETS_SOURCE`, `RECURRENCE_OF`,
`SPANS_SYSTEM`. The two demo questions traverse it directly:

- "Fix this ticket": Incident to Pattern to known action / data fix.
- "Fix it at source": Incident to RootCause to PermanentFix to System, with the
  recurrence count attached.

### Demo data

All of the above is generated by `generate_synthetic_data.py` into `data/` (18 CSVs plus
the data dictionary in `data/README.md`). The 20 real incidents are preserved verbatim
(`DATA_ORIGIN=REAL`); 60 synthetic incidents extend them in the same schema and
distribution for volume.

---

## Part 12: The built app (vertical slice)

Built and smoke-tested 2026-06-10. A working slice, not a mock.

- **Backend** (`server/`, Node + TypeScript): Express API, the agent orchestration, and a
  real MCP server, all over a single tool layer (`src/tools.ts`) backed by the `data/`
  CSVs. Runs **offline by default** (deterministic agent driven by the knowledge graph and
  root-cause data) and **live** when `ANTHROPIC_API_KEY` is set (Claude classifies and
  writes the diagnosis). The MCP server (`src/mcp-server.ts`, `npm run mcp`) exposes the
  same eight tools over stdio for Claude Desktop / MCP Inspector.
- **Frontend** (`web/`, React + Vite): incident queue, live-streaming diagnostic bundle
  (SSE), the resolve-at-source card, the approval panel gated by persona, and the track
  dashboard. Builds clean.
- **Verified end to end** against the real incident INC0903826: classified as
  `PAT-REV-SYNC`, evidence read from `item_revisions`, traced to `RCA-01`, found 8
  incidents sharing the root cause plus the linked ticket INC0877704, proposed the
  immediate replay and the permanent fix at source, and wrote both the diagnosis and the
  approved action to `agent_worklog.csv`.

Run instructions: `app_README.md`. Tools exposed: `list_open_incidents`, `get_incident`,
`match_pattern`, `get_evidence`, `get_root_cause`, `get_recurrence`,
`get_proposed_action`, `append_worklog`.

What is real vs demo: the agent reasoning, MCP tool calls, SSE streaming, persona-gated
approvals, and worklog write-back are real. The "systems" behind the tools are the CSVs,
not live EBS/CPQ/BluJay. Swapping the tool implementations for live connectors is the
production step; the agent logic does not change.

---

## Open decisions

1. ITSM system of record: ServiceNow, Oracle SR, or other? Drives intake and write-back.
2. Autonomy under the AMS contract: some clients forbid any automated PROD write, which
   pushes everything to assisted mode.
3. App identity model: run as a virtual agent *user* inside ServiceNow (cleaner per-action
   audit, usually preferred by auditors) or as an external service the ITSM calls back.
4. Concrete ticket type to model first end to end. Updated recommendation given the five
   tracks: model **Track 1, EBOM / hold release** (e.g. INC1080014) end to end, since it
   is the flagship auto-resolve candidate. Show the ServiceNow states, API calls, and the
   EBS `OE_ORDER_HOLDS_ALL` / BOM queries.
5. System reach for the MCP read/action layer: confirm which systems are PD/PLM (Agile,
   Windchill, other?), CPQ (Oracle CPQ / other?), and the trade/GTM platform, so the
   connectors can be scoped.
6. Owner for the Track 4 data-fix catalogue: it is the highest-leverage asset and needs a
   named owner to curate and review entries.

---

## Analysis log

Append further analysis below this line as the work progresses.

- 2026-06-10: Created. Documented the RMS-protected dump finding and the agentic app
  design including the ITSM end-to-end flow.
- 2026-06-10: Added Part 7. Categorised content received for the high-impact dump: five
  tracks (EBOM/hold release, CPQ-to-EBS, revenue recognition, data-fix dependency,
  cross-platform sync). Mapped each to diagnostic signals and auto/assist/escalate tiers,
  added the cross-track prioritisation, and widened the architecture scope from EBS-only
  to a multi-system fabric (PD/PLM, CPQ, EBS, BOM, item master, trade/GTM). Updated open
  decisions.
- 2026-06-10: Added Part 8. Demo constraints captured: file-based with synthetic CSVs
  under `data/`, Claude API for all agent reasoning, MCP-based architecture, React
  frontend, and the role/persona model.
- 2026-06-10: GROUND TRUTH. The dump was refreshed as an unprotected xlsx and read.
  Real schema and the "Alice" value-stream model (Item-MDM, QTD, PTM, PTC, Services) and
  real systems (Agile PD, Item MDM, EBS, CPQ, BluJay, Cloud2EBS/DropShip) replace the
  assumed five tracks. Part 7 marked superseded; Part 11 added as authoritative. Rebuilt
  `generate_synthetic_data.py` around the real data and generated 18 CSVs into `data/`:
  real 20 incidents preserved verbatim plus 60 synthetic, item master with real Vertiv
  products mapped to numeric part numbers, value-stream detail tables, root-cause /
  permanent-fix layer, repetitive-issue classification, data-fix catalogue (incl real
  SBM-090351), action catalogue, knowledge base from the real close notes, personas, and
  a knowledge graph (184 nodes, 332 edges). Added `data/README.md` data dictionary.
- 2026-06-10: BUILT the vertical slice (Part 12). Node/TS backend (Express + agent + MCP
  server over the CSV tool layer), React/Vite frontend (queue, streaming diagnosis,
  resolve-at-source card, persona-gated approvals, dashboard). Offline-by-default with
  optional live Claude. Installed deps, ran the backend, and verified the full diagnose
  and approve flow against the real incident INC0903826. Run guide in `app_README.md`;
  key file at `server/.env`.
