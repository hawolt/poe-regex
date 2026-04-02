import {Modifier} from "./Modifier";
import {associations} from "./Global";

export class MapAssociation {
    private readonly mapping: Map<number, number[]>;

    constructor() {
        this.mapping = new Map(associations.map(([idx, related]) => [idx, related]));
        console.log(`[MapAssociation] built with ${this.mapping.size} association entries`);
    }

    private hasLineOverlap(a: Modifier, b: Modifier): boolean {
        const aLines = a.getModifier().toLowerCase().split('\\n').map(l => l.trim());
        const bLines = b.getModifier().toLowerCase().split('\\n').map(l => l.trim());
        return aLines.some(al => bLines.includes(al));
    }

    public upgrade(t17: boolean, vaal: boolean, implicit: boolean, required: Modifier[], allModifiers: Modifier[], result: Set<string>): Modifier[] {
        const set = new Set(required);

        // ── Pass 1: group-based transitive expansion ──────────────────────────
        // Walk the group association map transitively. Only add mods that share
        // at least one line with the mod being processed — group members with
        // no line overlap are UI siblings only and must not constrain regex generation.
        const queue: Modifier[] = [...required];
        const visited = new Set<number>(required.map(m => m.getIndex()));

        // The original required mods — used as the anchor for line-overlap checks.
        // A group-related mod should only be added if it shares at least one line
        // with the ORIGINAL selection, not just with an intermediary (e.g. a supermod).
        // Without this, selecting "Monsters fire additional Projectiles" would pull in
        // "Monsters have increased Area of Effect" via the supermod that bundles both —
        // even though "Area of Effect" has nothing to do with the original selection.
        const originalRequired = new Set(required.map(m => m.getIndex()));

        while (queue.length > 0) {
            const modifier = queue.shift()!;
            const related = this.mapping.get(modifier.getIndex());
            if (!related) continue;

            console.log(`[MapAssociation.upgrade] idx=${modifier.getIndex()} has ${related.length} group-related: [${related.join(',')}]`);

            for (const relatedIndex of related) {
                const association = allModifiers[relatedIndex];
                if (!association) {
                    console.warn(`[MapAssociation.upgrade] relatedIndex=${relatedIndex} out of bounds (allModifiers.length=${allModifiers.length})`);
                    continue;
                }

                if (visited.has(relatedIndex)) continue;
                visited.add(relatedIndex);

                const shouldAdd = t17
                    || association.isT17()
                    || association.getModifier().includes("#% more Monster Life");

                if (!shouldAdd) {
                    console.log(`[MapAssociation.upgrade]   skip idx=${relatedIndex} (t17 gate): "${association.getModifier().substring(0, 50)}"`);
                    continue;
                }

                const alreadyMatched = Array.from(result).some(expr =>
                    association.getModifier().toLowerCase().includes(expr)
                );
                if (alreadyMatched) {
                    console.log(`[MapAssociation.upgrade]   skip idx=${relatedIndex} (already matched): "${association.getModifier().substring(0, 50)}"`);
                    continue;
                }

                const alreadyInSet = Array.from(set).some(
                    existing => existing.getModifier() === association.getModifier()
                );
                if (alreadyInSet) {
                    console.log(`[MapAssociation.upgrade]   skip idx=${relatedIndex} (duplicate text): "${association.getModifier().substring(0, 50)}"`);
                    continue;
                }

                // Check overlap against ORIGINAL required mods only, not the current
                // queue item. This prevents group siblings of a supermod from being
                // pulled in just because they share a line with the supermod itself.
                const overlapsOriginal = Array.from(originalRequired).some(origIdx => {
                    const orig = allModifiers[origIdx];
                    return orig && this.hasLineOverlap(orig, association);
                });
                // Also allow the association itself to be a supermod of an original mod
                // (i.e. original mod's lines are a subset of the association's lines)
                const isSupermod = Array.from(originalRequired).some(origIdx => {
                    const orig = allModifiers[origIdx];
                    if (!orig) return false;
                    const origLines = orig.getModifier().toLowerCase().split('\\n').map(l => l.trim());
                    const assocLines = association.getModifier().toLowerCase().split('\\n').map(l => l.trim());
                    return origLines.every(l => assocLines.includes(l));
                });

                if (!overlapsOriginal && !isSupermod) {
                    console.log(`[MapAssociation.upgrade]   skip idx=${relatedIndex} (no overlap with original selection): "${association.getModifier().substring(0, 50)}"`);
                    continue;
                }

                console.log(`[MapAssociation.upgrade]   +add (group) idx=${relatedIndex} t17=${association.isT17()} "${association.getModifier().substring(0, 50)}"`);
                set.add(association);
                queue.push(association);
            }
        }

        // ── Pass 2: line-intersection expansion ───────────────────────────────
        // Catches mods that share a line with the originally selected mods but have
        // no group association, e.g. the T17 supermod bundling lines from individually
        // grouped mods.
        //
        // We do NOT iterate to fixpoint — only direct line matches against the
        // anchor set (original required + Pass 1 additions) are considered.
        //
        // Additionally, we skip any candidate whose lines are ALL already contained
        // within a mod already in the set — such candidates are proper subsets and
        // will always be matched by any token that matches the superset mod. Adding
        // them to required would force the filter to generate a second redundant token.
        // Example: selecting "Monsters cannot be Stunned\n#% more Monster Life" should
        // NOT pull in the single-line "#% more Monster Life" — the supermod already
        // covers it, and the supermod has a unique line ("cannot be Stunned") that can
        // serve as its regex token.
        const anchorSet = Array.from(set); // snapshot before Pass 2 adds anything

        for (const candidate of allModifiers) {
            if (visited.has(candidate.getIndex())) continue;

            // Skip candidates that would be ignored by the filter — same gate as Pass 1.
            if (candidate.isT17()      && !t17)      continue;
            if (candidate.isVaal()     && !vaal)     continue;
            if (candidate.isImplicit() && !implicit) continue;

            const alreadyInSet = Array.from(set).some(
                existing => existing.getModifier() === candidate.getModifier()
            );
            if (alreadyInSet) {
                visited.add(candidate.getIndex());
                continue;
            }

            const alreadyMatched = Array.from(result).some(expr =>
                candidate.getModifier().toLowerCase().includes(expr)
            );
            if (alreadyMatched) continue;

            const candidateLines = candidate.getModifier().toLowerCase().split('\\n').map(l => l.trim());

            // Skip if candidate is a proper subset of any mod already in the set —
            // every one of its lines appears in some existing set member.
            const isSubsetOfExisting = Array.from(set).some(existing => {
                const existingLines = existing.getModifier().toLowerCase().split('\\n').map(l => l.trim());
                return candidateLines.every(cl => existingLines.includes(cl));
            });
            if (isSubsetOfExisting) {
                console.log(`[MapAssociation.upgrade]   skip idx=${candidate.getIndex()} (subset of existing set member): "${candidate.getModifier().substring(0, 60)}"`);
                continue;
            }

            // Only add if an anchor mod's lines are all contained in the candidate
            // (candidate is a supermod of an anchor — selecting it means the anchor
            // would always be matched by any regex token for the candidate).
            const subsetRelationship = anchorSet.some(anchor => {
                const anchorLines = anchor.getModifier().toLowerCase().split('\\n').map(l => l.trim());
                return anchorLines.every(al => candidateLines.includes(al));
            });

            if (subsetRelationship) {
                console.log(`[MapAssociation.upgrade]   +add (line) idx=${candidate.getIndex()} t17=${candidate.isT17()} "${candidate.getModifier().substring(0, 60)}"`);
                visited.add(candidate.getIndex());
                set.add(candidate);
            }
        }

        const expanded = Array.from(set);
        if (expanded.length > required.length) {
            console.log(`[MapAssociation.upgrade] total: ${required.length} → ${expanded.length}`);
        }

        return expanded;
    }
}