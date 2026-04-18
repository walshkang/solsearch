# AGENTS — Developer & AI Assistant Protocol

**ENVIRONMENT WARNING:** You are operating in a multi-agent, highly concurrent environment. Other AI instances (Cursor, Claude Code, Copilot, Antigravity) may be executing tasks in this codebase simultaneously. You share no memory with them; the filesystem and this document are your only shared context.

## Data Contracts

"If you get the type right, you're probably not far off." Schemas are the literal enforcement mechanism for parallelization.

### Companies (`data/companies.json`)
```
id, name, domain, careers_page_url, careers_page_reachable,
careers_page_discovery_method, ats_platform, ats_slug,
funding_signals, company_profile,
climate_tech_category, primary_sector, opportunity_area, category_confidence,
consecutive_empty_scrapes, dormant
```

### Jobs (`data/jobs.json`)
```
id, company_id, job_title_raw, source_url, location_raw,
employment_type, description_raw, description_hash,
first_seen_at, last_seen_at, removed_at, days_live,
job_title_normalized, job_function, seniority_level, location_type,
mba_relevance_score, description_summary,
climate_relevance_confirmed, climate_relevance_reason,
enrichment_prompt_version, enrichment_error
```

### Scrape Runs (`data/scrape_runs.json`)
```
company_id, timestamp, status, error_type, body_size_kb,
provider, scrape_method
```

### Contracts Before Logic

Before writing *any* functional code, define and export the Data Contract. Focus entirely on transforming data to fit the contract. If a cross-boundary contract does not exist, create it and seek approval before proceeding.

---

## Concurrency & Scoping Rules

- **Volatile Filesystem**: Assume files are changing. Always read the current state of a shared file (e.g., `companies.json`) immediately before writing to it to avoid clobbering concurrent updates.
- **Strict Scoping**: Never modify files outside your assigned domain. Each agent owns its declared outputs (see ownership table above). If a change is needed elsewhere, use the **Stub and Signal** rule below.
- **Idempotency**: All agents must be safe to re-run. Check for existing records or checksums before performing expensive operations or duplicate writes.

### The Stub and Signal Rule

If your task requires a change or feature in a file outside your scope, **DO NOT EDIT IT**. Instead:
1. Write a deterministic stub/mock.
2. Define the expected Data Contract.
3. Explicitly flag it in your final output so the Coordinator can assign it to a peer agent.

---

## AI Assistant Protocol

When multiple AI instances (Antigravity, Cursor, etc.) operate in this repo, adhere to these standards:

### 1. Dynamic Roles

- **Orchestrator**: If planning or delegating, define non-overlapping scopes and write interfaces/contracts. Do not write implementation logic.
- **Peer Executor**: If assigned a feature/fix, execute only that scope. Do not spawn sub-agents or nested workflows.

### 2. Execution Loop (Shape Up + TDD)

1. **Scope & Appetite**: Identify exact files and boundaries.
2. **Define Contracts**: Update/write Types and Schemas first.
3. **Test First (Red)**: Write a failing test using Jest for the exact behavior.
4. **Implement (Green)**: Write the minimum code to pass the test.
5. **Handoff**: Stop. Do not refactor adjacent systems or "fix" out-of-scope files.

### 3. Standardized Handoff

Report status in this exact format:

```
[STATUS]         SUCCESS | BLOCKED | REQUIRES_PEER
[FILES_MODIFIED] list files changed
[NEW_CONTRACTS]  list any new Types/Schemas created
[MESSAGE]        concise summary; if blocked, state the unknown;
                 if REQUIRES_PEER, state the exact interface needed
```

---

## Operational Notes

- **Artifacts**: `data/companies.json`, `data/jobs.json`, `artifacts/html/<company-id>.html|.json`
- **Config**: `src/config.js` — all model defaults and key lookups; override per-agent via `.env.local`
- **Secrets**: use `.env.local` locally, GitHub Secrets in CI; never commit keys
- **Tests**: `npm test` (Jest, `--runInBand`)
- **Prompts**:

<reminder>
<sql_tables>No tables currently exist. Default tables (todos, todo_deps) will be created automatically when you first use the SQL tool.</sql_tables>
</reminder>
