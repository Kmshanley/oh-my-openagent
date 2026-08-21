import { describe, expect, test } from "bun:test"

import { unsafeTestValue } from "../../../../../test-support/unsafe-test-value"
import type { OhMyOpenCodeConfig } from "../../config"
import { SessionCategoryRegistry } from "../../shared/session-category-registry"
import { resolveFallbackBootstrapModel } from "./fallback-bootstrap-model"

describe("resolveFallbackBootstrapModel", () => {
  test("derives model from agent models[0] when singular model is absent", () => {
    // given
    const config = unsafeTestValue<OhMyOpenCodeConfig>({
      agents: {
        sisyphus: {
          models: ["opencode-go/deepseek-v4-flash", "synthetic/syn:small:text"],
        },
      },
    })

    // when
    const model = resolveFallbackBootstrapModel({
      sessionID: "ses_test",
      source: "session.error",
      resolvedAgent: "sisyphus",
      pluginConfig: config,
    })

    // then
    expect(model).toBe("opencode-go/deepseek-v4-flash")
  })

  test("prefers singular model over models[0] when both are present", () => {
    // given
    const config = unsafeTestValue<OhMyOpenCodeConfig>({
      agents: {
        sisyphus: {
          model: "anthropic/claude-opus-5",
          models: ["opencode-go/deepseek-v4-flash", "synthetic/syn:small:text"],
        },
      },
    })

    // when
    const model = resolveFallbackBootstrapModel({
      sessionID: "ses_test",
      source: "session.error",
      resolvedAgent: "sisyphus",
      pluginConfig: config,
    })

    // then
    expect(model).toBe("anthropic/claude-opus-5")
  })

  test("resolve models[0] object form with model field", () => {
    // given
    const config = unsafeTestValue<OhMyOpenCodeConfig>({
      agents: {
        oracle: {
          models: [{ model: "opencode-go/glm-5.2", reasoning: "high" }, "synthetic/hf:zai-org/GLM-5.2"],
        },
      },
    })

    // when
    const model = resolveFallbackBootstrapModel({
      sessionID: "ses_test",
      source: "session.error",
      resolvedAgent: "oracle",
      pluginConfig: config,
    })

    // then
    expect(model).toBe("opencode-go/glm-5.2")
  })

  test("returns undefined when agent has no model or models config", () => {
    // given
    const config = unsafeTestValue<OhMyOpenCodeConfig>({
      agents: {
        sisyphus: {
          temperature: 0.5,
        },
      },
    })

    // when
    const model = resolveFallbackBootstrapModel({
      sessionID: "ses_test",
      source: "session.error",
      resolvedAgent: "sisyphus",
      pluginConfig: config,
    })

    // then
    expect(model).toBeUndefined()
  })

  test("derives model from agent category config models[0]", () => {
    // given
    const config = unsafeTestValue<OhMyOpenCodeConfig>({
      agents: {
        sisyphus: {
          category: "deep",
        },
      },
      categories: {
        deep: {
          models: ["opencode-go/deepseek-v4-flash", "synthetic/syn:small:text"],
        },
      },
    })

    // when
    const model = resolveFallbackBootstrapModel({
      sessionID: "ses_test",
      source: "session.error",
      resolvedAgent: "sisyphus",
      pluginConfig: config,
    })

    // then
    expect(model).toBe("opencode-go/deepseek-v4-flash")
  })

  test("derives model from resolved event model when present", () => {
    // given
    const eventModel = "opencode-go/deepseek-v4-flash"

    // when
    const model = resolveFallbackBootstrapModel({
      sessionID: "ses_test",
      source: "session.error",
      eventModel,
    })

    // then
    expect(model).toBe("opencode-go/deepseek-v4-flash")
  })

  test("derives model from session category when registered", () => {
    // given
    const sessionID = "ses_test_category"
    SessionCategoryRegistry.register(sessionID, "ultrabrain")
    const config = unsafeTestValue<OhMyOpenCodeConfig>({
      categories: {
        ultrabrain: {
          models: ["opencode-go/glm-5.2", "openrouter/z-ai/glm-5.2"],
        },
      },
    })

    // when
    const model = resolveFallbackBootstrapModel({
      sessionID,
      source: "session.error",
      resolvedAgent: "metis",
      pluginConfig: config,
    })

    // then
    expect(model).toBe("opencode-go/glm-5.2")
  })
})