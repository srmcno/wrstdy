# Water Rate Study review, 2.3.0

## Corrections

- Annual debt remains fixed unless explicitly scheduled. A zero schedule entry means no payment, including an all-zero schedule. Blank years retain each track's budget debt.
- Data checks examine every forecast year for negative cash, including a shortfall followed by a later grant. The target uses the same default as charts and reports.
- The three-month O&M reserve suggestion excludes debt and asset-replacement/long-range reserve transfers.
- The 3%/5% sensitivity tables now use the same debt and one-time-item logic in the screen, PDF, and Word report.
- Malformed imported numbers, negative rate/budget inputs, duplicate tier breakpoints, and nonzero rates without breakpoints produce visible findings.
- The former Operating Ratio is labeled Budget Coverage Ratio because its denominator includes debt and reserve transfers.
- Income screening percentages no longer claim USDA eligibility or universal EPA affordability. DSCR screen labels no longer claim actual covenant compliance.
- Opening a study or accepting a host-loaded record no longer triggers a normalization-only save. Edited timestamps no longer claim successful persistence. Oversized PCF study output is rejected.
- AI requests register the pending reply before notifying the canvas host and time out after 120 seconds. Event timestamps are distinct even within one millisecond. Initial PCF height respects the allocated container.
- Added internal study guidance, more legible typography, keyboard-operable tabs, visible focus indicators, and a reduced-motion preference.
- Added WRS-specific Dataverse tables, an additive PowerShell 5.1 installer, host formulas, and Windows solution CI. Added missing PCF lint configuration and a locked dependency tree. The build disables telemetry/Statsbeat before initialization.

## Calculation basis staff must understand

Rates are monthly, dollar-per-1,000-gallon cumulative blocks. The final rate extends beyond the last breakpoint. To model gallons included in a base charge, use a zero-rate first block. Customer usage groups are shared between current and proposed structures; manual side-specific customer/gallon totals apply only when no groups exist. Monthly figures should represent the complete billing year. Flat class-average billing can misstate tiered revenue, especially for seasonal or uneven consumption.

The cash budget includes actual monthly reserve transfers, not noncash depreciation expense. Beginning fund balance is available unrestricted operating cash after separating restricted reserves. Do not charge a capital project again against operating cash when it is already funded by a separately excluded reserve. Known positive one-time items add cost; negatives add receipts, in both forecast tracks. The model assumes billed revenue is collected; staff should reconcile actual collections and model collection shortfalls in documented assumptions before using it for adoption.

Budget coverage is rate revenue divided by the total cash requirement. DSCR excludes the debt line and reserve transfers from O&M; the exact covenant calculation and target must come from the loan agreement. Income bands at 1.5%, 2%, and 2.5% are illustrative planning screens for a 5,000-gallon bill. They do not determine grant eligibility or the affordability of lower-income households. Do not set rates solely to hit an income band.

The current forecast combines current rates and current budget; the proposed forecast combines proposed rates and proposed budget. Revenue and account growth compound multiplicatively beginning in FY2. Do not count the same growth twice. No demand-elasticity or collection-rate response is inferred automatically. Changes in service mix, tariffs, or operating scale require staff assumptions.

## Deployment limits

The component and database schema do not constitute a prewired canvas app. Insert the PCF into the team's existing canvas host using the included formulas. Four tables store complete study payloads and related review/report records. No AI flow, tenant policy change, or role assignment is silently installed. Live import, generated field-name binding, permissions, and Teams playback must be tested in development.

The example host detects a previously saved concurrent change, but it is not an atomic lock. Use one editor per study, or add a server-side concurrency service before allowing simultaneous edits. A report saved as base64 in Dataverse is a stored document, not a SharePoint download link. An optional approved report-delivery flow can expose it to staff.

## Sources checked

- [EPA: sustainable small-system rates](https://www.epa.gov/system/files/documents/2022-06/FINAL%20Sustainable%20Water%20Rate%20STEP%20Guide_508.pdf)
- [USDA RD: Water and Waste Disposal Loan and Grant Program](https://www.rd.usda.gov/programs-services/water-environmental-programs/water-waste-disposal-loan-grant-program)
- [Microsoft: code components for canvas apps](https://learn.microsoft.com/en-us/power-apps/developer/component-framework/component-framework-for-canvas-apps)
- [Microsoft: table and column metadata](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api)

## Verification completed

- 120 unit tests pass, including all-zero debt schedules, fixed debt, early cash deficits, reserve targets, malformed values, and oversized output.
- Browser suite passes at desktop and narrow widths, covering all eight steps, local persistence, input clearing, host CSS isolation, no PCF web storage, host updates, and no write-on-open.
- Compiled PCF wrapper passes height, edit emission, read-only navigation, and restoration checks. PDF and Word exports from the compiled bundle produce valid document signatures and matching byte counts, with no runtime errors.
- Production PCF build succeeds. It emits bundle-size warnings and two dynamic-require warnings from bundled dependencies; PDF and Word export paths were exercised successfully.
- Managed and unmanaged component ZIPs were packed with Microsoft's SolutionPackager library. Package manifests, resource paths, control name, versions, and managed flags were inspected. They contain the PCF component, not the Dataverse tables or a canvas host.
- The supplied PowerShell script targets Windows PowerShell 5.1 and provisions through documented metadata APIs. Parsing with the PowerShell 7.4 parser produced zero syntax errors. It has not been executed against your tenant, and Windows PowerShell 5.1 was unavailable in this local runtime. The included Windows CI job can validate syntax after authorized publication.
- No Teams tenant import or end-user permission verification has been performed. The GitHub push was rejected by automatic approval review; changes are committed locally and included in the source ZIP.

The standard CLI/MSBuild launcher could not run in this local runtime because process information was unavailable. Packing used the official library's public API with telemetry disabled; the source staging script is included for normal `pac solution pack` use elsewhere.
