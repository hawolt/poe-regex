import {Modifier} from "./Modifier";
import {associations} from "./Global";

export class MapAssociation {
    private mapping: Map<Modifier, Modifier[]> = new Map<Modifier, Modifier[]>();

    constructor(modifiers: Modifier[]) {
        let builder = new Map<number, Modifier>();
        // create a local set with all indices and modifiers
        for (let i = 0; i < associations.length; i++) {
            let array = associations[i];

            let target = array[0];
            let mod = modifiers[target];
            let modifier = new Modifier(mod.getModifier(), mod.getMetadata());

            builder.set(target, modifier);
        }
        // iterate again to properly build mapping
        for (let i = 0; i < associations.length; i++) {
            let array = associations[i];

            let target = array[0];
            let indices = array[1];

            let modifier = builder.get(target);

            let arr: Modifier[] = [];
            for (let j = 0; j < indices.length; j++) {
                let index = indices[j];
                let mod = builder.get(index);
                if (mod) {
                    arr.push(mod);
                }
            }

            if (modifier && arr) {
                this.mapping.set(modifier, arr);
            }
        }
    }

    // fill array with any mod that is associated to one of the present and required mods
    // only add the t17 mods into the pool from the mapping since we don't want to create
    // a regex that matches more than what we need, would be extra characters
    // if t17 mode is enabled then we need to add everything, for this case we also need
    // to know the current result set to avoid endlessly adding things we have already matched
    public upgrade(t17: boolean, required: Modifier[], result: Set<string>): Modifier[] {
        const set = new Set(required);
        const keys = Array.from(this.mapping.keys());

        for (const modifier of required) {
            for (const key of keys) {
                if (modifier.equals(key)) {
                    let associations = this.mapping.get(key) || [];
                    for (const association of associations) {
                        // skip this upgrade if it is supposed to be ignored
                        if (modifier.isIncludedBypass(association.getIndex())) continue;
                        // the mod "#% more Monster Life" is a special exception since it shares its attribute
                        // with another non t17 mod
                        if (t17 || association.isT17() || association.getModifier().includes("#% more Monster Life")) {
                            // check if we have this matched already, assume no by default
                            let matched = false;
                            for (const expression of result) {
                                if (association.getModifier().toLowerCase().includes(expression)) {
                                    matched = true;
                                    break;
                                }
                            }
                            // only add if it's not already matched by a result
                            if (!matched) {
                                set.add(association);
                            }
                        }
                    }
                }
            }
        }

        return Array.from(set);
    }
}