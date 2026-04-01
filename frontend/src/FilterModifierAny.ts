import {Modifier} from "./Modifier";
import {MapAssociation} from "./MapAssociation";
import {Filter} from "./Filter";

export class FilterModifierAny extends Filter {

    protected check(substring: string, modifiers: Modifier[], result: Set<string>): boolean {
        if (this.excludes.blacklisted(substring)) {
            return false;
        }

        for (let i = 0; i < this.modifiers.length; i++) {
            const modifier = this.modifiers[i];
            const info     = modifier.getModifier().toLowerCase();

            if (!info.includes(substring)) continue;
            if (this.isIgnored(modifier)) continue;

            let alreadyMatched = false;
            for (const regex of result) {
                if (info.includes(regex)) { alreadyMatched = true; break; }
            }
            if (alreadyMatched) continue;

            if (!this.includes(modifier, modifiers)) {
                return false;
            }
        }
        return true;
    }

    public create(association: MapAssociation, result: Set<string>, required: Modifier[], failsafe: number): void {
        if (required.length === 0) {
            console.log(`[Any.create] fs=${failsafe} → required empty, done`);
            return;
        }

        // Hard cap: if we've looped more times than there are mods, something is broken
        if (failsafe > 50) {
            console.error(`[Any.create] DEADLOCK GUARD hit at failsafe=${failsafe}. Bailing out.`);
            console.error(`[Any.create] Remaining required (${required.length}):`);
            required.forEach(m => console.error(`  - "${m.getModifier().substring(0, 80)}"`));
            console.error(`[Any.create] Current result set (${result.size}):`, Array.from(result));
            return;
        }

        console.log(`[Any.create] ── fs=${failsafe} required=${required.length} result=${result.size} ──`);
        required.forEach((m, i) => console.log(`  req[${i}]: idx=${m.getIndex()} t17=${m.isT17()} vaal=${m.isVaal()} impl=${m.isImplicit()} "${m.getModifier().substring(0, 70)}"`));

        // upgrade: add group-associated mods so substring uniqueness is checked against all tier-variants
        const beforeUpgrade = required.length;
        required = association.upgrade(this.t17, required, this.modifiers, result);
        console.log(`[Any.create] upgrade: ${beforeUpgrade} → ${required.length} mods`);
        if (required.length > beforeUpgrade) {
            required.slice(beforeUpgrade).forEach((m, i) =>
                console.log(`  +added[${i}]: idx=${m.getIndex()} t17=${m.isT17()} "${m.getModifier().substring(0, 60)}"`)
            );
        }

        // generate all substrings across all required mods
        let options: Set<string> = new Set();
        for (const modifier of required) {
            this.substrings(modifier, this.blacklist).forEach(item => options.add(item));
        }
        console.log(`[Any.create] substrings pool size: ${options.size}`);

        const map: Map<string, number> = new Map();
        let checkedCount = 0;
        let rejectedExclude = 0;
        let rejectedCheck = 0;

        const sorted = Array.from(options)
            .filter(o => o.length >= 2)
            .sort((a, b) => a.length - b.length);

        for (const substring of sorted) {
            if (substring.length >= 20) {
                console.log(`[Any.create] stopping substring scan at length ${substring.length} after checking ${checkedCount}`);
                break;
            }
            if (substring.startsWith(' ') || substring.endsWith(' ')) continue;

            checkedCount++;
            if (!this.check(substring, required, result)) {
                rejectedCheck++;
                continue;
            }

            let coverage = 0;
            for (const modifier of required) {
                if (!modifier.getModifier().toLowerCase().includes(substring.toLowerCase())) continue;
                coverage++;
            }
            if (coverage > 0) map.set(substring, coverage);
        }

        console.log(`[Any.create] checked=${checkedCount} rejectedCheck=${rejectedCheck} candidates=${map.size}`);

        // sort: most coverage first, then shortest
        let entries = Array.from(map.entries());
        entries.sort((e1, e2) => {
            const diff = e2[1] - e1[1];
            if (diff !== 0) return diff;
            const l1 = e1[0].length + (e1[0].includes('#') ? 3 : 0);
            const l2 = e2[0].length + (e2[0].includes('#') ? 3 : 0);
            return l1 - l2;
        });

        if (entries.length > 0) {
            console.log(`[Any.create] top-5 candidates:`, entries.slice(0, 5).map(([s, n]) => `"${s}"(${n})`));
        } else {
            console.warn(`[Any.create] NO candidates found!`);
            console.warn(`[Any.create] required mods were:`);
            required.forEach(m => console.warn(`  "${m.getModifier().substring(0, 80)}"`));
            console.warn(`[Any.create] current result:`, Array.from(result));
        }

        const proposed = entries.length > 0 ? entries[0][0] : null;
        console.log(`[Any.create] proposed="${proposed ?? 'null'}"`);

        let ideal: string;
        let expression: RegExp;

        try {
            const optimized = this.optimize(proposed, required);
            expression = optimized.getRegularExpression();
            ideal      = optimized.getIdealResult();
            console.log(`[Any.create] optimized ideal="${ideal}" expr=${expression}`);
        } catch (e) {
            console.error(`[Any.create] optimize() THREW:`, e);
            console.error(`[Any.create] proposed="${proposed}" required[0].fallback="${required[0]?.getFallback()}"`);
            return;
        }

        // remove mods now matched by this ideal
        const beforeFilter = required.length;
        required = required.filter(modifier => {
            const lines   = modifier.getModifier().toLowerCase().split('\\n');
            const matched = lines.some(line => expression.test(line));
            if (matched) console.log(`  [filter] REMOVED idx=${modifier.getIndex()} "${modifier.getModifier().substring(0, 60)}"`);
            else         console.log(`  [filter] kept    idx=${modifier.getIndex()} "${modifier.getModifier().substring(0, 60)}"`);
            return !matched;
        });
        console.log(`[Any.create] filter: ${beforeFilter} → ${required.length} remaining`);

        result.add(ideal);
        console.log(`[Any.create] result now:`, Array.from(result));

        this.create(association, result, required, failsafe + 1);
    }
}