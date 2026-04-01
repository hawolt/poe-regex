export class Modifier {
    private readonly mod: string;
    private readonly index: number;
    private readonly groups: string[];
    private readonly active: boolean;
    private readonly t17: boolean;
    private readonly vaal: boolean;
    private readonly implicit: boolean;
    private readonly special: boolean;
    private readonly fallback: string | null;

    constructor(
        mod: string,
        index: number,
        groups: string[],
        active: boolean,
        t17: boolean,
        vaal: boolean,
        implicit: boolean = false,
        fallback: string | null = null
    ) {
        this.mod = mod;
        this.index = index;
        this.groups = groups;
        this.active = active;
        this.t17 = t17;
        this.vaal = vaal;
        this.implicit = implicit;
        this.fallback = fallback;
        this.special = fallback !== null;
    }

    public getGroups(): string[] {
        return this.groups;
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

    public isImplicit(): boolean {
        return this.implicit;
    }

    public clone(): Modifier {
        return new Modifier(this.mod, this.index, this.groups, this.active, this.t17, this.vaal, this.implicit, this.fallback);
    }

    public equals(modifier: Modifier): boolean {
        if (this === modifier) return true;
        if (!modifier) return false;
        return this.mod === modifier.getModifier()
            && this.index === modifier.getIndex()
            && this.active === modifier.isActive()
            && this.t17 === modifier.isT17()
            && this.vaal === modifier.isVaal()
            && this.implicit === modifier.isImplicit()
            && this.fallback === modifier.getFallback();
    }
}