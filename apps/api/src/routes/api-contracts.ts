export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export interface ApiListResponse<T> {
  items: T[];
}

export interface ReconciliationHealthResult {
  scannedCount: number;
  pendingCount: number;
  failedCount: number;
  successCount: number;
  manualActionRequiredCount?: number;
}

export interface ReconciliationHealthState {
  enabled: boolean;
  intervalMs: number;
  staleAfterMs: number;
  batchSize: number;
  ownerId: string;
  leaseMs: number;
  running: boolean;
  consecutiveFailures: number;
  lastError?: string;
  lastRunStartedAt?: string;
  lastRunCompletedAt?: string;
  lastSuccessAt?: string;
  lastDurationMs?: number;
  lastResult?: ReconciliationHealthResult;
}

export interface HealthResponse {
  status: "ok";
  persistenceMode: string;
  seededFormats: string[];
  reconciliation: {
    render: ReconciliationHealthState;
    publish: ReconciliationHealthState;
  };
}
