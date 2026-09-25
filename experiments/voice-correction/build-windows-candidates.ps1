[CmdletBinding()]
param(
    [string]$SourceRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MeeWav\AudioCandidateSources'),
    [string]$BuildRoot = (Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MeeWav\AudioCandidateBuilds'),
    [ValidateSet('All', 'QPitch', 'OpenVoxTuner', 'Silvertune')]
    [string[]]$Candidate = @('All'),
    [switch]$IncludeKnownFailingMusicAI,
    [string]$CMakeGenerator = 'Visual Studio 18 2026'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pins = [ordered]@{
    QPitch = [ordered]@{
        Directory = 'qpitch'
        Repository = 'https://github.com/Skynse/qpitch.git'
        Ref = 'v1.3.1'
        Commit = 'a0a95f103d2715650462344c1be3dfad4e2e9290'
        JuceRef = '8.0.8'
        JuceCommit = 'd6181bde38d858c283c3b7bf699ce6340c050b5d'
        ClapJuceExtensionsCommit = 'c1a5ad025f95d01e03267857fa8276ebeed16500'
    }
    OpenVoxTuner = [ordered]@{
        Directory = 'OpenVoxTuner'
        Repository = 'https://github.com/EiffelBS/OpenVoxTuner.git'
        Ref = 'v0.1.67'
        Commit = '5570e8a6bf8e686c33c7971563c3d757f9c394d6'
    }
    Silvertune = [ordered]@{
        Directory = 'silvertune-web'
        Repository = 'https://github.com/verticalrectangle/silvertune-web.git'
        Ref = 'companion-v0.4.0'
        Commit = '7b9be1fb65e71eff2f274ddafbd12868c27bc171'
        MiniaudioRef = '0.11.21'
        MiniaudioCommit = '4a5b74bef029b3592c54b6048650ee5f972c1a48'
    }
    MusicAI = [ordered]@{
        Directory = 'musicai'
        Repository = 'https://github.com/ruvnet/musicai.git'
        Ref = '92c0c53f2ca81d82a3e392f8781cc521f25b2c21'
        Commit = '92c0c53f2ca81d82a3e392f8781cc521f25b2c21'
    }
}

function Get-FullPath([string]$Path) {
    return [System.IO.Path]::GetFullPath($Path).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
}

function Assert-SafeRoots {
    param([string]$ResolvedSourceRoot, [string]$ResolvedBuildRoot)

    $driveRoot = [System.IO.Path]::GetPathRoot($ResolvedBuildRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $sourceDriveRoot = [System.IO.Path]::GetPathRoot($ResolvedSourceRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar)
    $profileRoot = Get-FullPath ([Environment]::GetFolderPath('UserProfile'))
    if ($ResolvedBuildRoot -eq $driveRoot -or $ResolvedBuildRoot -eq $profileRoot -or
        $ResolvedSourceRoot -eq $sourceDriveRoot -or $ResolvedSourceRoot -eq $profileRoot) {
        throw "Refusing broad source/build root: SourceRoot=$ResolvedSourceRoot BuildRoot=$ResolvedBuildRoot"
    }

    $separator = [System.IO.Path]::DirectorySeparatorChar
    if ($ResolvedBuildRoot -eq $ResolvedSourceRoot -or
        $ResolvedBuildRoot.StartsWith("$ResolvedSourceRoot$separator", [System.StringComparison]::OrdinalIgnoreCase) -or
        $ResolvedSourceRoot.StartsWith("$ResolvedBuildRoot$separator", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'SourceRoot and BuildRoot must be separate, non-nested directories.'
    }
}

function Get-NormalizedGitUrl([string]$Url) {
    return $Url.Trim().TrimEnd('/').ToLowerInvariant() -replace '\.git$', ''
}

function Test-GitCommitExists {
    param([Parameter(Mandatory)] [string]$Repository, [Parameter(Mandatory)] [string]$Commit)
    & git -C $Repository cat-file -e "$Commit^{commit}" 2>$null
    return $LASTEXITCODE -eq 0
}

function Ensure-Repository {
    param(
        [Parameter(Mandatory)] [string]$Destination,
        [Parameter(Mandatory)] [string]$Url,
        [Parameter(Mandatory)] [string]$Ref,
        [Parameter(Mandatory)] [string]$Commit
    )

    if (-not (Test-Path -LiteralPath $Destination)) {
        $parent = Split-Path -Parent $Destination
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
        Invoke-Checked -FilePath 'git' -Arguments @('clone', '--filter=blob:none', '--no-checkout', $Url, $Destination)
    }

    if (-not (Test-Path -LiteralPath (Join-Path $Destination '.git'))) {
        throw "Existing source destination is not a Git repository: $Destination"
    }

    $origin = (& git -C $Destination remote get-url origin 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or (Get-NormalizedGitUrl $origin) -ne (Get-NormalizedGitUrl $Url)) {
        throw "Unexpected origin for $Destination. Expected $Url, got '$origin'."
    }

    if (-not (Test-GitCommitExists -Repository $Destination -Commit $Commit)) {
        Invoke-Checked -FilePath 'git' -Arguments @('-C', $Destination, 'fetch', '--filter=blob:none', 'origin', $Commit)
    }

    if (-not (Test-GitCommitExists -Repository $Destination -Commit $Commit)) {
        throw "Pinned commit $Commit could not be fetched from $Url"
    }

    if ($Ref -ne $Commit) {
        $resolvedRef = (& git -C $Destination rev-parse "$Ref^{}" 2>$null).Trim()
        if ($LASTEXITCODE -ne 0 -or -not $resolvedRef) {
            Invoke-Checked -FilePath 'git' -Arguments @('-C', $Destination, 'fetch', '--filter=blob:none', 'origin', "refs/tags/${Ref}:refs/tags/${Ref}")
        }
    }

    Assert-Commit -Repository $Destination -Ref $Ref -Expected $Commit
    return $Destination
}

function Assert-CleanWorktree {
    param([Parameter(Mandatory)] [string]$Repository)
    $status = (& git -C $Repository status --porcelain=v1 --untracked-files=all)
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to inspect Git worktree: $Repository"
    }
    if ($status) {
        throw "Pinned worktree contains local changes; refusing a non-reproducible build: $Repository`n$($status -join "`n")"
    }
}

function Find-CMake {
    $command = Get-Command cmake -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    $bundled = 'C:\Program Files\Microsoft Visual Studio\18\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
    if (Test-Path -LiteralPath $bundled -PathType Leaf) {
        return $bundled
    }

    throw 'CMake was not found. Install a supported Visual Studio C++ workload or put cmake on PATH.'
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)] [string]$FilePath,
        [Parameter()] [string[]]$Arguments = @(),
        [Parameter()] [string]$WorkingDirectory
    )

    Write-Host ('> ' + $FilePath + ' ' + ($Arguments -join ' '))
    if ($WorkingDirectory) {
        Push-Location -LiteralPath $WorkingDirectory
    }
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $FilePath"
        }
    } finally {
        if ($WorkingDirectory) {
            Pop-Location
        }
    }
}

function Get-GitCommit {
    param([Parameter(Mandatory)] [string]$Repository, [Parameter(Mandatory)] [string]$Ref)
    $value = (& git -C $Repository rev-parse "$Ref^{}" 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $value) {
        throw "Unable to resolve Git ref '$Ref' in $Repository"
    }
    return $value
}

function Assert-Commit {
    param(
        [Parameter(Mandatory)] [string]$Repository,
        [Parameter(Mandatory)] [string]$Ref,
        [Parameter(Mandatory)] [string]$Expected
    )
    $actual = Get-GitCommit -Repository $Repository -Ref $Ref
    if ($actual -ne $Expected) {
        throw "Unexpected commit for $Repository ($Ref): expected $Expected, got $actual"
    }
}

function Get-PinnedWorktree {
    param(
        [Parameter(Mandatory)] [string]$Repository,
        [Parameter(Mandatory)] [string]$Ref,
        [Parameter(Mandatory)] [string]$Commit,
        [Parameter(Mandatory)] [string]$Destination
    )

    Assert-Commit -Repository $Repository -Ref $Ref -Expected $Commit
    if (Test-Path -LiteralPath $Destination) {
        if (-not (Test-Path -LiteralPath (Join-Path $Destination '.git'))) {
            throw "Existing source destination is not a Git worktree: $Destination"
        }
        Assert-Commit -Repository $Destination -Ref 'HEAD' -Expected $Commit
        Assert-CleanWorktree -Repository $Destination
        return $Destination
    }

    $parent = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    Invoke-Checked -FilePath 'git' -Arguments @('-C', $Repository, 'worktree', 'add', '--detach', $Destination, $Commit) | Out-Host
    Assert-Commit -Repository $Destination -Ref 'HEAD' -Expected $Commit
    Assert-CleanWorktree -Repository $Destination
    return $Destination
}

function Assert-FetchedCommit {
    param([Parameter(Mandatory)] [string]$Repository, [Parameter(Mandatory)] [string]$Expected)
    if (-not (Test-Path -LiteralPath $Repository -PathType Container)) {
        throw "Fetched dependency is missing: $Repository"
    }
    Assert-Commit -Repository $Repository -Ref 'HEAD' -Expected $Expected
    Assert-CleanWorktree -Repository $Repository
}

function Write-ArtifactHash {
    param([Parameter(Mandatory)] [string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Expected artifact is missing: $Path"
    }
    $file = Get-Item -LiteralPath $Path
    $hash = Get-FileHash -LiteralPath $Path -Algorithm SHA256
    Write-Host ("ARTIFACT {0} bytes={1} sha256={2}" -f $file.FullName, $file.Length, $hash.Hash.ToLowerInvariant())
}

$sourceRootFull = Get-FullPath $SourceRoot
$buildRootFull = Get-FullPath $BuildRoot
Assert-SafeRoots -ResolvedSourceRoot $sourceRootFull -ResolvedBuildRoot $buildRootFull
New-Item -ItemType Directory -Path $sourceRootFull -Force | Out-Null
New-Item -ItemType Directory -Path $buildRootFull -Force | Out-Null

$cmake = Find-CMake
$requested = if ($Candidate -contains 'All') { @('QPitch', 'OpenVoxTuner', 'Silvertune') } else { @($Candidate | Select-Object -Unique) }
if ($IncludeKnownFailingMusicAI) {
    $requested += 'MusicAI'
}
$sourceCache = Join-Path $buildRootFull '_sources'
$qpitchSource = $null
$qpitchBuild = Join-Path $buildRootFull 'repro-qpitch-v1.3.1'

function Ensure-QPitchSource {
    if ($null -eq $script:qpitchSource) {
        $repo = Ensure-Repository `
            -Destination (Join-Path $sourceRootFull $pins.QPitch.Directory) `
            -Url $pins.QPitch.Repository `
            -Ref $pins.QPitch.Ref `
            -Commit $pins.QPitch.Commit
        $destination = Join-Path $sourceCache 'qpitch-v1.3.1'
        $script:qpitchSource = Get-PinnedWorktree -Repository $repo -Ref $pins.QPitch.Ref -Commit $pins.QPitch.Commit -Destination $destination
    }
    return $script:qpitchSource
}

function Build-QPitch {
    $source = Ensure-QPitchSource
    Invoke-Checked -FilePath $cmake -Arguments @(
        '-S', $source,
        '-B', $qpitchBuild,
        '-G', $CMakeGenerator,
        '-A', 'x64',
        "-DQPITCH_JUCE_GIT_TAG=$($pins.QPitch.JuceRef)",
        "-DQPITCH_CLAP_JUCE_EXTENSIONS_GIT_TAG=$($pins.QPitch.ClapJuceExtensionsCommit)"
    )
    Invoke-Checked -FilePath $cmake -Arguments @('--build', $qpitchBuild, '--config', 'Release', '--parallel')
    Invoke-Checked -FilePath $cmake -Arguments @(
        '--build', $qpitchBuild, '--config', 'Release', '--parallel', '--target',
        'qpitch_ifft_recon', 'qpitch_vocoder_roundtrip', 'qpitch_forward_debug', 'qpitch_fft_test', 'qpitch_shifter_test'
    )

    Assert-FetchedCommit -Repository (Join-Path $qpitchBuild '_deps\juce-src') -Expected $pins.QPitch.JuceCommit
    Assert-FetchedCommit -Repository (Join-Path $qpitchBuild '_deps\clap_juce_extensions_project-src') -Expected $pins.QPitch.ClapJuceExtensionsCommit

    foreach ($test in @('qpitch_ifft_recon', 'qpitch_vocoder_roundtrip', 'qpitch_forward_debug', 'qpitch_fft_test', 'qpitch_shifter_test')) {
        Invoke-Checked -FilePath (Join-Path $qpitchBuild "Release\$test.exe")
    }

    Assert-CleanWorktree -Repository $source

    Write-ArtifactHash -Path (Join-Path $qpitchBuild 'QPitch_artefacts\Release\VST3\QPitch.vst3\Contents\x86_64-win\QPitch.vst3')
    Write-ArtifactHash -Path (Join-Path $qpitchBuild 'QPitch_artefacts\Release\CLAP\QPitch.clap')
}

function Build-OpenVoxTuner {
    if (-not (Test-Path -LiteralPath (Join-Path $qpitchBuild '_deps\juce-src\CMakeLists.txt'))) {
        Build-QPitch
    }
    $repo = Ensure-Repository `
        -Destination (Join-Path $sourceRootFull $pins.OpenVoxTuner.Directory) `
        -Url $pins.OpenVoxTuner.Repository `
        -Ref $pins.OpenVoxTuner.Ref `
        -Commit $pins.OpenVoxTuner.Commit
    $source = Get-PinnedWorktree -Repository $repo -Ref $pins.OpenVoxTuner.Ref -Commit $pins.OpenVoxTuner.Commit -Destination (Join-Path $sourceCache 'openvoxtuner-v0.1.67')
    $build = Join-Path $buildRootFull 'repro-openvoxtuner-v0.1.67'
    $jucePath = Join-Path $qpitchBuild '_deps\juce-src'
    Assert-FetchedCommit -Repository $jucePath -Expected $pins.QPitch.JuceCommit

    Invoke-Checked -FilePath $cmake -Arguments @(
        '-S', $source,
        '-B', $build,
        '-G', $CMakeGenerator,
        '-A', 'x64',
        "-DJUCE_PATH=$jucePath",
        '-DOVT_VERSION=0.1.67',
        '-DOVT_ENABLE_ARA=OFF',
        '-DAUTOTUNE_BUILD_TESTS=ON'
    )
    Invoke-Checked -FilePath $cmake -Arguments @('--build', $build, '--config', 'Release', '--parallel')
    Invoke-Checked -FilePath (Join-Path $build 'OpenVoxTunerTests_artefacts\Release\OpenVoxTunerTests.exe')
    Assert-CleanWorktree -Repository $source
    Write-ArtifactHash -Path (Join-Path $build 'OpenVoxTuner_artefacts\Release\VST3\OpenVoxTuner.vst3\Contents\x86_64-win\OpenVoxTuner.vst3')
    Write-ArtifactHash -Path (Join-Path $build 'OpenVoxTuner_artefacts\Release\Standalone\OpenVoxTuner.exe')
}

function Build-Silvertune {
    $repo = Ensure-Repository `
        -Destination (Join-Path $sourceRootFull $pins.Silvertune.Directory) `
        -Url $pins.Silvertune.Repository `
        -Ref $pins.Silvertune.Ref `
        -Commit $pins.Silvertune.Commit
    $source = Get-PinnedWorktree -Repository $repo -Ref $pins.Silvertune.Ref -Commit $pins.Silvertune.Commit -Destination (Join-Path $sourceCache 'silvertune-companion-v0.4.0')
    $build = Join-Path $buildRootFull 'repro-silvertune-companion-v0.4.0'

    Invoke-Checked -FilePath $cmake -Arguments @(
        '-S', (Join-Path $source 'companion'),
        '-B', $build,
        '-G', $CMakeGenerator,
        '-A', 'x64',
        '-DCOMPANION_VERSION=companion-v0.4.0'
    )
    Invoke-Checked -FilePath $cmake -Arguments @('--build', $build, '--config', 'Release', '--parallel')
    Assert-FetchedCommit -Repository (Join-Path $build '_deps\miniaudio-src') -Expected $pins.Silvertune.MiniaudioCommit
    Invoke-Checked -FilePath 'node' -Arguments @('--check', (Join-Path $source 'worklet.js'))
    Assert-CleanWorktree -Repository $source
    Write-ArtifactHash -Path (Join-Path $build 'Release\silvertune-companion.exe')
    Write-Host 'The companion executable was built but deliberately not launched: launching it may open audio devices.'
}

function Build-MusicAI {
    Write-Warning 'MusicAI is an explicit negative-control build. Its upstream tests are known to fail; this invocation is expected to return a non-zero exit code.'
    $repo = Ensure-Repository `
        -Destination (Join-Path $sourceRootFull $pins.MusicAI.Directory) `
        -Url $pins.MusicAI.Repository `
        -Ref $pins.MusicAI.Ref `
        -Commit $pins.MusicAI.Commit
    $source = Get-PinnedWorktree -Repository $repo -Ref $pins.MusicAI.Ref -Commit $pins.MusicAI.Commit -Destination (Join-Path $sourceCache 'musicai-92c0c53')
    $build = Join-Path $buildRootFull 'repro-musicai-92c0c53'

    Invoke-Checked -FilePath 'cargo' -Arguments @('build', '--locked', '--release', '--target-dir', $build) -WorkingDirectory $source
    Write-ArtifactHash -Path (Join-Path $build 'release\musicai.dll')
    Invoke-Checked -FilePath 'cargo' -Arguments @('test', '--locked', '--all-targets', '--target-dir', $build) -WorkingDirectory $source
    Assert-CleanWorktree -Repository $source
}

foreach ($name in $requested) {
    Write-Host "`n=== $name ==="
    switch ($name) {
        'QPitch' { Build-QPitch }
        'OpenVoxTuner' { Build-OpenVoxTuner }
        'Silvertune' { Build-Silvertune }
        'MusicAI' { Build-MusicAI }
    }
}

Write-Host "`nSelected candidate checks completed. No plugin was installed system-wide and no audio device was opened."
