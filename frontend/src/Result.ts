export class Result {
    private readonly ideal: string;
    private readonly expression: RegExp;

    constructor(ideal: string, expression: RegExp) {
        this.expression = expression;
        this.ideal = ideal;
    }

    public getIdealResult(): string {
        return this.ideal;
    }

    public getRegularExpression(): RegExp {
        return this.expression;
    }
}