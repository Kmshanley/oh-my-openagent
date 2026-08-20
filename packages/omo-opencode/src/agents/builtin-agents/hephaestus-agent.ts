import type { AgentConfig } from "@opencode-ai/sdk"
import type { AgentOverrides } from "../types"
import type { CategoryConfig } from "../../config/schema"
import type { AvailableAgent, AvailableCategory, AvailableSkill } from "../dynamic-agent-prompt-builder"
import { AGENT_MODEL_REQUIREMENTS, isAnyProviderConnected } from "../../shared"
import { log } from "../../shared/logger"
import { createHephaestusAgent, isHephaestusSupportedModel } from "../hephaestus"
import { applyEnvironmentContext } from "./environment-context"
import { applyCategoryOverride, mergeAgentConfig } from "./agent-overrides"
import { applyModelResolution, getFirstFallbackModel, resolveOverrideModel } from "./model-resolution"
import { applyFrontierToolSchemaPermission } from "../frontier-tool-schema-guard"

export function maybeCreateHephaestusConfig(input: {
  disabledAgents: string[]
  agentOverrides: AgentOverrides
  availableModels: Set<string>
  systemDefaultModel?: string
  isFirstRunNoCache: boolean
  availableAgents: AvailableAgent[]
  availableSkills: AvailableSkill[]
  availableCategories: AvailableCategory[]
  mergedCategories: Record<string, CategoryConfig>
  directory?: string
  useTaskSystem: boolean
  disableOmoEnv?: boolean
}): AgentConfig | undefined {
  const {
    disabledAgents,
    agentOverrides,
    availableModels,
    systemDefaultModel,
    isFirstRunNoCache,
    availableAgents,
    availableSkills,
    availableCategories,
    mergedCategories,
    directory,
    useTaskSystem,
    disableOmoEnv = false,
  } = input

  if (disabledAgents.includes("hephaestus")) return undefined

const hephaestusOverride = agentOverrides["hephaestus"]
   const hephaestusRequirement = AGENT_MODEL_REQUIREMENTS["hephaestus"]
   // v4.19.4 compatibility: resolve user-configured model from override, supporting
   // both legacy single-model field and the new models array (models[0] is primary).
   let overrideModel: string | undefined = undefined
   if (hephaestusOverride?.model !== undefined) {
     overrideModel = hephaestusOverride.model
   } else {
     const modelsArray = hephaestusOverride?.models
     if (modelsArray && modelsArray.length > 0) {
       const first = modelsArray[0]
       overrideModel = typeof first === "string" ? first : first?.model
     }
   }

   let hephaestusResolution = applyModelResolution({
     userModel: overrideModel,
     requirement: hephaestusRequirement,
     availableModels,
     systemDefaultModel,
   })
   if (isFirstRunNoCache && overrideModel === undefined) {
     hephaestusResolution = getFirstFallbackModel(hephaestusRequirement)
   }

   if (!hephaestusResolution) {
     log("[agent-registration] Agent skipped: model resolution returned no result", {
       agent: "hephaestus",
       configuredModel: overrideModel,
     })
     return undefined
   }
   const { model: hephaestusModel, variant: hephaestusResolvedVariant } = hephaestusResolution

  if (!isHephaestusSupportedModel(hephaestusModel)) {
    log("[agent-registration] Agent skipped: unsupported Hephaestus model", {
      agent: "hephaestus",
      configuredModel: hephaestusModel,
    })
    return undefined
  }

  let hephaestusConfig = createHephaestusAgent(
    hephaestusModel,
    availableAgents,
    undefined,
    availableSkills,
    availableCategories,
    useTaskSystem
  )

  hephaestusConfig = { ...hephaestusConfig, variant: hephaestusResolvedVariant ?? "medium" }

  const hepOverrideCategory = (hephaestusOverride as Record<string, unknown> | undefined)?.category as string | undefined
  if (hepOverrideCategory) {
    hephaestusConfig = applyCategoryOverride(hephaestusConfig, hepOverrideCategory, mergedCategories)
    if (!isHephaestusSupportedModel(hephaestusConfig.model)) {
      log("[agent-registration] Agent skipped: unsupported Hephaestus category model", {
        agent: "hephaestus",
        configuredModel: hephaestusConfig.model,
      })
      return undefined
    }
  }

  hephaestusConfig = applyEnvironmentContext(hephaestusConfig, directory, { disableOmoEnv })

  if (hephaestusOverride) {
    hephaestusConfig = mergeAgentConfig(hephaestusConfig, hephaestusOverride, directory)
    if (!isHephaestusSupportedModel(hephaestusConfig.model)) {
      log("[agent-registration] Agent skipped: unsupported Hephaestus override model", {
        agent: "hephaestus",
        configuredModel: hephaestusConfig.model,
      })
      return undefined
    }
  }

  const resolvedModel = hephaestusConfig.model ?? ""
  hephaestusConfig.permission = applyFrontierToolSchemaPermission(
    hephaestusConfig.permission,
    resolvedModel,
    hephaestusOverride?.permission,
    (hephaestusOverride as { tools?: Record<string, boolean> } | undefined)?.tools
  )

  return hephaestusConfig
}
