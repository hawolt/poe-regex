export class Blacklist {
    private readonly blacklist: Set<string> = new Set();
    private readonly forbidden: Set<string> = new Set();

    // add everything and make sure its lowercased
    public populate(arr: string[]) {
        for (let i = 0; i < arr.length; i++) {
            this.blacklist.add(arr[i].toLowerCase().trim());
        }
    }

    // these are things which are not allowed to be included in the substring
    public lock(arr: string[]) {
        for (let i = 0; i < arr.length; i++) {
            if (arr[i].length === 0) continue;
            this.forbidden.add(arr[i].toLowerCase().trim());
        }
    }

    public blacklisted(substring: string): boolean {
        for (let entry of this.blacklist) {
            if (entry.includes(substring)) {
                return true;
            }
        }
        for (let entry of this.forbidden) {
            if (substring.includes(entry)) {
                return true;
            }
        }
        return false;
    }
}