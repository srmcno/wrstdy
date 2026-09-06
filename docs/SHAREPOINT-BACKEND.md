# SharePoint Back End — Water Rate Study Tool

Everything the Power Apps canvas app needs behind the Water Rate Study Tool
code component: the site, its lists and libraries, every column, the indexes,
the permission model, the Power Automate flows that join them, and a PnP
provisioning script.

Audience: whoever stands the environment up (a Power Platform maker or M365
admin) and whoever maintains it afterwards. Nothing here requires Dataverse.

---

## 1. Why the data is shaped this way

A rate study is not a row. One study contains up to seven customer classes,
each with a current and a proposed rate schedule, each schedule with an
arbitrary number of tier blocks, plus an optional customer usage distribution,
two full budgets of ~50 line items each, a five-year forecast with a debt
schedule and one-time items, a scenario, and a saved analysis. Modelling that
relationally in SharePoint means roughly nine child lists and several hundred
round trips to open one study — which a canvas app on a field laptop cannot do
at a usable speed.

So the tool uses a **document-plus-index** shape:

| Where | What it holds | Why |
| --- | --- | --- |
| `Rate Study Data` library | One `.json` file per study — the complete study, exactly as the component reads and writes it | No size ceiling; every save becomes a file version, which *is* the audit trail |
| `Rate Studies` list | One item per study: identity, status, assignment, and ~15 headline metrics copied out of the payload on each save | Fast, filterable, indexable — this is what galleries, dashboards, Power BI, and management reports read |
| `Water Systems` list | One item per public water system | The master registry; studies point at it, and it outlives any single study |

The headline metrics on the list item are a **derived copy**, never the source
of truth. They are rewritten from the payload on every save so nobody has to
open a study to answer "which systems are below a 1.0 operating ratio?".

> **Why the payload is not just a column.** A SharePoint *Multiple lines of
> text* column holds at most **63,999 characters**. A study with a full usage
> distribution and a couple of saved analyses passes that. Truncation there
> would be silent and would corrupt the study. A library file has no such
> limit, and gives per-save version history for free.
>
> If a deployment is certain its payloads stay small (no AI analyses stored, no
> usage distributions) the payload *can* live in a `StudyJson` column on
> `Rate Studies` and both payload flows can be dropped. Section 9 covers that
> variant and its guardrail.

---

## 2. Site

Create one **Team site (no Microsoft 365 group)** or use an existing OWRM site.

| Setting | Value |
| --- | --- |
| Title | Water Resource Management — Rate Studies |
| URL | `/sites/OWRM-RateStudies` |
| Template | Team site (STS#3) |
| Language | English (1033) |
| Regional settings | Central Time (US & Canada) |
| Site collection admin | OWRM data owner + one backup |
| External sharing | **Off** — studies carry system financial data |

Everything below lives in that one site. Keep it in one site: cross-site
lookups are not supported, and several lists here are lookup targets.

---

## 3. Lists and libraries

Internal names matter — Power Apps and Power Automate reference them. Create
each column with the **internal name given**, then rename the display name
afterwards if you prefer different wording. (SharePoint derives the internal
name from whatever the column is *first* called, so create it with the internal
name and rename second.)

### 3.1 `WaterSystems` — Water Systems (list)

The master registry of public water systems OWRM assists. One item per PWS.

| Display name | Internal name | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| System Name | `Title` | Single line of text | Yes | Indexed |
| PWS ID | `PwsId` | Single line of text | No | **Enforce unique values.** Indexed. Column validation: `=OR(ISBLANK([PWS ID]),AND(LEN([PWS ID])=9,LEFT([PWS ID],2)="OK"))` — message: "PWS IDs are OK followed by seven digits." |
| County | `County` | Choice | Yes | See §3.1.1 |
| System Type | `SystemType` | Choice | No | `Community`, `Non-Transient Non-Community`, `Transient Non-Community` |
| Source Type | `SourceType` | Choice | No | `Groundwater`, `Surface Water`, `Purchased / Wholesale`, `Mixed` |
| Water Body / Source | `WaterBodySource` | Single line of text | No | e.g. "Hugo Lake", "Antlers Aquifer" |
| Wholesale Supplier | `WholesaleSupplier` | Lookup → `WaterSystems`.`Title` | No | Self-lookup; blank unless the system buys water |
| Population Served | `PopulationServed` | Number (0 dp, min 0) | No | |
| Active Connections | `Connections` | Number (0 dp, min 0) | No | |
| Address | `Address` | Single line of text | No | |
| Latitude | `Latitude` | Number (6 dp) | No | Range −90…90 |
| Longitude | `Longitude` | Number (6 dp) | No | Range −180…180 |
| Council District | `CouncilDistrict` | Number (0 dp) | No | 1–12 |
| Primary Contact | `PrimaryContact` | Single line of text | No | Manager / operator name |
| Contact Email | `ContactEmail` | Single line of text | No | |
| Contact Phone | `ContactPhone` | Single line of text | No | |
| OWRM Lead | `OwrmLead` | Person or Group (single) | No | Staff member who owns the relationship |
| Monthly MHI | `MonthlyMhi` | Currency (2 dp) | No | **Monthly**, not annual — see §3.1.2 |
| MHI Source | `MhiSource` | Single line of text | No | e.g. "ACS 2019–2023 5-yr, tract 9601" |
| Last Study Date | `LastStudyDate` | Date only | No | Maintained by flow; drives the "due for review" view |
| Last Study Status | `LastStudyStatus` | Single line of text | No | Maintained by flow |
| Active | `IsActive` | Yes/No (default Yes) | No | Retired systems stay for history |
| Notes | `Notes` | Multiple lines (plain, 6 rows) | No | |

**Indexes:** `PwsId`, `County`, `Title`, `IsActive`.
**Versioning:** major versions on, keep 50.
**Views:**
- *Active Systems* (default) — filter `IsActive = Yes`, sort by `Title`.
- *By County* — grouped by `County`.
- *Due for Review* — filter `IsActive = Yes` and `LastStudyDate` older than
  `[Today]-1095` **or** empty.
- *Missing Contact Info* — filter `ContactEmail` is empty and `IsActive = Yes`.

#### 3.1.1 County choice values

Reservation counties first, then neighbours the office also assists — the same
order the tool's own dropdown uses, so imports and exports line up:

`Atoka`, `Bryan`, `Choctaw`, `Coal`, `Haskell`, `Hughes`, `Latimer`,
`Le Flore`, `McCurtain`, `Pittsburg`, `Pushmataha`, `Johnston`, `Marshall`,
`McIntosh`, `Okfuskee`, `Pontotoc`, `Sequoyah`, `Other`

Set **Allow fill-in choices: No** so the values stay matchable.

#### 3.1.2 MHI must be monthly

Census ACS publishes **annual** median household income. The affordability
index is `bill at 5,000 gallons ÷ MONTHLY MHI`; storing the annual figure makes
every system look twelve times more affordable than it is and wrongly rules out
USDA RD grant eligibility. Add column validation to catch the paste:

```
=OR(ISBLANK([Monthly MHI]),[Monthly MHI]<10000)
```
Message: *"Enter MONTHLY household income. Census ACS publishes annual MHI —
divide it by 12."*

The tool applies the same check and offers a one-click ÷12 fix.

---

### 3.2 `RateStudies` — Rate Studies (list)

One item per study. The index over the payload files.

**Identity and workflow**

| Display name | Internal name | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| Study Name | `Title` | Single line of text | Yes | e.g. "Smithville RWD — Rate Study 2026" |
| Study ID | `StudyId` | Single line of text | Yes | The component's own GUID. **Enforce unique values.** Indexed. Names the payload file. |
| Water System | `WaterSystem` | Lookup → `WaterSystems`.`Title` | Yes | Indexed. Add lookup extra-columns for `PwsId` and `County` so views can filter on them without a second query. |
| Study Year | `StudyYear` | Number (0 dp) | No | Indexed |
| Status | `StudyStatus` | Choice | Yes | `Draft`, `In Progress`, `In Review`, `Complete`, `Adopted`, `Superseded`. Default `Draft`. Indexed. |
| Assigned To | `AssignedTo` | Person or Group (single) | No | |
| Reviewed By | `ReviewedBy` | Person or Group (single) | No | Set when Status moves to Complete |
| Effective Date | `EffectiveDate` | Date only | No | When proposed rates take effect |
| Board Adopted | `AdoptedDate` | Date only | No | Set when Status = Adopted |
| Supersedes | `SupersedesStudy` | Lookup → `RateStudies`.`Title` | No | Prior study this one replaces |

**Payload pointer**

| Display name | Internal name | Type | Notes |
| --- | --- | --- | --- |
| Payload File | `PayloadFileName` | Single line of text | `{StudyId}.json` in `RateStudyData` |
| Payload Saved | `PayloadSavedAt` | Date and Time | Written on every save |
| Payload Size | `PayloadSizeBytes` | Number (0 dp) | Watchdog for the size notes in §8 |
| Tool Version | `AppVersion` | Single line of text | Version of the component that wrote it |

**Headline metrics — written by the save flow, never edited by hand**

Mark every one of these read-only in the form (Power Apps) and say so in the
column description. They are a projection of the payload.

| Display name | Internal name | Type |
| --- | --- | --- |
| Revenue — Current (monthly) | `CurMonthlyRevenue` | Currency (2 dp) |
| Revenue — Proposed (monthly) | `PropMonthlyRevenue` | Currency (2 dp) |
| Expenses — Current (monthly) | `CurMonthlyExpenses` | Currency (2 dp) |
| Expenses — Proposed (monthly) | `PropMonthlyExpenses` | Currency (2 dp) |
| Operating Ratio — Current | `CurOperatingRatio` | Number (2 dp) |
| Operating Ratio — Proposed | `PropOperatingRatio` | Number (2 dp) |
| Affordability Index — Current | `CurAffordabilityIndex` | Number (4 dp, show as %) |
| Affordability Index — Proposed | `PropAffordabilityIndex` | Number (4 dp, show as %) |
| DSCR — Proposed | `PropDscr` | Number (2 dp) |
| Debt-to-Income — Proposed | `PropDebtToIncome` | Number (4 dp, show as %) |
| Cost per 1,000 gal — Proposed | `PropCostPer1k` | Currency (2 dp) |
| Bill at 5,000 gal — Current | `CurBill5k` | Currency (2 dp) |
| Bill at 5,000 gal — Proposed | `PropBill5k` | Currency (2 dp) |
| Rate Change | `RateChangePercent` | Number (2 dp, show as %) |
| FY5 Fund Balance — Proposed | `PropFy5FundBalance` | Currency (2 dp) |
| Revenue Basis | `RevenueBasis` | Choice: `Usage distribution`, `Mixed`, `Class averages` |
| Data Issues — Blocking | `BlockingDataIssues` | Number (0 dp) |
| Data Issues — Total | `OpenDataIssues` | Number (0 dp) |

**Reporting and locking**

| Display name | Internal name | Type | Notes |
| --- | --- | --- | --- |
| Latest Report | `ReportUrl` | Hyperlink | Points into `RateStudyReports` |
| Report Generated | `ReportGeneratedAt` | Date and Time | |
| Locked By | `LockedBy` | Person or Group (single) | Soft lock — see §6.3 |
| Locked At | `LockedAt` | Date and Time | Locks older than 4 hours are ignored |

**Indexes:** `StudyId`, `WaterSystem`, `StudyStatus`, `StudyYear`, `AssignedTo`.
**Versioning:** major versions on, keep 100.
**Content approval:** off (status column carries the workflow).
**Views:**
- *My Open Studies* (default) — `AssignedTo = [Me]` and `StudyStatus` ≠ `Complete`/`Adopted`/`Superseded`.
- *In Review* — `StudyStatus = In Review`, sorted by `Modified`.
- *Needs Attention* — `BlockingDataIssues > 0`.
- *Below Break-even* — `PropOperatingRatio < 1`, shows the metric columns.
- *Completed This Year* — `StudyStatus = Complete` or `Adopted`, `Modified >= [Today]-365`.
- *All Studies by System* — grouped by `WaterSystem`.

---

### 3.3 `RateStudyData` — Rate Study Data (document library)

The payloads. One file per study: `{StudyId}.json`.

| Setting | Value | Why |
| --- | --- | --- |
| Versioning | Major versions, **keep 500** | Every save is a version — this is the audit trail. A 500-version history of a 200 KB payload is ~100 MB per study; see §8 for the storage note. |
| Require check out | No | The app's soft lock (§6.3) handles concurrency |
| Open in browser | — | Files are never opened by hand |
| Search | Excluded — see §7.4 | Payloads contain the same financial data as the list; no reason to index them twice |

| Column | Internal name | Type |
| --- | --- | --- |
| Study ID | `StudyId` | Single line of text (indexed) |
| Water System | `WaterSystem` | Lookup → `WaterSystems`.`Title` |
| Saved At | `SavedAt` | Date and Time |
| Tool Version | `AppVersion` | Single line of text |

Flat structure — no folders. The library is machine-addressed by file name;
folders only add path-length and permission complexity.

---

### 3.4 `RateStudyReports` — Rate Study Reports (document library)

Generated board deliverables: the PDF, the Word version, the tier-rate CSV.

| Column | Internal name | Type | Notes |
| --- | --- | --- | --- |
| Study ID | `StudyId` | Single line of text | Indexed |
| Water System | `WaterSystem` | Lookup → `WaterSystems`.`Title` | Indexed |
| Study Year | `StudyYear` | Number (0 dp) | |
| Report Type | `ReportType` | Choice: `Board Report (PDF)`, `Board Report (Word)`, `Rate Table (CSV)`, `Study Backup (JSON)`, `Other` | |
| Status At Generation | `StatusAtGeneration` | Single line of text | Snapshot of `StudyStatus` |
| Generated By | `GeneratedBy` | Person or Group | |
| Generated At | `GeneratedAt` | Date and Time | |
| Superseded | `IsSuperseded` | Yes/No, default No | Set when a newer report is generated for the same study |

Folder per system, named `{PwsId} - {System Name}` — reports are the artefacts
staff actually browse and hand to boards, so a human-navigable path earns its
keep here (unlike the payload library).

**Versioning:** major versions, keep 20.
**Views:** *Current Reports* (`IsSuperseded = No`), *By System* (grouped).

---

### 3.5 `SystemSourceDocuments` — System Source Documents (document library)

What the systems give OWRM: billing registers, budgets, audits, meter reports,
rate ordinances. The evidence behind the numbers in a study.

| Column | Internal name | Type | Notes |
| --- | --- | --- | --- |
| Water System | `WaterSystem` | Lookup → `WaterSystems`.`Title` | Required, indexed |
| Document Type | `DocumentType` | Choice: `Billing Register`, `Operating Budget`, `Audit / Financial Statement`, `Rate Ordinance / Resolution`, `Engineering Report`, `Meter Reading Report`, `Loan Document`, `Correspondence`, `Other` | Required |
| Fiscal Year | `FiscalYear` | Number (0 dp) | |
| Period Covered | `PeriodCovered` | Single line of text | e.g. "May 2025", "FY2025 Q1" |
| Received Date | `ReceivedDate` | Date only | |
| Provided By | `ProvidedBy` | Single line of text | Person at the system |
| Sensitivity | `Sensitivity` | Choice: `Internal`, `Restricted` | Default `Internal` |
| Notes | `Notes` | Multiple lines (plain) | |

**Permissions:** break inheritance — see §6.2. Some of this is a system's
unredacted financial position.

**Versioning:** major versions, keep 20.
**Views:** *By System* (grouped), *Recent Uploads*, *Billing Registers*
(filtered — the ones that feed a usage distribution).

---

### 3.6 `RateStudyBenchmarks` — Rate Study Benchmarks (list)

The thresholds the scorecard judges against, in data rather than in code, so a
policy change is an edit rather than a release.

| Column | Internal name | Type |
| --- | --- | --- |
| Key | `Title` | Single line of text (unique, indexed) |
| Value | `BenchmarkValue` | Number (4 dp) |
| Display Label | `DisplayLabel` | Single line of text |
| Applies To | `AppliesTo` | Choice: `Operating Ratio`, `Affordability`, `Debt Service`, `Debt to Income`, `Base Coverage`, `Fund Balance`, `Forecast` |
| Effective From | `EffectiveFrom` | Date only |
| Source | `SourceRef` | Single line of text |
| Notes | `Notes` | Multiple lines (plain) |

Seed values (these match the tool's built-in defaults):

| Key | Value | Display label | Source |
| --- | --- | --- | --- |
| `OperatingRatio.Healthy` | 1.25 | Operating ratio ≥ 1.25 | Industry practice; CNO rate study format |
| `OperatingRatio.BreakEven` | 1.00 | Break-even | — |
| `Affordability.EpaAffordable` | 0.0200 | Under 2.00% of MHI | EPA affordability guidance |
| `Affordability.UsdaGrantThreshold` | 0.0150 | Above 1.50% of MHI supports a grant case | USDA RD Instruction 1780 |
| `Dscr.Covenant` | 1.15 | DSCR ≥ 1.15 | USDA RD / OWRB loan covenants (typ. 1.10–1.25) |
| `DebtToIncome.Max` | 0.4500 | Under 45% | Industry practice |
| `BaseCoverage.Target` | 1.0000 | Base charges cover expenses | — |
| `FundBalance.MonthsOfOandM` | 3 | Reserve of 3 months O&M | Industry practice |
| `Forecast.DefaultInflation` | 0.0300 | 3% annual inflation | — |

> The component ships with these numbers built in. Reading them from this list
> is a Power Apps enhancement (pass them into the study payload before mounting)
> — worth doing the first time a threshold changes, not before.

---

### 3.7 `AppConfiguration` — App Configuration (list)

Key/value settings for the canvas app itself, so behaviour can change without
republishing.

| Column | Internal name | Type |
| --- | --- | --- |
| Key | `Title` | Single line of text (unique, indexed) |
| Value | `ConfigValue` | Multiple lines of text (plain) |
| Description | `Description` | Single line of text |
| Environment | `EnvironmentTag` | Choice: `All`, `Dev`, `Test`, `Prod` |

Suggested keys: `Ai.Enabled` (`true`/`false`), `Ai.FlowNotice` (message shown
when analysis is unavailable), `Support.Contact`, `Banner.Message`,
`Banner.Severity`, `Report.LibraryUrl`, `Study.LockMinutes`.

---

### 3.8 `RateStudyActivity` — Rate Study Activity (list)

Append-only audit log, written by the flows. Answers "who changed this study,
when, and what did they do".

| Column | Internal name | Type | Notes |
| --- | --- | --- | --- |
| Action | `Title` | Single line of text | Short verb phrase |
| Study ID | `StudyId` | Single line of text | Indexed |
| Water System | `WaterSystem` | Lookup → `WaterSystems`.`Title` | |
| Action Type | `ActionType` | Choice: `Created`, `Saved`, `Status Changed`, `Report Generated`, `Analysis Requested`, `Exported`, `Deleted`, `Locked`, `Unlocked` | Indexed |
| Actor | `Actor` | Person or Group | |
| At | `ActionAt` | Date and Time | Indexed |
| Detail | `Detail` | Multiple lines (plain) | e.g. "Draft → In Review" |

**Permissions:** Analysts get **Add only** (contribute without edit/delete) —
see §6.1. Nobody edits an audit trail.
**Retention:** a scheduled flow deletes items older than 3 years (§5.6).

---

### 3.9 `AiAnalysisRequests` — AI Analysis Requests (list)

Only needed if the analysis feature is turned on. It is both the correlation
store for the component's request/response bridge and the record of what was
sent to a model.

| Column | Internal name | Type | Notes |
| --- | --- | --- | --- |
| Request ID | `Title` | Single line of text | The component's correlation id. Indexed, unique. |
| Study ID | `StudyId` | Single line of text | Indexed |
| Requested By | `RequestedBy` | Person or Group | |
| Requested At | `RequestedAt` | Date and Time | |
| Model | `ModelId` | Single line of text | |
| Status | `RequestStatus` | Choice: `Pending`, `Complete`, `Failed` | |
| Response | `ResponseText` | Multiple lines (plain) | **63,999-char cap applies** — the flow must truncate and flag rather than fail |
| Error | `ErrorText` | Single line of text | |
| Prompt Tokens | `PromptTokens` | Number (0 dp) | |
| Completion Tokens | `CompletionTokens` | Number (0 dp) | |

> **This list contains system financial data in prompt form.** Give it the same
> permissions as `SystemSourceDocuments`, and set a retention flow (90 days is
> a reasonable default) — there is no reason to keep prompts indefinitely.

---

## 4. Relationships

```
WaterSystems (1) ──< RateStudies (n)          RateStudies.WaterSystem  → lookup
WaterSystems (1) ──< SystemSourceDocuments    .WaterSystem             → lookup
WaterSystems (1) ──< RateStudyReports         .WaterSystem             → lookup
WaterSystems (0..1) ─ WaterSystems            .WholesaleSupplier       → self-lookup

RateStudies (1) ── (1) RateStudyData          matched on StudyId / file name
RateStudies (1) ──< RateStudyReports          matched on StudyId (text)
RateStudies (1) ──< RateStudyActivity         matched on StudyId (text)
RateStudies (1) ──< AiAnalysisRequests        matched on StudyId (text)
RateStudies (0..1) ─ RateStudies              .SupersedesStudy         → self-lookup
```

Only the `WaterSystem` relationships are real SharePoint lookups (they need
referential display and filtering). The `StudyId` joins are plain indexed text:
lookups into a list that will grow past the 5,000-item threshold cause more
problems than they solve, and nothing needs cascade behaviour there.

On `RateStudies.WaterSystem` and every other lookup to `WaterSystems`, set
**Delete behaviour: Restrict** so a system with studies cannot be deleted out
from under them.

---

## 5. Power Automate flows

Five flows do the work. All are **instant (Power Apps V2)** except §5.6.

Name them with a common prefix so they group in the maker portal.

### 5.1 `WRS - Get Study Payload`

Called when a user opens a study.

- **Input:** `StudyId` (text)
- **Steps:** `Get file content using path` on
  `/RateStudyData/{StudyId}.json` → `Respond to a Power App` with the content
  as text.
- **Error path:** file not found → respond with `{}` and a `notFound` flag, so
  a brand-new study opens blank rather than erroring.
- **Returns:** `PayloadJson` (text)

### 5.2 `WRS - Save Study Payload`

Called from the component's `OnChange` when `LastEvent = "save"`.

- **Inputs:** `StudyId`, `PayloadJson`, `SummaryJson` (the metrics the app
  computed), `AppVersion`
- **Steps:**
  1. `Create file` in `RateStudyData` with name `{StudyId}.json`, overwriting
     (this is what creates the version).
  2. `Get items` on `RateStudies` filtered `StudyId eq '{StudyId}'`.
  3. If found → `Update item` with the metrics from `SummaryJson`,
     `PayloadSavedAt`, `PayloadSizeBytes`, `AppVersion`.
     If not found → `Create item` first (a study created inside the component).
  4. `Create item` in `RateStudyActivity` — `ActionType = Saved`.
  5. `Update item` on `WaterSystems`: `LastStudyDate`, `LastStudyStatus`.
- **Returns:** `Ok` (boolean), `Message` (text)

> Keep the *whole* metric projection in this one flow. Splitting it across the
> app and a second flow is how the list and the payload drift apart.

### 5.3 `WRS - Save Report File`

Called when `LastEvent = "file"`.

- **Inputs:** `StudyId`, `FileName`, `MimeType`, `ContentBase64`
- **Steps:**
  1. `Compose` → `base64ToBinary(triggerBody()['ContentBase64'])`
  2. `Create file` in `RateStudyReports/{PwsId} - {System Name}/`
  3. `Update file properties` — `StudyId`, `WaterSystem`, `ReportType`
     (derived from the extension), `GeneratedBy`, `GeneratedAt`
  4. Mark prior reports of the same `StudyId` + `ReportType`
     `IsSuperseded = Yes`
  5. `Update item` on `RateStudies` — `ReportUrl`, `ReportGeneratedAt`
  6. `Create item` in `RateStudyActivity` — `ActionType = Report Generated`
- **Returns:** `FileUrl` (text)

### 5.4 `WRS - Request Analysis`

Only if the analysis feature is on. This is the flow that keeps the component
compliant: canvas code components cannot hold credentials or do custom auth, so
the *flow* owns the connection.

- **Inputs:** `RequestId`, `StudyId`, `RequestJson`
- **Steps:**
  1. `Create item` in `AiAnalysisRequests` — status `Pending`
  2. `HTTP` (or an approved AI connector) to the organisation's model endpoint,
     with the key held in **Azure Key Vault** or the connection itself — never
     in the app, never in a SharePoint column
  3. `Update item` — status `Complete`/`Failed`, `ResponseText` (truncate at
     63,000 chars and note it), token counts
  4. `Create item` in `RateStudyActivity` — `ActionType = Analysis Requested`
- **Returns:** `ResponseId` (echo of `RequestId`), `ResponseText`, `ErrorText`

### 5.5 `WRS - Lock / Unlock Study`

- **Inputs:** `StudyId`, `Action` (`lock`/`unlock`)
- Sets or clears `LockedBy`/`LockedAt` on `RateStudies`, and returns the
  current holder so the app can say *"Jane Doe opened this 20 minutes ago"*.

### 5.6 `WRS - Nightly Housekeeping` (scheduled, 02:00 CT)

- Emails each `AssignedTo` a digest of their `In Progress` studies untouched
  for 30+ days.
- Emails the data owner the list of studies with `BlockingDataIssues > 0`.
- Deletes `RateStudyActivity` items older than 3 years and
  `AiAnalysisRequests` older than 90 days.
- Flags `WaterSystems` with `LastStudyDate` older than 3 years into a
  *Due for Review* digest.

---

## 6. Permissions

### 6.1 Groups

Create four SharePoint groups on the site and grant them at the site level,
then adjust per list where noted.

| Group | Site permission | Who |
| --- | --- | --- |
| `WRS Owners` | Full Control | OWRM data owner + backup |
| `WRS Analysts` | Contribute | Staff who build studies |
| `WRS Reviewers` | Read + item edit on `RateStudies` only | Supervisors who approve |
| `WRS Read Only` | Read | Leadership, adjacent programmes |

Per-list adjustments:

| List / library | Owners | Analysts | Reviewers | Read Only |
| --- | --- | --- | --- | --- |
| `WaterSystems` | Full | Contribute | Read | Read |
| `RateStudies` | Full | Contribute | Contribute | Read |
| `RateStudyData` | Full | Contribute | Read | **No access** |
| `RateStudyReports` | Full | Contribute | Read | Read |
| `SystemSourceDocuments` | Full | Contribute | Read | **No access** |
| `RateStudyBenchmarks` | Full | Read | Read | Read |
| `AppConfiguration` | Full | Read | Read | Read |
| `RateStudyActivity` | Full | **Add only** | Read | Read |
| `AiAnalysisRequests` | Full | Contribute | Read | **No access** |

"Add only" is a custom permission level: copy *Contribute*, then clear
**Edit Items** and **Delete Items**. An audit log nobody can edit is worth the
five minutes.

### 6.2 Break inheritance

Break permission inheritance on `RateStudyData`, `SystemSourceDocuments`, and
`AiAnalysisRequests`, then remove `WRS Read Only`. These hold unredacted
financial detail for systems that are not OWRM's to publish.

### 6.3 Concurrency — the soft lock

SharePoint has no row locking, and two analysts editing one study would each
overwrite the other's payload wholesale.

The app takes a **soft lock**: on open it calls §5.5, and if `LockedBy` is set
by someone else with `LockedAt` inside the lock window (default 4 hours, from
`AppConfiguration.Study.LockMinutes`), it opens the component with
`ReadOnly = true` and shows who holds it. Locks are released on save and on
screen exit, and expire on their own so a crashed session cannot strand a study.

This is advisory, not enforced — an owner can always clear a stale lock by
editing the list item. That is the right trade-off for a five-person team; a
hard lock would strand studies more often than it would prevent collisions.

### 6.4 What the app connection needs

The canvas app connects with the **signed-in user's** SharePoint permissions,
so the table above governs it directly. The flows should run with a **service
account connection** for `RateStudyActivity` (so "Add only" analysts can still
generate log entries) and for the analysis endpoint. Document that account in
the site's owner notes; it is the one credential in this design.

---

## 7. Operational settings

### 7.1 Indexing and the 5,000-item threshold

`RateStudyActivity` will pass 5,000 items first, then `RateStudyReports`, then
`RateStudies`. Every view listed above filters on an indexed column, which is
what keeps them working past the threshold. When adding a view, index the
column it filters on **before** it grows.

### 7.2 Versioning and storage

Payload versioning is the audit trail, so keep it generous — but a 200 KB
payload × 500 versions × 300 studies is ~30 GB. That is fine for a normal
tenant allowance; check it annually, and reduce `RateStudyData` to 200 versions
if it becomes an issue. Never turn versioning off there: it is the only record
of what a study looked like when a board voted on it.

### 7.3 Recycle bin and backup

SharePoint's two-stage recycle bin (93 days) covers deletion. It does not cover
"a flow overwrote 40 payloads with bad data" — for that, version history is the
recovery path, which is another reason it stays on. Export a monthly snapshot
of `RateStudies` to a dated folder if the office wants an offline copy.

### 7.4 Search

Exclude `RateStudyData` and `SystemSourceDocuments` from search results
(*Library settings → Advanced settings → Allow items to appear in search
results: No*). The payload files are machine-readable JSON that would clutter
every tenant search, and source documents are restricted anyway.

### 7.5 Retention

Rate studies are advisory records supporting decisions boards make. Retain
`RateStudies`, `RateStudyData`, and `RateStudyReports` for the life of the
programme. `RateStudyActivity` 3 years, `AiAnalysisRequests` 90 days, both
enforced by §5.6.

---

## 8. Size limits worth knowing

| Limit | Value | Where it bites |
| --- | --- | --- |
| Multiple lines of text column | 63,999 characters | Why payloads live in a library; why §5.4 truncates `ResponseText` |
| Single line of text column | 255 characters | Report URLs are a Hyperlink column, not text |
| PCF `Multiple` property | 1,048,576 characters | The component refuses to hand back a file larger than ~780 KB (base64 inflates 4/3) and says so |
| Power Automate response size | ~100 MB | Comfortable for any report this tool generates |
| List view threshold | 5,000 items | §7.1 |
| Lookup columns per list | 12 | Why the `StudyId` joins are plain text |
| Lookup threshold per view | 8 | Keep lookup columns out of wide views |

---

## 9. Variant: payload in a list column

For a small deployment that will not store AI analyses, the payload can live on
the `RateStudies` item and both payload flows disappear.

- Add `StudyJson` — Multiple lines of text, **plain text**, no versioning
  append.
- Bind the component's `StudiesJson` straight to it; `Patch` `StudiesJsonOut`
  back in `OnChange`.
- Drop flows §5.1 and §5.2 (keep the metric write as a small `Patch` in the
  app, or a flow on item update).

**Guardrail — do not skip this.** Refuse the save when the payload is close to
the ceiling, or SharePoint truncates silently and the study is corrupt:

```powerfx
If(
    Len(WaterRateStudyTool1.StudiesJsonOut) > 60000,
    Notify(
        "This study is too large to save in the list column. Ask your admin to enable the payload library.",
        NotificationType.Error
    ),
    Patch(RateStudies, gblCurrentStudy, { StudyJson: WaterRateStudyTool1.StudiesJsonOut })
)
```

Plan to graduate to the library shape once analyses are stored — that is where
the 64K ceiling is reached.

---

## 10. Provisioning

`docs/provision-sharepoint.ps1` creates everything in this document with
[PnP.PowerShell](https://pnp.github.io/powershell/):

```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
Connect-PnPOnline -Url https://contoso.sharepoint.com/sites/OWRM-RateStudies -Interactive
./docs/provision-sharepoint.ps1 -SiteUrl https://contoso.sharepoint.com/sites/OWRM-RateStudies
```

The script is idempotent: re-running it adds anything missing and leaves
existing columns and data alone. It does **not** create the site, set
permissions, or build the flows — those are deliberate manual steps (§2, §6,
§5) that deserve a human decision.

### Verifying a change to the script

`docs/provision-sharepoint.Tests.ps1` runs the whole provisioning script
offline against stubbed PnP cmdlets — no tenant, no connection, no side
effects. It generates every field definition with its real arguments and
checks that the CAML parses, that internal names match what this document and
the flows reference, that no lookup points at a list the script never creates,
and that no view references a column that does not exist.

```powershell
pwsh -File docs/provision-sharepoint.Tests.ps1
```

Run it after editing the script. It exists because a description containing an
apostrophe — `"The tool's own study GUID"` — silently produced malformed CAML
and would have failed on `StudyId`, the column the whole payload design keys
off. Attribute values are XML-escaped now, and this is what keeps them that
way.

---

## 11. Checklist

- [ ] Site created, external sharing off (§2)
- [ ] Nine lists/libraries created with the internal names above (§3)
- [ ] Indexes added on every filtered column (§7.1)
- [ ] Column validation on `PwsId` and `MonthlyMhi` (§3.1)
- [ ] Versioning set per §7.2; search exclusions per §7.4
- [ ] `RateStudyBenchmarks` seeded (§3.6)
- [ ] `AppConfiguration` seeded (§3.7)
- [ ] Four groups created, `Add only` level built, inheritance broken on the
      three restricted lists (§6)
- [ ] Flows §5.1–§5.6 built and their connections owned by the service account
- [ ] Analysis endpoint key stored in Key Vault, not in SharePoint (§5.4)
- [ ] Canvas app wired per `docs/POWER-APPS-INTEGRATION.md`
- [ ] One end-to-end test: create → save → reopen → export report → confirm the
      version history, the metric columns, and the activity log all updated
