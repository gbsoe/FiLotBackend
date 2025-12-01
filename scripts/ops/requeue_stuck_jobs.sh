#!/bin/bash
# FiLot Operations - Requeue Stuck OCR Jobs
# Moves jobs from processing set back to queue for retry
#
# Usage: ./scripts/ops/requeue_stuck_jobs.sh [--redis-url URL] [--dry-run]

set -euo pipefail

REDIS_URL="${REDIS_URL:-}"
DRY_RUN=false
QUEUE_KEY="filot:ocr:gpu:queue"
PROCESSING_KEY="filot:ocr:gpu:processing"
ATTEMPTS_KEY="filot:ocr:gpu:attempts"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --redis-url)
            REDIS_URL="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --queue-key)
            QUEUE_KEY="$2"
            shift 2
            ;;
        --processing-key)
            PROCESSING_KEY="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [--redis-url URL] [--dry-run] [--queue-key KEY] [--processing-key KEY]"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ -z "$REDIS_URL" ]; then
    log_error "REDIS_URL is required. Use --redis-url or set REDIS_URL env var."
    exit 1
fi

if ! command -v redis-cli &> /dev/null; then
    log_error "redis-cli is not installed"
    exit 1
fi

# Extract host and port from Redis URL
# Format: redis://[:password@]host:port or rediss://[:password@]host:port
parse_redis_url() {
    local url=$1
    local proto="${url%%://*}"
    local rest="${url#*://}"
    
    # Check for password
    if [[ "$rest" == *"@"* ]]; then
        REDIS_PASSWORD="${rest%%@*}"
        REDIS_PASSWORD="${REDIS_PASSWORD#:}"
        rest="${rest#*@}"
    fi
    
    REDIS_HOST="${rest%%:*}"
    REDIS_PORT="${rest#*:}"
    REDIS_PORT="${REDIS_PORT%%/*}"
    
    if [ "$proto" = "rediss" ]; then
        REDIS_TLS="--tls"
    else
        REDIS_TLS=""
    fi
}

parse_redis_url "$REDIS_URL"

redis_cmd() {
    local cmd="redis-cli -h $REDIS_HOST -p $REDIS_PORT $REDIS_TLS"
    if [ -n "${REDIS_PASSWORD:-}" ]; then
        cmd="$cmd -a $REDIS_PASSWORD"
    fi
    $cmd "$@" 2>/dev/null
}

print_banner() {
    echo ""
    echo "========================================"
    echo "  FiLot - Requeue Stuck OCR Jobs"
    echo "========================================"
    echo "Redis Host:     ${REDIS_HOST}:${REDIS_PORT}"
    echo "Queue Key:      ${QUEUE_KEY}"
    echo "Processing Key: ${PROCESSING_KEY}"
    echo "Dry Run:        ${DRY_RUN}"
    echo "========================================"
    echo ""
}

main() {
    print_banner
    
    # Get count of stuck jobs
    log_step "Checking processing set..."
    STUCK_COUNT=$(redis_cmd SCARD "$PROCESSING_KEY" || echo "0")
    
    if [ "$STUCK_COUNT" = "0" ]; then
        log_info "No stuck jobs found in processing set."
        exit 0
    fi
    
    log_warn "Found ${STUCK_COUNT} jobs in processing set"
    
    # Get all stuck job IDs
    log_step "Retrieving stuck job IDs..."
    STUCK_JOBS=$(redis_cmd SMEMBERS "$PROCESSING_KEY")
    
    if [ -z "$STUCK_JOBS" ]; then
        log_info "Processing set is empty."
        exit 0
    fi
    
    # Display jobs
    echo ""
    log_info "Stuck jobs:"
    echo "$STUCK_JOBS" | while read -r job; do
        [ -n "$job" ] && echo "  - $job"
    done
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_warn "DRY RUN - No changes made"
        log_info "Would requeue ${STUCK_COUNT} jobs to ${QUEUE_KEY}"
        exit 0
    fi
    
    # Confirm action
    read -p "Requeue all stuck jobs? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Aborted."
        exit 0
    fi
    
    # Requeue each job
    log_step "Requeuing jobs..."
    REQUEUED=0
    
    echo "$STUCK_JOBS" | while read -r job; do
        if [ -n "$job" ]; then
            # Remove from processing set
            redis_cmd SREM "$PROCESSING_KEY" "$job" > /dev/null
            
            # Reset attempt counter
            redis_cmd HDEL "$ATTEMPTS_KEY" "$job" > /dev/null
            
            # Add back to queue
            redis_cmd RPUSH "$QUEUE_KEY" "$job" > /dev/null
            
            log_info "Requeued: $job"
            ((REQUEUED++))
        fi
    done
    
    echo ""
    log_info "Requeued ${STUCK_COUNT} jobs to ${QUEUE_KEY}"
    
    # Show current queue length
    QUEUE_LEN=$(redis_cmd LLEN "$QUEUE_KEY" || echo "?")
    log_info "Current queue length: ${QUEUE_LEN}"
}

main "$@"
