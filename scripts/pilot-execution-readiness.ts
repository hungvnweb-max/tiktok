import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createAsset,
  createContentIdea,
  createContentScript,
  createDefaultImageWorkflowConfig,
  createDefaultRenderConfig,
  createDefaultSubtitleConfig,
  createDefaultVoiceoverConfig,
  createEntityId,
  createPublicationSchedule,
  createTopic,
  createVideoConcept,
  updateVideoStatus,
  type PublicationSchedule,
  type PublishMode,
  type Video
} from "@videotik/core";
import { createInMemorySprint1Repositories } from "@videotik/database";
import {
  TemplateImagePromptGenerationAdapter,
  TemplateSubtitleCompositionAdapter
} from "../apps/api/src/adapters/template-media-planning-adapter";
import { TemplateRenderPipelineAdapter } from "../apps/api/src/adapters/template-render-pipeline-adapter";
import { TemplateSceneVoiceGenerationAdapter } from "../apps/api/src/adapters/template-scene-voice-generation-adapter";
import { TemplateTextGenerationAdapter } from "../apps/api/src/adapters/template-text-generation-adapter";
import { TikTokPublishingProvider } from "../apps/api/src/adapters/tiktok-publishing-provider";
import { createSprint5Services } from "../packages/core/src/application/services";

interface PilotIssue {
  code: string;
  message: string;
}

interface CliOptions {
  outputPath?: string;
  strict: boolean;
}

interface PreflightSummary {
  ok: boolean;
  checked: {
    databaseUrl: boolean;
    internalReconcileToken: boolean;
    renderCallbackSecret: boolean;
    publishCallbackSecret: boolean;
    alertWebhookUrl: boolean;
    alertEmailRecipients: boolean;
    dockerReachable: boolean;
  };
  requiredIssues: PilotIssue[];
  warnings: PilotIssue[];
}

interface ModeMatrixResult {
  mode: PublishMode;
  attemptStatus: string;
  videoStatus: string;
  scheduleStatus: string;
}

interface PublishModeMatrixSummary {
  ok: boolean;
  modeResults: ModeMatrixResult[];
  activityLogCount: number;
  costRecordCount: number;
  error?: string;
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

const parseCliOptions = (
  args: string[],
  parseIssues: PilotIssue[]
): CliOptions => {
  const options: CliOptions = {
    strict: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--output") {
      const outputPath = args[index + 1];
      if (!outputPath || outputPath.startsWith("--")) {
        parseIssues.push({
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

    parseIssues.push({
      code: "cli_unknown_option",
      message: `Unknown option: ${arg}`
    });
  }

  return options;
};

const validateUrl = (key: string, value: string | undefined, issues: PilotIssue[]): void => {
  if (!value) {
    return;
  }

  try {
    const parsed = new URL(value);
    assert.ok(parsed.protocol === "http:" || parsed.protocol === "https:");
  } catch {
    issues.push({
      code: `${key.toLowerCase()}_invalid_url`,
      message: `${key} must be a valid http/https URL.`
    });
  }
};

const validateEmailList = (
  key: string,
  value: string | undefined,
  issues: PilotIssue[]
): void => {
  if (!value) {
    return;
  }

  const entries = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) {
    issues.push({
      code: `${key.toLowerCase()}_empty`,
      message: `${key} must include at least one email address.`
    });
    return;
  }

  const invalidEntries = entries.filter((entry) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry));
  if (invalidEntries.length > 0) {
    issues.push({
      code: `${key.toLowerCase()}_invalid`,
      message: `${key} contains invalid email addresses: ${invalidEntries.join(", ")}.`
    });
  }
};

const runPreflightChecks = (): PreflightSummary => {
  const requiredIssues: PilotIssue[] = [];
  const warnings: PilotIssue[] = [];

  const databaseUrl = getEnv("DATABASE_URL");
  const internalReconcileToken = getEnv("INTERNAL_RECONCILIATION_TOKEN");
  const renderCallbackSecret =
    getEnv("TEMPLATE_RENDER_CALLBACK_SECRET") ?? getEnv("RENDER_CALLBACK_SECRET");
  const publishCallbackSecret =
    getEnv("TIKTOK_PUBLISH_CALLBACK_SECRET") ?? getEnv("PUBLISH_CALLBACK_SECRET");
  const alertWebhookUrl = getEnv("VIDEOTIK_ALERT_WEBHOOK_URL");
  const alertEmailRecipients = getEnv("VIDEOTIK_ALERT_EMAIL_TO");

  if (!databaseUrl) {
    requiredIssues.push({
      code: "missing_database_url",
      message: "Missing required database URL (DATABASE_URL)."
    });
  }

  if (!internalReconcileToken) {
    requiredIssues.push({
      code: "missing_internal_reconciliation_token",
      message: "Missing required internal reconciliation token (INTERNAL_RECONCILIATION_TOKEN)."
    });
  }

  if (!renderCallbackSecret) {
    requiredIssues.push({
      code: "missing_render_callback_secret",
      message:
        "Missing required render callback secret (TEMPLATE_RENDER_CALLBACK_SECRET or RENDER_CALLBACK_SECRET)."
    });
  }

  if (!publishCallbackSecret) {
    requiredIssues.push({
      code: "missing_publish_callback_secret",
      message:
        "Missing required publish callback secret (TIKTOK_PUBLISH_CALLBACK_SECRET or PUBLISH_CALLBACK_SECRET)."
    });
  }

  if (!alertWebhookUrl) {
    requiredIssues.push({
      code: "missing_videotik_alert_webhook_url",
      message: "Missing required alert webhook URL (VIDEOTIK_ALERT_WEBHOOK_URL)."
    });
  }

  if (!alertEmailRecipients) {
    requiredIssues.push({
      code: "missing_videotik_alert_email_to",
      message: "Missing required alert email recipients (VIDEOTIK_ALERT_EMAIL_TO)."
    });
  }

  validateUrl("VIDEOTIK_ALERT_WEBHOOK_URL", alertWebhookUrl, requiredIssues);
  validateEmailList("VIDEOTIK_ALERT_EMAIL_TO", alertEmailRecipients, requiredIssues);

  if (!getEnv("GF_SMTP_HOST")) {
    warnings.push({
      code: "missing_gf_smtp_host",
      message:
        "GF_SMTP_HOST is not set. Alert email delivery may fail unless SMTP is configured externally."
    });
  }

  if (!getEnv("GF_SMTP_FROM_ADDRESS")) {
    warnings.push({
      code: "missing_gf_smtp_from_address",
      message:
        "GF_SMTP_FROM_ADDRESS is not set. Alert email sender may be invalid unless configured externally."
    });
  }

  const dockerInfo = spawnSync("docker", ["info"], {
    encoding: "utf8"
  });
  const dockerReachable = dockerInfo.status === 0;
  if (!dockerReachable) {
    requiredIssues.push({
      code: "docker_unavailable",
      message:
        "Docker daemon is not reachable (`docker info` failed). Required for observability sandbox checks."
    });
  }

  return {
    ok: requiredIssues.length === 0,
    checked: {
      databaseUrl: Boolean(databaseUrl),
      internalReconcileToken: Boolean(internalReconcileToken),
      renderCallbackSecret: Boolean(renderCallbackSecret),
      publishCallbackSecret: Boolean(publishCallbackSecret),
      alertWebhookUrl: Boolean(alertWebhookUrl),
      alertEmailRecipients: Boolean(alertEmailRecipients),
      dockerReachable
    },
    requiredIssues,
    warnings
  };
};

const runPublishModeMatrix = async (): Promise<PublishModeMatrixSummary> => {
  try {
    const repositories = createInMemorySprint1Repositories();
    const services = createSprint5Services({
      repositories,
      textGenerationPort: new TemplateTextGenerationAdapter(),
      imagePromptGenerationPort: new TemplateImagePromptGenerationAdapter(),
      sceneVoiceGenerationPort: new TemplateSceneVoiceGenerationAdapter(),
      subtitleCompositionPort: new TemplateSubtitleCompositionAdapter(),
      renderPipelines: [new TemplateRenderPipelineAdapter()],
      publishingProviders: [new TikTokPublishingProvider()]
    });

    const contentFormat = await repositories.contentFormatRepository.findBySlug("quick_tip");
    assert.ok(contentFormat, "Expected quick_tip content format to exist.");

    const suffix = createEntityId("pilot_mode_matrix");
    const topic = createTopic({
      name: "Pilot Publish Mode Matrix",
      slug: `pilot_publish_mode_matrix_${suffix}`,
      description: "Pilot execution readiness matrix for publish modes.",
      audience: "operators"
    });
    await repositories.topicRepository.save(topic);

    const idea = createContentIdea({
      topicId: topic.id,
      contentFormatId: contentFormat.id,
      title: "Pilot matrix idea",
      hook: "Pilot matrix hook",
      angle: "Pilot matrix angle",
      brief: "Pilot matrix brief",
      callToAction: "Follow for more",
      targetAudience: "operators",
      keywords: ["pilot", "mode", "matrix"],
      formatRationale: "pilot_readiness",
      generationProvider: "template"
    });
    await repositories.ideaRepository.save(idea);

    const script = createContentScript({
      topicId: topic.id,
      ideaId: idea.id,
      contentFormatId: contentFormat.id,
      title: "Pilot matrix script",
      summary: "Pilot matrix summary",
      voiceover: "Pilot matrix voiceover",
      generationProvider: "template",
      scenes: [
        {
          order: 1,
          role: "hook",
          narration: "Stop wasting time on repetitive tasks in your workflow.",
          visualDirection: "Visual 1",
          onScreenText: "Hook",
          estimatedDurationSeconds: 5
        },
        {
          order: 2,
          role: "body",
          narration: "Build one reusable publish flow for each operating mode.",
          visualDirection: "Visual 2",
          onScreenText: "Body 1",
          estimatedDurationSeconds: 5
        },
        {
          order: 3,
          role: "body",
          narration: "Track attempts, costs, and failures so recovery stays reliable.",
          visualDirection: "Visual 3",
          onScreenText: "Body 2",
          estimatedDurationSeconds: 5
        },
        {
          order: 4,
          role: "cta",
          narration: "Follow this checklist to ship automation safely every week.",
          visualDirection: "Visual 4",
          onScreenText: "CTA",
          estimatedDurationSeconds: 5
        }
      ]
    });
    await repositories.scriptRepository.save(script);

    const createRenderedVideoContext = async (
      mode: PublishMode
    ): Promise<{ video: Video; schedule: PublicationSchedule }> => {
      let video = createVideoConcept({
        topicId: topic.id,
        ideaId: idea.id,
        scriptId: script.id,
        contentFormatId: contentFormat.id,
        formatSlug: contentFormat.slug,
        title: `${script.title}-${mode}`,
        scenes: script.scenes,
        estimatedDurationSeconds: script.estimatedDurationSeconds,
        subtitleConfig: createDefaultSubtitleConfig(contentFormat),
        imageWorkflowConfig: createDefaultImageWorkflowConfig(contentFormat),
        voiceoverConfig: createDefaultVoiceoverConfig(contentFormat),
        renderConfig: createDefaultRenderConfig(contentFormat),
        publishingConfig: null
      });
      video = updateVideoStatus(video, "rendered");
      await repositories.videoRepository.save(video);

      const renderedAsset = createAsset({
        videoId: video.id,
        type: "video",
        role: "render_output",
        provider: "template",
        sourceType: "provider_generated",
        versionNumber: 1,
        isActive: true,
        storage: {
          storageProvider: "external_url",
          url: `https://example.com/pilot-rendered-${mode}-${video.id}.mp4`
        },
        durationSeconds: 20
      });
      await repositories.assetRepository.save(renderedAsset);

      const schedule = createPublicationSchedule({
        videoId: video.id,
        platformSlug: "tiktok",
        provider: "tiktok",
        mode,
        timezone: "Europe/Berlin",
        scheduledFor: new Date(Date.now() - 5 * 60_000),
        caption: `Pilot mode ${mode} caption`,
        hashtags: ["#pilot_mode_matrix"]
      });
      await repositories.publicationScheduleRepository.save(schedule);

      return { video, schedule };
    };

    const modes: PublishMode[] = ["manual", "semi_auto", "full_auto"];
    const modeResults: ModeMatrixResult[] = [];

    for (const mode of modes) {
      const context = await createRenderedVideoContext(mode);
      const readiness = await services.publishingWorkflowService.validatePublishReadiness({
        videoId: context.video.id
      });
      assert.equal(
        readiness.report.isValid,
        true,
        `Expected publish readiness to pass for mode "${mode}".`
      );

      const publishResult = await services.publishingWorkflowService.publishVideo({
        videoId: context.video.id
      });
      const attemptAfterPublish = await repositories.publishAttemptRepository.findById(
        publishResult.attempt.id
      );
      assert.ok(attemptAfterPublish);

      if (mode === "semi_auto") {
        await services.publishingWorkflowService.reconcileSubmittedPublishAttempts({
          ownerId: "pilot-readiness-worker",
          leaseMs: 60_000,
          staleAfterMs: 300_000,
          limit: 50,
          now: new Date(Date.now() + 120_000)
        });
      }

      const finalAttempt = await repositories.publishAttemptRepository.findById(
        publishResult.attempt.id
      );
      const finalVideo = await repositories.videoRepository.findById(context.video.id);
      const finalSchedule = await repositories.publicationScheduleRepository.findById(
        context.schedule.id
      );
      assert.ok(finalAttempt);
      assert.ok(finalVideo);
      assert.ok(finalSchedule);

      modeResults.push({
        mode,
        attemptStatus: finalAttempt.status,
        videoStatus: finalVideo.status,
        scheduleStatus: finalSchedule.status
      });
    }

    const activityLogs = await services.auditTrailService.listActivity();
    const costRecords = await services.auditTrailService.listCosts();

    return {
      ok: true,
      modeResults,
      activityLogCount: activityLogs.length,
      costRecordCount: costRecords.length
    };
  } catch (error) {
    return {
      ok: false,
      modeResults: [],
      activityLogCount: 0,
      costRecordCount: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const findModeResult = (
  modeResults: ModeMatrixResult[],
  mode: PublishMode
): ModeMatrixResult | undefined => {
  return modeResults.find((item) => item.mode === mode);
};

const writeOutput = (outputPath: string, payload: unknown): void => {
  const resolvedOutputPath = path.resolve(rootDir, outputPath);
  fs.mkdirSync(path.dirname(resolvedOutputPath), { recursive: true });
  fs.writeFileSync(resolvedOutputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const main = async (): Promise<void> => {
  loadEnvFileFallbacks();

  const parseIssues: PilotIssue[] = [];
  const options = parseCliOptions(process.argv.slice(2), parseIssues);
  const preflight = runPreflightChecks();
  const modeMatrix = await runPublishModeMatrix();

  const blockers: PilotIssue[] = [...parseIssues, ...preflight.requiredIssues];
  const warnings: PilotIssue[] = [...preflight.warnings];

  if (!modeMatrix.ok) {
    blockers.push({
      code: "publish_mode_matrix_failed",
      message: modeMatrix.error ?? "Publish mode matrix execution failed."
    });
  }

  const manual = findModeResult(modeMatrix.modeResults, "manual");
  if (!manual || manual.attemptStatus !== "manual_action_required") {
    blockers.push({
      code: "manual_mode_unexpected_outcome",
      message: "Expected manual mode attempt status to end at manual_action_required."
    });
  }

  const semiAuto = findModeResult(modeMatrix.modeResults, "semi_auto");
  if (!semiAuto || semiAuto.attemptStatus !== "manual_action_required") {
    blockers.push({
      code: "semi_auto_mode_unexpected_outcome",
      message: "Expected semi_auto mode attempt status to end at manual_action_required."
    });
  }

  const fullAuto = findModeResult(modeMatrix.modeResults, "full_auto");
  if (
    !fullAuto ||
    fullAuto.attemptStatus !== "published" ||
    fullAuto.videoStatus !== "published" ||
    fullAuto.scheduleStatus !== "published"
  ) {
    blockers.push({
      code: "full_auto_mode_unexpected_outcome",
      message: "Expected full_auto mode to complete with published attempt/video/schedule."
    });
  }

  const oncallAlertRoutingConfigured =
    preflight.checked.alertWebhookUrl && preflight.checked.alertEmailRecipients;
  if (!oncallAlertRoutingConfigured) {
    warnings.push({
      code: "oncall_alert_routing_incomplete",
      message: "Alert webhook/email routing is incomplete."
    });
  }

  let report = {
    ok: blockers.length === 0,
    strict: options.strict,
    generatedAt: new Date().toISOString(),
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    checks: {
      preflight,
      publishModeMatrix: modeMatrix,
      rollbackChecklist: {
        reconcileTokenConfigured: preflight.checked.internalReconcileToken,
        callbackSecretsConfigured:
          preflight.checked.renderCallbackSecret && preflight.checked.publishCallbackSecret
      },
      oncallChecklist: {
        alertWebhookConfigured: preflight.checked.alertWebhookUrl,
        alertEmailConfigured: preflight.checked.alertEmailRecipients
      }
    }
  };

  if (options.outputPath) {
    try {
      writeOutput(options.outputPath, report);
    } catch (error) {
      blockers.push({
        code: "pilot_output_write_failed",
        message: error instanceof Error ? error.message : "Unknown output write error."
      });
      report = {
        ...report,
        ok: false,
        blockerCount: blockers.length,
        blockers
      };
    }
  }

  const shouldFail = options.strict ? blockers.length > 0 : false;

  if (shouldFail) {
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(report, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
