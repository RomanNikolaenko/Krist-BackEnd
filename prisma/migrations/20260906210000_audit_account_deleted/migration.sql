-- Records the moment an account removed itself. The row outlives the user it
-- describes: audit_logs.userId is SET NULL on delete, so the trail keeps the
-- event without keeping the person.
ALTER TYPE "AuditAction" ADD VALUE 'ACCOUNT_DELETED';
