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

    public upgrade(t17: boolean, required: Modifier[], allModifiers: Modifier[], result: Set<string>): Modifier[] {
        const set = new Set(required);

        // ── Pass 1: group-based transitive expansion ──────────────────────────
        // Walk the group association map transitively. Only add mods that share
        // at least one line with the mod being processed — group members with
        // no line overlap (e.g. Drowning Orbs and Sawblades sharing a group) are
        // UI siblings only and must not enter required or constrain regex generation.
        const queue: Modifier[] = [...required];
        const visited = new Set<number>(required.map(m => m.getIndex()));

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

                if (!this.hasLineOverlap(modifier, association)) {
                    console.log(`[MapAssociation.upgrade]   skip idx=${relatedIndex} (no line overlap, UI-only): "${association.getModifier().substring(0, 50)}"`);
                    continue;
                }

                console.log(`[MapAssociation.upgrade]   +add (group) idx=${relatedIndex} t17=${association.isT17()} "${association.getModifier().substring(0, 50)}"`);
                set.add(association);
                queue.push(association);
            }
        }

        // ── Pass 2: line-intersection expansion ───────────────────────────────
        // Catches mods that share a line with the originally selected mods but have
        // no group association, e.g. the T17 curse supermod that bundles lines from
        // individually grouped curse mods.
        //
        // IMPORTANT: we only match candidates against the mods that were in `required`
        // at the START of Pass 2 (i.e. after Pass 1, but before any Pass 2 additions).
        // We do NOT iterate to fixpoint — doing so would cause transitive pulls:
        //   "more Monster Life" → pulls in "Stunned\nmore Monster Life" (correct)
        //   → fixpoint would then match "Stunned\nmore Monster Life"'s lines against
        //     the 3-line supermod containing "Monsters cannot be Stunned" (wrong —
        //     that supermod has nothing to do with "more Monster Life")
        //
        // The anchor set is fixed at the start so only direct line matches against
        // the user's actual selection (plus Pass 1 additions) are considered.
        const anchorSet = Array.from(set); // snapshot before Pass 2 adds anything

        for (const candidate of allModifiers) {
            if (visited.has(candidate.getIndex())) continue;

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

            // Only check against the anchor set (original required + Pass 1 additions)
            const hasOverlap = anchorSet.some(anchor => {
                const anchorLines = anchor.getModifier().toLowerCase().split('\\n').map(l => l.trim());
                return anchorLines.some(al => candidateLines.includes(al));
            });

            if (hasOverlap) {
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