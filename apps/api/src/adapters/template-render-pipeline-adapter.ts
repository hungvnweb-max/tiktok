import {
  ValidationError,
  type RenderPipelinePort,
  type RenderPipelineCallbackVerificationRequest,
  type RenderPipelineCallbackVerificationResult,
  type RenderPipelineReconciliationRequest,
  type RenderPipelineReconciliationResult,
  type RenderPipelineRequest,
  type RenderPipelineSubmissionResult
} from "@videotik/core";
import { createHmac, timingSafeEqual } from "node:crypto";

const supportedTemplateSlugs = [
  "quick_tip_template_v1",
  "kinetic_cards",
  "news_template_v1",
  "clean_vertical",
  "horoscope_template_v1",
  "storytelling_template_v1"
] as const;

const defaultCallbackSecret = "videotik-template-render-dev-secret";
const defaultToleranceSeconds = 300;

const normalizeSignature = (signature: string): string => {
  const normalized = signature.trim();

  if (normalized.startsWith("sha256=")) {
    return normalized.slice("sha256=".length);
  }

  if (normalized.startsWith("v1=")) {
    return normalized.slice("v1=".length);
  }

  return normalized;
};

const sortRecordEntries = (record: Record<string, string | number | boolean | null>) => {
  return Object.entries(record).sort(([left], [right]) => left.localeCompare(right));
};

export const createTemplateRenderCallbackSignature = (
  input: Omit<RenderPipelineCallbackVerificationRequest, "signature">,
  secret: string
): string => {
  const canonicalPayload = JSON.stringify({
    action: input.action,
    callbackToken: input.callbackToken,
    idempotencyKey: input.idempotencyKey,
    payload: sortRecordEntries(input.payload),
    provider: "template",
    providerJobId: input.providerJobId,
    signatureTimestamp: input.signatureTimestamp,
    workflowJobId: input.workflowJob.id
  });

  return createHmac("sha256", secret).update(canonicalPayload).digest("hex");
};

export class TemplateRenderPipelineAdapter implements RenderPipelinePort {
  readonly providerId = "template" as const;
  readonly supportedTemplateSlugs = supportedTemplateSlugs;

  private readonly callbackSecret =
    process.env.TEMPLATE_RENDER_CALLBACK_SECRET?.trim() ||
    process.env.RENDER_CALLBACK_SECRET?.trim() ||
    defaultCallbackSecret;

  private readonly callbackToleranceMs =
    Number(process.env.RENDER_CALLBACK_TOLERANCE_SECONDS ?? defaultToleranceSeconds) * 1000;

  async enqueue(request: RenderPipelineRequest): Promise<RenderPipelineSubmissionResult> {
    return {
      providerJobId: `template-render-${request.workflowJob.id}`,
      providerStatus: "queued",
      metadata: {
        sceneCount: request.video.scenes.length,
        subtitleBurnIn: request.video.renderConfig.subtitleBurnIn,
        activeImageAssetCount: request.activeImageAssets.length,
        activeAudioAssetCount: request.activeAudioAssets.length
      },
      cost: {
        amount: 0,
        units: "render_job",
        quantity: 1,
        metadata: {
          templateSlug: request.video.renderConfig.templateSlug
        }
      }
    };
  }

  async verifyCallback(
    request: RenderPipelineCallbackVerificationRequest
  ): Promise<RenderPipelineCallbackVerificationResult> {
    const timestampMs = Date.parse(request.signatureTimestamp);

    if (Number.isNaN(timestampMs)) {
      throw new ValidationError(
        "Render callback timestamp must be a valid ISO date string.",
        "render_callback_timestamp_invalid",
        {
          provider: this.providerId
        }
      );
    }

    if (Math.abs(Date.now() - timestampMs) > this.callbackToleranceMs) {
      throw new ValidationError(
        "Render callback timestamp is outside the allowed verification window.",
        "render_callback_timestamp_expired",
        {
          provider: this.providerId,
          toleranceMs: this.callbackToleranceMs
        }
      );
    }

    const expectedSignature = createTemplateRenderCallbackSignature(
      {
        action: request.action,
        workflowJob: request.workflowJob,
        callbackToken: request.callbackToken,
        providerJobId: request.providerJobId,
        idempotencyKey: request.idempotencyKey,
        signatureTimestamp: request.signatureTimestamp,
        payload: request.payload
      },
      this.callbackSecret
    );
    const receivedSignature = normalizeSignature(request.signature);
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const receivedBuffer = Buffer.from(receivedSignature, "hex");

    if (
      expectedBuffer.length === 0 ||
      receivedBuffer.length === 0 ||
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new ValidationError(
        "Render callback signature is invalid.",
        "render_callback_signature_invalid",
        {
          provider: this.providerId
        }
      );
    }

    return {
      verifiedAt: new Date(timestampMs).toISOString(),
      scheme: "hmac_sha256"
    };
  }

  async reconcileSubmission(
    request: RenderPipelineReconciliationRequest
  ): Promise<RenderPipelineReconciliationResult> {
    return {
      state: "pending",
      providerStatus:
        typeof request.workflowJob.resultMetadata?.providerStatus === "string"
          ? request.workflowJob.resultMetadata.providerStatus
          : "queued",
      checkedAt: new Date().toISOString(),
      metadata: {
        providerJobId:
          typeof request.workflowJob.resultMetadata?.providerJobId === "string"
            ? request.workflowJob.resultMetadata.providerJobId
            : "unknown"
      }
    };
  }
}
