import {Modifier} from "./Modifier";
import {Filter} from "./Filter";
import {MapAssociation} from "./MapAssociation";

export class FilterModifierAll extends Filter {

    protected check(substring: string, modifiers: Modifier[], result: Set<string>): boolean {
        if (this.excludes.blacklisted(substring)) {
            return false;
        }

        for (let i = 0; i < this.modifiers.length; i++) {
            const modifier = this.modifiers[i];
            if (this.isIgnored(modifier)) continue;

            const valid = modifier.getModifier().toLowerCase().includes(substring.toLowerCase());
            const required = this.includes(modifier, modifiers);

            if ((!required && valid) || (required && !valid)) {
                return false;
            }
        }
        return true;
    }

    public create(association: MapAssociation, result: Set<string>, required: Modifier[], failsafe: number): void {
        if (required.length === 0) {
            console.log(`[All.create] required empty, done`);
            return;
        }

        console.log(`[All.create] called with ${required.length} required mod(s):`);
        required.forEach((m, i) => console.log(`  req[${i}]: idx=${m.getIndex()} t17=${m.isT17()} vaal=${m.isVaal()} impl=${m.isImplicit()} "${m.getModifier().substring(0, 70)}"`));

        // Deduplicate: if a mod's full text appears as a line inside another mod in required,
        // it is already covered by that larger mod and does not need its own token.
        // e.g. required = [
        //   "Monsters cannot be Stunned"                                    (single-line)
        //   "Monsters cannot be Stunned\nMonsters' Action Speed cannot..."  (supermod)
        // ]
        // The single-line mod is fully covered by the supermod → remove it so only one
        // token is generated (for the supermod), which matches all lines via one regex.
        const deduplicated = required.filter(mod => {
            const modLines = mod.getModifier().toLowerCase().split('\\n').map(l => l.trim());
            const coveredByOther = required.some(other => {
                if (other === mod) return false;
                const otherLines = other.getModifier().toLowerCase().split('\\n').map(l => l.trim());
                // 'other' covers 'mod' if every line of 'mod' appears in 'other'
                return modLines.every(ml => otherLines.includes(ml));
            });
            if (coveredByOther) {
                console.log(`[All.create]   dedup: removing idx=${mod.getIndex()} (covered by a larger mod in required) "${mod.getModifier().substring(0, 60)}"`);
            }
            return !coveredByOther;
        });

        if (deduplicated.length < required.length) {
            console.log(`[All.create] dedup: ${required.length} → ${deduplicated.length} mod(s) to process`);
            required = deduplicated;
        }

        for (const modifier of required) {
            console.log(`\n[All.create] ── processing: "${modifier.getModifier().substring(0, 70)}" ──`);

            let options: Set<string> = new Set();
            let exception: Modifier[] = [];

            const list = this.substrings(modifier, this.blacklist);
            list.forEach(item => options.add(item));
            console.log(`[All.create]   substrings: ${options.size}`);

            // build exception list: mods that textually contain or are contained by this modifier
            for (const i in this.modifiers) {
                const mod = this.modifiers[i];
                const direct = modifier.getModifier().toLowerCase().includes(mod.getModifier().toLowerCase());
                const reversed = mod.getModifier().toLowerCase().includes(modifier.getModifier().toLowerCase());
                if (direct || reversed) exception.push(mod);
            }
            exception.push(modifier);
            console.log(`[All.create]   exception list: ${exception.length} mods`);

            let matches: string[] = [];
            let checked = 0;
            const sorted = Array.from(options).sort((a, b) => a.length - b.length);

            for (const substring of sorted) {
                if (substring.startsWith(' ') || substring.endsWith(' ')) continue;
                checked++;
                if (!this.check(substring, exception, result)) continue;
                matches.push(substring);
            }

            console.log(`[All.create]   checked ${checked} substrings → ${matches.length} valid matches`);

            if (matches.length === 0) {
                console.warn(`[All.create]   NO matches found for "${modifier.getModifier().substring(0, 60)}"`);
                console.warn(`[All.create]   fallback="${modifier.getFallback()}"`);
                console.warn(`[All.create]   t17=${this.t17} vaal=${this.vaal} impl=${this.implicit}`);
                console.warn(`[All.create]   modifiers pool size=${this.modifiers.length}`);
            }

            // sort by effective length (penalise # and spaces)
            matches.sort((a, b) => {
                let la = a.length + (a.includes('#') ? 3 : 0) + (a.includes(' ') ? 2 : 0);
                let lb = b.length + (b.includes('#') ? 3 : 0) + (b.includes(' ') ? 2 : 0);
                if (la !== lb) return la - lb;
                return (a.includes(' ') ? 1 : 0) - (b.includes(' ') ? 1 : 0);
            });

            const fallback = modifier.getFallback();

            if (matches.length > 0) {
                console.log(`[All.create]   top match: "${matches[0]}"`);
                try {
                    const optimized = this.optimize(matches[0], exception);
                    const ideal = optimized.getIdealResult();
                    console.log(`[All.create]   → result: "${ideal}"`);
                    result.add(ideal);
                } catch (e) {
                    console.error(`[All.create]   optimize() THREW:`, e);
                }
            } else if (fallback) {
                console.warn(`[All.create]   using fallback: "${fallback}"`);
                result.add(fallback);
            } else {
                console.error(`[All.create]   FAILED — no match and no fallback for: "${modifier.getModifier().substring(0, 60)}"`);
            }
        }

        console.log(`[All.create] done. result:`, Array.from(result));
    }
}