# T8-B.1 Domain Replacement Report

**Tranche**: T8-B.1  
**Date**: 2024-12-01  
**Status**: COMPLETE

---

## Objective

Replace all occurrences of `filot.id` and `api.filot.id` with `filot.me` and `api.filot.me` respectively across the entire codebase and documentation.

---

## Files Modified

### Source Code

| File | Changes |
|------|---------|
| `backend/src/middlewares/corsConfig.ts` | Default CORS origin updated from `https://app.filot.id` to `https://app.filot.me` |

### Configuration Files

| File | Changes |
|------|---------|
| `backend/prod.env.template` | Updated `FILOT_FRONTEND_ORIGIN`, BULI2 internal URL, and callback URL comments |
| `scripts/smoke/run_e2e_smoke.sh` | Default API_URL changed to `https://api.filot.me` |

### Documentation Files

| File | Changes |
|------|---------|
| `replit.md` | Updated smoke test command URL |
| `README.md` | Updated smoke test command URL |
| `backend/README.md` | Updated CORS example, smoke test URLs |
| `runbooks/T8B-deploy-runbook.md` | Updated API URLs in smoke tests and health check examples |
| `backend/docs/T8B_PRODUCTION_DEPLOYMENT.md` | Updated ALB diagram, smoke test URLs, DNS configuration reference |
| `backend/docs/T8A_predeployment_checklist.md` | Updated FILOT_FRONTEND_ORIGIN checklist item |
| `backend/docs/T8A_production_architecture.md` | Updated frontend and backend domain labels in architecture diagram |
| `backend/docs/T6B_BACKEND_SECURITY_PATCH.md` | Updated all CORS and API URL references |
| `backend/docs/FiLot_Backend_Audit.md` | Updated CORS configuration example |
| `backend/docs/FILOT_FULL_SYSTEM_AUDIT.md` | Updated allowed origins documentation |

---

## Changes Summary

### Domain Mapping

| Old Domain | New Domain |
|------------|------------|
| `app.filot.id` | `app.filot.me` |
| `api.filot.id` | `api.filot.me` |
| `buli2.internal.filot.id` | `buli2.internal.filot.me` |

### Total Files Modified

- **Source files**: 1
- **Configuration files**: 2
- **Documentation files**: 10
- **Total**: 13 files

---

## Verification

All project files have been verified to use the new `filot.me` domain. The only remaining `filot.id` references are in:

- `attached_assets/` - User-provided input files (read-only, not part of deployment)

These attached assets are historical references and do not affect the deployed system.

---

## Production Impact

1. **CORS Configuration**: The backend will now accept requests from `https://app.filot.me` by default
2. **Smoke Tests**: All test scripts now target `https://api.filot.me`
3. **Documentation**: All operator guides and runbooks reference the correct domain

---

## Next Steps

1. Ensure DNS records for `api.filot.me` point to the production ALB
2. Ensure DNS records for `app.filot.me` point to the frontend hosting
3. Verify ACM certificate covers `api.filot.me`
4. Update any external systems (BULI2, monitoring) to use new domain

---

*Generated as part of Tranche T8-B.1: Backend Deployment Patch*
