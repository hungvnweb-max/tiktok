import fs from "node:fs";
import path from "node:path";

interface BaselineIssue {
  code: string;
  message: string;
}

interface BaselineOptions {
  sourcePath: string;
  targetPath: string;
}

const rootDir = process.cwd();

const parseOptions = (args: string[], issues: BaselineIssue[]): BaselineOptions => {
  const options: BaselineOptions = {
    sourcePath: ".artifacts/preflight/staging-preflight.json",
    targetPath: ".artifacts/preflight/staging-preflight.baseline.json"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--source") {
      const sourcePath = args[index + 1];
      if (!sourcePath || sourcePath.startsWith("--")) {
        issues.push({
          code: "cli_source_path_missing",
          message: "Missing value for --source option."
        });
        continue;
      }
      options.sourcePath = sourcePath;
      index += 1;
      continue;
    }

    if (arg === "--target") {
      const targetPath = args[index + 1];
      if (!targetPath || targetPath.startsWith("--")) {
        issues.push({
          code: "cli_target_path_missing",
          message: "Missing value for --target option."
        });
        continue;
      }
      options.targetPath = targetPath;
      index += 1;
      continue;
    }

    issues.push({
      code: "cli_unknown_option",
      message: `Unknown option: ${arg}`
    });
  }

  return options;
};

const run = (): void => {
  const issues: BaselineIssue[] = [];
  const options = parseOptions(process.argv.slice(2), issues);
  const sourceResolvedPath = path.resolve(rootDir, options.sourcePath);
  const targetResolvedPath = path.resolve(rootDir, options.targetPath);

  if (!fs.existsSync(sourceResolvedPath)) {
    issues.push({
      code: "source_snapshot_missing",
      message: `Source snapshot does not exist: ${sourceResolvedPath}`
    });
  }

  let sourceContent = "";

  if (issues.length === 0) {
    try {
      sourceContent = fs.readFileSync(sourceResolvedPath, "utf8");
      JSON.parse(sourceContent);
    } catch (error) {
      issues.push({
        code: "source_snapshot_invalid_json",
        message: `Source snapshot must be valid JSON: ${
          error instanceof Error ? error.message : "Unknown parse error."
        }`
      });
    }
  }

  if (issues.length > 0) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          sourcePath: options.sourcePath,
          targetPath: options.targetPath,
          issueCount: issues.length,
          issues
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(targetResolvedPath), { recursive: true });
  fs.writeFileSync(targetResolvedPath, sourceContent.endsWith("\n") ? sourceContent : `${sourceContent}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        sourcePath: options.sourcePath,
        targetPath: options.targetPath,
        sourceResolvedPath,
        targetResolvedPath
      },
      null,
      2
    )
  );
};

run();
