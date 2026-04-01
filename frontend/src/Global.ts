// Populated at load time by buildModifiers() in main.ts using shared group intersections.
// Structure: [modifierIndex, [associatedModifierIndex, ...]]
export const associations: [number, number[]][] = [];

// Populated at load time by buildModifiers() in main.ts using line-level text intersection.
// Any modifier that shares at least one line (split by \n) with another modifier is linked here.
// This catches supermods that bundle lines from multiple mods without sharing any group tag.
// Structure: modifierIndex → Set of related modifierIndices
export const lineRelations: Map<number, Set<number>> = new Map();