import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const readText = (relativePath: string): string => {
  const absolutePath = path.join(rootDir, relativePath);
  assert.ok(fs.existsSync(absolutePath), `Missing required file: ${relativePath}`);
  return fs.readFileSync(absolutePath, "utf8");
};

const assertContainsAll = (
  source: string,
  tokens: string[],
  sourceLabel: string
): void => {
  for (const token of tokens) {
    assert.ok(
      source.includes(token),
      `Expected token "${token}" in ${sourceLabel}, but it was not found.`
    );
  }
};

const run = (): void => {
  const sandboxE2eScriptPath = "scripts/observability-sandbox-e2e.ts";
  const prometheusModulePath =
    "infra/observability/prometheus/json-exporter/reconciliation-health-module.yml";
  const prometheusAlertsPath =
    "infra/observability/prometheus/alerts/reconciliation-alerts.rules.yml";
  const lokiAlertsPath = "infra/observability/loki/reconciliation-alerts.yml";
  const grafanaDashboardPath =
    "infra/observability/grafana/reconciliation-overview.dashboard.json";
  const grafanaUnifiedAlertingPath =
    "infra/observability/grafana/alerting/reconciliation-unified-alerting.yml";
  const grafanaContactPointsPath =
    "infra/observability/grafana/alerting/contact-points.yml";
  const grafanaPoliciesPath =
    "infra/observability/grafana/alerting/notification-policies.yml";
  const sandboxComposePath = "infra/observability/sandbox/docker-compose.yml";
  const sandboxPrometheusPath = "infra/observability/sandbox/prometheus/prometheus.yml";
  const sandboxGrafanaDatasourcePath =
    "infra/observability/sandbox/grafana/provisioning/datasources/datasources.yml";
  const sandboxGrafanaDashboardsPath =
    "infra/observability/sandbox/grafana/provisioning/dashboards/dashboards.yml";
  const preflightBaselinePath =
    "infra/observability/preflight/staging-preflight.baseline.json";
  const manualPromoteWorkflowPath =
    ".github/workflows/promote-preflight-baseline.yml";

  const prometheusModule = readText(prometheusModulePath);
  assertContainsAll(
    prometheusModule,
    [
      "videotik_reconcile_render_consecutive_failures",
      "videotik_reconcile_publish_consecutive_failures",
      "videotik_reconcile_render_pending_count",
      "videotik_reconcile_publish_pending_count",
      "videotik_reconcile_render_failed_count",
      "videotik_reconcile_publish_failed_count"
    ],
    prometheusModulePath
  );

  const prometheusAlerts = readText(prometheusAlertsPath);
  assertContainsAll(
    prometheusAlerts,
    [
      "VideotikPublishReconcileConsecutiveFailures",
      "VideotikRenderReconcileConsecutiveFailures",
      "VideotikPublishReconcilePendingBacklog",
      "VideotikRenderReconcilePendingBacklog",
      "VideotikPublishReconcileFailedItemsBurst",
      "VideotikRenderReconcileFailedItemsBurst"
    ],
    prometheusAlertsPath
  );

  const lokiAlerts = readText(lokiAlertsPath);
  assertContainsAll(
    lokiAlerts,
    [
      "VideotikPublishReconcileConsecutiveFailuresFromLogs",
      "VideotikRenderReconcileConsecutiveFailuresFromLogs",
      "VideotikPublishReconcilePendingWarningFromLogs",
      "VideotikRenderReconcilePendingWarningFromLogs"
    ],
    lokiAlertsPath
  );

  const grafanaUnifiedAlerting = readText(grafanaUnifiedAlertingPath);
  assertContainsAll(
    grafanaUnifiedAlerting,
    [
      "apiVersion: 1",
      "name: videotik-reconciliation",
      "DS_PROMETHEUS_UID",
      "Videotik Render Reconcile Consecutive Failures",
      "Videotik Publish Reconcile Consecutive Failures",
      "Videotik Render Reconcile Pending Backlog",
      "Videotik Publish Reconcile Pending Backlog",
      "Videotik Render Reconcile Failed Items",
      "Videotik Publish Reconcile Failed Items",
      "videotik_reconcile_render_consecutive_failures",
      "videotik_reconcile_publish_consecutive_failures",
      "videotik_reconcile_render_pending_count",
      "videotik_reconcile_publish_pending_count",
      "videotik_reconcile_render_failed_count",
      "videotik_reconcile_publish_failed_count"
    ],
    grafanaUnifiedAlertingPath
  );

  const grafanaContactPoints = readText(grafanaContactPointsPath);
  assertContainsAll(
    grafanaContactPoints,
    [
      "apiVersion: 1",
      "name: videotik-alerting",
      "uid: vt_webhook_ops",
      "uid: vt_email_ops",
      "VIDEOTIK_ALERT_WEBHOOK_URL",
      "VIDEOTIK_ALERT_EMAIL_TO"
    ],
    grafanaContactPointsPath
  );

  const grafanaPolicies = readText(grafanaPoliciesPath);
  assertContainsAll(
    grafanaPolicies,
    [
      "apiVersion: 1",
      "receiver: videotik-alerting",
      "group_by:",
      "- alertname",
      "- pipeline",
      "- severity",
      "severity",
      "critical",
      "warning",
      "render",
      "publish"
    ],
    grafanaPoliciesPath
  );

  const sandboxCompose = readText(sandboxComposePath);
  assertContainsAll(
    sandboxCompose,
    [
      "videotik-api:",
      "alert-sink:",
      "mailhog:",
      "json-exporter:",
      "prometheus:",
      "grafana:",
      "VIDEOTIK_ALERT_WEBHOOK_URL: http://alert-sink:9999/mock-webhook",
      "reconciliation-unified-alerting.yml",
      "contact-points.yml",
      "notification-policies.yml",
      "RENDER_RECONCILIATION_STALE_AFTER_MS: \"-1\"",
      "PUBLISH_RECONCILIATION_STALE_AFTER_MS: \"-1\""
    ],
    sandboxComposePath
  );

  const sandboxPrometheus = readText(sandboxPrometheusPath);
  assertContainsAll(
    sandboxPrometheus,
    [
      "job_name: videotik_health_json",
      "module:",
      "videotik_reconciliation_health",
      "http://videotik-api:3000/health",
      "replacement: json-exporter:7979"
    ],
    sandboxPrometheusPath
  );

  const sandboxGrafanaDatasource = readText(sandboxGrafanaDatasourcePath);
  assertContainsAll(
    sandboxGrafanaDatasource,
    [
      "name: Prometheus",
      "uid: prometheus",
      "url: http://prometheus:9090"
    ],
    sandboxGrafanaDatasourcePath
  );

  const sandboxGrafanaDashboards = readText(sandboxGrafanaDashboardsPath);
  assertContainsAll(
    sandboxGrafanaDashboards,
    [
      "name: Videotik Reconciliation",
      "folder: Videotik",
      "path: /var/lib/grafana/dashboards"
    ],
    sandboxGrafanaDashboardsPath
  );

  const grafanaDashboard = readText(grafanaDashboardPath);
  const dashboardObject = JSON.parse(grafanaDashboard) as {
    title?: string;
    uid?: string;
    panels?: Array<{ id?: number; title?: string; targets?: Array<{ expr?: string }> }>;
  };
  assert.equal(dashboardObject.title, "Videotik Reconciliation Overview");
  assert.equal(dashboardObject.uid, "videotik-reconcile");
  assert.ok(Array.isArray(dashboardObject.panels), "Dashboard panels must be an array.");
  assert.ok(
    dashboardObject.panels.length >= 6,
    "Dashboard must include at least 6 observability panels."
  );

  const panelTitles = new Set(dashboardObject.panels.map((panel) => panel.title));
  for (const requiredTitle of [
    "Render Consecutive Failures",
    "Publish Consecutive Failures",
    "Render Pending Count",
    "Publish Pending Count",
    "Render Failed Count",
    "Publish Failed Count"
  ]) {
    assert.ok(panelTitles.has(requiredTitle), `Missing required dashboard panel: ${requiredTitle}`);
  }

  const allExpressions = new Set(
    dashboardObject.panels.flatMap((panel) =>
      (panel.targets ?? []).map((target) => target.expr).filter(Boolean) as string[]
    )
  );
  for (const requiredExpression of [
    "videotik_reconcile_render_consecutive_failures",
    "videotik_reconcile_publish_consecutive_failures",
    "videotik_reconcile_render_pending_count",
    "videotik_reconcile_publish_pending_count",
    "videotik_reconcile_render_failed_count",
    "videotik_reconcile_publish_failed_count"
  ]) {
    assert.ok(
      allExpressions.has(requiredExpression),
      `Missing required dashboard query expression: ${requiredExpression}`
    );
  }

  const sandboxE2eScript = readText(sandboxE2eScriptPath);
  assertContainsAll(
    sandboxE2eScript,
    [
      "docker compose",
      "http://localhost:3000/health",
      "http://localhost:9090/api/v1/query",
      "http://localhost:3001/api/health",
      "/api/alertmanager/grafana/config/api/v1/alerts",
      "/api/alertmanager/grafana/config/api/v1/receivers/test",
      "/api/v1/provisioning/alert-rules",
      "/api/v1/provisioning/contact-points",
      "/api/v1/provisioning/policies",
      "http://localhost:9999/events",
      "http://localhost:8025/api/v2/messages",
      "alertNegativeWebhookFailure",
      "alertNegativeEmailFailure",
      "not-an-email",
      "127.0.0.1:1"
    ],
    sandboxE2eScriptPath
  );

  const preflightBaseline = readText(preflightBaselinePath);
  const preflightBaselineObject = JSON.parse(preflightBaseline) as {
    ok?: boolean;
    checked?: Record<string, unknown>;
    requiredIssues?: unknown[];
  };
  assert.equal(preflightBaselineObject.ok, true);
  assert.ok(
    preflightBaselineObject.checked &&
      typeof preflightBaselineObject.checked === "object",
    "Preflight baseline must include checked summary."
  );
  assert.equal(
    (preflightBaselineObject.checked as Record<string, unknown>).databaseUrl,
    true
  );
  assert.equal(
    (preflightBaselineObject.checked as Record<string, unknown>).dockerReachable,
    true
  );
  assert.ok(
    Array.isArray(preflightBaselineObject.requiredIssues),
    "Preflight baseline requiredIssues must be an array."
  );
  assert.equal(preflightBaselineObject.requiredIssues.length, 0);

  const manualPromoteWorkflow = readText(manualPromoteWorkflowPath);
  assertContainsAll(
    manualPromoteWorkflow,
    [
      "workflow_dispatch",
      "apply_update",
      "preflight:staging:snapshot",
      "preflight:staging:diff",
      "preflight:staging:baseline",
      "peter-evans/create-pull-request",
      "infra/observability/preflight/staging-preflight.baseline.json"
    ],
    manualPromoteWorkflowPath
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checked: {
          prometheusModulePath,
          prometheusAlertsPath,
          lokiAlertsPath,
          grafanaDashboardPath,
          grafanaUnifiedAlertingPath,
          grafanaContactPointsPath,
          grafanaPoliciesPath,
          sandboxComposePath,
          sandboxPrometheusPath,
          sandboxGrafanaDatasourcePath,
          sandboxGrafanaDashboardsPath,
          sandboxE2eScriptPath,
          preflightBaselinePath,
          manualPromoteWorkflowPath
        },
        dashboardPanelCount: dashboardObject.panels.length
      },
      null,
      2
    )
  );
};

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
