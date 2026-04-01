export function generateRegularExpression(number: string, optimize: boolean): string | null {
    let input = parseFloat(number);
    // input not a number
    if (isNaN(input)) {
        return null;
    }
    // if input is 0 before optimization ignore
    if (input === 0) return null;
    if (optimize) {
        if (input >= 100) {
            input = input - (input % 10);
        } else {
            input = Math.floor(input / 10) * 10;
        }
    }
    // zero does not have to be optimized
    if (input === 0) {
        return "";
    }

    // anything past this point requires a regex

    let hundreds = Math.floor(input / 100) % 10;
    let tens = Math.floor((input % 100) / 10);
    let digit = input % 10;

    let expression = generate(number, input, hundreds, tens, digit);

    console.log(expression);

    return input >= 100 && tens != 0 ? '(' + expression + `|[${hundreds + 1}-9]..)` : expression;
}

function generate(number: string, input: number, hundreds: number, tens: number, digit: number): string | null {
    if (input === 100) {
        return "\\d.."
    } else if (input > 100) {
        if (digit === 0 && tens === 0) {
            return `[${hundreds}-9]..`
        } else if (digit == 0) {
            if (tens === 9) {
                return `${hundreds}9.`;
            } else if (tens === 8) {
                return `${hundreds}[89].`;
            }
            return `${hundreds}[${tens}-9].`;
        } else if (tens === 0) {
            if (digit === 9) {
                return `(${hundreds}09|${hundreds}[1-9].)`
            } else if (digit === 8) {
                return `(${hundreds}0[89]|${hundreds}[1-9].)`
            }
            return `(${hundreds}0[${digit}-9]|${hundreds}[1-9].)`
        } else {
            if (tens === 9) {
                return digit != 8 ? `${hundreds}9[${tens}-9]` : `${hundreds}9[89]`;
            }
            // these won't match above 200, if we want a true match we would have to replace the start with \d
            return `${hundreds}([${tens}-9][${digit}-9]|[${tens + 1}-9].)`;
        }
    } else if (input >= 10) {
        if (digit === 0) {
            let base: string;
            if (tens === 9) base = "9.";
            else if (tens === 8) base = "[89].";
            else base = `[${tens}-9].`;
            return `(${base}|\\d..)`;
        } else if (tens === 9) {
            return `(${tens}[${digit}-9]|\\d..)`;
        } else {
            let optimized: string[] = [];
            if (digit === 9) optimized.push("9");
            else if (digit === 8) optimized.push("[89]");
            else optimized.push(`[${digit}-9]`)

            if (tens === 8) optimized.push("9.");
            if (tens === 7) optimized.push("[89].");
            else optimized.push(`[${tens + 1}-9].`)
            return `(${tens}${optimized[0]}|${optimized[1]}|\\d..)`;
        }
    } else if (input < 10) {
        if (input === 9) return "(9|\\d..?)"
        else if (input === 8) return "([89]|\\d..?)"
        else if (input > 1) return `([${input}-9]|\\d..?)`
        else return ""; // no need to specify a number for 1 since the .* will match anything anyway
    }
    return number;
}