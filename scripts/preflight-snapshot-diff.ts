import fs from "node:fs";
import path from "node:path";

interface DriftIssue {
  code: string;
  message: string;
}

interface DiffOptions {
  baselinePath?: string;
  currentPath?: string;
  outputPath?: string;
  strict: boolean;
  allowMissingBaseline: boolean;
}

interface SnapshotIssueLike {
  code?: string;
}

interface SnapshotLike {
  ok?: boolean;
  checked?: Record<string, unknown>;
  requiredIssues?: SnapshotIssueLike[];
  warnings?: SnapshotIssueLike[];
}

interface DriftEntry {
  type:
    | "checked_changed"
    | "required_issue_added"
    | "required_issue_removed"
    | "warning_added"
    | "warning_removed";
  key: string;
  baselineValue?: boolean | null;
  currentValue?: boolean | null;
}

const rootDir = process.cwd();

const parseOptions = (args: string[], issues: DriftIssue[]): DiffOptions => {
  const options: DiffOptions = {
    strict: false,
    allowMissingBaseline: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--baseline") {
      const baselinePath = args[index + 1];
      if (!baselinePath || baselinePath.startsWith("--")) {
        issues.push({
          code: "cli_baseline_path_missing",
          message: "Missing value for --baseline option."
        });
        continue;
      }
      options.baselinePath = baselinePath;
      index += 1;
      continue;
    }

    if (arg === "--current") {
      const currentPath = args[index + 1];
      if (!currentPath || currentPath.startsWith("--")) {
        issues.push({
          code: "cli_current_path_missing",
          message: "Missing value for --current option."
        });
        continue;
      }
      options.currentPath = currentPath;
      index += 1;
      continue;
    }

    if (arg === "--output") {
      const outputPath = args[index + 1];
      if (!outputPath || outputPath.startsWith("--")) {
        issues.push({
          code: "cli_output_path_missing",
          message: "Missing value for --output option."
        });
        continue;
      }
      options.outputPath = outputPath;
      index += 1;
      continue;
    }

    if (arg === "--strict") {
      options.strict = true;
      continue;
    }

    if (arg === "--allow-missing-baseline") {
      options.allowMissingBaseline = true;
      continue;
    }

    issues.push({
      code: "cli_unknown_option",
      message: `Unknown option: ${arg}`
    });
  }

  if (!options.baselinePath) {
    issues.push({
      code: "cli_baseline_path_required",
      message: "The --baseline option is required."
    });
  }

  if (!options.currentPath) {
    issues.push({
      code: "cli_current_path_required",
      message: "The --current option is required."
    });
  }

  return options;
};

const extractIssueCodes = (issues: unknown): string[] => {
  if (!Array.isArray(issues)) {
    return [];
  }

  return Array.from(
    new Set(
      issues
        .map((issue) => {
          if (!issue || typeof issue !== "object") {
            return null;
          }

          const candidate = issue as SnapshotIssueLike;
          return typeof candidate.code === "string" ? candidate.code : null;
        })
        .filter((code): code is string => Boolean(code))
    )
  ).sort((left, right) => left.localeCompare(right));
};

const normalizeChecked = (checked: unknown): Record<string, boolean> => {
  if (!checked || typeof checked !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(checked as Record<string, unknown>)
      .map(([key, value]) => [key, Boolean(value)] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  );
};

const readSnapshot = (
  inputPath: string,
  issues: DriftIssue[]
): SnapshotLike | null => {
  const resolvedPath = path.resolve(rootDir, inputPath);

  if (!fs.existsSync(resolvedPath)) {
    issues.push({
      code: "snapshot_missing",
      message: `Snapshot file not found: ${resolvedPath}`
    });
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, "utf8")) as SnapshotLike;
    if (!parsed || typeof parsed !== "object") {
      issues.push({
        code: "snapshot_invalid_shape",
        message: `Snapshot file has invalid JSON object shape: ${resolvedPath}`
      });
      return null;
    }
    return parsed;
  } catch (error) {
    issues.push({
      code: "snapshot_parse_failed",
      message: `Unable to parse snapshot JSON (${resolvedPath}): ${
        error instanceof Error ? error.message : "Unknown parse error."
      }`
    });
    return null;
  }
};

const writeOutput = (outputPath: string, payload: unknown): void => {
  const resolvedPath = path.resolve(rootDir, outputPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const run = (): void => {
  const issues: DriftIssue[] = [];
  const options = parseOptions(process.argv.slice(2), issues);

  const baselinePath = options.baselinePath ?? "";
  const currentPath = options.currentPath ?? "";
  const baselineResolvedPath = baselinePath ? path.resolve(rootDir, baselinePath) : null;

  const outputSummary = (
    payload: Record<string, unknown>,
    exitCode: number
  ): void => {
    try {
      if (options.outputPath) {
        writeOutput(options.outputPath, payload);
      }
    } catch (error) {
      issues.push({
        code: "diff_output_write_failed",
        message: `Unable to write diff output file: ${
          error instanceof Error ? error.message : "Unknown write error."
        }`
      });
      const fallbackPayload = {
        ...payload,
        ok: false,
        parseIssueCount: issues.length,
        parseIssues: issues
      };
      console.error(JSON.stringify(fallbackPayload, null, 2));
      process.exit(1);
    }

    if (exitCode === 0) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.error(JSON.stringify(payload, null, 2));
    process.exit(exitCode);
  };

  if (
    options.allowMissingBaseline &&
    baselineResolvedPath &&
    !fs.existsSync(baselineResolvedPath)
  ) {
    const skippedPayload = {
      ok: true,
      skipped: true,
      reason: "baseline_missing",
      strict: options.strict,
      baselinePath,
      currentPath,
      outputPath: options.outputPath ?? null,
      hasDrift: false,
      driftCount: 0,
      drift: [],
      parseIssueCount: issues.length,
      parseIssues: issues
    };
    outputSummary(skippedPayload, 0);
    return;
  }

  const baselineSnapshot = readSnapshot(baselinePath, issues);
  const currentSnapshot = readSnapshot(currentPath, issues);

  if (!baselineSnapshot || !currentSnapshot || issues.length > 0) {
    const failedPayload = {
      ok: false,
      skipped: false,
      strict: options.strict,
      baselinePath,
      currentPath,
      outputPath: options.outputPath ?? null,
      hasDrift: false,
      driftCount: 0,
      drift: [],
      parseIssueCount: issues.length,
      parseIssues: issues
    };
    outputSummary(failedPayload, 1);
    return;
  }

  const baselineChecked = normalizeChecked(baselineSnapshot.checked);
  const currentChecked = normalizeChecked(currentSnapshot.checked);
  const baselineRequiredCodes = extractIssueCodes(baselineSnapshot.requiredIssues);
  const currentRequiredCodes = extractIssueCodes(currentSnapshot.requiredIssues);
  const baselineWarningCodes = extractIssueCodes(baselineSnapshot.warnings);
  const currentWarningCodes = extractIssueCodes(currentSnapshot.warnings);

  const drift: DriftEntry[] = [];

  const checkedKeys = Array.from(
    new Set([...Object.keys(baselineChecked), ...Object.keys(currentChecked)])
  ).sort((left, right) => left.localeCompare(right));

  for (const key of checkedKeys) {
    const baselineValue = baselineChecked[key];
    const currentValue = currentChecked[key];
    if (baselineValue !== currentValue) {
      drift.push({
        type: "checked_changed",
        key,
        baselineValue: baselineValue ?? null,
        currentValue: currentValue ?? null
      });
    }
  }

  const baselineRequiredSet = new Set(baselineRequiredCodes);
  const currentRequiredSet = new Set(currentRequiredCodes);
  const baselineWarningSet = new Set(baselineWarningCodes);
  const currentWarningSet = new Set(currentWarningCodes);

  for (const code of baselineRequiredCodes) {
    if (!currentRequiredSet.has(code)) {
      drift.push({
        type: "required_issue_removed",
        key: code
      });
    }
  }

  for (const code of currentRequiredCodes) {
    if (!baselineRequiredSet.has(code)) {
      drift.push({
        type: "required_issue_added",
        key: code
      });
    }
  }

  for (const code of baselineWarningCodes) {
    if (!currentWarningSet.has(code)) {
      drift.push({
        type: "warning_removed",
        key: code
      });
    }
  }

  for (const code of currentWarningCodes) {
    if (!baselineWarningSet.has(code)) {
      drift.push({
        type: "warning_added",
        key: code
      });
    }
  }

  const hasDrift = drift.length > 0;
  const summary = {
    ok: !hasDrift || !options.strict,
    skipped: false,
    strict: options.strict,
    baselinePath,
    currentPath,
    outputPath: options.outputPath ?? null,
    hasDrift,
    driftCount: drift.length,
    drift,
    baseline: {
      ok: Boolean(baselineSnapshot.ok),
      checked: baselineChecked,
      requiredIssueCodes: baselineRequiredCodes,
      warningCodes: baselineWarningCodes
    },
    current: {
      ok: Boolean(currentSnapshot.ok),
      checked: currentChecked,
      requiredIssueCodes: currentRequiredCodes,
      warningCodes: currentWarningCodes
    },
    parseIssueCount: issues.length,
    parseIssues: issues
  };

  outputSummary(summary, hasDrift && options.strict ? 1 : 0);
};

run();
