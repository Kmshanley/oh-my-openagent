import type { AgentOverrides } from "../../config/schema"
import { getAgentConfigKey } from "../../shared/agent-display-names"
import { fuzzyMatchModel } from "../../shared/model-availability"
import { buildFallbackChainFromModels } from "../../shared/fallback-chain-from-models"
import { normalizeModelFormat } from "../../shared/model-format-normalizer"
import { flattenToFallbackModelStrings, normalizeFallbackModels } from "../../shared/model-resolver"
import { AGENT_MODEL_REQUIREMENTS } from "../../shared/model-requirements"
import { log } from "../../shared/logger"
import { getAvailableModelsForDelegateTask } from "./available-models"
import { applyCategoryParams } from "./delegated-model-config"
import type { ExecutorContext } from "./executor-types"
import { applyFallbackEntrySettings } from "./fallback-entry-settings"
import { resolveEffectiveFallbackEntry } from "./fallback-entry-resolution"
import { resolveModelForDelegateTask } from "./model-selection"
import type { AgentInfo } from "./subagent-discovery"
import type { ResolvedSubagentModel } from "./subagent-resolution-types"

function findAgentOverride(agentOverrides: AgentOverrides | undefined, agentConfigKey: string) {
  return agentOverrides?.[agentConfigKey]
    ?? Object.entries(agentOverrides ?? {}).find(([key]) => key.toLowerCase() === agentConfigKey)?.[1]
}

export async function resolveSubagentModel(
  agentToUse: string,
  matchedAgent: AgentInfo,
  executorCtx: ExecutorContext,
): Promise<ResolvedSubagentModel> {
  let categoryModel = undefined
  let fallbackChain = undefined

  const agentConfigKey = getAgentConfigKey(agentToUse)
  const agentOverride = findAgentOverride(executorCtx.agentOverrides, agentConfigKey)
  const agentRequirement = AGENT_MODEL_REQUIREMENTS[agentConfigKey]
  const agentCategoryConfig = agentOverride?.category
    ? executorCtx.userCategories?.[agentOverride.category]
    : undefined
  const agentCategoryModel = agentCategoryConfig?.model
  // v4.19.4 compatibility: prefer models array, fall back to legacy model + fallback_models
  const modelsArray = agentOverride?.models
  const primaryModelString: string | undefined = agentOverride?.model
    ?? (modelsArray && modelsArray.length > 0
      ? (typeof modelsArray[0] === "string" ? modelsArray[0] : modelsArray[0]?.model)
      : undefined)
  const fallbackFromModels = modelsArray && modelsArray.length > 1 ? modelsArray.slice(1) : undefined
  const hasExplicitUserModel = Boolean(primaryModelString ?? agentCategoryModel)
  const normalizedAgentFallbackModels = normalizeFallbackModels(
    agentOverride?.fallback_models
    ?? fallbackFromModels
    ?? agentCategoryConfig?.fallback_models
  )

  const availableModels = await getAvailableModelsForDelegateTask(executorCtx.client)
  const normalizedMatchedModel = matchedAgent.model
    ? normalizeModelFormat(matchedAgent.model)
    : undefined
  const matchedAgentModelStr = normalizedMatchedModel
    ? `${normalizedMatchedModel.providerID}/${normalizedMatchedModel.modelID}`
    : undefined

  if (primaryModelString || agentCategoryModel || agentRequirement || matchedAgent.model) {
    const resolution = resolveModelForDelegateTask({
      userModel: primaryModelString ?? agentCategoryModel,
      userFallbackModels: flattenToFallbackModelStrings(normalizedAgentFallbackModels),
      categoryDefaultModel: matchedAgentModelStr,
      fallbackChain: agentRequirement?.fallbackChain,
      availableModels,
      systemDefaultModel: undefined,
    })

    const resolutionSkipped = resolution && "skipped" in resolution

    if (resolution && !resolutionSkipped) {
      const normalized = normalizeModelFormat(resolution.model)
      if (normalized) {
        const variantToUse = agentOverride?.variant ?? resolution.variant ?? agentCategoryConfig?.variant
        const resolvedModel = variantToUse ? { ...normalized, variant: variantToUse } : normalized
        categoryModel = applyCategoryParams(resolvedModel, agentCategoryConfig)
      }
    } else if (resolutionSkipped && (primaryModelString ?? agentCategoryModel)) {
      const explicitModel = primaryModelString ?? agentCategoryModel
      const normalized = explicitModel ? normalizeModelFormat(explicitModel) : undefined
      if (normalized) {
        const variantToUse = agentOverride?.variant ?? agentCategoryConfig?.variant
        const resolvedModel = variantToUse ? { ...normalized, variant: variantToUse } : normalized
        categoryModel = applyCategoryParams(resolvedModel, agentCategoryConfig)
        log("[delegate-task] Cold cache: using explicit user override for subagent", {
          agent: agentToUse,
          model: primaryModelString ?? agentCategoryModel,
        })
      }
    }

    const defaultProviderID = categoryModel?.providerID
      ?? normalizedMatchedModel?.providerID
      ?? "opencode"
    const configuredFallbackChain = buildFallbackChainFromModels(
      normalizedAgentFallbackModels,
      defaultProviderID,
    )
    fallbackChain = configuredFallbackChain
      ?? ((resolutionSkipped || hasExplicitUserModel) ? undefined : agentRequirement?.fallbackChain)
    const effectiveEntry = resolveEffectiveFallbackEntry({
      categoryModel,
      configuredFallbackChain,
      resolution,
    })

    if (categoryModel && effectiveEntry) {
      categoryModel = applyFallbackEntrySettings({
        categoryModel,
        effectiveEntry,
        variantOverride: agentOverride?.variant,
      })
    }
  }

  if (!categoryModel && normalizedMatchedModel) {
    const fullModel = `${normalizedMatchedModel.providerID}/${normalizedMatchedModel.modelID}`
    if (availableModels.size === 0 || fuzzyMatchModel(fullModel, availableModels, [normalizedMatchedModel.providerID])) {
      categoryModel = normalizedMatchedModel
    } else {
      log("[delegate-task] Skipping unavailable agent default model", {
        agent: agentToUse,
        model: fullModel,
      })
    }
  }

  return { categoryModel, fallbackChain }
}
