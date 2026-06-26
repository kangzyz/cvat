#!/usr/bin/env bash
set -u

ACR_REGISTRY="${ACR_REGISTRY:-crpi-w25qc705jz1thhjj.cn-beijing.personal.cr.aliyuncs.com}"
ACR_NAMESPACE="${ACR_NAMESPACE:-cvat-ch}"
CVAT_SHARE_ROOT="${CVAT_SHARE_ROOT:-/data/cvat/share}"
CVAT_HOST="${CVAT_HOST:-$(hostname -I 2>/dev/null | awk '{print $1}')}"
CVAT_HTTP_PORT="${CVAT_HTTP_PORT:-28080}"
CVAT_HTTPS_PORT="${CVAT_HTTPS_PORT:-}"
CVAT_DASHBOARD_PORT="${CVAT_DASHBOARD_PORT:-28090}"
CVAT_SERVER_TAG="${CVAT_SERVER_TAG:-gpu}"
CVAT_UI_TAG="${CVAT_UI_TAG:-dev}"
FULL_GPU_TEST="${FULL_GPU_TEST:-0}"

SERVER_IMAGE="${ACR_REGISTRY}/${ACR_NAMESPACE}/server:${CVAT_SERVER_TAG}"
UI_IMAGE="${ACR_REGISTRY}/${ACR_NAMESPACE}/ui:${CVAT_UI_TAG}"

FAILED=0
WARNED=0

pass() { printf '[PASS] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*"; WARNED=1; }
fail() { printf '[FAIL] %s\n' "$*"; FAILED=1; }
info() { printf '[INFO] %s\n' "$*"; }

run() {
    "$@" >/tmp/cvat-preflight.out 2>/tmp/cvat-preflight.err
}

docker_cmd() {
    if docker info >/dev/null 2>&1; then
        docker "$@"
    elif command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
        sudo docker "$@"
    else
        return 1
    fi
}

compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        docker compose "$@"
    elif command -v sudo >/dev/null 2>&1 && sudo -n docker compose version >/dev/null 2>&1; then
        sudo docker compose "$@"
    else
        return 1
    fi
}

bytes_available_for() {
    local path="$1"
    local probe="$path"
    while [ ! -e "$probe" ] && [ "$probe" != "/" ]; do
        probe="$(dirname "$probe")"
    done
    df -PB1 "$probe" 2>/dev/null | awk 'NR==2 {print $4}'
}

check_os() {
    info "Checking OS and basic resources"

    if [ "$(uname -s)" != "Linux" ]; then
        fail "This deployment target must be Linux"
        return
    fi

    if [ -r /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        case "${ID:-}" in
            ubuntu) pass "OS: ${PRETTY_NAME:-Ubuntu}" ;;
            *) warn "OS is ${PRETTY_NAME:-unknown}; Ubuntu is recommended" ;;
        esac
    else
        warn "Cannot read /etc/os-release"
    fi

    case "$(uname -m)" in
        x86_64|amd64) pass "Architecture: $(uname -m)" ;;
        *) warn "Architecture is $(uname -m); images were built for amd64" ;;
    esac

    if command -v free >/dev/null 2>&1; then
        local mem_gb
        mem_gb="$(free -g | awk '/^Mem:/ {print $2}')"
        if [ "${mem_gb:-0}" -ge 16 ]; then
            pass "Memory: ${mem_gb}GB"
        else
            warn "Memory: ${mem_gb:-unknown}GB; 16GB+ is recommended"
        fi
    fi

    local avail
    avail="$(bytes_available_for "$CVAT_SHARE_ROOT")"
    if [ -n "${avail:-}" ]; then
        local avail_gb=$((avail / 1024 / 1024 / 1024))
        if [ "$avail_gb" -ge 100 ]; then
            pass "Free disk near CVAT_SHARE_ROOT: ${avail_gb}GB"
        elif [ "$avail_gb" -ge 50 ]; then
            warn "Free disk near CVAT_SHARE_ROOT: ${avail_gb}GB; 100GB+ is recommended"
        else
            fail "Free disk near CVAT_SHARE_ROOT: ${avail_gb}GB; too small for images and videos"
        fi
    else
        warn "Cannot check disk space for $CVAT_SHARE_ROOT"
    fi
}

check_ports() {
    info "Checking ports"

    local ports=("$CVAT_HTTP_PORT" "$CVAT_DASHBOARD_PORT")
    if [ -n "$CVAT_HTTPS_PORT" ]; then
        ports+=("$CVAT_HTTPS_PORT")
    fi

    for port in "${ports[@]}"; do
        case "$port" in
            2*) pass "External port $port follows the 2xxxx convention" ;;
            *) warn "External port $port does not start with 2" ;;
        esac

        if command -v ss >/dev/null 2>&1 && ss -ltn "( sport = :$port )" | tail -n +2 | grep -q .; then
            fail "Port $port is already in use"
        else
            pass "Port $port is available"
        fi
    done
}

check_gpu() {
    info "Checking NVIDIA driver"
    if ! command -v nvidia-smi >/dev/null 2>&1; then
        fail "nvidia-smi not found; install NVIDIA driver first"
        return
    fi

    if run nvidia-smi; then
        pass "nvidia-smi works"
        nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>/dev/null \
            | sed 's/^/[INFO] GPU: /' || true
    else
        fail "nvidia-smi failed"
        sed 's/^/[INFO] /' /tmp/cvat-preflight.err || true
    fi
}

check_docker() {
    info "Checking Docker and Compose"

    if ! command -v docker >/dev/null 2>&1; then
        fail "docker command not found"
        return
    fi

    if docker_cmd version >/dev/null 2>&1; then
        pass "$(docker_cmd version --format 'Docker client {{.Client.Version}}, server {{.Server.Version}}' 2>/dev/null)"
    else
        fail "Docker daemon is not reachable by current user or passwordless sudo"
        return
    fi

    if compose_cmd version >/dev/null 2>&1; then
        pass "$(compose_cmd version 2>/dev/null)"
    else
        fail "docker compose plugin is not available"
    fi

    if docker_cmd info --format '{{json .Runtimes}}' 2>/dev/null | grep -qi nvidia; then
        pass "NVIDIA runtime is registered in Docker"
    else
        warn "NVIDIA runtime is not listed in docker info; --gpus may still work with CDI, but verify with FULL_GPU_TEST=1"
    fi
}

check_registry() {
    info "Checking Aliyun ACR access"

    if docker_cmd manifest inspect "$UI_IMAGE" >/dev/null 2>&1; then
        pass "Can read manifest: $UI_IMAGE"
    else
        fail "Cannot read manifest: $UI_IMAGE; run docker login for $ACR_REGISTRY"
    fi

    if docker_cmd manifest inspect "$SERVER_IMAGE" >/dev/null 2>&1; then
        pass "Can read manifest: $SERVER_IMAGE"
    else
        fail "Cannot read manifest: $SERVER_IMAGE; run docker login for $ACR_REGISTRY"
    fi
}

check_share() {
    info "Checking video share directory"

    if mkdir -p "$CVAT_SHARE_ROOT" 2>/dev/null; then
        pass "Share directory exists: $CVAT_SHARE_ROOT"
    else
        fail "Cannot create share directory: $CVAT_SHARE_ROOT"
        return
    fi

    local test_file="$CVAT_SHARE_ROOT/.cvat-write-test"
    if echo test > "$test_file" 2>/dev/null && rm -f "$test_file"; then
        pass "Share directory is writable by current user"
    else
        warn "Share directory is not writable by current user; container user 1000 also needs write access"
    fi

    if command -v stat >/dev/null 2>&1; then
        local owner
        owner="$(stat -c '%u:%g' "$CVAT_SHARE_ROOT" 2>/dev/null || true)"
        if [ "$owner" = "1000:1000" ]; then
            pass "Share directory owner is 1000:1000"
        else
            warn "Share directory owner is $owner; recommended: sudo chown -R 1000:1000 $CVAT_SHARE_ROOT"
        fi
    fi
}

check_compose_files() {
    info "Checking compose files"

    if [ ! -f docker-compose.yml ]; then
        fail "docker-compose.yml not found; run this script from the CVAT repo root"
        return
    fi
    if [ ! -f docker-compose.aliyun-gpu.yml ]; then
        fail "docker-compose.aliyun-gpu.yml not found"
        return
    fi

    if [ -f docker-compose.override.yml ]; then
        warn "docker-compose.override.yml exists; always deploy with explicit -f docker-compose.yml -f docker-compose.aliyun-gpu.yml"
    fi

    export ACR_REGISTRY ACR_NAMESPACE CVAT_HOST CVAT_SHARE_ROOT CVAT_SERVER_TAG CVAT_UI_TAG
    export CVAT_HTTP_PORT CVAT_HTTPS_PORT CVAT_DASHBOARD_PORT
    if compose_cmd -f docker-compose.yml -f docker-compose.aliyun-gpu.yml config --quiet >/dev/null 2>&1; then
        pass "Compose configuration is valid"
    else
        fail "Compose configuration is invalid"
        compose_cmd -f docker-compose.yml -f docker-compose.aliyun-gpu.yml config >/tmp/cvat-compose-config.out 2>/tmp/cvat-compose-config.err || true
        sed 's/^/[INFO] /' /tmp/cvat-compose-config.err || true
    fi
}

check_full_gpu_container() {
    if [ "$FULL_GPU_TEST" != "1" ]; then
        warn "Skipping full GPU container test. Run FULL_GPU_TEST=1 $0 to pull server:gpu and test CUDA inside container."
        return
    fi

    info "Running full GPU container test with $SERVER_IMAGE"
    if docker_cmd run --rm --gpus all --entrypoint bash "$SERVER_IMAGE" -lc \
        'nvidia-smi && ffmpeg -hide_banner -hwaccels && ffmpeg -hide_banner -decoders | grep -E "h264_cuvid|hevc_cuvid"'; then
        pass "GPU is visible inside server:gpu and FFmpeg CUDA decoders are present"
    else
        fail "Full GPU container test failed"
    fi
}

cat <<EOF
CVAT GPU server preflight
ACR_REGISTRY=$ACR_REGISTRY
ACR_NAMESPACE=$ACR_NAMESPACE
CVAT_HOST=${CVAT_HOST:-unset}
CVAT_SHARE_ROOT=$CVAT_SHARE_ROOT
SERVER_IMAGE=$SERVER_IMAGE
EOF

check_os
check_ports
check_gpu
check_docker
check_registry
check_share
check_compose_files
check_full_gpu_container

printf '\n'
if [ "$FAILED" -ne 0 ]; then
    fail "Preflight failed. Fix [FAIL] items before deployment."
    exit 1
fi

if [ "$WARNED" -ne 0 ]; then
    warn "Preflight passed with warnings. Review [WARN] items before production use."
    exit 0
fi

pass "Preflight passed."
