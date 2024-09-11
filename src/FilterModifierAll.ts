import {Modifier} from "./Modifier";
import {Filter} from "./Filter";
import {MapAssociation} from "./MapAssociation";

export class FilterModifierAll extends Filter {

    protected check(substring: string, modifiers: Modifier[], result: Set<string>): boolean {
        // if the substring is excluded, instantly stop
        if (this.excludes.blacklisted(substring)) {
            return false;
        }

        // check if any other mod has issues with this substring
        for (let i = 0; i < this.modifiers.length; i++) {
            let modifier = this.modifiers[i];
            let valid = modifier.getModifier().toLowerCase().includes(substring.toLowerCase());
            let required = this.includes(modifier, modifiers);
            // is this perhaps a T17 mod that we can ignore
            if (modifier.isT17() && !this.t17) {
                continue;
            }
            // if we do not need this mod, but it includes our substring reject it
            if ((!required && valid) || (required && !valid)) {
                return false;
            }
        }
        return true;
    }

    create(association: MapAssociation, result: Set<string>, required: Modifier[], failsafe: number): void {
        // stop if we don't require anything
        if (required.length === 0) return;

        for (const modifier of required) {
            let options: Set<string> = new Set();
            let exception: Modifier[] = [];

            let list = this.substrings(modifier, this.blacklist);
            list.forEach(item => options.add(item));

            // figure out any mod that contains our target mod as a reference for later
            for (const i in this.modifiers) {
                let mod = this.modifiers[i];
                if (mod.getModifier().toLowerCase().includes(modifier.getModifier().toLowerCase())) {
                    exception.push(mod);
                }
            }
            exception.push(modifier);

            // sort all substrings based on their length
            let matches: string[] = [];
            let sorted = Array.from(options).sort((a, b) => a.length - b.length);
            for (const substring of sorted) {
                // ensure substring is unique to itself and no other mod other than the exceptions
                if (!this.check(substring, exception, result)) continue;
                matches.push(substring);
            }

            // sort all matches based on their real length
            // sort equal length results based on if they contain a space or not
            matches.sort((a, b) => {
                const length1 = a.includes("#") || a.includes(" ") ? a.length + 2 : a.length;
                const length2 = b.includes("#") || b.includes(" ") ? b.length + 2 : b.length;
                if (length1 !== length2) {
                    return length1 - length2;
                }
                const space1 = a.includes(" ");
                const space2 = b.includes(" ");
                return space1 === space2 ? 0 : space1 ? 1 : -1;
            });

            if (matches.length > 0) {
                result.add(matches[0])
            }
        }
    }
}