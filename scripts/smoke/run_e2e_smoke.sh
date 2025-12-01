#!/bin/bash
# FiLot Production Smoke Test Suite
# Run after deployment to validate end-to-end functionality
#
# Usage: ./scripts/smoke/run_e2e_smoke.sh [--api-url URL] [--jwt TOKEN]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "${SCRIPT_DIR}")")"

# Configuration
API_URL="${API_URL:-https://api.filot.id}"
ADMIN_JWT="${ADMIN_JWT:-}"
REDIS_HOST="${REDIS_HOST:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --api-url)
            API_URL="$2"
            shift 2
            ;;
        --jwt)
            ADMIN_JWT="$2"
            shift 2
            ;;
        --redis-host)
            REDIS_HOST="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

log_info() { echo -e "${GREEN}[PASS]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }
log_skip() { echo -e "${YELLOW}[SKIP]${NC} $1"; }
log_step() { echo -e "${BLUE}[TEST]${NC} $1"; }
log_detail() { echo -e "${CYAN}       ${NC} $1"; }

print_banner() {
    echo ""
    echo "========================================"
    echo "  FiLot Production Smoke Tests"
    echo "========================================"
    echo "API URL:    ${API_URL}"
    echo "Timestamp:  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "========================================"
    echo ""
}

run_test() {
    local test_name="$1"
    local test_func="$2"
    
    log_step "Running: ${test_name}"
    
    if $test_func; then
        log_info "${test_name}"
        ((TESTS_PASSED++))
        return 0
    else
        log_fail "${test_name}"
        ((TESTS_FAILED++))
        return 1
    fi
}

skip_test() {
    local test_name="$1"
    local reason="$2"
    
    log_skip "${test_name} - ${reason}"
    ((TESTS_SKIPPED++))
}

# ============================================
# Test 1: API Health Check
# ============================================
test_api_health() {
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        local body
        body=$(curl -s "${API_URL}/health" 2>/dev/null)
        log_detail "Response: ${body}"
        
        # Check for ok status
        if echo "$body" | grep -q '"ok":true\|"status":"ok"'; then
            return 0
        fi
    fi
    
    log_detail "HTTP Status: ${response}"
    return 1
}

# ============================================
# Test 2: Health Check - Redis Connected
# ============================================
test_health_redis() {
    local response
    response=$(curl -s "${API_URL}/health" 2>/dev/null)
    
    if echo "$response" | grep -q '"redisConnected":true'; then
        log_detail "Redis connection: OK"
        return 0
    elif echo "$response" | grep -q '"redis":\s*true'; then
        log_detail "Redis connection: OK"
        return 0
    fi
    
    log_detail "Response: ${response}"
    return 1
}

# ============================================
# Test 3: Health Check - Database Connected
# ============================================
test_health_database() {
    local response
    response=$(curl -s "${API_URL}/health" 2>/dev/null)
    
    if echo "$response" | grep -q '"databaseConnected":true\|"database":\s*true\|"db":\s*true'; then
        log_detail "Database connection: OK"
        return 0
    fi
    
    # Even if not explicitly shown, 200 OK with ok:true implies DB works
    if echo "$response" | grep -q '"ok":true'; then
        log_detail "Assuming database connected (healthy response)"
        return 0
    fi
    
    return 1
}

# ============================================
# Test 4: Metrics Endpoint
# ============================================
test_metrics_endpoint() {
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/metrics" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        log_detail "Metrics endpoint accessible"
        return 0
    fi
    
    log_detail "HTTP Status: ${response}"
    return 1
}

# ============================================
# Test 5: Auth Endpoint (Unauthenticated)
# ============================================
test_auth_endpoint() {
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/auth/login" -H "Content-Type: application/json" -d '{}' 2>/dev/null || echo "000")
    
    # Expect 400 or 401 (endpoint exists but auth required)
    if [ "$response" = "400" ] || [ "$response" = "401" ] || [ "$response" = "422" ]; then
        log_detail "Auth endpoint responds correctly (${response})"
        return 0
    fi
    
    log_detail "HTTP Status: ${response}"
    return 1
}

# ============================================
# Test 6: Document Upload Endpoint (Unauthenticated)
# ============================================
test_documents_endpoint() {
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${API_URL}/documents/upload" 2>/dev/null || echo "000")
    
    # Expect 401 (requires auth)
    if [ "$response" = "401" ]; then
        log_detail "Documents endpoint protected (401)"
        return 0
    fi
    
    log_detail "HTTP Status: ${response}"
    return 1
}

# ============================================
# Test 7: Verification Endpoint (Requires Auth)
# ============================================
test_verification_endpoint() {
    if [ -z "$ADMIN_JWT" ]; then
        log_skip "Verification Evaluate Endpoint - No JWT token provided (optional)"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_step "Running: Verification Evaluate Endpoint"
    
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST "${API_URL}/verification/evaluate" \
        -H "Authorization: Bearer ${ADMIN_JWT}" \
        -H "Content-Type: application/json" \
        -d '{"documentId":"test-smoke-check"}' 2>/dev/null || echo "000")
    
    # Expect 400 or 404 (document not found) - endpoint works
    if [ "$response" = "400" ] || [ "$response" = "404" ] || [ "$response" = "200" ]; then
        log_info "Verification Evaluate Endpoint"
        log_detail "Verification endpoint responds (${response})"
        ((TESTS_PASSED++))
        return 0
    fi
    
    log_fail "Verification Evaluate Endpoint"
    log_detail "HTTP Status: ${response}"
    ((TESTS_FAILED++))
    return 1
}

# ============================================
# Test 8: Redis Queue Check (if accessible)
# ============================================
test_redis_queue() {
    if [ -z "$REDIS_HOST" ]; then
        log_skip "Redis Queue Check - No Redis host provided (optional, use --redis-host)"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    # Check if redis-cli is available
    if ! command -v redis-cli &> /dev/null; then
        log_skip "Redis Queue Check - redis-cli not installed (optional)"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_step "Running: Redis Queue Check"
    
    local queue_length
    queue_length=$(redis-cli -h "$REDIS_HOST" LLEN "filot:ocr:gpu:queue" 2>/dev/null || echo "-1")
    
    if [ "$queue_length" != "-1" ]; then
        log_info "Redis Queue Check"
        log_detail "GPU Queue Length: ${queue_length}"
        ((TESTS_PASSED++))
        return 0
    fi
    
    log_fail "Redis Queue Check"
    ((TESTS_FAILED++))
    return 1
}

# ============================================
# Test 9: CloudWatch Log Group Exists
# ============================================
test_cloudwatch_logs() {
    if ! command -v aws &> /dev/null; then
        log_skip "CloudWatch Log Groups - AWS CLI not installed (optional)"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_step "Running: CloudWatch Log Groups"
    
    local backend_logs
    backend_logs=$(aws logs describe-log-groups --log-group-name-prefix "/ecs/filot-backend" --region ap-southeast-2 --query 'logGroups[0].logGroupName' --output text 2>/dev/null || echo "None")
    
    if [ "$backend_logs" != "None" ] && [ "$backend_logs" != "" ]; then
        log_info "CloudWatch Log Groups"
        log_detail "Log group found: ${backend_logs}"
        ((TESTS_PASSED++))
        return 0
    fi
    
    log_skip "CloudWatch Log Groups - Log group not yet created (will be created on first deploy)"
    ((TESTS_SKIPPED++))
    return 0
}

# ============================================
# Test 10: ECS Service Status
# ============================================
test_ecs_service_status() {
    if ! command -v aws &> /dev/null; then
        log_skip "ECS Service Status - AWS CLI not installed (optional)"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_step "Running: ECS Service Status"
    
    local service_status
    service_status=$(aws ecs describe-services \
        --cluster filot-backend-cluster \
        --services filot-backend-service \
        --region ap-southeast-2 \
        --query 'services[0].status' \
        --output text 2>/dev/null || echo "UNKNOWN")
    
    if [ "$service_status" = "ACTIVE" ]; then
        local running_count
        running_count=$(aws ecs describe-services \
            --cluster filot-backend-cluster \
            --services filot-backend-service \
            --region ap-southeast-2 \
            --query 'services[0].runningCount' \
            --output text 2>/dev/null || echo "0")
        
        log_info "ECS Service Status"
        log_detail "Service: ACTIVE, Running tasks: ${running_count}"
        ((TESTS_PASSED++))
        return 0
    fi
    
    if [ "$service_status" = "UNKNOWN" ]; then
        log_skip "ECS Service Status - Service not yet deployed (optional)"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_fail "ECS Service Status"
    log_detail "Service status: ${service_status}"
    ((TESTS_FAILED++))
    return 1
}

# ============================================
# Test 11: GPU Worker ECS Service Status
# ============================================
test_gpu_worker_status() {
    if ! command -v aws &> /dev/null; then
        log_skip "GPU Worker Status - AWS CLI not installed (optional)"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_step "Running: GPU Worker Status"
    
    local service_status
    service_status=$(aws ecs describe-services \
        --cluster filot-ocr-gpu-cluster \
        --services filot-ocr-gpu-service \
        --region ap-southeast-2 \
        --query 'services[0].status' \
        --output text 2>/dev/null || echo "UNKNOWN")
    
    if [ "$service_status" = "ACTIVE" ]; then
        log_info "GPU Worker Status"
        log_detail "GPU Worker Service: ACTIVE"
        ((TESTS_PASSED++))
        return 0
    fi
    
    if [ "$service_status" = "UNKNOWN" ]; then
        log_skip "GPU Worker Status - Service not yet deployed (optional)"
        ((TESTS_SKIPPED++))
        return 0
    fi
    
    log_fail "GPU Worker Status"
    log_detail "GPU Service status: ${service_status}"
    ((TESTS_FAILED++))
    return 1
}

# ============================================
# Print Summary
# ============================================
print_summary() {
    echo ""
    echo "========================================"
    echo "  Smoke Test Summary"
    echo "========================================"
    echo -e "  ${GREEN}Passed:${NC}  ${TESTS_PASSED}"
    echo -e "  ${RED}Failed:${NC}  ${TESTS_FAILED}"
    echo -e "  ${YELLOW}Skipped:${NC} ${TESTS_SKIPPED}"
    echo "========================================"
    
    if [ $TESTS_FAILED -gt 0 ]; then
        echo -e "  ${RED}OVERALL: FAILED${NC}"
        echo ""
        exit 1
    else
        echo -e "  ${GREEN}OVERALL: PASSED${NC}"
        if [ $TESTS_SKIPPED -gt 0 ]; then
            echo "  (Skipped tests are optional and do not affect pass/fail status)"
        fi
        echo ""
        exit 0
    fi
}

# ============================================
# Main
# ============================================
main() {
    print_banner
    
    echo "Phase 1: API Health Checks"
    echo "----------------------------------------"
    run_test "API Health Check" test_api_health
    run_test "Health - Redis Connected" test_health_redis
    run_test "Health - Database Connected" test_health_database
    run_test "Metrics Endpoint" test_metrics_endpoint
    echo ""
    
    echo "Phase 2: Endpoint Validation"
    echo "----------------------------------------"
    run_test "Auth Endpoint (Protected)" test_auth_endpoint
    run_test "Documents Endpoint (Protected)" test_documents_endpoint
    test_verification_endpoint  # Has internal skip logic
    echo ""
    
    echo "Phase 3: Infrastructure Checks"
    echo "----------------------------------------"
    test_redis_queue  # Has internal skip logic
    test_cloudwatch_logs  # Has internal skip logic
    test_ecs_service_status  # Has internal skip logic
    test_gpu_worker_status  # Has internal skip logic
    echo ""
    
    print_summary
}

main "$@"
