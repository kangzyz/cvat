[CmdletBinding()]
param(
    [string] $AcrRegistry = $env:ACR_REGISTRY,
    [string] $AcrNamespace = $env:ACR_NAMESPACE,
    [string] $ServerTag = $env:CVAT_SERVER_TAG,
    [string] $UiTag = $env:CVAT_UI_TAG,
    [string] $BaseTag = $env:CVAT_SERVER_BASE_TAG,
    [string] $ServerBaseImage = $env:CVAT_SERVER_BASE_IMAGE,
    [string] $CommitTag = $env:CVAT_IMAGE_COMMIT_TAG,
    [switch] $SkipBuild,
    [switch] $SkipPush,
    [switch] $SkipUi,
    [switch] $SkipCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Use-Default {
    param(
        [string] $Value,
        [string] $Default
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $Default
    }

    return $Value
}

function Assert-Success {
    param([string] $Action)

    if ($LASTEXITCODE -ne 0) {
        throw "$Action failed with exit code $LASTEXITCODE"
    }
}

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

Push-Location $RepoRoot
try {
    $AcrRegistry = Use-Default $AcrRegistry 'crpi-w25qc705jz1thhjj.cn-beijing.personal.cr.aliyuncs.com'
    $AcrNamespace = Use-Default $AcrNamespace 'cvat-ch'
    $ServerTag = Use-Default $ServerTag 'gpu'
    $UiTag = Use-Default $UiTag 'dev'
    $BaseTag = Use-Default $BaseTag 'cuda12.6.3-ffmpeg8.0-py312'
    $CommitTag = Use-Default $CommitTag (git rev-parse --short HEAD)
    $ServerBaseImage = Use-Default $ServerBaseImage "${AcrRegistry}/${AcrNamespace}/server-base-gpu:${BaseTag}"

    $ServerImage = "${AcrRegistry}/${AcrNamespace}/server:${ServerTag}"
    $ServerCommitImage = "${AcrRegistry}/${AcrNamespace}/server:${CommitTag}"
    $UiImage = "${AcrRegistry}/${AcrNamespace}/ui:${UiTag}"
    $UiCommitImage = "${AcrRegistry}/${AcrNamespace}/ui:${CommitTag}"

    $env:ACR_REGISTRY = $AcrRegistry
    $env:ACR_NAMESPACE = $AcrNamespace
    $env:CVAT_SERVER_BASE_IMAGE = $ServerBaseImage

    if (-not $SkipBuild) {
        Write-Host "[INFO] Building cvat_server from base: $ServerBaseImage"
        $Services = @('cvat_server')
        if (-not $SkipUi) {
            $Services += 'cvat_ui'
        }

        docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.gpu.yml build @Services
        Assert-Success 'docker compose build'
    }

    Write-Host "[INFO] Tagging server images"
    docker tag cvat/server:dev $ServerImage
    Assert-Success 'docker tag server release image'
    docker tag cvat/server:dev $ServerCommitImage
    Assert-Success 'docker tag server commit image'

    if (-not $SkipUi) {
        Write-Host "[INFO] Tagging UI images"
        docker tag cvat/ui:dev $UiImage
        Assert-Success 'docker tag UI release image'
        docker tag cvat/ui:dev $UiCommitImage
        Assert-Success 'docker tag UI commit image'
    }

    if (-not $SkipCheck) {
        Write-Host "[INFO] Verifying local server image FFmpeg CUDA decoders and PyAV"
        $CheckCommand = "ffmpeg -hide_banner -hwaccels | grep -q cuda && ffmpeg -hide_banner -decoders | grep -E 'h264_cuvid|hevc_cuvid|mjpeg_cuvid' && python -c 'import av; print(av.__version__)'"
        docker run --rm --entrypoint bash cvat/server:dev -lc $CheckCommand
        Assert-Success 'local server image check'
    }

    if (-not $SkipPush) {
        Write-Host "[INFO] Pushing server images"
        docker push $ServerImage
        Assert-Success 'docker push server release image'
        docker push $ServerCommitImage
        Assert-Success 'docker push server commit image'

        if (-not $SkipUi) {
            Write-Host "[INFO] Pushing UI images"
            docker push $UiImage
            Assert-Success 'docker push UI release image'
            docker push $UiCommitImage
            Assert-Success 'docker push UI commit image'
        }

        Write-Host "[INFO] Verifying remote manifests"
        docker manifest inspect $ServerImage | Out-Null
        Assert-Success 'docker manifest inspect server release image'
        docker manifest inspect $ServerCommitImage | Out-Null
        Assert-Success 'docker manifest inspect server commit image'
        if (-not $SkipUi) {
            docker manifest inspect $UiImage | Out-Null
            Assert-Success 'docker manifest inspect UI release image'
            docker manifest inspect $UiCommitImage | Out-Null
            Assert-Success 'docker manifest inspect UI commit image'
        }
    }

    $ResultVerb = 'Published'
    if ($SkipPush) {
        $ResultVerb = 'Prepared'
    }

    Write-Host "[OK] $ResultVerb server image: $ServerImage"
    Write-Host "[OK] $ResultVerb server commit image: $ServerCommitImage"
    if (-not $SkipUi) {
        Write-Host "[OK] $ResultVerb UI image: $UiImage"
        Write-Host "[OK] $ResultVerb UI commit image: $UiCommitImage"
    }
}
finally {
    Pop-Location
}
