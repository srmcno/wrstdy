<#
.SYNOPSIS
    Offline dry run of provision-sharepoint.ps1 — no tenant required.

.DESCRIPTION
    Replaces every PnP cmdlet with a recording stub and runs the real
    provisioning script end to end, so each field definition it ships is
    generated with its real arguments and checked:

      * the CAML parses as XML (an unescaped apostrophe in a description is
        malformed, and that is not hypothetical — StudyId's description
        contains one)
      * Name and StaticName agree, so the internal name is what the flows
        and the integration doc reference, never a mangled "Study_x0020_ID"
      * no empty Min/Max attribute, which SharePoint rejects
      * every list an index, view, or lookup targets was actually created
      * every lookup resolves to a list this script creates

    This is the only automated check the provisioning script can have — it
    talks to a live tenant otherwise. Run it after editing that script.

.EXAMPLE
    pwsh -File docs/provision-sharepoint.Tests.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
# Recorders live in the global scope: the stubs below are called from inside
# provision-sharepoint.ps1, which runs in its own script scope.
$global:fail = 0
$global:fields = 0
$global:lists = @{}          # url -> created list object
$global:fieldsByList = @{}   # url -> @{ internalName = $true }
$global:lookups = @()        # @{ list; name; target }
$global:viewTargets = @()

function Fail([string] $msg) { Write-Host "  x $msg" -ForegroundColor Red; $global:fail++ }

# ── PnP stubs ───────────────────────────────────────────────────────────────
function Get-PnPContext { [PSCustomObject]@{ Url = 'https://stub' } }

function Get-PnPList {
    [CmdletBinding()] param([Parameter(ValueFromPipeline)] $Identity)
    if ($Identity -is [string]) { return $global:lists[$Identity] }
    return $Identity
}
function New-PnPList {
    [CmdletBinding()] param([string] $Title, [string] $Url, [string] $Template)
    if ($global:lists.ContainsKey($Url)) { Fail "list '$Url' created twice" }
    $global:lists[$Url] = [PSCustomObject]@{ Title = $Title; Url = $Url; Id = [guid]::NewGuid() }
    $global:fieldsByList[$Url] = @{}
}
function Set-PnPList { [CmdletBinding()] param($Identity, $Description, $EnableVersioning, $MajorVersions, $NoCrawl) }

function Get-PnPField {
    [CmdletBinding()] param([string] $List, [string] $Identity)
    if (-not $global:fieldsByList.ContainsKey($List)) { return $null }
    if ($global:fieldsByList[$List].ContainsKey($Identity)) {
        return [PSCustomObject]@{ InternalName = $Identity; Indexed = $true }
    }
    # 'Title' exists on every list from the moment it is created.
    if ($Identity -eq 'Title') { return [PSCustomObject]@{ InternalName = 'Title'; Indexed = $true } }
    return $null
}
function Set-PnPField { [CmdletBinding()] param([string] $List, [string] $Identity, [hashtable] $Values) }

function Add-PnPFieldFromXml {
    [CmdletBinding()] param([string] $List, [string] $FieldXml)
    $global:fields++
    if (-not $global:lists.ContainsKey($List)) { Fail "field added to list '$List' before it was created" ; return }
    $doc = $null
    try { $doc = [xml]$FieldXml }
    catch { Fail "malformed CAML on '$List': $($_.Exception.Message)`n      $FieldXml"; return }
    $f = $doc.Field
    if (-not $f.Name)                    { Fail "field on '$List' has no Name" }
    if ($f.Name -ne $f.StaticName)       { Fail "Name/StaticName mismatch on '$List'.$($f.Name)" }
    if (-not $f.DisplayName)             { Fail "'$List'.$($f.Name) has no DisplayName" }
    if ($FieldXml -match "M(in|ax)=''")  { Fail "'$List'.$($f.Name) has an empty Min/Max attribute" }
    if ($f.Type -eq 'Lookup') {
        $global:lookups += @{ list = $List; name = $f.Name; target = $f.List }
        if (-not $f.ShowField)           { Fail "lookup '$List'.$($f.Name) has no ShowField" }
    }
    $global:fieldsByList[$List][$f.Name] = $true
}

function Get-PnPView { [CmdletBinding()] param([string] $List, [string] $Identity) $null }
function Add-PnPView {
    [CmdletBinding()] param([string] $List, [string] $Title, [string[]] $Fields, [string] $Query, [int] $RowLimit)
    $global:viewTargets += @{ list = $List; title = $Title; fields = $Fields; query = $Query }
    if ($Query) { try { [xml]"<Q>$Query</Q>" | Out-Null } catch { Fail "view '$List'/'$Title' has malformed CAML query" } }
}

function Get-PnPListItem { [CmdletBinding()] param([string] $List, [string] $Query) @() }
function Add-PnPListItem {
    [CmdletBinding()] param([string] $List, [hashtable] $Values)
    if (-not $global:lists.ContainsKey($List)) { Fail "seed item written to '$List' before it was created" }
}

# ── Run the real script against the stubs ───────────────────────────────────
Write-Host "Dry run of provision-sharepoint.ps1`n"
$script = Join-Path $PSScriptRoot 'provision-sharepoint.ps1'
& $script -SiteUrl 'https://stub.sharepoint.com/sites/OWRM-RateStudies' 6>$null | Out-Null

# ── Cross-checks ────────────────────────────────────────────────────────────
Write-Host ''
foreach ($l in $global:lookups) {
    $target = $global:lists.Values | Where-Object { "{$($_.Id)}" -eq $l.target }
    if (-not $target) { Fail "lookup '$($l.list)'.$($l.name) points at a list this script never creates" }
}
foreach ($v in $global:viewTargets) {
    foreach ($f in $v.fields) {
        $builtIn = @('Title','Modified','Created','DocIcon','LinkFilename','Editor','Author','ID')
        if ($builtIn -contains $f) { continue }
        if (-not $global:fieldsByList[$v.list].ContainsKey($f)) {
            Fail "view '$($v.list)'/'$($v.title)' references a column '$f' that is never created"
        }
    }
}

$expected = @('WaterSystems','RateStudies','RateStudyData','RateStudyReports','SystemSourceDocuments',
              'RateStudyBenchmarks','AppConfiguration','RateStudyActivity','AiAnalysisRequests')
foreach ($e in $expected) { if (-not $global:lists.ContainsKey($e)) { Fail "documented list '$e' is never created" } }

Write-Host ("Lists created : {0}" -f $global:lists.Count)
Write-Host ("Fields defined: {0}" -f $global:fields)
Write-Host ("Lookups       : {0}" -f $global:lookups.Count)
Write-Host ("Views         : {0}" -f $global:viewTargets.Count)
Write-Host ''
if ($global:fail) { Write-Host "$($global:fail) problem(s) found" -ForegroundColor Red; exit 1 }
Write-Host 'Provisioning script verified.' -ForegroundColor Green
