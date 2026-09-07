#Requires -Version 5.1
<#
Creates/extends the WRS solution without elevated Windows privileges.
Run against a DEVELOPMENT environment first. Requires existing Dataverse
customization and import privileges. Does not change tenant settings or roles.
If no token is supplied, signs in through Az.Accounts installed for CurrentUser.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][uri]$EnvironmentUrl,
    [string]$TenantId,
    [Security.SecureString]$AccessToken,
    [string]$SchemaPath = (Join-Path $PSScriptRoot 'dataverse-schema.json'),
    [string]$ComponentSolution,
    [string]$ExportDirectory = (Join-Path $PSScriptRoot 'exported'),
    [guid]$ExportReportId = [guid]::Empty,
    [string]$ReportDirectory = (Join-Path $PSScriptRoot 'reports'),
    [switch]$CheckOnly,
    [switch]$SkipExport
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
if ($EnvironmentUrl.Scheme -ne 'https' -or $EnvironmentUrl.AbsolutePath -ne '/' -or $EnvironmentUrl.Query -or $EnvironmentUrl.UserInfo) {
    throw 'EnvironmentUrl must be the HTTPS environment origin, for example https://yourorg.crm.dynamics.com'
}
$origin = $EnvironmentUrl.GetLeftPart([UriPartial]::Authority).TrimEnd('/')
$api = $origin + '/api/data/v9.2/'
$schema = Get-Content -LiteralPath $SchemaPath -Raw | ConvertFrom-Json
if (-not $AccessToken) {
    if (-not $TenantId) { throw 'Supply -TenantId for interactive sign-in, or -AccessToken as a SecureString.' }
    if (-not (Get-Module -ListAvailable Az.Accounts)) {
        Install-Module Az.Accounts -Scope CurrentUser -Repository PSGallery -Force -AllowClobber
    }
    Import-Module Az.Accounts
    Disable-AzContextAutosave -Scope Process | Out-Null
    Connect-AzAccount -Tenant $TenantId -UseDeviceAuthentication -SkipContextPopulation | Out-Null
    $tokenResult = Get-AzAccessToken -ResourceUrl $origin -TenantId $TenantId
    if ($tokenResult.Token -is [Security.SecureString]) { $AccessToken = $tokenResult.Token }
    else { $AccessToken = ConvertTo-SecureString $tokenResult.Token -AsPlainText -Force }
}
function Invoke-WrsApi {
    param([string]$Method, [string]$Path, $Body = $null)
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($AccessToken)
    try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    $headers = @{Authorization=('Bearer ' + $plain); Accept='application/json'; 'OData-MaxVersion'='4.0'; 'OData-Version'='4.0'}
    $plain = $null
    $requestParams = @{Method=$Method; Uri=($api + $Path); Headers=$headers; ContentType='application/json; charset=utf-8'; TimeoutSec=600}
    if ($null -ne $Body) { $requestParams.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 60 -Compress)) }
    try { Invoke-RestMethod @requestParams }
    catch {
        $detail = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail += '. ' + $_.ErrorDetails.Message }
        throw "Dataverse $Method $Path failed: $detail"
    }
    finally { $headers.Clear() }
}
function Label([string]$Text) { return @{LocalizedLabels=@(@{Label=$Text; LanguageCode=1033})} }
function Attribute($Column) {
    $a = @{'@odata.type'=('Microsoft.Dynamics.CRM.' + $Column.type + 'AttributeMetadata'); SchemaName=$Column.name; DisplayName=(Label $Column.label); RequiredLevel=@{Value='None'}; IsAuditEnabled=@{Value=$true}}
    if ($Column.type -eq 'String' -or $Column.type -eq 'Memo') { $a.MaxLength = $Column.maxLength; $a.Format = 'Text' }
    if ($Column.type -eq 'Integer') { $a.MinValue = 0; $a.MaxValue = 2147483647; $a.Format='None' }
    return $a
}
function TableDefinition([string]$Name) {
    $r = Invoke-WrsApi GET ('EntityDefinitions?$select=MetadataId,LogicalName,OwnershipType&$filter=LogicalName eq ''' + $Name + '''')
    return @($r.value) | Select-Object -First 1
}
$who = Invoke-WrsApi GET 'WhoAmI'
Write-Host "Connected to $origin as Dataverse user $($who.UserId)."
# Read-only report retrieval uses the same user sign-in and never provisions schema.
if ($ExportReportId -ne [guid]::Empty) {
    $reportMetadata = Invoke-WrsApi GET "EntityDefinitions(LogicalName='cnowrm_wrsreport')?`$select=EntitySetName"
    $report = Invoke-WrsApi GET ($reportMetadata.EntitySetName + '(' + $ExportReportId.ToString() + ')?$select=cnowrm_filename,cnowrm_contentbase64,cnowrm_sizebytes')
    $fileName = [IO.Path]::GetFileName($report.cnowrm_filename)
    if (-not $fileName -or $fileName.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0) { throw 'The report filename is invalid.' }
    $bytes = [Convert]::FromBase64String($report.cnowrm_contentbase64)
    if ($bytes.Length -ne $report.cnowrm_sizebytes) { throw 'The stored report byte count does not match its content.' }
    New-Item -ItemType Directory -Path $ReportDirectory -Force | Out-Null
    $reportPath = Join-Path $ReportDirectory $fileName
    if (Test-Path -LiteralPath $reportPath) { throw "File already exists: $reportPath. Use a different -ReportDirectory." }
    [IO.File]::WriteAllBytes($reportPath, $bytes)
    Write-Host "Downloaded $reportPath"
    return
}
Write-Host 'Tables: WRS Water Systems, WRS Rate Studies, WRS Study Revisions, WRS Generated Reports.'
if ($CheckOnly) {
    foreach ($t in $schema.tables) {
        $exists = TableDefinition $t.name
        Write-Host ("{0}: {1}" -f $t.name, $(if ($exists) {'exists'} else {'will create'}))
    }
    Write-Host 'Connectivity checked. No schema changed. This does not prove import/customization privileges.'
    return
}
$solutions = Invoke-WrsApi GET ('solutions?$select=solutionid,ismanaged,version&$filter=uniquename eq ''' + $schema.solution + '''')
if (@($solutions.value).Count -gt 0 -and $solutions.value[0].ismanaged) { throw 'This is a managed installation. Run provisioning in an unmanaged development environment and export a new version.' }
if ($ComponentSolution) {
    $file = (Resolve-Path -LiteralPath $ComponentSolution).Path
    $jobId = [guid]::NewGuid().ToString()
    Write-Host "Importing component solution. Import job: $jobId"
    Invoke-WrsApi POST 'ImportSolution' @{CustomizationFile=[Convert]::ToBase64String([IO.File]::ReadAllBytes($file)); ImportJobId=$jobId; PublishWorkflows=$false; OverwriteUnmanagedCustomizations=$false} | Out-Null
}
$solutions = Invoke-WrsApi GET ('solutions?$select=solutionid,ismanaged,version&$filter=uniquename eq ''' + $schema.solution + '''')
if (@($solutions.value).Count -eq 0) {
    $pubs = Invoke-WrsApi GET ('publishers?$select=publisherid,customizationprefix&$filter=uniquename eq ''' + $schema.publisher + '''')
    if (@($pubs.value).Count -eq 0) {
        Invoke-WrsApi POST 'publishers' @{uniquename=$schema.publisher; friendlyname='Choctaw Nation Office of Water Resource Management'; customizationprefix=$schema.prefix; customizationoptionvalueprefix=29141} | Out-Null
        $pubs = Invoke-WrsApi GET ('publishers?$select=publisherid,customizationprefix&$filter=uniquename eq ''' + $schema.publisher + '''')
    }
    if ($pubs.value[0].customizationprefix -ne $schema.prefix) { throw 'Existing publisher has a different prefix. Resolve the publisher mismatch before retrying.' }
    Invoke-WrsApi POST 'solutions' @{uniquename=$schema.solution; friendlyname='Choctaw Nation Water Rate Study'; version=$schema.version; 'publisherid@odata.bind'=('publishers(' + $pubs.value[0].publisherid + ')')} | Out-Null
}
$currentSolutions = Invoke-WrsApi GET ('solutions?$select=solutionid,version&$filter=uniquename eq ''{0}''' -f $schema.solution)
$currentSolution = $currentSolutions.value[0]
if ([version]$currentSolution.version -gt [version]$schema.version) { throw 'The environment solution is newer than this installer. Use its matching deployment package.' }
if ($currentSolution.version -ne $schema.version) {
    Invoke-WrsApi PATCH ('solutions(' + $currentSolution.solutionid + ')') @{version=$schema.version} | Out-Null
}
foreach ($table in $schema.tables) {
    $definition = TableDefinition $table.name
    if (-not $definition) {
        Write-Host "Creating $($table.name)..."
        $primary = @{name='cnowrm_name'; label='Name'; type='String'; maxLength=200}
        $primaryAttribute = Attribute $primary
        $primaryAttribute.IsPrimaryName = $true
        $primaryAttribute.RequiredLevel = @{Value='ApplicationRequired'}
        Invoke-WrsApi POST 'EntityDefinitions' @{'@odata.type'='Microsoft.Dynamics.CRM.EntityMetadata'; SchemaName=$table.name; DisplayName=(Label $table.label); DisplayCollectionName=(Label $table.plural); Description=(Label 'CNO internal water rate study records.'); OwnershipType='UserOwned'; HasActivities=$false; HasNotes=$false; IsActivity=$false; IsAuditEnabled=@{Value=$true}; Attributes=@($primaryAttribute)} | Out-Null
        $definition = TableDefinition $table.name
    }
    if ($definition.OwnershipType -ne 'UserOwned') { throw "Existing table $($table.name) has incompatible ownership. No destructive migration attempted." }
    $entityPath = "EntityDefinitions(LogicalName='$($table.name)')"
    $existing = Invoke-WrsApi GET ($entityPath + '/Attributes?$select=LogicalName,AttributeType')
    foreach ($column in $table.columns) {
        $found = @($existing.value | Where-Object { $_.LogicalName -eq $column.name })
        if ($found.Count -gt 0) {
            if ($found[0].AttributeType -ne $column.type) { throw "Column $($column.name) has an incompatible type." }
            continue
        }
        Write-Host "  Adding $($column.name)"
        Invoke-WrsApi POST ($entityPath + '/Attributes') (Attribute $column) | Out-Null
    }
    if ($table.PSObject.Properties.Name -contains 'lookup') {
        $l = $table.lookup
        if (-not @($existing.value | Where-Object { $_.LogicalName -eq $l.name }).Count) {
            Invoke-WrsApi POST 'RelationshipDefinitions' @{
                '@odata.type'='Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata'
                SchemaName=($table.name + '_' + $l.name)
                ReferencedEntity=$l.target; ReferencedAttribute=($l.target + 'id'); ReferencingEntity=$table.name
                Lookup=@{'@odata.type'='Microsoft.Dynamics.CRM.LookupAttributeMetadata'; SchemaName=$l.name; DisplayName=(Label $l.label); RequiredLevel=@{Value='ApplicationRequired'}}
                CascadeConfiguration=@{Assign='NoCascade'; Delete='Restrict'; Merge='NoCascade'; Reparent='NoCascade'; Share='NoCascade'; Unshare='NoCascade'; RollupView='NoCascade'}
            } | Out-Null
        }
    }
    Invoke-WrsApi POST 'AddSolutionComponent' @{ComponentId=$definition.MetadataId; ComponentType=1; SolutionUniqueName=$schema.solution; AddRequiredComponents=$false; DoNotIncludeSubcomponents=$false} | Out-Null
}
$entityXml = ($schema.tables | ForEach-Object { '<entity>' + $_.name + '</entity>' }) -join ''
Invoke-WrsApi POST 'PublishXml' @{ParameterXml=('<importexportxml><entities>' + $entityXml + '</entities></importexportxml>')} | Out-Null
Write-Host 'Schema provisioned. Assign table privileges to the existing CNO maker/analyst/reviewer roles before sharing the app.'
if (-not $SkipExport) {
    New-Item -ItemType Directory -Path $ExportDirectory -Force | Out-Null
    foreach ($managed in @($false,$true)) {
        $suffix = if ($managed) {'managed'} else {'unmanaged'}
        $export = Invoke-WrsApi POST 'ExportSolution' @{SolutionName=$schema.solution; Managed=$managed}
        $output = Join-Path $ExportDirectory ("CNO-WaterRateStudy-2.3.0-$suffix.zip")
        [IO.File]::WriteAllBytes($output,[Convert]::FromBase64String($export.ExportSolutionFile))
        Write-Host "Exported $output"
    }
}
Write-Host 'Provisioning complete. Follow DATAVERSE-TEAMS.md to bind the code component in your canvas app.'
