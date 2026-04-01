import {Modifier} from "./Modifier";
import {associations} from "./Global";

export class MapAssociation {
    private readonly mapping: Map<number, number[]>;

    constructor() {
        this.mapping = new Map(associations.map(([idx, related]) => [idx, related]));
        console.log(`[MapAssociation] built with ${this.mapping.size} association entries`);
    }

    public upgrade(t17: boolean, required: Modifier[], allModifiers: Modifier[], result: Set<string>): Modifier[] {
        const set = new Set(required);
        const before = set.size;

        for (const modifier of required) {
            const related = this.mapping.get(modifier.getIndex());
            if (!related) continue;

            console.log(`[MapAssociation.upgrade] idx=${modifier.getIndex()} has ${related.length} related: [${related.join(',')}]`);

            for (const relatedIndex of related) {
                const association = allModifiers[relatedIndex];
                if (!association) {
                    console.warn(`[MapAssociation.upgrade] relatedIndex=${relatedIndex} out of bounds (allModifiers.length=${allModifiers.length})`);
                    continue;
                }

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

                console.log(`[MapAssociation.upgrade]   +add idx=${relatedIndex} t17=${association.isT17()} "${association.getModifier().substring(0, 50)}"`);
                set.add(association);
            }
        }

        if (set.size > before) {
            console.log(`[MapAssociation.upgrade] expanded ${before} → ${set.size}`);
        }

        return Array.from(set);
    }
}