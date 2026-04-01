import {Result} from "./Result";
import {Modifier} from "./Modifier";
import {Blacklist} from "./Blacklist";
import {MapAssociation} from "./MapAssociation";

export abstract class Filter {

    protected readonly modifiers: Modifier[];
    protected readonly blacklist: Blacklist;
    protected readonly excludes: Blacklist;
    protected readonly vaal: boolean;
    protected readonly t17: boolean;
    protected readonly implicit: boolean;

    constructor(t17: boolean, vaal: boolean, implicit: boolean, modifiers: Modifier[], excludes: Blacklist, blacklist: Blacklist) {
        this.modifiers = modifiers;
        this.blacklist = blacklist;
        this.excludes = excludes;
        this.vaal = vaal;
        this.t17 = t17;
        this.implicit = implicit;
    }

    public abstract create(association: MapAssociation, result: Set<string>, required: Modifier[], failsafe: number): void;

    protected abstract check(substring: string, modifiers: Modifier[], result: Set<string>): boolean;

    protected includes(modifier: Modifier, modifiers: Modifier[]): boolean {
        for (const mod of modifiers) {
            if (mod.equals(modifier)) return true;
        }
        return false;
    }

    /** Returns true if this modifier should be skipped given current checkbox state */
    protected isIgnored(mod: Modifier): boolean {
        if (mod.isImplicit() && !this.implicit) return true;
        if (mod.isVaal()     && !this.vaal)     return true;
        if (mod.isT17()      && !this.t17)      return true;
        return false;
    }

    protected substrings(mod: Modifier, blacklist: Blacklist): string[] {
        let set: string[] = [];
        let modifier = mod.getModifier().toLowerCase();
        let data = modifier.split("\\n");
        for (let i = 0; i < data.length; i++) {
            let information = data[i];
            for (let j = 0; j < information.length; j++) {
                for (let k = j + 1; k <= information.length; k++) {
                    let substring = information.substring(j, k);
                    if (substring.length === 1) continue;
                    let forbidden = blacklist.blacklisted(substring);
                    if (forbidden) continue;
                    set.push(substring);
                }
            }
        }
        // manually bypass blacklist for "corrupted" mod
        if (modifier === 'corrupted') set.push("pte");
        set.sort((a, b) => a.length - b.length);
        return set;
    }

    protected optimize(ideal: string | null, required: Modifier[]): Result {
        let fallback = required[0].getFallback();
        let expression: RegExp;
        let idealResult: string;

        if (ideal != null) {
            // check how many mods match the ideal result and look at their fallback values
            let captured = [...new Set(
                required
                    .filter(modifier => modifier.getModifier().toLowerCase().includes(ideal!))
                    .map(modifier => modifier.getFallback())
            )];

            // if there is only one fallback value available, use it as it will cover all matched mods
            if (captured.length === 1 && captured[0]) {
                expression = new RegExp(captured[0]);
                idealResult = captured[0];
            } else {
                // escape the substring since it could include characters like +, # etc
                expression = new RegExp(this.escape(ideal));
                idealResult = ideal;
            }
        } else if (fallback) {
            expression = new RegExp(fallback);
            idealResult = fallback;
        } else {
            throw new Error("Unable to find a result for specified configuration");
        }
        return new Result(idealResult, expression);
    }

    protected escape(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}