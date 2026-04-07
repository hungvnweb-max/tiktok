import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const composeFile = path.join(
  process.cwd(),
  "infra/observability/sandbox/docker-compose.yml"
);

const runDockerCompose = async (args: string[]): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("docker", ["compose", "-f", composeFile, ...args], {
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `docker compose ${args.join(" ")} failed with exit code ${code ?? -1}.`
        )
      );
    });
  });
};

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const fetchOk = async (url: string, init?: RequestInit): Promise<Response> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    throw new Error(`Request ${url} failed with status ${response.status}.`);
  }

  return response;
};

const fetchJson = async (
  url: string,
  init?: RequestInit
): Promise<unknown> => {
  const response = await fetchOk(url, init);
  return response.json();
};

const waitFor = async <T>(
  label: string,
  loader: () => Promise<T>,
  predicate: (value: T) => boolean,
  options: {
    timeoutMs: number;
    intervalMs: number;
  }
): Promise<T> => {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const value = await loader();

      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(options.intervalMs);
  }

  throw new Error(
    `Timed out waiting for ${label}.${lastError ? ` Last error: ${String(lastError)}` : ""}`
  );
};

interface GrafanaReceiverConfig {
  uid?: string;
  type?: string;
  settings?: Record<string, unknown>;
}

interface GrafanaAlertmanagerReceiver {
  name: string;
  grafana_managed_receiver_configs?: GrafanaReceiverConfig[];
}

const run = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const skipUp = args.includes("--skip-up");
  const keepUp = args.includes("--keep-up");
  const grafanaAuth = `Basic ${Buffer.from("admin:admin").toString("base64")}`;
  const timeoutMs = 8 * 60 * 1000;
  const intervalMs = 5_000;
  let startedStack = false;

  try {
    if (!skipUp) {
      await runDockerCompose(["up", "-d", "--build"]);
      startedStack = true;
    }

    const health = (await waitFor(
      "videotik api health",
      () => fetchJson("http://localhost:3000/health"),
      (value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        const record = value as Record<string, unknown>;
        const reconciliation = record.reconciliation;

        if (!reconciliation || typeof reconciliation !== "object") {
          return false;
        }

        const pipelines = reconciliation as Record<string, unknown>;
        return (
          typeof record.status === "string" &&
          pipelines.render !== undefined &&
          pipelines.publish !== undefined
        );
      },
      { timeoutMs, intervalMs }
    )) as Record<string, unknown>;

    await waitFor(
      "alert sink health",
      () => fetchJson("http://localhost:9999/health"),
      (value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        const payload = value as { status?: string };
        return payload.status === "ok";
      },
      { timeoutMs, intervalMs }
    );

    const renderMetric = (await waitFor(
      "prometheus render reconciliation metric",
      () =>
        fetchJson(
          `http://localhost:9090/api/v1/query?${new URLSearchParams({
            query: "videotik_reconcile_render_consecutive_failures"
          }).toString()}`
        ),
      (value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        const payload = value as {
          status?: string;
          data?: { result?: unknown[] };
        };
        return (
          payload.status === "success" &&
          Array.isArray(payload.data?.result) &&
          payload.data.result.length > 0
        );
      },
      { timeoutMs, intervalMs }
    )) as Record<string, unknown>;

    const publishMetric = (await waitFor(
      "prometheus publish reconciliation metric",
      () =>
        fetchJson(
          `http://localhost:9090/api/v1/query?${new URLSearchParams({
            query: "videotik_reconcile_publish_consecutive_failures"
          }).toString()}`
        ),
      (value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        const payload = value as {
          status?: string;
          data?: { result?: unknown[] };
        };
        return (
          payload.status === "success" &&
          Array.isArray(payload.data?.result) &&
          payload.data.result.length > 0
        );
      },
      { timeoutMs, intervalMs }
    )) as Record<string, unknown>;

    const grafanaHealth = (await waitFor(
      "grafana health",
      () =>
        fetchJson("http://localhost:3001/api/health", {
          headers: {
            Authorization: grafanaAuth
          }
        }),
      (value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        const payload = value as { database?: string };
        return payload.database === "ok";
      },
      { timeoutMs, intervalMs }
    )) as Record<string, unknown>;

    const dashboardSearch = (await waitFor(
      "grafana reconciliation dashboard provisioning",
      () =>
        fetchJson(
          `http://localhost:3001/api/search?${new URLSearchParams({
            query: "Videotik Reconciliation Overview"
          }).toString()}`,
          {
            headers: {
              Authorization: grafanaAuth
            }
          }
        ),
      (value) => {
        if (!Array.isArray(value)) {
          return false;
        }

        return value.some((item) => {
          if (!item || typeof item !== "object") {
            return false;
          }

          const entry = item as { uid?: string; title?: string };
          return (
            entry.uid === "videotik-reconcile" ||
            entry.title === "Videotik Reconciliation Overview"
          );
        });
      },
      { timeoutMs, intervalMs }
    )) as unknown[];

    const alertRules = (await waitFor(
      "grafana unified alerting rules provisioning",
      () =>
        fetchJson("http://localhost:3001/api/v1/provisioning/alert-rules", {
          headers: {
            Authorization: grafanaAuth
          }
        }),
      (value) => {
        if (!Array.isArray(value)) {
          return false;
        }

        const titles = new Set(
          value.flatMap((item) => {
            if (!item || typeof item !== "object") {
              return [];
            }

            const entry = item as { title?: string };
            return typeof entry.title === "string" ? [entry.title] : [];
          })
        );

        return (
          titles.has("Videotik Render Reconcile Consecutive Failures") &&
          titles.has("Videotik Publish Reconcile Consecutive Failures")
        );
      },
      { timeoutMs, intervalMs }
    )) as unknown[];

    const contactPoints = (await waitFor(
      "grafana contact points provisioning",
      () =>
        fetchJson("http://localhost:3001/api/v1/provisioning/contact-points", {
          headers: {
            Authorization: grafanaAuth
          }
        }),
      (value) => {
        if (!Array.isArray(value)) {
          return false;
        }

        return value.some((item) => {
          if (!item || typeof item !== "object") {
            return false;
          }

          const entry = item as { name?: string };
          return entry.name === "videotik-alerting";
        });
      },
      { timeoutMs, intervalMs }
    )) as unknown[];

    const policies = (await waitFor(
      "grafana notification policy provisioning",
      () =>
        fetchJson("http://localhost:3001/api/v1/provisioning/policies", {
          headers: {
            Authorization: grafanaAuth
          }
        }),
      (value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        const record = value as Record<string, unknown>;
        return (
          typeof record.receiver === "string" &&
          record.receiver === "videotik-alerting"
        );
      },
      { timeoutMs, intervalMs }
    )) as Record<string, unknown>;

    await fetchOk("http://localhost:9999/events", {
      method: "DELETE"
    });
    await fetchOk("http://localhost:8025/api/v1/messages", {
      method: "DELETE"
    });

    const alertmanagerConfig = (await waitFor(
      "grafana alertmanager config",
      () =>
        fetchJson("http://localhost:3001/api/alertmanager/grafana/config/api/v1/alerts", {
          headers: {
            Authorization: grafanaAuth
          }
        }),
      (value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        const payload = value as {
          alertmanager_config?: { receivers?: unknown[] };
        };

        return Array.isArray(payload.alertmanager_config?.receivers);
      },
      { timeoutMs, intervalMs }
    )) as {
      alertmanager_config: {
        receivers: GrafanaAlertmanagerReceiver[];
      };
    };

    const videotikReceiver = alertmanagerConfig.alertmanager_config.receivers.find(
      (receiver) => receiver.name === "videotik-alerting"
    );
    assert.ok(videotikReceiver, "Expected videotik-alerting receiver in alertmanager config.");

    const smokeId = `alert-delivery-${Date.now()}`;
    const testAlertPayload = {
      receivers: [videotikReceiver],
      alert: {
        labels: {
          alertname: "VideotikSmokeAlertDelivery",
          severity: "warning",
          pipeline: "render",
          smoke_id: smokeId
        },
        annotations: {
          summary: `Smoke alert delivery ${smokeId}`,
          description: `Smoke alert delivery verification ${smokeId}`
        },
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        generatorURL: "http://localhost/smoke"
      }
    };

    const notificationTestResult = (await fetchJson(
      "http://localhost:3001/api/alertmanager/grafana/config/api/v1/receivers/test",
      {
        method: "POST",
        headers: {
          Authorization: grafanaAuth,
          "content-type": "application/json"
        },
        body: JSON.stringify(testAlertPayload)
      }
    )) as {
      receivers?: Array<{
        name?: string;
        grafana_managed_receiver_configs?: Array<{
          uid?: string;
          status?: string;
        }>;
      }>;
    };

    const testedVideotikReceiver = notificationTestResult.receivers?.find(
      (receiver) => receiver.name === "videotik-alerting"
    );
    assert.ok(testedVideotikReceiver, "Expected test result for videotik-alerting receiver.");

    const receiverStatuses = new Map(
      (testedVideotikReceiver.grafana_managed_receiver_configs ?? []).map((receiver) => [
        receiver.uid ?? "",
        receiver.status ?? ""
      ])
    );

    assert.equal(
      receiverStatuses.get("vt_webhook_ops"),
      "ok",
      "Expected webhook test receiver status to be ok."
    );
    assert.equal(
      receiverStatuses.get("vt_email_ops"),
      "ok",
      "Expected email test receiver status to be ok."
    );

    const negativeWebhookSmokeId = `alert-delivery-negative-webhook-${Date.now()}`;
    const negativeWebhookResult = (await fetchJson(
      "http://localhost:3001/api/alertmanager/grafana/config/api/v1/receivers/test",
      {
        method: "POST",
        headers: {
          Authorization: grafanaAuth,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          receivers: [
            {
              name: "videotik-alerting",
              grafana_managed_receiver_configs: [
                {
                  uid: "vt_webhook_ops",
                  name: "videotik-alerting",
                  type: "webhook",
                  disableResolveMessage: false,
                  settings: {
                    url: "http://127.0.0.1:1/mock-webhook",
                    httpMethod: "POST",
                    maxAlerts: 1,
                    title: "[NEGATIVE] webhook delivery smoke",
                    message: "negative webhook delivery smoke"
                  }
                }
              ]
            }
          ],
          alert: {
            labels: {
              alertname: "VideotikSmokeAlertDeliveryNegativeWebhook",
              severity: "warning",
              pipeline: "render",
              smoke_id: negativeWebhookSmokeId
            },
            annotations: {
              summary: `Negative webhook delivery smoke ${negativeWebhookSmokeId}`,
              description: `Negative webhook delivery smoke ${negativeWebhookSmokeId}`
            },
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
            generatorURL: "http://localhost/smoke-negative-webhook"
          }
        })
      }
    )) as {
      receivers?: Array<{
        name?: string;
        grafana_managed_receiver_configs?: Array<{
          uid?: string;
          status?: string;
          error?: string;
        }>;
      }>;
    };

    const negativeWebhookConfig = negativeWebhookResult.receivers
      ?.flatMap((receiver) => receiver.grafana_managed_receiver_configs ?? [])
      .find((receiver) => receiver.uid === "vt_webhook_ops");
    assert.ok(
      negativeWebhookConfig,
      "Expected negative webhook test result for vt_webhook_ops."
    );
    assert.equal(
      negativeWebhookConfig.status,
      "failed",
      "Expected negative webhook test to fail."
    );
    assert.ok(
      typeof negativeWebhookConfig.error === "string" && negativeWebhookConfig.error.length > 0,
      "Expected negative webhook test to include an error message."
    );

    const negativeEmailSmokeId = `alert-delivery-negative-email-${Date.now()}`;
    const negativeEmailResult = (await fetchJson(
      "http://localhost:3001/api/alertmanager/grafana/config/api/v1/receivers/test",
      {
        method: "POST",
        headers: {
          Authorization: grafanaAuth,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          receivers: [
            {
              name: "videotik-alerting",
              grafana_managed_receiver_configs: [
                {
                  uid: "vt_email_ops",
                  name: "videotik-alerting",
                  type: "email",
                  disableResolveMessage: false,
                  settings: {
                    addresses: "not-an-email"
                  }
                }
              ]
            }
          ],
          alert: {
            labels: {
              alertname: "VideotikSmokeAlertDeliveryNegativeEmail",
              severity: "warning",
              pipeline: "render",
              smoke_id: negativeEmailSmokeId
            },
            annotations: {
              summary: `Negative email delivery smoke ${negativeEmailSmokeId}`,
              description: `Negative email delivery smoke ${negativeEmailSmokeId}`
            },
            startsAt: new Date().toISOString(),
            endsAt: new Date(Date.now() + 5 * 60_000).toISOString(),
            generatorURL: "http://localhost/smoke-negative-email"
          }
        })
      }
    )) as {
      receivers?: Array<{
        name?: string;
        grafana_managed_receiver_configs?: Array<{
          uid?: string;
          status?: string;
          error?: string;
        }>;
      }>;
    };

    const negativeEmailConfig = negativeEmailResult.receivers
      ?.flatMap((receiver) => receiver.grafana_managed_receiver_configs ?? [])
      .find((receiver) => receiver.uid === "vt_email_ops");
    assert.ok(
      negativeEmailConfig,
      "Expected negative email test result for vt_email_ops."
    );
    assert.equal(
      negativeEmailConfig.status,
      "failed",
      "Expected negative email test to fail."
    );
    assert.ok(
      typeof negativeEmailConfig.error === "string" && negativeEmailConfig.error.length > 0,
      "Expected negative email test to include an error message."
    );

    const alertSinkEvent = (await waitFor(
      "alert sink webhook delivery",
      () => fetchJson("http://localhost:9999/events"),
      (value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        const payload = value as {
          events?: Array<{ body?: string }>;
        };
        return (
          Array.isArray(payload.events) &&
          payload.events.some((event) => event.body?.includes(smokeId))
        );
      },
      { timeoutMs, intervalMs }
    )) as {
      count?: number;
    };

    const mailhogMessages = (await waitFor(
      "mailhog email delivery",
      () => fetchJson("http://localhost:8025/api/v2/messages"),
      (value) => {
        if (!value || typeof value !== "object") {
          return false;
        }

        const payload = value as {
          items?: Array<{
            Raw?: { Data?: string };
            Content?: { Body?: string };
          }>;
        };

        return (
          Array.isArray(payload.items) &&
          payload.items.some((item) => {
            const raw = item.Raw?.Data ?? "";
            const body = item.Content?.Body ?? "";
            return raw.includes(smokeId) || body.includes(smokeId);
          })
        );
      },
      { timeoutMs, intervalMs }
    )) as {
      total?: number;
      items?: Array<{
        Content?: { Headers?: { Subject?: string[] } };
      }>;
    };

    assert.ok(health.reconciliation, "Health response must include reconciliation field.");
    assert.ok(grafanaHealth.database === "ok");
    assert.ok(Array.isArray(dashboardSearch));
    assert.ok(Array.isArray(alertRules));
    assert.ok(Array.isArray(contactPoints));
    assert.ok(typeof policies.receiver === "string");
    assert.ok(
      contactPoints.some((item) => {
        if (!item || typeof item !== "object") {
          return false;
        }

        const entry = item as {
          name?: string;
          settings?: { url?: string };
          uid?: string;
        };

        return (
          entry.name === "videotik-alerting" &&
          entry.uid === "vt_webhook_ops" &&
          entry.settings?.url === "http://alert-sink:9999/mock-webhook"
        );
      }),
      "Expected webhook contact point to target alert-sink service."
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          composeFile,
          startedStack,
          checks: {
            apiHealth: true,
            prometheusRenderMetric: true,
            prometheusPublishMetric: true,
            grafanaHealth: true,
            grafanaDashboardProvisioned: true,
            grafanaAlertRulesProvisioned: true,
            grafanaContactPointsProvisioned: true,
            grafanaPoliciesProvisioned: true,
            alertWebhookDelivery: true,
            alertEmailDelivery: true,
            alertNegativeWebhookFailure: true,
            alertNegativeEmailFailure: true
          },
          counts: {
            dashboardSearchHits: dashboardSearch.length,
            alertRuleCount: alertRules.length,
            contactPointCount: contactPoints.length,
            prometheusRenderSeries:
              ((renderMetric.data as { result?: unknown[] } | undefined)?.result ?? []).length,
            prometheusPublishSeries:
              ((publishMetric.data as { result?: unknown[] } | undefined)?.result ?? []).length,
            alertSinkEvents: alertSinkEvent.count ?? 0,
            mailhogMessages: mailhogMessages.total ?? 0
          },
          alertDelivery: {
            smokeId,
            receiverStatuses: Object.fromEntries(receiverStatuses),
            negativeWebhookSmokeId,
            negativeWebhookStatus: negativeWebhookConfig.status,
            negativeWebhookError:
              typeof negativeWebhookConfig.error === "string"
                ? negativeWebhookConfig.error.slice(0, 200)
                : null,
            negativeEmailSmokeId,
            negativeEmailStatus: negativeEmailConfig.status,
            negativeEmailError:
              typeof negativeEmailConfig.error === "string"
                ? negativeEmailConfig.error.slice(0, 200)
                : null,
            latestMailSubject:
              mailhogMessages.items?.[mailhogMessages.items.length - 1]?.Content?.Headers?.Subject?.[0] ??
              null
          }
        },
        null,
        2
      )
    );
  } finally {
    if (startedStack && !keepUp) {
      await runDockerCompose(["down", "-v"]);
    }
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
