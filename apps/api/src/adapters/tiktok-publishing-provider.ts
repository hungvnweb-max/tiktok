import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ValidationError } from "@videotik/core";
import type {
  PublishProviderCallbackVerificationRequest,
  PublishProviderCallbackVerificationResult,
  PublishProviderReconcileRequest,
  PublishProviderReconcileResult,
  PublishProviderRequest,
  PublishProviderResult,
  PublishProviderValidationResult,
  PublishingProviderPort
} from "@videotik/core";

const createTikTokId = (prefix: string): string => {
  return `tiktok_${prefix}_${randomUUID()}`;
};

const defaultPublishCallbackSecret = "videotik-tiktok-publish-dev-secret";
const defaultPublishCallbackToleranceSeconds = 300;

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

export const createTikTokPublishCallbackSignature = (
  input: Omit<PublishProviderCallbackVerificationRequest, "signature">,
  secret: string
): string => {
  const canonicalPayload = JSON.stringify({
    attemptId: input.attempt.id,
    callbackToken: input.callbackToken,
    idempotencyKey: input.idempotencyKey,
    payload: sortRecordEntries(input.payload),
    provider: "tiktok",
    signatureTimestamp: input.signatureTimestamp,
    workflowJobId: input.attempt.workflowJobId ?? "none"
  });

  return createHmac("sha256", secret).update(canonicalPayload).digest("hex");
};

export class TikTokPublishingProvider implements PublishingProviderPort {
  readonly providerId = "tiktok" as const;
  readonly supportedPlatforms = ["tiktok"];
  readonly supportedModes = ["manual", "semi_auto", "full_auto"] as const;

  private readonly callbackSecret =
    process.env.TIKTOK_PUBLISH_CALLBACK_SECRET?.trim() ||
    process.env.PUBLISH_CALLBACK_SECRET?.trim() ||
    defaultPublishCallbackSecret;

  private readonly callbackToleranceMs =
    Number(
      process.env.PUBLISH_CALLBACK_TOLERANCE_SECONDS ?? defaultPublishCallbackToleranceSeconds
    ) * 1000;

  async validate(
    request: PublishProviderRequest
  ): Promise<PublishProviderValidationResult> {
    const issues: PublishProviderValidationResult["issues"] = [];

    if (request.schedule.platformSlug !== "tiktok") {
      issues.push({
        code: "tiktok_platform_required",
        message: 'TikTok publishing provider can only handle platform "tiktok".',
        details: {
          platformSlug: request.schedule.platformSlug
        }
      });
    }

    if (!this.supportedModes.includes(request.publishMode)) {
      issues.push({
        code: "tiktok_mode_unsupported",
        message: `TikTok provider does not support publish mode "${request.publishMode}".`,
        details: {
          publishMode: request.publishMode,
          supportedModes: [...this.supportedModes]
        }
      });
    }

    if (!request.activeRenderAsset) {
      issues.push({
        code: "tiktok_render_output_missing",
        message: "TikTok publish flow requires an active rendered video asset.",
        details: {
          hasActiveRenderAsset: false
        }
      });
    }

    if (request.schedule.caption.trim().length === 0) {
      issues.push({
        code: "tiktok_caption_missing",
        message: "TikTok publish flow requires a non-empty caption.",
        details: {
          captionLength: request.schedule.caption.trim().length
        }
      });
    }

    return {
      isValid: issues.length === 0,
      issues,
      metadata: {
        simulated: true,
        assetCount: request.activeRenderAsset ? 1 : 0
      }
    };
  }

  async publish(request: PublishProviderRequest): Promise<PublishProviderResult> {
    if (request.publishMode === "manual") {
      return {
        status: "manual_action_required",
        providerStatus: "awaiting_manual_upload",
        publicationId: createTikTokId("draft"),
        checklist: [
          "Upload the rendered video file to TikTok Studio or the TikTok app.",
          `Paste the prepared caption: ${request.schedule.caption}`,
          `Include hashtags: ${request.schedule.hashtags.join(" ") || "(none)"}`,
          "Confirm the scheduled publish time in TikTok before final submission."
        ],
        metadata: {
          simulated: true,
          publishMode: request.publishMode
        },
        cost: {
          amount: 0,
          currency: "USD",
          units: "tiktok_manual_publish",
          quantity: 1,
          metadata: {
            simulated: true
          }
        }
      };
    }

    if (request.publishMode === "semi_auto") {
      return {
        status: "submitted",
        providerStatus: "draft_prepared",
        publicationId: createTikTokId("submission"),
        checklist: [
          "Review the prepared TikTok draft metadata.",
          "Confirm thumbnail, privacy, and scheduling settings in TikTok.",
          "Finalize publish manually after verification."
        ],
        metadata: {
          simulated: true,
          publishMode: request.publishMode
        },
        cost: {
          amount: 0,
          currency: "USD",
          units: "tiktok_semi_auto_publish",
          quantity: 1,
          metadata: {
            simulated: true
          }
        }
      };
    }

    return {
      status: "published",
      providerStatus: "published_simulated",
      publicationId: createTikTokId("publication"),
      publishedAt: new Date(),
      metadata: {
        simulated: true,
        publishMode: request.publishMode
      },
      cost: {
        amount: 0,
        currency: "USD",
        units: "tiktok_full_auto_publish",
        quantity: 1,
        metadata: {
          simulated: true
        }
      }
    };
  }

  async verifyCallback(
    request: PublishProviderCallbackVerificationRequest
  ): Promise<PublishProviderCallbackVerificationResult> {
    const timestampMs = Date.parse(request.signatureTimestamp);

    if (Number.isNaN(timestampMs)) {
      throw new ValidationError(
        "Publish callback timestamp must be a valid ISO date string.",
        "publish_callback_timestamp_invalid",
        {
          provider: this.providerId
        }
      );
    }

    if (Math.abs(Date.now() - timestampMs) > this.callbackToleranceMs) {
      throw new ValidationError(
        "Publish callback timestamp is outside the allowed verification window.",
        "publish_callback_timestamp_expired",
        {
          provider: this.providerId,
          toleranceMs: this.callbackToleranceMs
        }
      );
    }

    const expectedSignature = createTikTokPublishCallbackSignature(
      {
        attempt: request.attempt,
        callbackToken: request.callbackToken,
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
        "Publish callback signature is invalid.",
        "publish_callback_signature_invalid",
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
    request: PublishProviderReconcileRequest
  ): Promise<PublishProviderReconcileResult> {
    if (request.publishMode === "semi_auto") {
      return {
        state: "manual_action_required",
        providerStatus: "awaiting_manual_confirmation",
        ...(request.attempt.providerPublicationId
          ? { publicationId: request.attempt.providerPublicationId }
          : {}),
        ...(request.attempt.externalUrl ? { externalUrl: request.attempt.externalUrl } : {}),
        checklist: [
          "Open the TikTok draft prepared by the system.",
          "Confirm final metadata, privacy, and publish/schedule options.",
          "Submit the draft manually to finish publication."
        ],
        metadata: {
          simulated: true,
          publishMode: request.publishMode
        },
        cost: {
          amount: 0,
          currency: "USD",
          units: "tiktok_publish_reconcile",
          quantity: 1,
          metadata: {
            simulated: true
          }
        }
      };
    }

    if (request.publishMode === "full_auto") {
      return {
        state: "published",
        providerStatus: "published_simulated",
        publicationId: request.attempt.providerPublicationId ?? createTikTokId("publication"),
        ...(request.attempt.externalUrl ? { externalUrl: request.attempt.externalUrl } : {}),
        publishedAt: new Date(),
        metadata: {
          simulated: true,
          publishMode: request.publishMode
        },
        cost: {
          amount: 0,
          currency: "USD",
          units: "tiktok_publish_reconcile",
          quantity: 1,
          metadata: {
            simulated: true
          }
        }
      };
    }

    return {
      state: "submitted",
      providerStatus: request.attempt.providerStatus ?? "submitted",
      ...(request.attempt.providerPublicationId
        ? { publicationId: request.attempt.providerPublicationId }
        : {}),
      ...(request.attempt.externalUrl ? { externalUrl: request.attempt.externalUrl } : {}),
      metadata: {
        simulated: true,
        publishMode: request.publishMode
      },
      cost: {
        amount: 0,
        currency: "USD",
        units: "tiktok_publish_reconcile",
        quantity: 1,
        metadata: {
          simulated: true
        }
      }
    };
  }
}
