import fs from "node:fs";
import path from "node:path";
import {
  createTemplateRenderCallbackSignature
} from "../apps/api/src/adapters/template-render-pipeline-adapter";

interface CliOptions {
  datasetPath: string;
  outputPath: string;
  strict: boolean;
}

interface DatasetTopic {
  name: string;
  description: string;
  audience: string;
  slug?: string;
  contentPillars?: string[];
  keywords?: string[];
  preferredFormatSlugs?: string[];
}

interface DatasetSchedule {
  platformSlug?: string;
  provider?: string;
  timezone?: string;
  offsetMinutes?: number;
}

interface DatasetItem {
  id: string;
  contentFormatSlug: string;
  publishMode: "manual" | "semi_auto" | "full_auto";
  topic: DatasetTopic;
  schedule?: DatasetSchedule;
  hashtags?: string[];
  manualImageBaseUrl?: string;
}

interface DatasetFile {
  version: number;
  items: DatasetItem[];
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

interface TopicResponse {
  id: string;
}

interface IdeaGenerateResponse {
  idea: {
    id: string;
  };
}

interface ScriptGenerateResponse {
  script: {
    id: string;
  };
  video: {
    id: string;
  };
}

interface CaptionGenerateResponse {
  caption: {
    shortCaption: string;
    hashtags: string[];
  };
}

interface RenderValidateResponse {
  report: {
    isValid: boolean;
    issues: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  };
}

interface RenderEnqueueResponse {
  job: {
    id: string;
    payload?: {
      callbackToken?: string;
    };
  };
  submission: {
    providerJobId: string;
    providerStatus: string;
  };
}

interface PublishValidateResponse {
  report: {
    isValid: boolean;
    issues: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  };
}

interface PublishResponse {
  attempt: {
    id: string;
    status: string;
    providerStatus?: string;
    sequenceNumber: number;
  };
}

interface PublishAttemptListResponse {
  items: PublishAttemptSummary[];
}

interface PublishAttemptSummary {
  id: string;
  sequenceNumber: number;
  status: string;
  providerStatus?: string;
  workflowAttemptCount: number;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  failureStage?: string;
}

interface VideoDetailResponse {
  video: {
    id: string;
    status: string;
  };
  schedule?: {
    id: string;
    status: string;
    mode: "manual" | "semi_auto" | "full_auto";
    provider: string;
  };
  publishAttempts: PublishAttemptSummary[];
  scenes: Array<{
    scene: {
      id: string;
      order: number;
    };
  }>;
}

interface PublishReconcileResponse {
  scannedCount: number;
  publishedCount: number;
  manualActionRequiredCount: number;
  failedCount: number;
  pendingCount: number;
  items: Array<{
    publishAttemptId: string;
    outcome:
      | "pending"
      | "manual_action_required"
      | "published"
      | "failed_timeout"
      | "failed_provider"
      | "failed_workflow";
    providerStatus?: string;
    message?: string;
  }>;
}

interface StateTransitionSnapshot {
  at: string;
  step: string;
  videoStatus: string;
  scheduleStatus: string | null;
  latestPublishAttemptStatus: string | null;
  publishAttemptCount: number;
}

interface RollbackMarker {
  code: string;
  message: string;
  recommendedAction: string;
  severity: "info" | "warning" | "critical";
}

interface PerVideoReport {
  datasetItemId: string;
  contentFormatSlug: string;
  publishMode: "manual" | "semi_auto" | "full_auto";
  success: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  topicId?: string;
  videoId?: string;
  stateTransitions: StateTransitionSnapshot[];
  publishAttemptTimeline: PublishAttemptSummary[];
  rollbackMarkers: RollbackMarker[];
  error?: {
    message: string;
    details?: Record<string, unknown>;
  };
  reconcileResult?: PublishReconcileResponse;
}

interface PilotDryRunReport {
  ok: boolean;
  strict: boolean;
  generatedAt: string;
  apiBaseUrl: string;
  datasetPath: string;
  outputPath: string;
  totals: {
    requested: number;
    succeeded: number;
    failed: number;
  };
  items: PerVideoReport[];
}

const defaultDatasetPath = "infra/pilot/pilot-dry-run-dataset.json";
const defaultOutputPath = ".artifacts/pilot/pilot-dry-run-report.json";
const defaultApiBaseUrl = "http://localhost:3000";
const defaultRenderCallbackSecret = "videotik-template-render-dev-secret";

const parseCliOptions = (args: string[]): CliOptions => {
  const options: CliOptions = {
    datasetPath: process.env.PILOT_DRY_RUN_DATASET_PATH ?? defaultDatasetPath,
    outputPath: process.env.PILOT_DRY_RUN_OUTPUT_PATH ?? defaultOutputPath,
    strict: process.env.PILOT_DRY_RUN_STRICT === "true"
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dataset") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --dataset option.");
      }
      options.datasetPath = value;
      index += 1;
      continue;
    }

    if (arg === "--output") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --output option.");
      }
      options.outputPath = value;
      index += 1;
      continue;
    }

    if (arg === "--strict") {
      options.strict = true;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
};

const loadDataset = (datasetPath: string): DatasetFile => {
  const resolved = path.resolve(process.cwd(), datasetPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Dataset file not found: ${resolved}`);
  }

  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8")) as DatasetFile;

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
    throw new Error("Dataset file has invalid shape. Expected { version, items[] }.");
  }

  if (parsed.items.length === 0) {
    throw new Error("Dataset file has no items.");
  }

  for (const [index, item] of parsed.items.entries()) {
    if (!item.id || !item.contentFormatSlug || !item.publishMode) {
      throw new Error(`Dataset item at index ${index} is missing id/contentFormatSlug/publishMode.`);
    }
    if (!item.topic || !item.topic.name || !item.topic.description || !item.topic.audience) {
      throw new Error(`Dataset item "${item.id}" has invalid topic payload.`);
    }
  }

  return parsed;
};

const buildHeaders = (base: Record<string, string> = {}): Record<string, string> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...base
  };
  const apiToken = process.env.PILOT_API_TOKEN?.trim();
  if (apiToken) {
    headers.authorization = `Bearer ${apiToken}`;
  }
  return headers;
};

const requestJson = async <T>(input: {
  baseUrl: string;
  path: string;
  method: "GET" | "POST" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
}): Promise<T> => {
  const response = await fetch(`${input.baseUrl}${input.path}`, {
    method: input.method,
    headers: buildHeaders(input.headers),
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) })
  });

  const text = await response.text();
  let maybeJson: unknown = undefined;

  if (text.length > 0) {
    try {
      maybeJson = JSON.parse(text) as unknown;
    } catch {
      maybeJson = text;
    }
  }

  if (!response.ok) {
    const payload =
      maybeJson && typeof maybeJson === "object"
        ? (maybeJson as ApiErrorPayload)
        : {};
    const message =
      payload.error?.message ??
      `Request ${input.method} ${input.path} failed with status ${response.status}.`;
    const error = new Error(message) as Error & {
      statusCode?: number;
      details?: Record<string, unknown>;
      code?: string;
      path?: string;
      method?: string;
    };
    error.statusCode = response.status;
    if (payload.error?.code) {
      error.code = payload.error.code;
    }
    if (payload.error?.details) {
      error.details = payload.error.details;
    }
    error.path = input.path;
    error.method = input.method;
    throw error;
  }

  return maybeJson as T;
};

const createImageUrl = (datasetItemId: string, sceneId: string): string => {
  const seed = encodeURIComponent(`${datasetItemId}-${sceneId}`);
  return `https://picsum.photos/seed/${seed}/1080/1920`;
};

const addRollbackMarker = (
  markers: RollbackMarker[],
  marker: RollbackMarker
): void => {
  if (markers.some((entry) => entry.code === marker.code)) {
    return;
  }
  markers.push(marker);
};

const toErrorRecord = (error: unknown): { message: string; details?: Record<string, unknown> } => {
  if (error instanceof Error) {
    const record: { message: string; details?: Record<string, unknown> } = {
      message: error.message
    };
    const annotated = error as Error & {
      statusCode?: number;
      details?: Record<string, unknown>;
      code?: string;
      path?: string;
      method?: string;
    };
    const details: Record<string, unknown> = {};
    if (annotated.statusCode !== undefined) {
      details.statusCode = annotated.statusCode;
    }
    if (annotated.code) {
      details.code = annotated.code;
    }
    if (annotated.path) {
      details.path = annotated.path;
    }
    if (annotated.method) {
      details.method = annotated.method;
    }
    if (annotated.details) {
      details.apiDetails = annotated.details;
    }
    if (Object.keys(details).length > 0) {
      record.details = details;
    }
    return record;
  }

  return {
    message: String(error)
  };
};

const resolveRenderCallbackSecret = (): string => {
  return (
    process.env.PILOT_RENDER_CALLBACK_SECRET?.trim() ||
    process.env.TEMPLATE_RENDER_CALLBACK_SECRET?.trim() ||
    process.env.RENDER_CALLBACK_SECRET?.trim() ||
    defaultRenderCallbackSecret
  );
};

const captureTransition = async (input: {
  baseUrl: string;
  videoId: string;
  step: string;
}): Promise<StateTransitionSnapshot> => {
  const detail = await requestJson<VideoDetailResponse>({
    baseUrl: input.baseUrl,
    path: `/videos/${input.videoId}`,
    method: "GET"
  });
  const latestAttempt = detail.publishAttempts.at(-1);

  return {
    at: new Date().toISOString(),
    step: input.step,
    videoStatus: detail.video.status,
    scheduleStatus: detail.schedule?.status ?? null,
    latestPublishAttemptStatus: latestAttempt?.status ?? null,
    publishAttemptCount: detail.publishAttempts.length
  };
};

const runPerVideo = async (input: {
  baseUrl: string;
  datasetItem: DatasetItem;
}): Promise<PerVideoReport> => {
  const startedAt = new Date();
  const stateTransitions: StateTransitionSnapshot[] = [];
  const rollbackMarkers: RollbackMarker[] = [];
  let topicId: string | undefined;
  let videoId: string | undefined;
  let reconcileResult: PublishReconcileResponse | undefined;

  try {
    const schedule = input.datasetItem.schedule ?? {};
    const scheduledFor = new Date(
      Date.now() + (schedule.offsetMinutes ?? 30) * 60_000
    ).toISOString();

    const topic = await requestJson<TopicResponse>({
      baseUrl: input.baseUrl,
      path: "/topics",
      method: "POST",
      body: {
        ...input.datasetItem.topic,
        slug:
          input.datasetItem.topic.slug ??
          `${input.datasetItem.id}-${Date.now().toString(36)}`
      }
    });
    topicId = topic.id;

    const idea = await requestJson<IdeaGenerateResponse>({
      baseUrl: input.baseUrl,
      path: "/ideas/generate",
      method: "POST",
      body: {
        topicId: topic.id,
        contentFormatSlug: input.datasetItem.contentFormatSlug
      }
    });

    const script = await requestJson<ScriptGenerateResponse>({
      baseUrl: input.baseUrl,
      path: "/scripts/generate",
      method: "POST",
      body: {
        ideaId: idea.idea.id
      }
    });
    videoId = script.video.id;

    stateTransitions.push(
      await captureTransition({
        baseUrl: input.baseUrl,
        videoId: script.video.id,
        step: "script_generated"
      })
    );

    const captionResult = await requestJson<CaptionGenerateResponse>({
      baseUrl: input.baseUrl,
      path: "/captions/generate",
      method: "POST",
      body: {
        scriptId: script.script.id
      }
    });

    await requestJson({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}/image-prompts/generate`,
      method: "POST",
      body: {}
    });

    const detailAfterPrompt = await requestJson<VideoDetailResponse>({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}`,
      method: "GET"
    });

    for (const sceneDetail of detailAfterPrompt.scenes) {
      const assetUrl = input.datasetItem.manualImageBaseUrl
        ? `${input.datasetItem.manualImageBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(
            `${input.datasetItem.id}-${sceneDetail.scene.order}`
          )}.jpg`
        : createImageUrl(input.datasetItem.id, sceneDetail.scene.id);

      await requestJson({
        baseUrl: input.baseUrl,
        path: `/videos/${script.video.id}/scenes/${sceneDetail.scene.id}/images/manual`,
        method: "POST",
        body: {
          assetUrl
        }
      });
    }

    await requestJson({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}/subtitles/generate`,
      method: "POST",
      body: {}
    });

    stateTransitions.push(
      await captureTransition({
        baseUrl: input.baseUrl,
        videoId: script.video.id,
        step: "assets_prepared"
      })
    );

    const renderValidation = await requestJson<RenderValidateResponse>({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}/render/validate`,
      method: "POST",
      body: {}
    });

    if (!renderValidation.report.isValid) {
      addRollbackMarker(rollbackMarkers, {
        code: "render_validation_failed",
        message: "Render validation failed during pilot dry-run.",
        recommendedAction: "Review scene assets/subtitles and rerun render preparation.",
        severity: "critical"
      });

      throw new Error(
        `Render validation failed: ${JSON.stringify(renderValidation.report.issues)}`
      );
    }

    const renderQueued = await requestJson<RenderEnqueueResponse>({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}/render`,
      method: "POST",
      body: {}
    });

    stateTransitions.push(
      await captureTransition({
        baseUrl: input.baseUrl,
        videoId: script.video.id,
        step: "render_enqueued"
      })
    );

    const callbackToken = renderQueued.job.payload?.callbackToken;
    if (!callbackToken) {
      throw new Error("Render enqueue response missing callbackToken.");
    }

    const renderCallbackIdempotencyKey = `pilot-render-${input.datasetItem.id}-${Date.now()}`;
    const renderCallbackTimestamp = new Date().toISOString();
    const renderAssetUrl = `https://example.com/pilot/${encodeURIComponent(
      input.datasetItem.id
    )}/${script.video.id}/render.mp4`;
    const renderPayload = {
      assetUrl: renderAssetUrl,
      providerStatus: "completed_pilot_dry_run"
    };

    const renderCallbackSignature = createTemplateRenderCallbackSignature(
      {
        action: "complete",
        workflowJob: renderQueued.job as any,
        callbackToken,
        providerJobId: renderQueued.submission.providerJobId,
        idempotencyKey: renderCallbackIdempotencyKey,
        signatureTimestamp: renderCallbackTimestamp,
        payload: renderPayload
      },
      resolveRenderCallbackSecret()
    );

    await requestJson({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}/render/complete`,
      method: "POST",
      headers: {
        "x-render-callback-id": renderCallbackIdempotencyKey,
        "x-render-callback-signature": renderCallbackSignature,
        "x-render-callback-timestamp": renderCallbackTimestamp
      },
      body: {
        workflowJobId: renderQueued.job.id,
        callbackToken,
        providerJobId: renderQueued.submission.providerJobId,
        assetUrl: renderAssetUrl,
        providerStatus: "completed_pilot_dry_run"
      }
    });

    stateTransitions.push(
      await captureTransition({
        baseUrl: input.baseUrl,
        videoId: script.video.id,
        step: "render_completed"
      })
    );

    await requestJson({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}/schedule`,
      method: "POST",
      body: {
        platformSlug: schedule.platformSlug ?? "tiktok",
        provider: schedule.provider ?? "tiktok",
        mode: input.datasetItem.publishMode,
        timezone: schedule.timezone ?? "Europe/Berlin",
        scheduledFor,
        caption: captionResult.caption.shortCaption,
        hashtags:
          input.datasetItem.hashtags ??
          (captionResult.caption.hashtags.length > 0
            ? captionResult.caption.hashtags
            : ["#pilot_dry_run"])
      }
    });

    stateTransitions.push(
      await captureTransition({
        baseUrl: input.baseUrl,
        videoId: script.video.id,
        step: "scheduled"
      })
    );

    const publishValidation = await requestJson<PublishValidateResponse>({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}/publish/validate`,
      method: "POST",
      body: {
        force: true
      }
    });

    if (!publishValidation.report.isValid) {
      addRollbackMarker(rollbackMarkers, {
        code: "publish_validation_failed",
        message: "Publish validation failed during pilot dry-run.",
        recommendedAction: "Inspect schedule/caption/render output before re-publishing.",
        severity: "critical"
      });
      throw new Error(
        `Publish validation failed: ${JSON.stringify(publishValidation.report.issues)}`
      );
    }

    const publishResult = await requestJson<PublishResponse>({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}/publish`,
      method: "POST",
      body: {
        force: true
      }
    });

    stateTransitions.push(
      await captureTransition({
        baseUrl: input.baseUrl,
        videoId: script.video.id,
        step: "publish_triggered"
      })
    );

    if (input.datasetItem.publishMode === "semi_auto") {
      const reconcileHeaders: Record<string, string> = {};
      const reconcileToken = process.env.PILOT_RECONCILE_TOKEN?.trim();
      if (reconcileToken) {
        reconcileHeaders["x-reconcile-token"] = reconcileToken;
      }

      reconcileResult = await requestJson<PublishReconcileResponse>({
        baseUrl: input.baseUrl,
        path: "/publish/reconcile",
        method: "POST",
        headers: reconcileHeaders,
        body: {
          staleAfterMs: 5 * 60 * 1000,
          limit: 100
        }
      });

      stateTransitions.push(
        await captureTransition({
          baseUrl: input.baseUrl,
          videoId: script.video.id,
          step: "publish_reconciled"
        })
      );
    }

    const publishAttempts = await requestJson<PublishAttemptListResponse>({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}/publish-attempts`,
      method: "GET"
    });

    const finalDetail = await requestJson<VideoDetailResponse>({
      baseUrl: input.baseUrl,
      path: `/videos/${script.video.id}`,
      method: "GET"
    });

    if (publishResult.attempt.status === "manual_action_required") {
      addRollbackMarker(rollbackMarkers, {
        code: "manual_publish_followup_required",
        message: "Attempt requires manual publish follow-up.",
        recommendedAction: "Complete manual publish checklist and confirm final platform state.",
        severity: "info"
      });
    }

    if (publishAttempts.items.some((attempt) => attempt.status === "failed")) {
      addRollbackMarker(rollbackMarkers, {
        code: "publish_attempt_failed",
        message: "At least one publish attempt failed.",
        recommendedAction: "Switch to manual mode and re-run publish after root-cause fix.",
        severity: "critical"
      });
    }

    if (input.datasetItem.publishMode === "full_auto" && finalDetail.video.status !== "published") {
      addRollbackMarker(rollbackMarkers, {
        code: "full_auto_not_published",
        message: "Full-auto dry-run did not end in published state.",
        recommendedAction: "Rollback to semi_auto/manual and inspect provider status + callbacks.",
        severity: "critical"
      });
    }

    if (input.datasetItem.publishMode === "semi_auto" && reconcileResult) {
      const failedOutcome = reconcileResult.items.find((item) =>
        item.outcome.startsWith("failed_")
      );
      if (failedOutcome) {
        addRollbackMarker(rollbackMarkers, {
          code: "publish_reconcile_failed",
          message:
            failedOutcome.message ??
            "Publish reconcile reported failed outcome for semi_auto attempt.",
          recommendedAction: "Trigger incident rollback path and resolve provider/workflow failure.",
          severity: "critical"
        });
      }
    }

    const finishedAt = new Date();
    return {
      datasetItemId: input.datasetItem.id,
      contentFormatSlug: input.datasetItem.contentFormatSlug,
      publishMode: input.datasetItem.publishMode,
      success: true,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      ...(topicId ? { topicId } : {}),
      ...(videoId ? { videoId } : {}),
      stateTransitions,
      publishAttemptTimeline: publishAttempts.items,
      rollbackMarkers,
      ...(reconcileResult ? { reconcileResult } : {})
    };
  } catch (error) {
    const finishedAt = new Date();
    return {
      datasetItemId: input.datasetItem.id,
      contentFormatSlug: input.datasetItem.contentFormatSlug,
      publishMode: input.datasetItem.publishMode,
      success: false,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      ...(topicId ? { topicId } : {}),
      ...(videoId ? { videoId } : {}),
      stateTransitions,
      publishAttemptTimeline: [],
      rollbackMarkers,
      error: toErrorRecord(error),
      ...(reconcileResult ? { reconcileResult } : {})
    };
  }
};

const writeReport = (outputPath: string, report: PilotDryRunReport): void => {
  const resolved = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, "utf8");
};

const run = async (): Promise<void> => {
  const options = parseCliOptions(process.argv.slice(2));
  const dataset = loadDataset(options.datasetPath);
  const apiBaseUrl = (process.env.PILOT_API_BASE_URL?.trim() || defaultApiBaseUrl).replace(/\/+$/, "");

  const reports: PerVideoReport[] = [];

  for (const item of dataset.items) {
    const report = await runPerVideo({
      baseUrl: apiBaseUrl,
      datasetItem: item
    });
    reports.push(report);
  }

  const summary: PilotDryRunReport = {
    ok: reports.every((item) => item.success),
    strict: options.strict,
    generatedAt: new Date().toISOString(),
    apiBaseUrl,
    datasetPath: options.datasetPath,
    outputPath: options.outputPath,
    totals: {
      requested: reports.length,
      succeeded: reports.filter((item) => item.success).length,
      failed: reports.filter((item) => !item.success).length
    },
    items: reports
  };

  writeReport(options.outputPath, summary);

  if (options.strict && !summary.ok) {
    console.error(JSON.stringify(summary, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(summary, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
