import type { OhMyOpenCodeConfig } from "../../config"
import { HOOK_NAME } from "./constants"
import { log } from "../../shared/logger"
import { SessionCategoryRegistry } from "../../shared/session-category-registry"
import { stringifyRuntimeModel } from "./fallback-state"

type ResolveFallbackBootstrapModelOptions = {
  sessionID: string
  source: string
  eventModel?: unknown
  resolvedAgent?: string
  pluginConfig?: OhMyOpenCodeConfig
}

export function resolveFallbackBootstrapModel(
  options: ResolveFallbackBootstrapModelOptions,
): string | undefined {
  const eventModel = stringifyRuntimeModel(options.eventModel)
  if (eventModel) {
    return eventModel
  }

  const extractConfiguredModel = (record: Record<string, unknown> | undefined): string | undefined => {
    const singular = record?.model
    if (typeof singular === "string" && singular.length > 0) return singular
    const models = record?.models
    if (Array.isArray(models) && models.length > 0) {
      const first = models[0]
      if (typeof first === "string") return first
      if (typeof first === "object" && first !== null) {
        const firstModel = (first as { model?: unknown }).model
        if (typeof firstModel === "string" && firstModel.length > 0) return firstModel
      }
    }
    return undefined
  }

  const agentConfigs = options.pluginConfig?.agents
  const agentConfig = options.resolvedAgent && agentConfigs
    ? agentConfigs[options.resolvedAgent as keyof typeof agentConfigs]
    : undefined
  const agentConfigRecord = agentConfig as Record<string, unknown> | undefined

  const agentModel = extractConfiguredModel(agentConfigRecord)
  if (agentModel) {
    log(`[${HOOK_NAME}] Derived model from agent config for ${options.source}`, {
      sessionID: options.sessionID,
      agent: options.resolvedAgent,
      model: agentModel,
    })
    return agentModel
  }

  const agentCategory = typeof agentConfig?.category === "string" ? agentConfig.category : undefined
  if (agentCategory) {
    const agentCategoryModel = extractConfiguredModel(
      options.pluginConfig?.categories?.[agentCategory] as Record<string, unknown> | undefined,
    )
    if (agentCategoryModel) {
      log(`[${HOOK_NAME}] Derived model from agent category config for ${options.source}`, {
        sessionID: options.sessionID,
        agent: options.resolvedAgent,
        category: agentCategory,
        model: agentCategoryModel,
      })
      return agentCategoryModel
    }
  }

  const sessionCategory = SessionCategoryRegistry.get(options.sessionID)
  const categoryModel = sessionCategory
    ? extractConfiguredModel(
        options.pluginConfig?.categories?.[sessionCategory] as Record<string, unknown> | undefined,
      )
    : undefined
  if (categoryModel) {
    log(`[${HOOK_NAME}] Derived model from session category config for ${options.source}`, {
      sessionID: options.sessionID,
      category: sessionCategory,
      model: categoryModel,
    })
    return categoryModel
  }

  return undefined
}
