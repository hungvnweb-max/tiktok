export interface ReconciliationRuntimeConfig {
  enabled: boolean;
  intervalMs: number;
  staleAfterMs: number;
  batchSize: number;
  ownerId: string;
  leaseMs: number;
}

export interface ReconciliationRuntimeThresholds {
  consecutiveFailureWarnThreshold: number;
  failedCountWarnThreshold?: number;
  pendingCountWarnThreshold?: number;
  noSuccessWarnAfterMs?: number;
}

export interface ReconciliationRuntimeResult {
  scannedCount: number;
  pendingCount: number;
  failedCount: number;
  successCount: number;
  manualActionRequiredCount?: number;
}

export interface ReconciliationRuntimeSnapshot {
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
  lastResult?: ReconciliationRuntimeResult;
}

interface ReconciliationRuntimeState {
  running: boolean;
  consecutiveFailures: number;
  lastError: string | undefined;
  lastRunStartedAt: Date | undefined;
  lastRunCompletedAt: Date | undefined;
  lastSuccessAt: Date | undefined;
  lastDurationMs: number | undefined;
  lastResult: ReconciliationRuntimeResult | undefined;
}

export class ReconciliationHealthTracker {
  private readonly state: ReconciliationRuntimeState = {
    running: false,
    consecutiveFailures: 0,
    lastError: undefined,
    lastRunStartedAt: undefined,
    lastRunCompletedAt: undefined,
    lastSuccessAt: undefined,
    lastDurationMs: undefined,
    lastResult: undefined
  };

  constructor(
    private readonly name: string,
    private readonly config: ReconciliationRuntimeConfig,
    private readonly thresholds: ReconciliationRuntimeThresholds
  ) {}

  markRunStarted(at: Date = new Date()): void {
    this.state.running = true;
    this.state.lastRunStartedAt = at;
  }

  markRunSucceeded(result: ReconciliationRuntimeResult, at: Date = new Date()): string[] {
    this.state.running = false;
    this.state.consecutiveFailures = 0;
    this.state.lastError = undefined;
    this.state.lastRunCompletedAt = at;
    this.state.lastSuccessAt = at;
    this.state.lastResult = result;
    this.state.lastDurationMs = this.getDurationMs(at);

    const warnings: string[] = [];

    if (
      this.thresholds.failedCountWarnThreshold !== undefined &&
      result.failedCount >= this.thresholds.failedCountWarnThreshold
    ) {
      warnings.push(
        `${this.name} reconciliation failed count ${result.failedCount} reached warning threshold ${this.thresholds.failedCountWarnThreshold}.`
      );
    }

    if (
      this.thresholds.pendingCountWarnThreshold !== undefined &&
      result.pendingCount >= this.thresholds.pendingCountWarnThreshold
    ) {
      warnings.push(
        `${this.name} reconciliation pending count ${result.pendingCount} reached warning threshold ${this.thresholds.pendingCountWarnThreshold}.`
      );
    }

    return warnings;
  }

  markRunFailed(error: unknown, at: Date = new Date()): string[] {
    this.state.running = false;
    this.state.consecutiveFailures += 1;
    this.state.lastRunCompletedAt = at;
    this.state.lastDurationMs = this.getDurationMs(at);
    this.state.lastError = error instanceof Error ? error.message : String(error);

    const warnings: string[] = [];

    if (
      this.state.consecutiveFailures >=
      this.thresholds.consecutiveFailureWarnThreshold
    ) {
      warnings.push(
        `${this.name} reconciliation has ${this.state.consecutiveFailures} consecutive failures (threshold ${this.thresholds.consecutiveFailureWarnThreshold}).`
      );
    }

    if (
      this.thresholds.noSuccessWarnAfterMs !== undefined &&
      this.state.lastSuccessAt &&
      at.getTime() - this.state.lastSuccessAt.getTime() >=
        this.thresholds.noSuccessWarnAfterMs
    ) {
      warnings.push(
        `${this.name} reconciliation has no successful run for ${at.getTime() - this.state.lastSuccessAt.getTime()} ms (threshold ${this.thresholds.noSuccessWarnAfterMs}).`
      );
    }

    return warnings;
  }

  snapshot(): ReconciliationRuntimeSnapshot {
    return {
      enabled: this.config.enabled,
      intervalMs: this.config.intervalMs,
      staleAfterMs: this.config.staleAfterMs,
      batchSize: this.config.batchSize,
      ownerId: this.config.ownerId,
      leaseMs: this.config.leaseMs,
      running: this.state.running,
      consecutiveFailures: this.state.consecutiveFailures,
      ...(this.state.lastError ? { lastError: this.state.lastError } : {}),
      ...(this.state.lastRunStartedAt
        ? { lastRunStartedAt: this.state.lastRunStartedAt.toISOString() }
        : {}),
      ...(this.state.lastRunCompletedAt
        ? { lastRunCompletedAt: this.state.lastRunCompletedAt.toISOString() }
        : {}),
      ...(this.state.lastSuccessAt
        ? { lastSuccessAt: this.state.lastSuccessAt.toISOString() }
        : {}),
      ...(this.state.lastDurationMs === undefined
        ? {}
        : { lastDurationMs: this.state.lastDurationMs }),
      ...(this.state.lastResult ? { lastResult: this.state.lastResult } : {})
    };
  }

  private getDurationMs(endedAt: Date): number | undefined {
    if (!this.state.lastRunStartedAt) {
      return undefined;
    }

    return Math.max(0, endedAt.getTime() - this.state.lastRunStartedAt.getTime());
  }
}

export const readPositiveIntegerEnv = (
  name: string,
  fallback: number
): number => {
  const rawValue = process.env[name];

  if (!rawValue || rawValue.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
};
