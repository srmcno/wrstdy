<#
.SYNOPSIS
    Provisions the SharePoint back end for the Water Rate Study Tool.

.DESCRIPTION
    Creates the lists, libraries, columns, indexes, views, and seed data
    described in docs/SHAREPOINT-BACKEND.md.

    Idempotent: re-running adds anything missing and leaves existing columns,
    settings, and data untouched. Safe to run after a schema change.

    Deliberately NOT done here — each is a decision a person should make:
      * creating the site collection
      * permissions and group membership (§6 of the doc)
      * the Power Automate flows (§5)
      * breaking permission inheritance on the restricted lists (§6.2)

.PARAMETER SiteUrl
    Absolute URL of the site to provision into. Must already exist.

.PARAMETER SkipSeedData
    Create the structure but do not write the benchmark / configuration rows.

.EXAMPLE
    Install-Module PnP.PowerShell -Scope CurrentUser
    Connect-PnPOnline -Url https://contoso.sharepoint.com/sites/OWRM-RateStudies -Interactive
    ./provision-sharepoint.ps1 -SiteUrl https://contoso.sharepoint.com/sites/OWRM-RateStudies

.NOTES
    Requires PnP.PowerShell 2.x and Site Collection Administrator rights.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string] $SiteUrl,

    [switch] $SkipSeedData
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step { param([string] $Message) Write-Host "  → $Message" -ForegroundColor Cyan }
function Write-Skip { param([string] $Message) Write-Host "  · $Message (already present)" -ForegroundColor DarkGray }
function Write-Done { param([string] $Message) Write-Host "✓ $Message" -ForegroundColor Green }

function Ensure-List {
    param(
        [Parameter(Mandatory)][string] $Title,
        [Parameter(Mandatory)][string] $Url,
        [Parameter(Mandatory)][ValidateSet('GenericList', 'DocumentLibrary')][string] $Template,
        [string] $Description = ''
    )
    $list = Get-PnPList -Identity $Url -ErrorAction SilentlyContinue
    if ($null -ne $list) {
        Write-Skip "List '$Title'"
        return $list
    }
    Write-Step "Creating list '$Title' at /$Url"
    New-PnPList -Title $Title -Url $Url -Template $Template | Out-Null
    $list = Get-PnPList -Identity $Url
    if ($Description) { Set-PnPList -Identity $list -Description $Description | Out-Null }
    return $list
}

<#
    Adds a field from CAML so every attribute the doc specifies (decimals,
    min/max, Required, EnforceUniqueValues, lookups) is set in one call, and
    the INTERNAL name is exactly what we ask for. Creating a field by display
    name and renaming it later leaves the internal name mangled
    ("Study_x0020_ID"), which then has to be hard-coded into every flow.
#>
function Ensure-Field {
    param(
        [Parameter(Mandatory)][string] $ListUrl,
        [Parameter(Mandatory)][string] $InternalName,
        [Parameter(Mandatory)][string] $Xml
    )
    $existing = Get-PnPField -List $ListUrl -Identity $InternalName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Write-Skip "  field '$InternalName'"
        return
    }
    Write-Step "  field '$InternalName'"
    Add-PnPFieldFromXml -List $ListUrl -FieldXml $Xml -ErrorAction Stop | Out-Null
}

function New-TextFieldXml {
    param([string] $Name, [string] $Display, [int] $MaxLength = 255, [switch] $Required, [switch] $Unique, [string] $Description = '')
    $req = if ($Required) { 'TRUE' } else { 'FALSE' }
    $uniq = if ($Unique) { 'TRUE' } else { 'FALSE' }
    "<Field Type='Text' Name='$Name' StaticName='$Name' DisplayName='$Display' MaxLength='$MaxLength' Required='$req' EnforceUniqueValues='$uniq' Indexed='$uniq' Description='$Description' />"
}

function New-NoteFieldXml {
    param([string] $Name, [string] $Display, [int] $Rows = 6, [string] $Description = '')
    "<Field Type='Note' Name='$Name' StaticName='$Name' DisplayName='$Display' NumLines='$Rows' RichText='FALSE' RichTextMode='Compatible' AppendOnly='FALSE' Description='$Description' />"
}

function New-NumberFieldXml {
    param([string] $Name, [string] $Display, [int] $Decimals = 0, [string] $Min = '', [string] $Max = '', [switch] $Required, [string] $Description = '', [switch] $Percentage)
    $req = if ($Required) { 'TRUE' } else { 'FALSE' }
    # A [string] parameter turns $null into '', so test for emptiness rather
    # than for $null — the earlier "-ne $null" guard always passed and wrote
    # Min='' into the CAML, which SharePoint rejects.
    $range = ''
    if (-not [string]::IsNullOrWhiteSpace($Min)) { $range += " Min='$Min'" }
    if (-not [string]::IsNullOrWhiteSpace($Max)) { $range += " Max='$Max'" }
    $pct = if ($Percentage) { "TRUE" } else { "FALSE" }
    "<Field Type='Number' Name='$Name' StaticName='$Name' DisplayName='$Display' Decimals='$Decimals' Percentage='$pct' Required='$req'$range Description='$Description' />"
}

function New-CurrencyFieldXml {
    param([string] $Name, [string] $Display, [string] $Description = '')
    "<Field Type='Currency' Name='$Name' StaticName='$Name' DisplayName='$Display' Decimals='2' LCID='1033' Description='$Description' />"
}

function New-ChoiceFieldXml {
    param([string] $Name, [string] $Display, [string[]] $Choices, [string] $Default = '', [switch] $Required, [string] $Description = '')
    $req = if ($Required) { 'TRUE' } else { 'FALSE' }
    $items = ($Choices | ForEach-Object { "      <CHOICE>$([System.Security.SecurityElement]::Escape($_))</CHOICE>" }) -join "`n"
    $def = if ($Default) { "  <Default>$([System.Security.SecurityElement]::Escape($Default))</Default>`n" } else { '' }
    @"
<Field Type='Choice' Name='$Name' StaticName='$Name' DisplayName='$Display' Format='Dropdown' FillInChoice='FALSE' Required='$req' Description='$Description'>
$def  <CHOICES>
$items
  </CHOICES>
</Field>
"@
}

function New-DateFieldXml {
    param([string] $Name, [string] $Display, [ValidateSet('DateOnly', 'DateTime')][string] $Format = 'DateOnly', [string] $Description = '')
    "<Field Type='DateTime' Name='$Name' StaticName='$Name' DisplayName='$Display' Format='$Format' Description='$Description' />"
}

function New-BooleanFieldXml {
    param([string] $Name, [string] $Display, [bool] $Default = $false, [string] $Description = '')
    $d = if ($Default) { '1' } else { '0' }
    "<Field Type='Boolean' Name='$Name' StaticName='$Name' DisplayName='$Display' Description='$Description'><Default>$d</Default></Field>"
}

function New-UserFieldXml {
    param([string] $Name, [string] $Display, [string] $Description = '')
    "<Field Type='User' Name='$Name' StaticName='$Name' DisplayName='$Display' UserSelectionMode='PeopleOnly' Mult='FALSE' Description='$Description' />"
}

function New-UrlFieldXml {
    param([string] $Name, [string] $Display, [string] $Description = '')
    "<Field Type='URL' Name='$Name' StaticName='$Name' DisplayName='$Display' Format='Hyperlink' Description='$Description' />"
}

function Ensure-LookupField {
    param(
        [Parameter(Mandatory)][string] $ListUrl,
        [Parameter(Mandatory)][string] $InternalName,
        [Parameter(Mandatory)][string] $Display,
        [Parameter(Mandatory)][string] $TargetListUrl,
        [string] $TargetField = 'Title',
        [switch] $Required
    )
    $existing = Get-PnPField -List $ListUrl -Identity $InternalName -ErrorAction SilentlyContinue
    if ($null -ne $existing) { Write-Skip "  lookup '$InternalName'"; return }
    Write-Step "  lookup '$InternalName' → $TargetListUrl.$TargetField"
    $target = Get-PnPList -Identity $TargetListUrl
    $req = if ($Required) { 'TRUE' } else { 'FALSE' }
    $xml = "<Field Type='Lookup' Name='$InternalName' StaticName='$InternalName' DisplayName='$Display' List='{$($target.Id)}' ShowField='$TargetField' Required='$req' RelationshipDeleteBehavior='Restrict' />"
    Add-PnPFieldFromXml -List $ListUrl -FieldXml $xml | Out-Null
}

function Ensure-Index {
    param([string] $ListUrl, [string[]] $Fields)
    foreach ($f in $Fields) {
        try {
            $field = Get-PnPField -List $ListUrl -Identity $f -ErrorAction Stop
            if (-not $field.Indexed) {
                Write-Step "  index on '$f'"
                Set-PnPField -List $ListUrl -Identity $f -Values @{ Indexed = $true } | Out-Null
            }
            else { Write-Skip "  index on '$f'" }
        }
        catch { Write-Warning "    could not index '$f' on $ListUrl : $($_.Exception.Message)" }
    }
}

function Ensure-View {
    param([string] $ListUrl, [string] $Title, [string[]] $Fields, [string] $Query = '', [int] $RowLimit = 100)
    $existing = Get-PnPView -List $ListUrl -Identity $Title -ErrorAction SilentlyContinue
    if ($null -ne $existing) { Write-Skip "  view '$Title'"; return }
    Write-Step "  view '$Title'"
    Add-PnPView -List $ListUrl -Title $Title -Fields $Fields -Query $Query -RowLimit $RowLimit | Out-Null
}

function Ensure-Item {
    param([string] $ListUrl, [string] $TitleValue, [hashtable] $Values)
    $found = Get-PnPListItem -List $ListUrl -Query "<View><Query><Where><Eq><FieldRef Name='Title'/><Value Type='Text'>$TitleValue</Value></Eq></Where></Query><RowLimit>1</RowLimit></View>" -ErrorAction SilentlyContinue
    if ($found -and $found.Count -gt 0) { Write-Skip "  seed '$TitleValue'"; return }
    Write-Step "  seed '$TitleValue'"
    Add-PnPListItem -List $ListUrl -Values ($Values + @{ Title = $TitleValue }) | Out-Null
}

# ── Constants ────────────────────────────────────────────────────────────────

$Counties = @(
    'Atoka', 'Bryan', 'Choctaw', 'Coal', 'Haskell', 'Hughes', 'Latimer',
    'Le Flore', 'McCurtain', 'Pittsburg', 'Pushmataha',
    'Johnston', 'Marshall', 'McIntosh', 'Okfuskee', 'Pontotoc', 'Sequoyah', 'Other'
)

# ── Run ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Water Rate Study Tool — SharePoint provisioning" -ForegroundColor White
Write-Host "Site: $SiteUrl" -ForegroundColor White
Write-Host ""

$ctx = Get-PnPContext -ErrorAction SilentlyContinue
if ($null -eq $ctx) {
    throw "Not connected. Run: Connect-PnPOnline -Url $SiteUrl -Interactive"
}

if (-not $PSCmdlet.ShouldProcess($SiteUrl, 'Provision Water Rate Study lists and libraries')) { return }

# ── 1. Water Systems ─────────────────────────────────────────────────────────

Write-Host "Water Systems" -ForegroundColor White
Ensure-List -Title 'Water Systems' -Url 'WaterSystems' -Template GenericList `
    -Description 'Master registry of the public water systems OWRM assists. One item per PWS.' | Out-Null
Set-PnPField -List 'WaterSystems' -Identity 'Title' -Values @{ Title = 'System Name' } | Out-Null

Ensure-Field 'WaterSystems' 'PwsId'            (New-TextFieldXml 'PwsId' 'PWS ID' 20 -Unique -Description 'State SDWIS identifier, format OK0000000.')
Ensure-Field 'WaterSystems' 'County'           (New-ChoiceFieldXml 'County' 'County' $Counties -Required)
Ensure-Field 'WaterSystems' 'SystemType'       (New-ChoiceFieldXml 'SystemType' 'System Type' @('Community', 'Non-Transient Non-Community', 'Transient Non-Community') 'Community')
Ensure-Field 'WaterSystems' 'SourceType'       (New-ChoiceFieldXml 'SourceType' 'Source Type' @('Groundwater', 'Surface Water', 'Purchased / Wholesale', 'Mixed') 'Groundwater')
Ensure-Field 'WaterSystems' 'WaterBodySource'  (New-TextFieldXml 'WaterBodySource' 'Water Body / Source' 255 -Description 'Lake, river, or aquifer the system draws from.')
Ensure-Field 'WaterSystems' 'PopulationServed' (New-NumberFieldXml 'PopulationServed' 'Population Served' 0 '0')
Ensure-Field 'WaterSystems' 'Connections'      (New-NumberFieldXml 'Connections' 'Active Connections' 0 '0')
Ensure-Field 'WaterSystems' 'Address'          (New-TextFieldXml 'Address' 'Address' 255)
Ensure-Field 'WaterSystems' 'Latitude'         (New-NumberFieldXml 'Latitude' 'Latitude' 6 '-90' '90')
Ensure-Field 'WaterSystems' 'Longitude'        (New-NumberFieldXml 'Longitude' 'Longitude' 6 '-180' '180')
Ensure-Field 'WaterSystems' 'CouncilDistrict'  (New-NumberFieldXml 'CouncilDistrict' 'Council District' 0 '1' '12')
Ensure-Field 'WaterSystems' 'PrimaryContact'   (New-TextFieldXml 'PrimaryContact' 'Primary Contact')
Ensure-Field 'WaterSystems' 'ContactEmail'     (New-TextFieldXml 'ContactEmail' 'Contact Email')
Ensure-Field 'WaterSystems' 'ContactPhone'     (New-TextFieldXml 'ContactPhone' 'Contact Phone' 40)
Ensure-Field 'WaterSystems' 'OwrmLead'         (New-UserFieldXml 'OwrmLead' 'OWRM Lead')
Ensure-Field 'WaterSystems' 'MonthlyMhi'       (New-CurrencyFieldXml 'MonthlyMhi' 'Monthly MHI' 'MONTHLY median household income. Census ACS publishes ANNUAL — divide by 12.')
Ensure-Field 'WaterSystems' 'MhiSource'        (New-TextFieldXml 'MhiSource' 'MHI Source' 255 -Description 'e.g. ACS 2019-2023 5-yr, tract 9601.')
Ensure-Field 'WaterSystems' 'LastStudyDate'    (New-DateFieldXml 'LastStudyDate' 'Last Study Date' 'DateOnly' 'Maintained by the save flow.')
Ensure-Field 'WaterSystems' 'LastStudyStatus'  (New-TextFieldXml 'LastStudyStatus' 'Last Study Status' 60 -Description 'Maintained by the save flow.')
Ensure-Field 'WaterSystems' 'IsActive'         (New-BooleanFieldXml 'IsActive' 'Active' $true)
Ensure-Field 'WaterSystems' 'Notes'            (New-NoteFieldXml 'Notes' 'Notes')
Ensure-LookupField 'WaterSystems' 'WholesaleSupplier' 'Wholesale Supplier' 'WaterSystems'

# Validation formulas cannot be set from field XML.
Set-PnPList -Identity 'WaterSystems' -EnableVersioning $true -MajorVersions 50 | Out-Null
try {
    Set-PnPField -List 'WaterSystems' -Identity 'MonthlyMhi' -Values @{
        ValidationFormula = '=OR(ISBLANK([Monthly MHI]),[Monthly MHI]<10000)'
        ValidationMessage = 'Enter MONTHLY household income. Census ACS publishes annual MHI - divide it by 12.'
    } | Out-Null
    Set-PnPField -List 'WaterSystems' -Identity 'PwsId' -Values @{
        ValidationFormula = '=OR(ISBLANK([PWS ID]),AND(LEN([PWS ID])=9,LEFT([PWS ID],2)="OK"))'
        ValidationMessage = 'PWS IDs are OK followed by seven digits, e.g. OK1234567.'
    } | Out-Null
}
catch { Write-Warning "  column validation could not be applied: $($_.Exception.Message)" }

Ensure-Index 'WaterSystems' @('PwsId', 'County', 'Title', 'IsActive')
Ensure-View 'WaterSystems' 'By County' @('Title', 'PwsId', 'County', 'PopulationServed', 'OwrmLead', 'LastStudyDate')
Ensure-View 'WaterSystems' 'Due for Review' @('Title', 'PwsId', 'County', 'LastStudyDate', 'LastStudyStatus', 'OwrmLead') `
    "<Where><And><Eq><FieldRef Name='IsActive'/><Value Type='Boolean'>1</Value></Eq><Leq><FieldRef Name='LastStudyDate'/><Value Type='DateTime'><Today OffsetDays='-1095'/></Value></Leq></And></Where>"
Write-Done 'Water Systems'

# ── 2. Rate Studies ──────────────────────────────────────────────────────────

Write-Host "Rate Studies" -ForegroundColor White
Ensure-List -Title 'Rate Studies' -Url 'RateStudies' -Template GenericList `
    -Description 'One item per rate study: identity, workflow status, and headline metrics projected from the payload.' | Out-Null
Set-PnPField -List 'RateStudies' -Identity 'Title' -Values @{ Title = 'Study Name' } | Out-Null

Ensure-Field 'RateStudies' 'StudyId'         (New-TextFieldXml 'StudyId' 'Study ID' 60 -Required -Unique -Description "The tool's own study GUID. Names the payload file.")
Ensure-LookupField 'RateStudies' 'WaterSystem' 'Water System' 'WaterSystems' -Required
Ensure-Field 'RateStudies' 'StudyYear'       (New-NumberFieldXml 'StudyYear' 'Study Year' 0 '2000' '2100')
Ensure-Field 'RateStudies' 'StudyStatus'     (New-ChoiceFieldXml 'StudyStatus' 'Status' @('Draft', 'In Progress', 'In Review', 'Complete', 'Adopted', 'Superseded') 'Draft' -Required)
Ensure-Field 'RateStudies' 'AssignedTo'      (New-UserFieldXml 'AssignedTo' 'Assigned To')
Ensure-Field 'RateStudies' 'ReviewedBy'      (New-UserFieldXml 'ReviewedBy' 'Reviewed By')
Ensure-Field 'RateStudies' 'EffectiveDate'   (New-DateFieldXml 'EffectiveDate' 'Effective Date')
Ensure-Field 'RateStudies' 'AdoptedDate'     (New-DateFieldXml 'AdoptedDate' 'Board Adopted')
Ensure-LookupField 'RateStudies' 'SupersedesStudy' 'Supersedes' 'RateStudies'

Ensure-Field 'RateStudies' 'PayloadFileName'  (New-TextFieldXml 'PayloadFileName' 'Payload File' 120 -Description 'File name in the Rate Study Data library.')
Ensure-Field 'RateStudies' 'PayloadSavedAt'   (New-DateFieldXml 'PayloadSavedAt' 'Payload Saved' 'DateTime')
Ensure-Field 'RateStudies' 'PayloadSizeBytes' (New-NumberFieldXml 'PayloadSizeBytes' 'Payload Size' 0 '0')
Ensure-Field 'RateStudies' 'AppVersion'       (New-TextFieldXml 'AppVersion' 'Tool Version' 20)

$metricNote = 'Written by the save flow from the study payload. Do not edit by hand.'
Ensure-Field 'RateStudies' 'CurMonthlyRevenue'      (New-CurrencyFieldXml 'CurMonthlyRevenue' 'Revenue - Current (monthly)' $metricNote)
Ensure-Field 'RateStudies' 'PropMonthlyRevenue'     (New-CurrencyFieldXml 'PropMonthlyRevenue' 'Revenue - Proposed (monthly)' $metricNote)
Ensure-Field 'RateStudies' 'CurMonthlyExpenses'     (New-CurrencyFieldXml 'CurMonthlyExpenses' 'Expenses - Current (monthly)' $metricNote)
Ensure-Field 'RateStudies' 'PropMonthlyExpenses'    (New-CurrencyFieldXml 'PropMonthlyExpenses' 'Expenses - Proposed (monthly)' $metricNote)
Ensure-Field 'RateStudies' 'CurOperatingRatio'      (New-NumberFieldXml 'CurOperatingRatio' 'Operating Ratio - Current' 2 -Description $metricNote)
Ensure-Field 'RateStudies' 'PropOperatingRatio'     (New-NumberFieldXml 'PropOperatingRatio' 'Operating Ratio - Proposed' 2 -Description $metricNote)
Ensure-Field 'RateStudies' 'CurAffordabilityIndex'  (New-NumberFieldXml 'CurAffordabilityIndex' 'Affordability - Current' 4 -Percentage -Description $metricNote)
Ensure-Field 'RateStudies' 'PropAffordabilityIndex' (New-NumberFieldXml 'PropAffordabilityIndex' 'Affordability - Proposed' 4 -Percentage -Description $metricNote)
Ensure-Field 'RateStudies' 'PropDscr'               (New-NumberFieldXml 'PropDscr' 'DSCR - Proposed' 2 -Description $metricNote)
Ensure-Field 'RateStudies' 'PropDebtToIncome'       (New-NumberFieldXml 'PropDebtToIncome' 'Debt-to-Income - Proposed' 4 -Percentage -Description $metricNote)
Ensure-Field 'RateStudies' 'PropCostPer1k'          (New-CurrencyFieldXml 'PropCostPer1k' 'Cost per 1,000 gal - Proposed' $metricNote)
Ensure-Field 'RateStudies' 'CurBill5k'              (New-CurrencyFieldXml 'CurBill5k' 'Bill at 5,000 gal - Current' $metricNote)
Ensure-Field 'RateStudies' 'PropBill5k'             (New-CurrencyFieldXml 'PropBill5k' 'Bill at 5,000 gal - Proposed' $metricNote)
Ensure-Field 'RateStudies' 'RateChangePercent'      (New-NumberFieldXml 'RateChangePercent' 'Rate Change' 4 -Percentage -Description $metricNote)
Ensure-Field 'RateStudies' 'PropFy5FundBalance'     (New-CurrencyFieldXml 'PropFy5FundBalance' 'FY5 Fund Balance - Proposed' $metricNote)
Ensure-Field 'RateStudies' 'RevenueBasis'           (New-ChoiceFieldXml 'RevenueBasis' 'Revenue Basis' @('Usage distribution', 'Mixed', 'Class averages') '' -Description $metricNote)
Ensure-Field 'RateStudies' 'BlockingDataIssues'     (New-NumberFieldXml 'BlockingDataIssues' 'Data Issues - Blocking' 0 '0' -Description $metricNote)
Ensure-Field 'RateStudies' 'OpenDataIssues'         (New-NumberFieldXml 'OpenDataIssues' 'Data Issues - Total' 0 '0' -Description $metricNote)

Ensure-Field 'RateStudies' 'ReportUrl'         (New-UrlFieldXml 'ReportUrl' 'Latest Report')
Ensure-Field 'RateStudies' 'ReportGeneratedAt' (New-DateFieldXml 'ReportGeneratedAt' 'Report Generated' 'DateTime')
Ensure-Field 'RateStudies' 'LockedBy'          (New-UserFieldXml 'LockedBy' 'Locked By' 'Soft lock held by the app while a study is open.')
Ensure-Field 'RateStudies' 'LockedAt'          (New-DateFieldXml 'LockedAt' 'Locked At' 'DateTime')

Set-PnPList -Identity 'RateStudies' -EnableVersioning $true -MajorVersions 100 | Out-Null
Ensure-Index 'RateStudies' @('StudyId', 'WaterSystem', 'StudyStatus', 'StudyYear', 'AssignedTo')
Ensure-View 'RateStudies' 'In Review' @('Title', 'WaterSystem', 'StudyYear', 'AssignedTo', 'PropOperatingRatio', 'Modified') `
    "<Where><Eq><FieldRef Name='StudyStatus'/><Value Type='Text'>In Review</Value></Eq></Where>"
Ensure-View 'RateStudies' 'Needs Attention' @('Title', 'WaterSystem', 'StudyStatus', 'BlockingDataIssues', 'OpenDataIssues', 'AssignedTo') `
    "<Where><Gt><FieldRef Name='BlockingDataIssues'/><Value Type='Number'>0</Value></Gt></Where>"
Ensure-View 'RateStudies' 'Below Break-even' @('Title', 'WaterSystem', 'PropOperatingRatio', 'PropMonthlyRevenue', 'PropMonthlyExpenses', 'PropFy5FundBalance') `
    "<Where><Lt><FieldRef Name='PropOperatingRatio'/><Value Type='Number'>1</Value></Lt></Where>"
Write-Done 'Rate Studies'

# ── 3. Rate Study Data (payload library) ─────────────────────────────────────

Write-Host "Rate Study Data" -ForegroundColor White
Ensure-List -Title 'Rate Study Data' -Url 'RateStudyData' -Template DocumentLibrary `
    -Description 'Study payloads, one JSON file per study. Version history is the audit trail - do not disable versioning.' | Out-Null
Ensure-Field 'RateStudyData' 'StudyId'    (New-TextFieldXml 'StudyId' 'Study ID' 60)
Ensure-LookupField 'RateStudyData' 'WaterSystem' 'Water System' 'WaterSystems'
Ensure-Field 'RateStudyData' 'SavedAt'    (New-DateFieldXml 'SavedAt' 'Saved At' 'DateTime')
Ensure-Field 'RateStudyData' 'AppVersion' (New-TextFieldXml 'AppVersion' 'Tool Version' 20)
Set-PnPList -Identity 'RateStudyData' -EnableVersioning $true -MajorVersions 500 -NoCrawl $true | Out-Null
Ensure-Index 'RateStudyData' @('StudyId')
Write-Done 'Rate Study Data'

# ── 4. Rate Study Reports ────────────────────────────────────────────────────

Write-Host "Rate Study Reports" -ForegroundColor White
Ensure-List -Title 'Rate Study Reports' -Url 'RateStudyReports' -Template DocumentLibrary `
    -Description 'Generated board deliverables: PDF and Word reports, rate-table CSVs, study backups.' | Out-Null
Ensure-Field 'RateStudyReports' 'StudyId'            (New-TextFieldXml 'StudyId' 'Study ID' 60)
Ensure-LookupField 'RateStudyReports' 'WaterSystem' 'Water System' 'WaterSystems'
Ensure-Field 'RateStudyReports' 'StudyYear'          (New-NumberFieldXml 'StudyYear' 'Study Year' 0)
Ensure-Field 'RateStudyReports' 'ReportType'         (New-ChoiceFieldXml 'ReportType' 'Report Type' @('Board Report (PDF)', 'Board Report (Word)', 'Rate Table (CSV)', 'Study Backup (JSON)', 'Other'))
Ensure-Field 'RateStudyReports' 'StatusAtGeneration' (New-TextFieldXml 'StatusAtGeneration' 'Status At Generation' 60)
Ensure-Field 'RateStudyReports' 'GeneratedBy'        (New-UserFieldXml 'GeneratedBy' 'Generated By')
Ensure-Field 'RateStudyReports' 'GeneratedAt'        (New-DateFieldXml 'GeneratedAt' 'Generated At' 'DateTime')
Ensure-Field 'RateStudyReports' 'IsSuperseded'       (New-BooleanFieldXml 'IsSuperseded' 'Superseded' $false)
Set-PnPList -Identity 'RateStudyReports' -EnableVersioning $true -MajorVersions 20 | Out-Null
Ensure-Index 'RateStudyReports' @('StudyId', 'WaterSystem')
Ensure-View 'RateStudyReports' 'Current Reports' @('DocIcon', 'LinkFilename', 'WaterSystem', 'ReportType', 'GeneratedAt', 'GeneratedBy') `
    "<Where><Neq><FieldRef Name='IsSuperseded'/><Value Type='Boolean'>1</Value></Neq></Where>"
Write-Done 'Rate Study Reports'

# ── 5. System Source Documents ───────────────────────────────────────────────

Write-Host "System Source Documents" -ForegroundColor White
Ensure-List -Title 'System Source Documents' -Url 'SystemSourceDocuments' -Template DocumentLibrary `
    -Description 'Evidence behind the studies: billing registers, budgets, audits, ordinances. Restricted - break inheritance per the back-end doc.' | Out-Null
Ensure-LookupField 'SystemSourceDocuments' 'WaterSystem' 'Water System' 'WaterSystems' -Required
Ensure-Field 'SystemSourceDocuments' 'DocumentType'  (New-ChoiceFieldXml 'DocumentType' 'Document Type' @('Billing Register', 'Operating Budget', 'Audit / Financial Statement', 'Rate Ordinance / Resolution', 'Engineering Report', 'Meter Reading Report', 'Loan Document', 'Correspondence', 'Other') '' -Required)
Ensure-Field 'SystemSourceDocuments' 'FiscalYear'    (New-NumberFieldXml 'FiscalYear' 'Fiscal Year' 0 '2000' '2100')
Ensure-Field 'SystemSourceDocuments' 'PeriodCovered' (New-TextFieldXml 'PeriodCovered' 'Period Covered' 100)
Ensure-Field 'SystemSourceDocuments' 'ReceivedDate'  (New-DateFieldXml 'ReceivedDate' 'Received Date')
Ensure-Field 'SystemSourceDocuments' 'ProvidedBy'    (New-TextFieldXml 'ProvidedBy' 'Provided By')
Ensure-Field 'SystemSourceDocuments' 'Sensitivity'   (New-ChoiceFieldXml 'Sensitivity' 'Sensitivity' @('Internal', 'Restricted') 'Internal')
Ensure-Field 'SystemSourceDocuments' 'Notes'         (New-NoteFieldXml 'Notes' 'Notes' 4)
Set-PnPList -Identity 'SystemSourceDocuments' -EnableVersioning $true -MajorVersions 20 -NoCrawl $true | Out-Null
Ensure-Index 'SystemSourceDocuments' @('WaterSystem', 'DocumentType')
Write-Done 'System Source Documents'

# ── 6. Benchmarks ────────────────────────────────────────────────────────────

Write-Host "Rate Study Benchmarks" -ForegroundColor White
Ensure-List -Title 'Rate Study Benchmarks' -Url 'RateStudyBenchmarks' -Template GenericList `
    -Description 'Scorecard thresholds as data, so a policy change is an edit rather than a release.' | Out-Null
Set-PnPField -List 'RateStudyBenchmarks' -Identity 'Title' -Values @{ Title = 'Key' } | Out-Null
Ensure-Field 'RateStudyBenchmarks' 'BenchmarkValue' (New-NumberFieldXml 'BenchmarkValue' 'Value' 4 -Required)
Ensure-Field 'RateStudyBenchmarks' 'DisplayLabel'   (New-TextFieldXml 'DisplayLabel' 'Display Label')
Ensure-Field 'RateStudyBenchmarks' 'AppliesTo'      (New-ChoiceFieldXml 'AppliesTo' 'Applies To' @('Operating Ratio', 'Affordability', 'Debt Service', 'Debt to Income', 'Base Coverage', 'Fund Balance', 'Forecast'))
Ensure-Field 'RateStudyBenchmarks' 'EffectiveFrom'  (New-DateFieldXml 'EffectiveFrom' 'Effective From')
Ensure-Field 'RateStudyBenchmarks' 'SourceRef'      (New-TextFieldXml 'SourceRef' 'Source' 255)
Ensure-Field 'RateStudyBenchmarks' 'Notes'          (New-NoteFieldXml 'Notes' 'Notes' 4)
Ensure-Index 'RateStudyBenchmarks' @('Title')
Write-Done 'Rate Study Benchmarks'

# ── 7. App Configuration ─────────────────────────────────────────────────────

Write-Host "App Configuration" -ForegroundColor White
Ensure-List -Title 'App Configuration' -Url 'AppConfiguration' -Template GenericList `
    -Description 'Key/value settings for the canvas app so behaviour can change without republishing.' | Out-Null
Set-PnPField -List 'AppConfiguration' -Identity 'Title' -Values @{ Title = 'Key' } | Out-Null
Ensure-Field 'AppConfiguration' 'ConfigValue'    (New-NoteFieldXml 'ConfigValue' 'Value' 4)
Ensure-Field 'AppConfiguration' 'Description'    (New-TextFieldXml 'Description' 'Description' 255)
Ensure-Field 'AppConfiguration' 'EnvironmentTag' (New-ChoiceFieldXml 'EnvironmentTag' 'Environment' @('All', 'Dev', 'Test', 'Prod') 'All')
Ensure-Index 'AppConfiguration' @('Title')
Write-Done 'App Configuration'

# ── 8. Activity log ──────────────────────────────────────────────────────────

Write-Host "Rate Study Activity" -ForegroundColor White
Ensure-List -Title 'Rate Study Activity' -Url 'RateStudyActivity' -Template GenericList `
    -Description 'Append-only audit log written by the flows. Grant Analysts an Add-only permission level.' | Out-Null
Set-PnPField -List 'RateStudyActivity' -Identity 'Title' -Values @{ Title = 'Action' } | Out-Null
Ensure-Field 'RateStudyActivity' 'StudyId'    (New-TextFieldXml 'StudyId' 'Study ID' 60)
Ensure-LookupField 'RateStudyActivity' 'WaterSystem' 'Water System' 'WaterSystems'
Ensure-Field 'RateStudyActivity' 'ActionType' (New-ChoiceFieldXml 'ActionType' 'Action Type' @('Created', 'Saved', 'Status Changed', 'Report Generated', 'Analysis Requested', 'Exported', 'Deleted', 'Locked', 'Unlocked'))
Ensure-Field 'RateStudyActivity' 'Actor'      (New-UserFieldXml 'Actor' 'Actor')
Ensure-Field 'RateStudyActivity' 'ActionAt'   (New-DateFieldXml 'ActionAt' 'At' 'DateTime')
Ensure-Field 'RateStudyActivity' 'Detail'     (New-NoteFieldXml 'Detail' 'Detail' 4)
Ensure-Index 'RateStudyActivity' @('StudyId', 'ActionType', 'ActionAt')
Write-Done 'Rate Study Activity'

# ── 9. AI analysis requests ──────────────────────────────────────────────────

Write-Host "AI Analysis Requests" -ForegroundColor White
Ensure-List -Title 'AI Analysis Requests' -Url 'AiAnalysisRequests' -Template GenericList `
    -Description 'Correlation store and audit trail for analysis requests. Contains system financial data in prompt form - restrict access.' | Out-Null
Set-PnPField -List 'AiAnalysisRequests' -Identity 'Title' -Values @{ Title = 'Request ID' } | Out-Null
Ensure-Field 'AiAnalysisRequests' 'StudyId'          (New-TextFieldXml 'StudyId' 'Study ID' 60)
Ensure-Field 'AiAnalysisRequests' 'RequestedBy'      (New-UserFieldXml 'RequestedBy' 'Requested By')
Ensure-Field 'AiAnalysisRequests' 'RequestedAt'      (New-DateFieldXml 'RequestedAt' 'Requested At' 'DateTime')
Ensure-Field 'AiAnalysisRequests' 'ModelId'          (New-TextFieldXml 'ModelId' 'Model' 120)
Ensure-Field 'AiAnalysisRequests' 'RequestStatus'    (New-ChoiceFieldXml 'RequestStatus' 'Status' @('Pending', 'Complete', 'Failed') 'Pending')
Ensure-Field 'AiAnalysisRequests' 'ResponseText'     (New-NoteFieldXml 'ResponseText' 'Response' 12 'Truncate at 63,000 characters in the flow - the column ceiling is 63,999.')
Ensure-Field 'AiAnalysisRequests' 'ErrorText'        (New-TextFieldXml 'ErrorText' 'Error' 255)
Ensure-Field 'AiAnalysisRequests' 'PromptTokens'     (New-NumberFieldXml 'PromptTokens' 'Prompt Tokens' 0 '0')
Ensure-Field 'AiAnalysisRequests' 'CompletionTokens' (New-NumberFieldXml 'CompletionTokens' 'Completion Tokens' 0 '0')
Ensure-Index 'AiAnalysisRequests' @('Title', 'StudyId')
Write-Done 'AI Analysis Requests'

# ── 10. Seed data ────────────────────────────────────────────────────────────

if (-not $SkipSeedData) {
    Write-Host "Seed data" -ForegroundColor White
    $benchmarks = @(
        @{ Key = 'OperatingRatio.Healthy';            Value = 1.25;   Label = 'Operating ratio at or above 1.25';                       Applies = 'Operating Ratio'; Source = 'Industry practice; CNO rate study format' }
        @{ Key = 'OperatingRatio.BreakEven';          Value = 1.00;   Label = 'Break-even';                                             Applies = 'Operating Ratio'; Source = '' }
        @{ Key = 'Affordability.EpaAffordable';       Value = 0.0200; Label = 'Under 2.00% of monthly MHI';                             Applies = 'Affordability';   Source = 'EPA affordability guidance' }
        @{ Key = 'Affordability.UsdaGrantThreshold';  Value = 0.0150; Label = 'Above 1.50% of MHI supports a USDA RD grant case';       Applies = 'Affordability';   Source = 'USDA RD Instruction 1780' }
        @{ Key = 'Dscr.Covenant';                     Value = 1.15;   Label = 'Debt service coverage at or above 1.15';                 Applies = 'Debt Service';    Source = 'USDA RD / OWRB covenants, typically 1.10-1.25' }
        @{ Key = 'DebtToIncome.Max';                  Value = 0.4500; Label = 'Debt payments under 45% of revenue';                     Applies = 'Debt to Income';  Source = 'Industry practice' }
        @{ Key = 'BaseCoverage.Target';               Value = 1.0000; Label = 'Base charges alone cover expenses';                      Applies = 'Base Coverage';   Source = '' }
        @{ Key = 'FundBalance.MonthsOfOandM';         Value = 3;      Label = 'Operating reserve of three months O&M';                  Applies = 'Fund Balance';    Source = 'Industry practice' }
        @{ Key = 'Forecast.DefaultInflation';         Value = 0.0300; Label = '3% annual inflation on operating expenses';              Applies = 'Forecast';        Source = '' }
    )
    foreach ($b in $benchmarks) {
        Ensure-Item 'RateStudyBenchmarks' $b.Key @{
            BenchmarkValue = $b.Value
            DisplayLabel   = $b.Label
            AppliesTo      = $b.Applies
            SourceRef      = $b.Source
            EffectiveFrom  = (Get-Date)
        }
    }

    $config = @(
        @{ Key = 'Ai.Enabled';        Value = 'false'; Desc = 'Set to true once the WRS - Request Analysis flow is built and connected.' }
        @{ Key = 'Ai.FlowNotice';     Value = 'Analysis is not enabled in this environment. Contact the OWRM data owner.'; Desc = 'Shown when a user requests an analysis and Ai.Enabled is false.' }
        @{ Key = 'Support.Contact';   Value = '';      Desc = 'Email address shown in the app footer for help.' }
        @{ Key = 'Banner.Message';    Value = '';      Desc = 'Optional banner across the top of the app. Blank hides it.' }
        @{ Key = 'Banner.Severity';   Value = 'info';  Desc = 'info | warning | error' }
        @{ Key = 'Study.LockMinutes'; Value = '240';   Desc = 'How long a soft lock on a study is honoured before it is treated as stale.' }
    )
    foreach ($c in $config) {
        Ensure-Item 'AppConfiguration' $c.Key @{ ConfigValue = $c.Value; Description = $c.Desc; EnvironmentTag = 'All' }
    }
    Write-Done 'Seed data'
}

Write-Host ""
Write-Host "Structure provisioned." -ForegroundColor Green
Write-Host "Still to do by hand (see docs/SHAREPOINT-BACKEND.md):" -ForegroundColor Yellow
Write-Host "  1. Sections 6.1-6.2 - groups, the Add-only permission level, broken inheritance"
Write-Host "  2. Section 5        - the six Power Automate flows"
Write-Host "  3. Section 2        - confirm external sharing is off"
Write-Host "  4. POWER-APPS-INTEGRATION.md - wire the canvas app to the component"
Write-Host ""
