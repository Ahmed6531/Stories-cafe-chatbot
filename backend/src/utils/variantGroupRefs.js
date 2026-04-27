import { randomUUID } from "crypto";

function normalizeRefValue(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && isFinite(value)) return String(value);
  return "";
}

export function generateVariantGroupRefId() {
  return `vg_${randomUUID().replace(/-/g, "")}`;
}

export function extractVariantGroupRef(groupRef) {
  if (typeof groupRef === "string") {
    return normalizeRefValue(groupRef);
  }

  if (typeof groupRef === "number") {
    return normalizeRefValue(groupRef);
  }

  if (!groupRef || typeof groupRef !== "object") {
    return "";
  }

  for (const candidate of [groupRef.groupId, groupRef.refId, groupRef.id]) {
    const normalized = normalizeRefValue(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return "";
}

export function normalizeVariantGroupRefs(variantGroups = []) {
  if (!Array.isArray(variantGroups)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  variantGroups.forEach((groupRef) => {
    const ref = extractVariantGroupRef(groupRef);
    if (!ref || seen.has(ref)) {
      return;
    }

    seen.add(ref);
    normalized.push(ref);
  });

  return normalized;
}

export function getVariantGroupRefs(group) {
  const refs = [];

  [group?.groupId, group?.refId, group?.id].forEach((candidate) => {
    const normalized = normalizeRefValue(candidate);
    if (normalized && !refs.includes(normalized)) {
      refs.push(normalized);
    }
  });

  return refs;
}

export function createVariantGroupRefMap(groups = []) {
  const groupsByRef = new Map();

  groups.forEach((group) => {
    getVariantGroupRefs(group).forEach((ref) => {
      groupsByRef.set(ref, group);
    });
  });

  return groupsByRef;
}

export function getCanonicalVariantGroupRef(group) {
  return normalizeRefValue(group?.groupId);
}
