function extractVariantGroupId(groupRef) {
  if (typeof groupRef === "string") {
    return groupRef.trim()
  }

  if (!groupRef || typeof groupRef !== "object") {
    return ""
  }

  const candidates = [groupRef.refId, groupRef.groupId, groupRef.id]

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  return ""
}

export function normalizeVariantGroupIds(variantGroups) {
  if (!Array.isArray(variantGroups)) {
    return []
  }

  const seen = new Set()
  const normalized = []

  variantGroups.forEach((groupRef) => {
    const groupId = extractVariantGroupId(groupRef)
    if (!groupId || seen.has(groupId)) {
      return
    }

    seen.add(groupId)
    normalized.push(groupId)
  })

  return normalized
}

export function getVariantGroupId(groupRef) {
  return extractVariantGroupId(groupRef)
}
