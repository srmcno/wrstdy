# CNO Water Rate Study 2.3

This release is a PCF code component plus a Dataverse provisioning package. Importing the component does not create a canvas app screen. Add the component to your existing internal canvas app and use the formulas below. The full calculation workflow, reports, and study guide are inside the component.

## Choose the environment

Use the environment where your working Teams PCF app already runs. A canvas app hosted in Teams and a Dataverse for Teams environment are different configurations. This package retains the standard canvas-PCF approach; actual import and playback must be checked in your tenant. It does not alter tenant policy or enable PCF.

No Windows administrator rights are required for the script. Your signed-in account still needs permission to create/customize tables, import/export solutions, and publish these components. PCF must already be enabled. A denied permission is not solved by running PowerShell as administrator.

## Install from Windows PowerShell 5.1

Extract the release ZIP into a folder you own. Open ordinary Windows PowerShell there. Do not use an elevated window.

```powershell
# Connectivity and existing-table check only; no Dataverse writes.
.\deployment\Install-WaterRateStudy.ps1 `
  -EnvironmentUrl 'https://YOURORG.crm.dynamics.com' `
  -TenantId 'YOUR-TENANT-GUID' -CheckOnly

# Import the UNMANAGED component into development, provision tables, and
# export both complete solution variants from the environment.
.\deployment\Install-WaterRateStudy.ps1 `
  -EnvironmentUrl 'https://YOURORG.crm.dynamics.com' `
  -TenantId 'YOUR-TENANT-GUID' `
  -ComponentSolution '.\CNO-WaterRateStudy-PCF-unmanaged.zip'
```

When needed, the script installs only `Az.Accounts` under your user profile and uses Microsoft's interactive device sign-in. If organization policy blocks device sign-in or PowerShell Gallery, use an already-approved token source and pass `-AccessToken` as a SecureString. Do not paste tokens into chat, source files, or command-line literals. No app registration, client secret, or Azure subscription is created.

If your organization requires signed scripts, obtain your normal internal signing approval. The installer does not change execution policy. Internet access to Microsoft sign-in, the environment, and PowerShell Gallery is needed for interactive installation.

The script creates missing tables/columns, checks existing column types, retains rows, and restricts parent deletion when child records exist. It adds the tables to `ChoctawNationWaterRateStudy`. It does not rename existing schema, delete records, or change security roles. It can be rerun after a partial failure. Review errors before retrying an interrupted component import.

The resulting `deployment/exported/*-unmanaged.zip` and `*-managed.zip` contain the component and schema if the component was imported first. Use **Power Apps > Solutions > Import solution** for those ZIPs in subsequent environments. Import the unmanaged version into development; use managed for downstream installations. Do not run the provisioning script against a managed installation. Add your canvas app and any approved flows to the development solution before exporting again if you want those included in future imports.

## Tables

The existing publisher prefix `cnowrm` and PCF namespace are retained for upgrade continuity. The `wrs` table stem isolates this application's records.

| Table | Purpose | Relationship |
| --- | --- | --- |
| `cnowrm_wrssystem` | PWS identity and contacts | Parent of studies |
| `cnowrm_wrsstudy` | Name, study key, status, year, full JSON payload, app version, review notes | Water System lookup |
| `cnowrm_wrsrevision` | Explicit review checkpoints with full JSON and reason | Rate Study lookup |
| `cnowrm_wrsreport` | Filename, MIME type, byte count, base64 document, app version | Rate Study lookup |

All tables are user/team owned with built-in Created By, Created On, Modified By, and Modified On fields. Auditing is requested at table/column level; organization-level audit enablement and retention remain environment settings. Parent lookups are application-required and deletion is restricted. They are not a substitute for validation in other integrations.

The payload is authoritative for customer classes, tier breakpoints, usage groups, both budgets, five-year assumptions, scenarios, notes, and analysis. Keeping one study in one row avoids partially saved calculations and stale duplicated child-table totals. Saved revisions preserve the same payload format. The JSON schema is defined by `normalizeStudy` in the source; `dataverse-schema.json` defines physical tables and columns.

Payload and report text columns allow 1,048,576 characters. The component checks oversized output. Use **single** mode for Dataverse. Reports use base64 text to avoid requiring a flow for file-column upload; large report libraries should migrate to a managed document library and a file-save flow. No external AI service is required to calculate rates or create reports.

## Permissions

An environment owner can extend existing CNO roles with these privileges. The installer deliberately does not assign users or grant organization-wide access.

| Role | Required access |
| --- | --- |
| Analyst | Read/Create/Write on systems and studies; Read/Create on revisions and reports; Append/Append To for the lookups. Use team ownership/sharing for the relevant caseload. |
| Reviewer | Read on the four tables and access to the canvas app. Bind the component read-only. |
| Maintainer | Solution import/export, customization, and publish privileges in development. |

The component's `ReadOnly` property is a user-interface aid. Dataverse privileges enforce access. Avoid concurrent editing of the same study. The freshness check below detects an already-saved change before a write but is not an atomic lock; simultaneous network writes still require a server-side concurrency service if your workflow needs multi-editor guarantees.

## Create the canvas screen

Add these Dataverse data sources: **WRS Water Systems**, **WRS Rate Studies**, **WRS Study Revisions**, **WRS Generated Reports**.

Import the code component from **Get more components > Code** and name it `WaterRateStudyTool1`. Create a gallery screen with systems/studies, an editor screen named `scrRateStudy`, and a save button named `btnSaveStudy` on the editor screen.

Gallery `OnSelect`:

```powerfx
Set(gblStudyRecord, ThisItem);
Set(gblSystem, ThisItem.'Water System');
Set(gblPayload, ThisItem.'Study Payload');
Set(gblPendingPayload, "");
Set(gblSaveMessage, "Loaded from Dataverse");
Set(gblSaving, false);
Set(gblReadOnly, false);
Navigate(scrRateStudy, ScreenTransition.None)
```

For reviewers, set `gblReadOnly` from your existing role/access logic instead of `false`. New study button, after selecting an existing system in `cmbSystem`:

```powerfx
Set(gblSystem, cmbSystem.Selected);
If(IsBlank(gblSystem),
  Notify("Select a water system first.", NotificationType.Error),
  Set(gblStudyRecord, Blank());
  Set(gblPayload, "{""studies"":[]}");
  Set(gblPendingPayload, "");
  Set(gblSaveMessage, "New study, not yet saved");
  Set(gblSaving, false);
  Set(gblReadOnly, false);
  Navigate(scrRateStudy, ScreenTransition.None)
)
```

| Component property | Formula |
| --- | --- |
| StudiesJson | `gblPayload` |
| Mode | `"single"` |
| ReadOnly | `gblReadOnly || gblSaving` |
| Width | `Parent.Width` |
| Height | `Max(420, Parent.Height - 70)` |
| AiResponseId | `gblAiResponseId` |
| AiResponseText | `gblAiResponseText` |
| AiResponseError | `gblAiResponseError` |

Place a status label outside the component with `Text = gblSaveMessage`, and a retry button that selects `btnSaveStudy`. Do not label an edit "Saved" before Patch succeeds. Do not bind `StudiesJson` directly to `StudiesJsonOut`.

`btnSaveStudy.OnSelect`:

```powerfx
If(!gblSaving && !gblReadOnly && !IsBlank(gblPendingPayload),
  Set(gblSaving, true);
  Set(gblSaveMessage, "Saving...");
  IfError(
    Refresh('WRS Rate Studies');
    If(!IsBlank(gblStudyRecord) &&
       LookUp('WRS Rate Studies', 'WRS Rate Study' = gblStudyRecord.'WRS Rate Study').'Modified On' <> gblStudyRecord.'Modified On',
      Set(gblSaveMessage, "Another user changed this study. Your edits remain open. Save a checkpoint before reloading.");
      Notify(gblSaveMessage, NotificationType.Error),
      With({s: First(Table(ParseJSON(gblPendingPayload))).Value},
        Set(gblStudyRecord,
          Patch('WRS Rate Studies',
            If(IsBlank(gblStudyRecord), Defaults('WRS Rate Studies'), gblStudyRecord),
            {Name: Text(s.name), 'Study Key': Text(s.id),
             'Study Status': Text(s.status), 'Study Year': Text(s.systemInfo.studyYear),
             'Water System': gblSystem, 'Study Payload': gblPendingPayload,
             'App Version': "2.3.0"}));
        Set(gblSaveMessage, "Saved to Dataverse");
        Set(gblPendingPayload, "")
      )
    ),
    Set(gblSaveMessage, "Save failed: " & FirstError.Message);
    Notify(gblSaveMessage, NotificationType.Error)
  );
  Set(gblSaving, false)
)
```

The primary key display name is normally the singular table display name (for example `'WRS Rate Study'`). Verify it in Studio after adding the data source; if your tenant shows the logical name, select the primary key offered by IntelliSense.

`WaterRateStudyTool1.OnChange`:

```powerfx
Switch(WaterRateStudyTool1.LastEvent,
  "save",
    Set(gblPendingPayload, WaterRateStudyTool1.StudiesJsonOut);
    Select(btnSaveStudy),
  "file",
    If(IsBlank(gblStudyRecord),
      Notify("Save the study before saving a report.", NotificationType.Error),
      IfError(
        Patch('WRS Generated Reports', Defaults('WRS Generated Reports'),
          {Name: WaterRateStudyTool1.FileName,
           'File Name': WaterRateStudyTool1.FileName,
           'MIME Type': WaterRateStudyTool1.FileMimeType,
           'File Content Base64': WaterRateStudyTool1.FileBase64,
           'File Size Bytes': WaterRateStudyTool1.FileSizeBytes,
           'Rate Study': gblStudyRecord, 'App Version': "2.3.0"});
        Notify("Report saved to Dataverse.", NotificationType.Success),
        Notify("Report was not saved: " & FirstError.Message, NotificationType.Error)
      )
    ),
  "ai-request",
    Set(gblAiResponseText, "");
    Set(gblAiResponseError, "AI analysis is not configured. All rate calculations and reports remain available.");
    Set(gblAiResponseId, WaterRateStudyTool1.AiRequestId)
)
```

Optional **Save checkpoint** button, with a text input named `txtRevisionReason`:

```powerfx
If(IsBlank(gblStudyRecord),
  Notify("Save the study first.", NotificationType.Error),
  IfError(
    Patch('WRS Study Revisions', Defaults('WRS Study Revisions'),
      {Name: gblStudyRecord.Name & " - " & Text(Now(), "yyyy-mm-dd hh:mm:ss"),
       'Rate Study': gblStudyRecord,
       'Revision Payload': If(IsBlank(gblPendingPayload), gblStudyRecord.'Study Payload', gblPendingPayload),
       'Revision Reason': txtRevisionReason.Text, 'App Version': "2.3.0"});
    Notify("Checkpoint saved.", NotificationType.Success),
    Notify("Checkpoint failed: " & FirstError.Message, NotificationType.Error)
  )
)
```

Block your Back button while `gblSaving` is true or `gblPendingPayload` is nonempty. After the user has stopped typing, allow the component's 400 ms edit debounce to finish before leaving the screen. A forced close or network interruption can still lose unsaved edits; the status label and checkpoint action expose the distinction.

For AI, replace the disabled branch with an approved Power Automate flow. Capture the request ID before calling the flow; set response text/error first and response ID last. Handle `IfError`. The component now times out after 120 seconds. No credentials belong in the code component.

## Teams and acceptance checks

Publish the canvas app and use **Add to Teams** or the Teams Power Apps tab according to your existing working deployment. Give the editor enough height. Test Teams desktop and web with an analyst and a read-only reviewer.

Before operational use, verify: component import; create/save/reopen a study; correct system lookup; save failure/retry; second-user access; actual role restrictions; checkpoint payload; PDF/Word report bytes; all eight steps at Teams width; and a benchmark study reconciled to a real 12-month billing register. Confirm that no draft is described as an approved rate schedule.

Local build and browser tests do not establish that your tenant accepts the solution or that these Studio formulas compile against its generated field display names. Those checks require your environment. Keep the first import in development.

## Sources

- [Microsoft: canvas code components](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/component-framework-for-canvas-apps)
- [Microsoft: importing solutions](https://learn.microsoft.com/en-us/power-apps/maker/data-platform/import-update-export-solutions)
- [Microsoft: table metadata creation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api)
- [Microsoft: AddSolutionComponent](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponent)
- [Microsoft: Azure PowerShell compatibility](https://learn.microsoft.com/en-us/powershell/azure/new-azureps-module-az)

## Retrieve a saved report without a flow

Show the generated report row's primary-key GUID in your report gallery, then use the same script in its read-only report-download mode. This downloads the stored bytes with your existing Dataverse read permissions and performs no schema changes:

```powershell
.\deployment\Install-WaterRateStudy.ps1 `
  -EnvironmentUrl 'https://YOURORG.crm.dynamics.com' `
  -TenantId 'YOUR-TENANT-GUID' `
  -ExportReportId 'REPORT-ROW-GUID'
```

The file is written under `deployment/reports`. Existing files are not overwritten. For an in-app download link, connect your approved document-library flow to the file event instead.
