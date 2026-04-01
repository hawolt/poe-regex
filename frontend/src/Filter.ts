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

    constructor(t17: boolean, vaal: boolean, modifiers: Modifier[], excludes: Blacklist, blacklist: Blacklist) {
        this.modifiers = modifiers;
        this.blacklist = blacklist;
        this.excludes = excludes;
        this.vaal = vaal;
        this.t17 = t17;
    }

    public abstract create(association: MapAssociation, result: Set<string>, required: Modifier[], failsafe: number): void;

    protected abstract check(substring: string, modifiers: Modifier[], result: Set<string>): boolean;

    protected includes(modifier: Modifier, modifiers: Modifier[]): boolean {
        for (const mod of modifiers) {
            if (mod.equals(modifier)) {
                return true;
            }
        }
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
                    if (substring.length == 1) continue;
                    let forbidden = blacklist.blacklisted(substring);
                    if (forbidden) continue;
                    set.push(substring);
                }
            }
        }

        // manually bypass blacklist with pte
        if (modifier === 'corrupted') set.push("pte");

        set.sort((a, b) => a.length - b.length);
        return set;
    }

    protected optimize(ideal: string | null, required: Modifier[]): Result {
        let fallback = required[0].getFallback();
        let expression: RegExp | null;

        if (ideal != null) {
            // check how many mods match the ideal result and check their fallback values
            let captured = [...new Set(
                required
                    .filter(modifier => modifier.getModifier().toLowerCase().includes(ideal!))
                    .map(modifier => modifier.getFallback())
            )];

            // if there is only one fallback value available, use it as it will cover all mods ideal matched before
            if (captured.length === 1 && captured[0]) {
                expression = new RegExp(captured[0]);
                ideal = captured[0];
            } else {
                // escape the regex since this could include characters like +, # or other
                expression = new RegExp(this.escape(ideal));
            }
        } else if (fallback) {
            expression = new RegExp(fallback);
            ideal = fallback;
        } else {
            throw new Error("Unable to find a result for specified configuration")
        }
        return new Result(ideal, expression);
    }

    protected escape(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}