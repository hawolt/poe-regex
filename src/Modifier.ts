export class Modifier {
    private readonly mod: string;
    private readonly index: number;
    private readonly args: string[];
    private readonly active: boolean;
    private readonly t17: boolean = false;
    private readonly vaal: boolean = false;
    private readonly special: boolean = false;
    private readonly fallback: string | null = null;
    private readonly bypass: Set<number> = new Set();

    constructor(mod: string, args: string[]) {
        this.mod = mod;
        this.args = args;
        this.index = Number(args[0]);
        this.active = Boolean(args[1]);
        for (const arg of args) {
            if (arg.startsWith('bypass')) {
                arg.split("=", 2)[1].split(",").map(o => Number(o)).forEach(value => this.bypass.add(value));
            } else if (arg.startsWith('fallback')) {
                this.fallback = arg.split("=", 2)[1];
                this.special = true;
            } else {
                switch (arg) {
                    case 't17':
                        this.t17 = true;
                        break
                    case 'vaal':
                        this.vaal = true;
                        break
                }
            }
        }
    }

    public isIncludedBypass(id: number): boolean {
        return this.bypass.has(id);
    }

    public getMetadata(): string[] {
        return [...this.args];
    }

    public getFallback(): string | null {
        return this.fallback;
    }

    public getModifier(): string {
        return this.mod;
    }

    public getIndex(): number {
        return this.index;
    }

    public isActive(): boolean {
        return this.active;
    }

    public isSpecial(): boolean {
        return this.special;
    }

    public isVaal(): boolean {
        return this.vaal;
    }

    public isT17(): boolean {
        return this.t17;
    }

    public equals(modifier: Modifier): boolean {
        if (this === modifier) {
            return true;
        }
        if (!modifier) {
            return false;
        }
        return this.fallback === modifier.getFallback() &&
            this.mod === modifier.getModifier() &&
            this.active === modifier.isActive() &&
            this.special === modifier.isSpecial() &&
            this.index === modifier.getIndex() &&
            this.vaal === modifier.isVaal() &&
            this.t17 === modifier.isT17();
    }
}