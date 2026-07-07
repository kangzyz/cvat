[CmdletBinding()]
param(
    [string] $AcrRegistry = $env:ACR_REGISTRY,
    [string] $AcrNamespace = $env:ACR_NAMESPACE,
    [string] $BaseTag = $env:CVAT_SERVER_BASE_TAG,
    [string] $CudaBaseImage = $env:CVAT_CUDA_BASE_IMAGE,
    [switch] $NoPush,
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

$AcrRegistry = Use-Default $AcrRegistry 'crpi-w25qc705jz1thhjj.cn-beijing.personal.cr.aliyuncs.com'
$AcrNamespace = Use-Default $AcrNamespace 'cvat-ch'
$BaseTag = Use-Default $BaseTag 'cuda12.6.3-ffmpeg8.0-py312'
$CudaBaseImage = Use-Default $CudaBaseImage 'nvidia/cuda:12.6.3-devel-ubuntu24.04'
$BaseImage = "${AcrRegistry}/${AcrNamespace}/server-base-gpu:${BaseTag}"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')

Push-Location $RepoRoot
try {
    $env:ACR_REGISTRY = $AcrRegistry
    $env:ACR_NAMESPACE = $AcrNamespace
    $env:CVAT_SERVER_BASE_TAG = $BaseTag
    $env:CVAT_CUDA_BASE_IMAGE = $CudaBaseImage

    Write-Host "[INFO] Building GPU server base image: $BaseImage"
    docker compose -f docker-compose.gpu-base.yml build cvat_server_base
    Assert-Success 'docker compose build'

    if (-not $SkipCheck) {
        Write-Host "[INFO] Verifying FFmpeg CUDA decoders and PyAV in $BaseImage"
        $CheckCommand = "ffmpeg -hide_banner -hwaccels | grep -q cuda && ffmpeg -hide_banner -decoders | grep -E 'h264_cuvid|hevc_cuvid|mjpeg_cuvid' && python -c 'import av; print(av.__version__)'"
        docker run --rm --entrypoint bash $BaseImage -lc $CheckCommand
        Assert-Success 'GPU base image check'
    }

    if (-not $NoPush) {
        Write-Host "[INFO] Pushing GPU server base image: $BaseImage"
        docker push $BaseImage
        Assert-Success 'docker push'
        docker manifest inspect $BaseImage | Out-Null
        Assert-Success 'docker manifest inspect'
    }

    Write-Host "[OK] GPU server base image is ready: $BaseImage"
}
finally {
    Pop-Location
}
