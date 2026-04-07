CREATE TABLE "callback_receipts" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "workflowJobId" TEXT,
    "referenceType" "ReferenceEntityType" NOT NULL,
    "referenceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestMetadata" JSONB,
    "responsePayload" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "callback_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "callback_receipts_idempotencyKey_key" ON "callback_receipts"("idempotencyKey");
CREATE INDEX "callback_receipts_channel_provider_status_idx" ON "callback_receipts"("channel", "provider", "status");
CREATE INDEX "callback_receipts_workflowJobId_idx" ON "callback_receipts"("workflowJobId");
CREATE INDEX "callback_receipts_referenceType_referenceId_createdAt_idx" ON "callback_receipts"("referenceType", "referenceId", "createdAt");
