export function sanitizeSelectedOptions(selectedOptions) {
  if (!Array.isArray(selectedOptions)) return [];
  return selectedOptions.map(String);
}

export function sameSelectedOptions(a, b) {
  const left = [...sanitizeSelectedOptions(a)].sort();
  const right = [...sanitizeSelectedOptions(b)].sort();

  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

export function createVariantGroupMap(variantGroups = []) {
  return new Map(variantGroups.map((group) => [String(group.groupId), group]));
}

export function resolveVariantGroupsForMenuItem(menuItem, variantGroupsById) {
  const groupIds = Array.isArray(menuItem?.variantGroups) ? menuItem.variantGroups : [];

  return groupIds
    .map((groupId) => variantGroupsById.get(String(groupId)) || null)
    .filter(Boolean);
}

export function calculateSelectedOptionsDelta(selectedOptions, variantGroups = []) {
  const remaining = new Map();
  sanitizeSelectedOptions(selectedOptions).forEach((optionName) => {
    remaining.set(optionName, (remaining.get(optionName) || 0) + 1);
  });

  let delta = 0;

  variantGroups.forEach((group) => {
    const options = Array.isArray(group?.options)
      ? [...group.options].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      : [];

    options.forEach((option) => {
      const count = remaining.get(option.name) || 0;
      if (count > 0) {
        delta += Number(option.additionalPrice || 0);
        remaining.set(option.name, count - 1);
      }
    });
  });

  return delta;
}
