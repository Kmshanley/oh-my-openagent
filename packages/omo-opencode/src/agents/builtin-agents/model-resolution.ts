import { resolveModelPipeline } from "../../shared"
import { transformModelForProvider } from "../../shared/provider-model-id-transform"

// v4.19.4 compatibility: resolve user-configured model from override, supporting
// both legacy single-model field and the new models array (models[0] is primary).
export function resolveOverrideModel(override?: {
  model?: string
  models?: (string | { model?: string })[]
}): string | undefined {
  if (!override) return undefined
  if (override.model !== undefined) return override.model
  const modelsArray = override.models
  if (modelsArray && modelsArray.length > 0) {
    const first = modelsArray[0]
    return typeof first === "string" ? first : first?.model
  }
  return undefined
}

export function applyModelResolution(input: {
  uiSelectedModel?: string
  userModel?: string
  requirement?: { fallbackChain?: { providers: string[]; model: string; variant?: string }[] }
  availableModels: Set<string>
  systemDefaultModel?: string
}) {
  const { uiSelectedModel, userModel, requirement, availableModels, systemDefaultModel } = input
  return resolveModelPipeline({
    intent: { uiSelectedModel, userModel },
    constraints: { availableModels },
    policy: { fallbackChain: requirement?.fallbackChain, systemDefaultModel },
  })
}

export function getFirstFallbackModel(requirement?: {
  fallbackChain?: { providers: string[]; model: string; variant?: string }[]
}) {
  const entry = requirement?.fallbackChain?.[0]
  if (!entry || entry.providers.length === 0) return undefined
  const provider = entry.providers[0]
  const transformedModel = transformModelForProvider(provider, entry.model)
  return {
    model: `${provider}/${transformedModel}`,
    provenance: "provider-fallback" as const,
    variant: entry.variant,
  }
}
