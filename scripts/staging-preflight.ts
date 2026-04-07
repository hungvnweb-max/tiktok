import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

interface PreflightIssue {
  code: string;
  message: string;
}

interface CliOptions {
  outputPath?: string;
}

const rootDir = process.cwd();
const envFilePath = path.join(rootDir, ".env");

const parseDotEnv = (source: string): Record<string, string> => {
  const parsed: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1).trim();

    if (!key) {
      continue;
    }

    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
};

const loadEnvFileFallbacks = (): void => {
  if (!fs.existsSync(envFilePath)) {
    return;
  }

  const parsed = parseDotEnv(fs.readFileSync(envFilePath, "utf8"));

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
};

const getEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const parseIntSafe = (value: string): number | null => {
  if (!/^-?\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseCliOptions = (
  args: string[],
  issueList: PreflightIssue[]
): CliOptions => {
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--output") {
      const outputPath = args[index + 1];
      if (!outputPath || outputPath.startsWith("--")) {
        issueList.push({
          code: "cli_output_path_missing",
          message: "Missing value for --output option."
        });
        continue;
      }

      options.outputPath = outputPath;
      index += 1;
      continue;
    }

    issueList.push({
      code: "cli_unknown_option",
      message: `Unknown option: ${arg}`
    });
  }

  return options;
};

const run = (): void => {
  loadEnvFileFallbacks();

  const requiredIssues: PreflightIssue[] = [];
  const warningIssues: PreflightIssue[] = [];
  const cliOptions = parseCliOptions(process.argv.slice(2), requiredIssues);

  const requireSingle = (key: string, label: string): string | undefined => {
    const value = getEnv(key);
    if (!value) {
      requiredIssues.push({
        code: `missing_${key.toLowerCase()}`,
        message: `Missing required ${label} (${key}).`
      });
      return undefined;
    }
    return value;
  };

  const requireAny = (
    keys: readonly string[],
    label: string
  ): { key: string; value: string } | undefined => {
    for (const key of keys) {
      const value = getEnv(key);
      if (value) {
        return { key, value };
      }
    }

    requiredIssues.push({
      code: `missing_${label.toLowerCase().replace(/\s+/g, "_")}`,
      message: `Missing required ${label}. Set one of: ${keys.join(", ")}.`
    });
    return undefined;
  };

  const validateMinLength = (
    key: string,
    value: string | undefined,
    minLength: number
  ): void => {
    if (!value) {
      return;
    }

    if (value.length < minLength) {
      requiredIssues.push({
        code: `${key.toLowerCase()}_too_short`,
        message: `${key} must be at least ${minLength} characters.`
      });
    }
  };

  const validatePostgresUrl = (key: string, value: string | undefined): void => {
    if (!value) {
      return;
    }

    if (!/^postgres(ql)?:\/\//i.test(value)) {
      requiredIssues.push({
        code: `${key.toLowerCase()}_invalid_scheme`,
        message: `${key} must start with postgres:// or postgresql://.`
      });
    }
  };

  const validateUrl = (key: string, value: string | undefined): void => {
    if (!value) {
      return;
    }

    try {
      const parsed = new URL(value);
      assert.ok(parsed.protocol === "http:" || parsed.protocol === "https:");
    } catch {
      requiredIssues.push({
        code: `${key.toLowerCase()}_invalid_url`,
        message: `${key} must be a valid http/https URL.`
      });
    }
  };

  const validateEmailList = (key: string, value: string | undefined): void => {
    if (!value) {
      return;
    }

    const entries = value
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (entries.length === 0) {
      requiredIssues.push({
        code: `${key.toLowerCase()}_empty`,
        message: `${key} must include at least one email address.`
      });
      return;
    }

    const invalid = entries.filter((entry) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry));
    if (invalid.length > 0) {
      requiredIssues.push({
        code: `${key.toLowerCase()}_invalid`,
        message: `${key} contains invalid email address values: ${invalid.join(", ")}.`
      });
    }
  };

  const validatePositiveInt = (
    key: string,
    value: string | undefined,
    issueList: PreflightIssue[],
    severityLabel: "required" | "warning"
  ): void => {
    if (!value) {
      return;
    }

    const parsed = parseIntSafe(value);
    if (parsed === null || parsed <= 0) {
      issueList.push({
        code: `${key.toLowerCase()}_invalid_number`,
        message: `${key} must be a positive integer (${severityLabel}).`
      });
    }
  };

  const databaseUrl = requireSingle("DATABASE_URL", "database URL");
  validatePostgresUrl("DATABASE_URL", databaseUrl);

  const reconcileToken = requireSingle(
    "INTERNAL_RECONCILIATION_TOKEN",
    "internal reconciliation token"
  );
  validateMinLength("INTERNAL_RECONCILIATION_TOKEN", reconcileToken, 16);

  const renderCallbackSecret = requireAny(
    ["TEMPLATE_RENDER_CALLBACK_SECRET", "RENDER_CALLBACK_SECRET"],
    "render callback secret"
  );
  validateMinLength(renderCallbackSecret?.key ?? "RENDER_CALLBACK_SECRET", renderCallbackSecret?.value, 16);

  const publishCallbackSecret = requireAny(
    ["TIKTOK_PUBLISH_CALLBACK_SECRET", "PUBLISH_CALLBACK_SECRET"],
    "publish callback secret"
  );
  validateMinLength(
    publishCallbackSecret?.key ?? "PUBLISH_CALLBACK_SECRET",
    publishCallbackSecret?.value,
    16
  );

  const alertWebhookUrl = requireSingle(
    "VIDEOTIK_ALERT_WEBHOOK_URL",
    "alert webhook URL"
  );
  validateUrl("VIDEOTIK_ALERT_WEBHOOK_URL", alertWebhookUrl);

  const alertEmailTo = requireSingle(
    "VIDEOTIK_ALERT_EMAIL_TO",
    "alert email recipients"
  );
  validateEmailList("VIDEOTIK_ALERT_EMAIL_TO", alertEmailTo);

  const smtpHost = getEnv("GF_SMTP_HOST");
  if (!smtpHost) {
    warningIssues.push({
      code: "missing_gf_smtp_host",
      message:
        "GF_SMTP_HOST is not set. Alert email delivery may fail unless SMTP is configured outside this env."
    });
  }

  const smtpFrom = getEnv("GF_SMTP_FROM_ADDRESS");
  if (!smtpFrom) {
    warningIssues.push({
      code: "missing_gf_smtp_from_address",
      message:
        "GF_SMTP_FROM_ADDRESS is not set. Alert email sender may be invalid unless configured outside this env."
    });
  }

  const renderOwner = getEnv("RENDER_RECONCILIATION_OWNER_ID");
  if (!renderOwner) {
    warningIssues.push({
      code: "missing_render_reconciliation_owner_id",
      message:
        "RENDER_RECONCILIATION_OWNER_ID is not set. Default random owner id will be used."
    });
  }

  const publishOwner = getEnv("PUBLISH_RECONCILIATION_OWNER_ID");
  if (!publishOwner) {
    warningIssues.push({
      code: "missing_publish_reconciliation_owner_id",
      message:
        "PUBLISH_RECONCILIATION_OWNER_ID is not set. Default random owner id will be used."
    });
  }

  validatePositiveInt(
    "PUBLISH_CALLBACK_TOLERANCE_SECONDS",
    getEnv("PUBLISH_CALLBACK_TOLERANCE_SECONDS"),
    warningIssues,
    "warning"
  );
  validatePositiveInt(
    "RENDER_RECONCILIATION_LEASE_MS",
    getEnv("RENDER_RECONCILIATION_LEASE_MS"),
    warningIssues,
    "warning"
  );
  validatePositiveInt(
    "PUBLISH_RECONCILIATION_LEASE_MS",
    getEnv("PUBLISH_RECONCILIATION_LEASE_MS"),
    warningIssues,
    "warning"
  );

  const dockerInfo = spawnSync("docker", ["info"], {
    encoding: "utf8"
  });

  if (dockerInfo.status !== 0) {
    requiredIssues.push({
      code: "docker_unavailable",
      message:
        "Docker daemon is not reachable (`docker info` failed). Required for sandbox observability e2e checks."
    });
  }

  const buildSummary = () => ({
    ok: requiredIssues.length === 0,
    requiredIssueCount: requiredIssues.length,
    warningCount: warningIssues.length,
    outputPath: cliOptions.outputPath ?? null,
    checked: {
      databaseUrl: Boolean(databaseUrl),
      internalReconcileToken: Boolean(reconcileToken),
      renderCallbackSecret: Boolean(renderCallbackSecret),
      publishCallbackSecret: Boolean(publishCallbackSecret),
      alertWebhookUrl: Boolean(alertWebhookUrl),
      alertEmailRecipients: Boolean(alertEmailTo),
      dockerReachable: dockerInfo.status === 0
    },
    requiredIssues,
    warnings: warningIssues
  });

  let summary = buildSummary();

  if (cliOptions.outputPath) {
    const resolvedOutputPath = path.resolve(rootDir, cliOptions.outputPath);

    try {
      fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
      fs.writeFileSync(
        resolvedOutputPath,
        `${JSON.stringify(summary, null, 2)}\n`,
        "utf8"
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown output write error.";
      requiredIssues.push({
        code: "preflight_output_write_failed",
        message: `Unable to write preflight output file (${resolvedOutputPath}): ${message}`
      });
      summary = buildSummary();
    }
  }

  if (requiredIssues.length > 0) {
    console.error(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
};

run();
