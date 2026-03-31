function normalizeSelectedOption(selection) {
  if (typeof selection === "string") {
    const optionName = selection.trim();
    return optionName ? { optionName } : null;
  }

  if (!selection || typeof selection !== "object") {
    return null;
  }

  const optionSource = selection.optionName ?? selection.name;
  const optionName = String(optionSource || "").trim();
  if (!optionName) {
    return null;
  }

  const suboptionSource = selection.suboptionName ?? selection.sub;
  const suboptionName = suboptionSource == null ? "" : String(suboptionSource).trim();

  return suboptionName ? { optionName, suboptionName } : { optionName };
}

function selectedOptionKey(selection) {
  const normalized = normalizeSelectedOption(selection);
  if (!normalized) {
    return "";
  }

  return `${normalized.optionName}::${normalized.suboptionName || ""}`;
}

export function sanitizeSelectedOptions(selectedOptions) {
  if (!Array.isArray(selectedOptions)) return [];
  return selectedOptions.map(normalizeSelectedOption).filter(Boolean);
}

export function sameSelectedOptions(a, b) {
  const left = sanitizeSelectedOptions(a)
    .map(selectedOptionKey)
    .sort();
  const right = sanitizeSelectedOptions(b)
    .map(selectedOptionKey)
    .sort();

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
  const remainingSelections = sanitizeSelectedOptions(selectedOptions);

  let delta = 0;

  variantGroups.forEach((group) => {
    const options = Array.isArray(group?.options)
      ? [...group.options].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      : [];

    options.forEach((option) => {
      const matchIndex = remainingSelections.findIndex(
        (selection) => selection.optionName === option.name,
      );

      if (matchIndex < 0) {
        return;
      }

      const selection = remainingSelections[matchIndex];
      delta += Number(option.additionalPrice || 0);

      if (selection.suboptionName && Array.isArray(option.suboptions)) {
        const suboption = option.suboptions.find(
          (entry) => entry.name === selection.suboptionName,
        );
        delta += Number(suboption?.additionalPrice || 0);
      }

      remainingSelections.splice(matchIndex, 1);
    });
  });

  return delta;
}

export function sortSelectedOptionsForDisplay(selectedOptions, variantGroups = []) {
  const original = sanitizeSelectedOptions(selectedOptions);
  const remainingSelections = [...original];

  const ordered = [];

  variantGroups.forEach((group) => {
    const options = Array.isArray(group?.options)
      ? [...group.options].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      : [];

    options.forEach((option) => {
      for (let i = 0; i < remainingSelections.length; i += 1) {
        if (remainingSelections[i].optionName !== option.name) {
          continue;
        }

        ordered.push(remainingSelections[i]);
        remainingSelections.splice(i, 1);
        i -= 1;
      }
    });
  });

  remainingSelections.forEach((selection) => {
    ordered.push(selection);
  });

  return ordered;
}
