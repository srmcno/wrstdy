# Power Apps Integration — Water Rate Study Tool code component

How to build, deploy, and wire the `ChoctawNationOWRM.WaterRateStudyTool` code
component into a canvas app backed by the SharePoint design in
[`SHAREPOINT-BACKEND.md`](./SHAREPOINT-BACKEND.md).

---

## 1. What the component is, and what it deliberately is not

It is the eight-step rate study workspace — system info, customer classes and
tiered rates, budget, financial scorecard, five-year projection, scenarios,
analysis, and the board-ready report with PDF/Word export. All of the
calculation and all of the report layout live inside it.

It is **not** the data layer. Three framework rules force that split, and the
component is built to respect them rather than work around them
([limitations](https://learn.microsoft.com/power-apps/developer/component-framework/limitations)):

| Rule | What the component does instead |
| --- | --- |
| No `localStorage` / `sessionStorage` for data | Studies arrive on `StudiesJson` and leave on `StudiesJsonOut`; the app patches SharePoint |
| No custom auth | Analyses are *requests* (`AiRequestJson`) the app fulfils with a Power Automate flow |
| One bundle, no runtime code-splitting | The React app is pre-bundled into a single ES module before the PCF build |

So the canvas app owns: the study list, the map, saving, file storage, locking,
and any AI connection. The component owns: everything a rate analyst does
between opening a study and exporting the report.

### Standard, not virtual

`control-type` is `standard`. Virtual components share the platform React
library, which is **16.14.0** in canvas apps — and this application uses
`createRoot`, `useId`, and `useSyncExternalStore`, all React 18. Bundling React
is the supported alternative and costs about 45 KB gzipped.

---

## 2. Build and deploy

### Prerequisites

- Node 18+
- [Power Platform CLI](https://learn.microsoft.com/power-platform/developer/cli/introduction)
  (`pac install latest`)
- .NET SDK 6+ (for the solution build)
- **Power Apps component framework for canvas apps** enabled in the target
  environment: Power Platform admin center → Environments → *your environment*
  → Settings → Product → Features.

### Build

```bash
# 1. Bundle the React application (repository root).
#    Emits pcf/WaterRateStudyTool/app/wrs-app.js — one ES module, ~2.6 MB raw
#    / ~755 KB gzipped, with React, the stylesheet, and the PDF/Word exporters
#    inlined. The Leaflet map is replaced by a stub here: canvas apps draw
#    their own map, and it would otherwise add ~950 KB.
npm install
npm run build:pcf

# 2. Build the code component. `prebuild` re-runs step 1, so this is enough
#    on its own after the first install.
cd pcf
npm install
npm run build            # → pcf/out/controls/WaterRateStudyTool/bundle.js
```

Test it in the harness without an environment:

```bash
cd pcf && npm start watch
```

The harness has no SharePoint behind it — paste a study JSON into the
`StudiesJson` input to exercise the component.

### Deploy

**During development** — push straight into a dev environment:

```bash
pac auth create --url https://<yourorg>.crm.dynamics.com
cd pcf
pac pcf push --publisher-prefix cnowrm
```

**For test and production** — build the solution package:

```bash
cd pcf/Solutions
dotnet build -c Release          # → bin/Release/Solutions.zip (managed)
dotnet build                     # unmanaged, for a dev environment
```

Import the `.zip` in the maker portal (Solutions → Import solution). The
publisher prefix in `src/Other/Solution.xml` is `cnowrm`; change it there and in
`pac pcf push` together if your tenant uses a different one.

### Add it to an app

1. Power Apps Studio → **+ Add** → **Get more components** → **Code** tab
2. Select **Water Rate Study Tool** → **Import**
3. **+ Insert** → **Code components** → **Water Rate Study Tool**

After a version bump, re-import from the same dialog; the manifest `version`
attribute is what tells Power Apps something changed, so bump it on every
deploy.

---

## 3. Properties

### Inputs

| Property | Type | Purpose |
| --- | --- | --- |
| `StudiesJson` | Multiline text | The study to edit. Accepts one study object, an array, or an export envelope (`{study}` / `{studies}`). |
| `Mode` | Enum | `single` (default) — one study, app owns the list. `workspace` — the component shows its own study list and dashboard. |
| `ReadOnly` | Boolean | Displays the study with editing disabled (`inert`, so keyboard access is blocked too). |
| `AiResponseId` | Text | Echo of `AiRequestId`; delivers a reply to the waiting request. |
| `AiResponseText` | Multiline text | The analysis returned by your flow. |
| `AiResponseError` | Text | Set instead of `AiResponseText` when the flow failed. |

### Outputs

| Property | Type | Set when |
| --- | --- | --- |
| `StudiesJsonOut` | Multiline text | Any edit (debounced ~400 ms) |
| `ChangedStudyId` | Text | Any edit |
| `StudyCount` | Number | Any edit |
| `LastEvent` | Text | `save` · `file` · `ai-request` |
| `LastEventAt` | Text | ISO timestamp — **always changes**, so `OnChange` fires even for two identical saves |
| `FileName`, `FileMimeType`, `FileBase64`, `FileSizeBytes` | | `LastEvent = "file"` |
| `AiRequestId`, `AiRequestJson` | Text / multiline | `LastEvent = "ai-request"` |

`OnChange` fires for all of them together. Branch on `LastEvent`.

---

## 4. Wiring a single-study screen (recommended)

The shape most teams want: a gallery of studies on one screen, the component on
another.

### 4.1 Data sources

Add the SharePoint connector and select `WaterSystems`, `RateStudies`. Add the
flows `WRS - Get Study Payload`, `WRS - Save Study Payload`,
`WRS - Save Report File`, `WRS - Lock / Unlock Study` (and
`WRS - Request Analysis` if analysis is enabled).

### 4.2 Opening a study — gallery `OnSelect`

```powerfx
Set(gblStudyItem, ThisItem);
Set(gblStudyId, ThisItem.StudyId);

// Soft lock. Someone else holding it inside the window opens read-only.
Set(gblLock, 'WRS - Lock / Unlock Study'.Run(ThisItem.StudyId, "lock"));
Set(
    gblReadOnly,
    !IsBlank(gblLock.lockedByEmail) && gblLock.lockedByEmail <> User().Email
);

Set(gblPayload, 'WRS - Get Study Payload'.Run(ThisItem.StudyId).payloadjson);
Navigate(scrRateStudy, ScreenTransition.None)
```

### 4.3 The component

| Property | Formula |
| --- | --- |
| `StudiesJson` | `gblPayload` |
| `Mode` | `"single"` |
| `ReadOnly` | `gblReadOnly` |
| `AiResponseId` | `gblAiResponseId` |
| `AiResponseText` | `gblAiResponseText` |
| `AiResponseError` | `gblAiResponseError` |
| `Height` | `Parent.Height - 60` |
| `Width` | `Parent.Width` |

Give it real estate. The workspace assumes roughly 1000 × 700; below about
820 px wide it switches itself to a narrow layout, and below 520 px to a
single-column one, but eight steps of financial tables want room.

### 4.4 `OnChange` — the one formula that matters

```powerfx
Switch(
    WaterRateStudyTool1.LastEvent,

    // ── A study was edited ────────────────────────────────────────────────
    "save",
    With(
        { payload: WaterRateStudyTool1.StudiesJsonOut },
        With(
            { study: First(ParseJSON(payload)) },
            'WRS - Save Study Payload'.Run(
                WaterRateStudyTool1.ChangedStudyId,
                payload,
                // Headline metrics for the list item. Everything here is read
                // straight out of the payload — no recalculation in Power Fx,
                // so the list can never disagree with the study.
                JSON(
                    {
                        studyName:     Text(study.name),
                        studyStatus:   Text(study.status),
                        studyYear:     Text(study.systemInfo.studyYear),
                        pwsId:         Text(study.systemInfo.pwsId),
                        systemName:    Text(study.systemInfo.systemName),
                        effectiveDate: Text(study.demographics.effectiveDate)
                    },
                    JSONFormat.Compact
                ),
                "2.2.0"
            )
        )
    ),

    // ── A report was generated ────────────────────────────────────────────
    "file",
    UpdateContext({
        locSaveFile: 'WRS - Save Report File'.Run(
            WaterRateStudyTool1.ChangedStudyId,
            WaterRateStudyTool1.FileName,
            WaterRateStudyTool1.FileMimeType,
            WaterRateStudyTool1.FileBase64
        )
    });
    Notify(
        "Saved " & WaterRateStudyTool1.FileName & " to the reports library.",
        NotificationType.Success
    ),

    // ── An analysis was requested ─────────────────────────────────────────
    "ai-request",
    If(
        LookUp(AppConfiguration, Title = "Ai.Enabled").ConfigValue = "true",
        UpdateContext({
            locAi: 'WRS - Request Analysis'.Run(
                WaterRateStudyTool1.AiRequestId,
                WaterRateStudyTool1.ChangedStudyId,
                WaterRateStudyTool1.AiRequestJson
            )
        });
        Set(gblAiResponseText,  locAi.responsetext);
        Set(gblAiResponseError, locAi.errortext);
        // Set the ID LAST — it is the signal the component waits on.
        Set(gblAiResponseId,    WaterRateStudyTool1.AiRequestId),

        // Analysis switched off in this environment: fail the request
        // explicitly rather than leaving the user watching a spinner.
        Set(gblAiResponseText,  Blank());
        Set(gblAiResponseError, LookUp(AppConfiguration, Title = "Ai.FlowNotice").ConfigValue);
        Set(gblAiResponseId,    WaterRateStudyTool1.AiRequestId)
    )
)
```

> **Set `AiResponseId` last, always.** The component treats a change in that
> property as "the reply is here" and reads the text and error properties at
> that moment. Setting it first delivers an empty analysis.

### 4.5 Leaving the screen

```powerfx
// scrRateStudy.OnHidden
If(!gblReadOnly, 'WRS - Lock / Unlock Study'.Run(gblStudyId, "unlock"));
Set(gblPayload, Blank());
Set(gblAiResponseId, Blank());
Set(gblAiResponseText, Blank());
Set(gblAiResponseError, Blank())
```

### 4.6 Starting a new study

The component creates the study object itself — the app only needs to hand it
an empty payload and let the first `save` create the record.

```powerfx
// btnNewStudy.OnSelect
Set(gblSystem, cmbSystem.Selected);
Set(gblStudyId, Blank());          // the component mints its own GUID
Set(gblPayload, Blank());
Set(gblReadOnly, false);
Navigate(scrRateStudy, ScreenTransition.None)
```

`WRS - Save Study Payload` creates the `RateStudies` item when it cannot find
one for the incoming `StudyId` — so the first edit brings the record into
existence, and an abandoned blank study never leaves a row behind.

---

## 5. Wiring a workspace screen (whole library in one control)

Set `Mode = "workspace"` and hand it every study at once. The component then
shows its own sidebar, dashboard, and study list, and manages selection itself.

| Property | Formula |
| --- | --- |
| `StudiesJson` | `gblAllStudies` |
| `Mode` | `"workspace"` |

```powerfx
// App.OnStart or a Refresh button — one flow call per study.
Set(
    gblAllStudies,
    "[" &
    Concat(
        Filter(RateStudies, StudyStatus <> "Superseded"),
        'WRS - Get Study Payload'.Run(StudyId).payloadjson,
        ","
    ) &
    "]"
)
```

Sensible when the office works from a shared caseload of a few dozen studies,
and a poor idea past a hundred: every study is loaded into memory at once, and
`OnChange` writes **all** of them back. For anything larger, use single-study
mode.

---

## 6. Testing checklist

Run this once against a real environment before handing it to the team.

- [ ] **Create** — new study, fill Step 1, confirm a `RateStudies` item appears
      with the right `StudyId` and `WaterSystem`
- [ ] **Round trip** — edit rates, leave the screen, reopen; every value is
      still there
- [ ] **Version history** — `RateStudyData/{StudyId}.json` shows one version per
      save
- [ ] **Metrics** — `PropOperatingRatio` on the list item matches Step 4 on
      screen
- [ ] **Data check** — clear the proposed customer count; Step 8 flags it and
      `BlockingDataIssues` goes above zero after the next save
- [ ] **Report** — export a PDF; it lands in `RateStudyReports` with metadata,
      and prior reports for that study flip to `IsSuperseded`
- [ ] **Concurrency** — open the same study as two users; the second gets
      read-only and sees who holds it
- [ ] **Read-only** — confirm the form cannot be edited by mouse *or* keyboard
      (tab into it and try)
- [ ] **Analysis** — request one; confirm the reply lands in Step 7 and an
      `AiAnalysisRequests` row records it
- [ ] **Analysis off** — set `Ai.Enabled` to `false`; the request fails with the
      configured notice instead of hanging
- [ ] **Size** — export a report from the largest study; `FileSizeBytes` stays
      under ~780 KB (the text-property ceiling; the component refuses past it
      and says so)
- [ ] **Mobile** — open on a tablet; the layout collapses to the narrow
      arrangement and the tables scroll horizontally within their cards

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Component not in the **Code** tab | Framework feature off for the environment | Admin center → Environment → Settings → Product → Features |
| Blank rectangle where the control should be | `Height` unset or bound to an auto-height container | Give it an explicit height; the component falls back to 900 px only when the platform reports none |
| Edits never reach SharePoint | `OnChange` not branching on `LastEvent`, or the flow silently failing | Add `Notify()` to each branch and check the flow run history |
| Study resets while typing | The app writes `StudiesJson` back from the same variable the component just emitted | Bind `StudiesJson` to the payload loaded on open, **not** to `StudiesJsonOut` |
| Analysis spinner never stops | `AiResponseId` never set, or set before the text | Set the text and error first, the ID last |
| Analysis shows the wrong study's text | A stale reply arrived after the user moved on | Nothing to do — the component ignores replies whose ID doesn't match; make sure the flow echoes `AiRequestId` unchanged |
| Report export reports "too large" | Base64 exceeds the 1,048,576-character property ceiling | Trim the saved analysis or report notes; or add a flow that writes the file directly and skip the property |
| Old version keeps loading | Power Apps caches by manifest version | Bump `version` in `ControlManifest.Input.xml`, rebuild, re-import, republish the app |
| `pac pcf push` fails on publisher prefix | Prefix doesn't match the target solution's publisher | Use the prefix from the existing publisher, or create one that matches `cnowrm` |

---

## 8. Standalone build

The same source still builds the browser application — nothing here replaced
it. `npm run build` produces a normal static site and `npm run build:single`
one self-contained HTML file. In that build the app keeps localStorage
persistence, the Leaflet map, browser downloads, and printing; the host
abstraction in `src/platform/host.js` is what lets one codebase serve both.

Use it for field work without a Power Platform licence, and for the map view.
Studies move between the two through **Export Study (.json)**, which produces
exactly the payload format `StudiesJson` accepts.
