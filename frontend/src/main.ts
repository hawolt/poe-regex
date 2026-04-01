import {Modifier} from "./Modifier";
import {ModifierType} from "./ModifierType";
import {FilterModifierAny} from "./FilterModifierAny";
import {FilterModifierAll} from "./FilterModifierAll";
import {Blacklist} from "./Blacklist";
import {associations, lineRelations} from "./Global";
import {MapAssociation} from "./MapAssociation";
import {generateRegularExpression} from "./MinNumRegex";

const call = performance.now();

const REGULAR_KEYS   = ["default", "low_tier_map", "mid_tier_map", "top_tier_map"] as const;
const TIER_KEY_ORDER = ["implicit", ...REGULAR_KEYS, "uber_tier_map"] as const;

let selection: Map<ModifierType, Modifier[]> = new Map();
let cache: Map<ModifierType, string> = new Map();
let blacklist = new Blacklist();
let modifiers: Modifier[] = [];
let exclusive: Modifier[] = [];
let inclusive: Modifier[] = [];

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const blacklistFiles = [
        "./data/map.name.config",
        "./data/map.affix.config",
        "./data/map.general.config",
        "./data/map.blacklist.config"
    ];

    readText(blacklistFiles)
        .then(responses => { blacklist = initBlacklist(responses); })
        .then(() => loadModifiers())
        .then(() => setup())
        .then(() => tracker())
        .catch(err => exceptional(err));
});

// ─── Loading ──────────────────────────────────────────────────────────────────

async function loadModifiers(): Promise<void> {
    // Load mod data and fallback config in parallel
    const [modJson, fallbackText] = await Promise.all([
        fetch("./data/map.mod.config.json").then(r => {
            if (!r.ok) throw new Error(`Failed to load map.mod.config.json: ${r.status}`);
            return r.json();
        }),
        fetch("./data/map.fallback.config").then(r => {
            if (!r.ok) throw new Error(`Failed to load map.fallback.config: ${r.status}`);
            return r.text();
        }),
    ]);

    // Parse fallback config: "modText=fallbackString" per line, # lines are comments.
    // For multiline mod texts, use literal \n in the key, e.g.:
    //   Monsters cannot be Stunned\n(#-#)% more Monster Life=Stunned
    const fallbacks = new Map<string, string>();
    for (const raw of fallbackText.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.substring(0, eq).trim();
        const fb  = line.substring(eq + 1).trim();
        if (key.length > 0 && fb.length > 0) {
            fallbacks.set(key, fb);
            console.log(`[fallback] "${key}" → "${fb}"`);
        }
    }
    console.log(`[fallback] loaded ${fallbacks.size} manual fallback(s)`);

    buildModifiers(modJson, fallbacks);
}

async function readText(urls: string[]): Promise<string[]> {
    return Promise.all(urls.map(url =>
        fetch(url).then(r => {
            if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
            return r.text();
        })
    ));
}

function initBlacklist(files: string[]): Blacklist {
    const bl = new Blacklist();
    for (let i = 0; i < files.length - 1; i++) bl.populate(files[i].split("\n"));
    bl.lock(files[files.length - 1].split("\n"));
    return bl;
}


// ─── Build ────────────────────────────────────────────────────────────────────

function buildModifiers(config: Record<string, any[]>, fallbacks: Map<string, string>): void {
    interface FlatEntry {
        text: string;
        groups: string[];
        t17: boolean;
        vaal: boolean;
        implicit: boolean;
    }

    const flatEntries: FlatEntry[] = [];
    const regularTexts  = new Set<string>();
    const implicitTexts = new Set<string>();

    for (const key of TIER_KEY_ORDER) {
        const section: any[] = config[key] ?? [];
        const isT17      = key === "uber_tier_map";
        const isImplicit = key === "implicit";

        for (const entry of section) {
            const text: string = (entry.text ?? "").trim().replace(/\n/g, '\\n');
            if (!text) continue;
            const isVaal = entry.generation_type === "corrupted";

            if (isT17) {
                if (regularTexts.has(text)) continue;
            } else if (isImplicit) {
                if (implicitTexts.has(text)) continue;
                implicitTexts.add(text);
            } else {
                if (regularTexts.has(text)) continue;
                regularTexts.add(text);
            }

            flatEntries.push({ text, groups: Array.isArray(entry.groups) ? entry.groups : [], t17: isT17, vaal: isVaal, implicit: isImplicit });
        }
    }

    // Build group → indices map
    const groupToIndices = new Map<string, number[]>();
    for (let i = 0; i < flatEntries.length; i++) {
        for (const group of flatEntries[i].groups) {
            if (!groupToIndices.has(group)) groupToIndices.set(group, []);
            groupToIndices.get(group)!.push(i);
        }
    }

    // Populate global associations (group-based)
    const assocMap = new Map<number, Set<number>>();
    for (const [, indices] of groupToIndices) {
        if (indices.length < 2) continue;
        for (const a of indices) {
            for (const b of indices) {
                if (a === b) continue;
                if (!assocMap.has(a)) assocMap.set(a, new Set());
                assocMap.get(a)!.add(b);
            }
        }
    }
    associations.length = 0;
    for (const [idx, related] of assocMap) associations.push([idx, Array.from(related)]);

    // Populate global lineRelations (line-intersection-based)
    // Any two mods that share at least one identical line of text are linked.
    // This catches supermods that bundle lines from multiple mods without sharing any group tag,
    // e.g. "(#-#)% more Monster Life" and "Monsters cannot be Stunned\n(#-#)% more Monster Life".
    lineRelations.clear();
    const addLineRelation = (a: number, b: number) => {
        if (!lineRelations.has(a)) lineRelations.set(a, new Set());
        if (!lineRelations.has(b)) lineRelations.set(b, new Set());
        lineRelations.get(a)!.add(b);
        lineRelations.get(b)!.add(a);
    };
    const lineToIndices = new Map<string, number[]>();
    for (let i = 0; i < flatEntries.length; i++) {
        for (const line of flatEntries[i].text.toLowerCase().split('\\n').map(l => l.trim())) {
            if (!line) continue;
            if (!lineToIndices.has(line)) lineToIndices.set(line, []);
            lineToIndices.get(line)!.push(i);
        }
    }
    for (const [, indices] of lineToIndices) {
        if (indices.length < 2) continue;
        for (const a of indices) {
            for (const b of indices) {
                if (a !== b) addLineRelation(a, b);
            }
        }
    }

    const regularEntries:  { idx: number }[] = [];
    const t17Entries:      { idx: number }[] = [];
    const vaalEntries:     { idx: number }[] = [];
    const implicitEntries: { idx: number }[] = [];

    for (let i = 0; i < flatEntries.length; i++) {
        const e  = flatEntries[i];
        // Look up fallback by the mod's exact text — stable across regenerations
        const fb = fallbacks.get(e.text) ?? null;
        const mod = new Modifier(e.text, i, e.groups, true, e.t17, e.vaal, e.implicit, fb);
        modifiers.push(mod);
        if (e.implicit)  implicitEntries.push({ idx: i });
        else if (e.vaal) vaalEntries.push({ idx: i });
        else if (e.t17)  t17Entries.push({ idx: i });
        else             regularEntries.push({ idx: i });
    }

    console.log(`[buildModifiers] total=${flatEntries.length} regular=${regularEntries.length} t17=${t17Entries.length} vaal=${vaalEntries.length} implicit=${implicitEntries.length} associations=${associations.length} lineRelations=${lineRelations.size}`);

    const targets = document.querySelectorAll(".mod-container");
    for (const { idx } of regularEntries) {
        for (let j = 0; j < targets.length; j++) {
            targets[j].appendChild(createSelectableContainer(idx, j === 0 ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE, modifiers[idx]));
        }
    }
    for (const { idx } of t17Entries) {
        for (let j = 0; j < targets.length; j++) {
            targets[j].insertBefore(createSelectableContainer(idx, j === 0 ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE, modifiers[idx]), targets[j].firstChild);
        }
    }
    for (const { idx } of vaalEntries) {
        for (let j = 0; j < targets.length; j++) {
            targets[j].insertBefore(createSelectableContainer(idx, j === 0 ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE, modifiers[idx]), targets[j].firstChild);
        }
    }
    for (const { idx } of implicitEntries) {
        for (let j = 0; j < targets.length; j++) {
            targets[j].insertBefore(createSelectableContainer(idx, j === 0 ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE, modifiers[idx]), targets[j].firstChild);
        }
    }

    rebuild();
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function createSelectableContainer(index: number, type: ModifierType, modifier: Modifier): HTMLDivElement {
    const div = document.createElement("div");
    div.classList.add("selectable");

    if (modifier.isImplicit()) { div.classList.add("implicit"); div.style.display = "none"; }
    else if (modifier.isVaal()) { div.classList.add("vaal"); div.style.display = "none"; }
    else if (modifier.isT17()) { div.classList.add("t17"); div.style.display = "none"; }

    div.dataset.mod      = index.toString();
    div.dataset.t17      = modifier.isT17().toString();
    div.dataset.vaal     = modifier.isVaal().toString();
    div.dataset.implicit = modifier.isImplicit().toString();
    div.textContent      = modifier.getModifier().replace(/\\n/g, "\n");

    div.addEventListener('click', (event) => {
        const element = event.target as HTMLElement;
        if (element.classList.contains('disabled-item')) return;

        element.classList.toggle('selected-item');
        const active = element.classList.contains('selected-item');
        const array  = type === ModifierType.EXCLUSIVE ? exclusive : inclusive;

        disableCounterpartContainer(index, active, type, modifier);
        handleModifierSelection(active, array, modifier);
        toggleGroupMembers(index, active);

        const optimizeChecked = (document.getElementById('optimize') as HTMLInputElement).checked;

        console.log(`[click] mod idx=${index} active=${active} optimize=${optimizeChecked} excl=${exclusive.length} incl=${inclusive.length}`);

        if (!optimizeChecked) {
            modal('loading-modal', true);
        }
        construct();
    });

    return div;
}

function handleModifierSelection(active: boolean, array: Modifier[], modifier: Modifier): void {
    if (active) {
        array.push(modifier);
    } else {
        const idx = array.indexOf(modifier);
        if (idx > -1) array.splice(idx, 1);
    }
}

function disableCounterpartContainer(index: number, active: boolean, type: ModifierType, modifier: Modifier): void {
    const target  = type === ModifierType.EXCLUSIVE ? 'inclusive' : 'exclusive';
    const element = document.querySelector(`#${target} .selectable[data-mod="${index}"]`);
    if (!element) return;
    if (active) {
        element.classList.add('disabled-item');
        handleModifierSelection(false, type === ModifierType.EXCLUSIVE ? inclusive : exclusive, modifier);
    } else {
        element.classList.remove('disabled-item');
    }
}

function toggleGroupMembers(index: number, active: boolean): void {
    const visited = new Set<number>([index]);
    const queue   = [index];

    // Line relations are only expanded for the originally clicked mod — not transitively.
    // e.g. selecting "more Monster Life" disables "Monsters cannot be Stunned\nmore Monster Life"
    // because it directly contains the selected line, but we do NOT then follow that mod's
    // line connections further, as those mods (e.g. the 3-line supermod) do not contain
    // "more Monster Life" and are unrelated to the selection.
    const lineRelatedOfOrigin = lineRelations.get(index) ?? new Set<number>();
    for (const r of lineRelatedOfOrigin) {
        if (!visited.has(r)) { visited.add(r); queue.push(r); }
    }

    // Group associations are still expanded transitively via the queue,
    // but line relations are only read for the origin — not for discovered mods.
    while (queue.length > 0) {
        const current = queue.shift()!;

        const groupRelated = associations.find(([idx]) => idx === current)?.[1] ?? [];
        for (const r of groupRelated) {
            if (!visited.has(r)) { visited.add(r); queue.push(r); }
        }

        // Intentionally do NOT follow lineRelations for discovered mods here.
    }

    for (const relatedIndex of visited) {
        if (relatedIndex === index) continue;
        for (const typeStr of ['exclusive', 'inclusive']) {
            const el = document.querySelector(`#${typeStr} .selectable[data-mod="${relatedIndex}"]`);
            if (el) el.classList.toggle('disabled-item', active);
        }
    }
}

// ─── Rebuild from localStorage ────────────────────────────────────────────────

function rebuild(): void {
    restoreCheckbox('t17',      val => toggle('t17',      val));
    restoreCheckbox('vaal',     val => toggle('vaal',     val));
    restoreCheckbox('implicit', val => toggle('implicit', val));

    const typeStored = localStorage.getItem('maps-include');
    const mapType: ModifierType = Number(typeStored ?? 0) as ModifierType;
    (document.getElementById('maps-include') as HTMLInputElement).checked = mapType === ModifierType.INCLUSIVE;
    (document.getElementById('maps-exclude') as HTMLInputElement).checked = mapType !== ModifierType.INCLUSIVE;

    for (const id of ['map-normal', 'map-rare', 'map-magic']) {
        const stored = localStorage.getItem(id);
        if (stored) (document.getElementById(id) as HTMLInputElement).checked = stored === "true";
    }

    const savedRegex = localStorage.getItem("regex");
    if (savedRegex) {
        document.getElementById('regex')!.innerText = savedRegex;
        restoreSelectionsFromRegex(savedRegex);
    }

    const corruptedStored = localStorage.getItem('corrupted');
    if (corruptedStored) {
        const el = document.getElementById(corruptedStored) as HTMLInputElement;
        if (el) { el.checked = true; handleCheckboxChange(el); }
    }

    for (const [main, secondary] of [
        ['quantity', 'optimize-quantity'], ['pack-size', 'optimize-pack'],
        ['scarabs', 'optimize-scarab'], ['maps', 'optimize-maps'],
        ['currency', 'optimize-currency'], ['rarity', 'optimize-rarity'],
    ]) {
        (document.getElementById(main) as HTMLInputElement).value = localStorage.getItem(main) ?? "";
        const sec = localStorage.getItem(secondary);
        (document.getElementById(secondary) as HTMLInputElement).checked = sec === null || sec === "true";
    }
}

function restoreCheckbox(id: string, onChange: (val: boolean) => void): void {
    const el = document.getElementById(id) as HTMLInputElement;
    const stored = localStorage.getItem(id);
    if (stored) el.checked = stored === "true";
    onChange(el.checked);
}

function restoreSelectionsFromRegex(savedRegex: string): void {
    const t17Stored      = localStorage.getItem("t17");
    const vaalStored     = localStorage.getItem("vaal");
    const implicitStored = localStorage.getItem("implicit");

    const args = savedRegex.match(/"([^"]*)"|(\S+)/g)?.map(s =>
        s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s
    ) ?? [];

    for (const arg of args) {
        const containerId = arg.indexOf('!') !== -1 ? 'exclusive' : 'inclusive';
        const container   = (document.getElementById(containerId) as HTMLElement)?.querySelector('.mod-container');
        if (!container) continue;

        const pattern  = arg.replace('!', '');
        const re       = new RegExp(pattern, 'i');
        const children = container.children;

        for (let i = 0; i < children.length; i++) {
            const child = children[i] as HTMLElement;
            if (child.dataset.t17      === 'true' && t17Stored      === 'false') continue;
            if (child.dataset.vaal     === 'true' && vaalStored     === 'false') continue;
            if (child.dataset.implicit === 'true' && implicitStored === 'false') continue;
            if (child.classList.contains('disabled-item')) continue;
            if (!child.textContent || !re.test(child.textContent)) continue;

            const modIndex = Number(child.dataset.mod);
            const modifier = modifiers.find(m => m.getIndex() === modIndex);
            if (!modifier) continue;

            child.classList.toggle('selected-item');
            const active = child.classList.contains('selected-item');
            const type   = containerId === 'exclusive' ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE;
            disableCounterpartContainer(modIndex, active, type, modifier);
            handleModifierSelection(active, (type === ModifierType.EXCLUSIVE ? exclusive : inclusive), modifier);
            toggleGroupMembers(modIndex, active);
        }
    }
}

// ─── Regex Generation ─────────────────────────────────────────────────────────

function rollbackLastMod(type: ModifierType): void {
    const array = type === ModifierType.EXCLUSIVE ? exclusive : inclusive;
    if (array.length === 0) return;
    const mod = array[array.length - 1];
    console.warn(`[rollback] removing last ${ModifierType[type]} mod idx=${mod.getIndex()} "${mod.getModifier().substring(0, 60)}"`);

    handleModifierSelection(false, array, mod);
    toggleGroupMembers(mod.getIndex(), false);
    disableCounterpartContainer(mod.getIndex(), false, type, mod);

    const typeStr = type === ModifierType.EXCLUSIVE ? 'exclusive' : 'inclusive';
    const el = document.querySelector(`#${typeStr} .selectable[data-mod="${mod.getIndex()}"]`);
    if (el) el.classList.remove('selected-item');

    selection.delete(type);
    cache.delete(type);
}

function generate(): void {
    console.log(`[generate] START — excl=${exclusive.length} incl=${inclusive.length}`);
    exclusive.forEach((m, i) => console.log(`  excl[${i}] idx=${m.getIndex()} "${m.getModifier().substring(0, 60)}"`));
    inclusive.forEach((m, i) => console.log(`  incl[${i}] idx=${m.getIndex()} "${m.getModifier().substring(0, 60)}"`));

    document.getElementById('regex')!.innerText = "crunching numbers...";
    document.getElementById('hint')!.innerText  = "";

    setTimeout(() => {
        const any = (document.getElementById('any') as HTMLInputElement).checked;
        localStorage.setItem("any", String(any));

        console.log(`[generate] inside setTimeout, any=${any}`);

        let exclusiveExpr = "";
        let inclusiveExpr = "";
        let failed        = false;

        try {
            console.log(`[generate] building EXCLUSIVE...`);
            exclusiveExpr = buildModifierExpression(true, ModifierType.EXCLUSIVE);
            console.log(`[generate] EXCLUSIVE done: "${exclusiveExpr}"`);
        } catch (e) {
            console.error(`[generate] EXCLUSIVE threw:`, e);
            rollbackLastMod(ModifierType.EXCLUSIVE);
            failed = true;
        }

        if (!failed) {
            try {
                console.log(`[generate] building INCLUSIVE (any=${any})...`);
                inclusiveExpr = buildModifierExpression(any, ModifierType.INCLUSIVE);
                console.log(`[generate] INCLUSIVE done: "${inclusiveExpr}"`);
            } catch (e) {
                console.error(`[generate] INCLUSIVE threw:`, e);
                rollbackLastMod(ModifierType.INCLUSIVE);
                failed = true;
            }
        }

        if (failed) {
            document.getElementById('regex')!.innerText = "";
            document.getElementById('hint')!.innerText  = "⚠ Could not find a unique pattern for that selection — mod was deselected.";
            modal('loading-modal', false);
            return;
        }

        const utilityExpr = buildUtilityExpression();
        const mapExpr     = buildMapExpression();

        let base  = exclusiveExpr + ' ' + inclusiveExpr;
        base     += inclusiveExpr.trim().endsWith('"') ? '' : ' ';
        const regex = (base + utilityExpr + mapExpr).trim();

        console.log(`[generate] final regex: "${regex}"`);

        document.getElementById('regex')!.innerText = regex;
        localStorage.setItem("regex", regex);

        const hint = document.getElementById('hint')!;
        hint.innerText   = regex.length > 0 ? `length: ${regex.length} / 250` : '';
        hint.style.color = regex.length > 250 ? '#ff4d4d' : '#e0e0e0';

        modal('loading-modal', false);
    }, 100);
}

function construct(): void {
    if ((document.getElementById('optimize') as HTMLInputElement).checked) return;
    generate();
}

function compare(a: any[], b: any[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
}

function buildSuitableExcludeList(type: ModifierType): Blacklist {
    const clone = new Blacklist();
    clone.populate((type === ModifierType.EXCLUSIVE ? inclusive : exclusive).map(o => o.getModifier()));
    return clone;
}

function buildModifierExpression(any: boolean, type: ModifierType): string {
    const t17El      = document.getElementById('t17')      as HTMLInputElement;
    const vaalEl     = document.getElementById('vaal')     as HTMLInputElement;
    const implicitEl = document.getElementById('implicit') as HTMLInputElement;

    localStorage.setItem("t17",      t17El.checked.toString());
    localStorage.setItem("vaal",     vaalEl.checked.toString());
    localStorage.setItem("implicit", implicitEl.checked.toString());

    const excludes = buildSuitableExcludeList(type);
    const filter   = any
        ? new FilterModifierAny(t17El.checked, vaalEl.checked, implicitEl.checked, modifiers, excludes, blacklist)
        : new FilterModifierAll(t17El.checked, vaalEl.checked, implicitEl.checked, modifiers, excludes, blacklist);

    const target   = type === ModifierType.EXCLUSIVE ? exclusive : inclusive;
    const previous = selection.get(type) ?? [];

    console.log(`[buildModifierExpression] type=${ModifierType[type]} any=${any} t17=${t17El.checked} vaal=${vaalEl.checked} impl=${implicitEl.checked} target=${target.length} sameAsPrev=${compare(previous, target)}`);

    let regex = "";
    if (!compare(previous, target)) {
        const result      = new Set<string>();
        const association = new MapAssociation();
        console.log(`[buildModifierExpression] calling filter.create, modifiers pool size=${modifiers.length}`);
        filter.create(association, result, target, 0);
        console.log(`[buildModifierExpression] filter.create done, result=${JSON.stringify(Array.from(result))}`);
        selection.set(type, [...target]);

        if (any) {
            const joined = Array.from(result).join("|").replace(/#/g, "\\d+");
            regex = joined.length > 0 ? `"${type === ModifierType.EXCLUSIVE ? '!' : ''}${joined}"` : "";
        } else {
            let builder = "";
            for (const mod of result) {
                const value = mod.replace(/#/g, "\\d+");
                builder += mod.includes(" ") ? `"${value}" ` : `${value} `;
            }
            regex = builder;
        }
        cache.set(type, regex);
    } else {
        console.log(`[buildModifierExpression] cache hit`);
        regex = cache.get(type) ?? "";
    }

    console.log(`[buildModifierExpression] → "${regex}"`);
    return regex;
}

function buildSpecificUtilityExpression(main: string, secondary: string, unique: string): string | null {
    const quantity = (document.getElementById(main) as HTMLInputElement).value;
    const optimize = (document.getElementById(secondary) as HTMLInputElement).checked;
    localStorage.setItem(main, quantity);
    localStorage.setItem(secondary, String(optimize));
    const expression = generateRegularExpression(quantity, optimize);
    if (expression === null) return null;
    if (expression === '')   return `"${unique}"`;
    return `"${unique}.*${expression}%"`;
}

function buildUtilityExpression(): string {
    return [
        buildSpecificUtilityExpression('quantity',  'optimize-quantity', 'm q'),
        buildSpecificUtilityExpression('pack-size', 'optimize-pack',     'iz'),
        buildSpecificUtilityExpression('scarabs',   'optimize-scarab',   'abs'),
        buildSpecificUtilityExpression('maps',      'optimize-maps',     'ps:'),
        buildSpecificUtilityExpression('currency',  'optimize-currency', 'urr'),
        buildSpecificUtilityExpression('rarity',    'optimize-rarity',   'm r.*y'),
    ].filter(Boolean).join('');
}

function cleanup(array: Modifier[]): Modifier[] {
    return array.filter(mod => !mod.getModifier().toLowerCase().includes("corrupted"));
}

function buildMapExpression(): string {
    const type = (document.getElementById('maps-include') as HTMLInputElement).checked
        ? ModifierType.INCLUSIVE : ModifierType.EXCLUSIVE;
    localStorage.setItem('maps-include', type.toString());

    const maps: string[] = [];
    for (const [id, char] of [['map-normal', 'n'], ['map-rare', 'r'], ['map-magic', 'm']] as const) {
        const checked = (document.getElementById(id) as HTMLInputElement).checked;
        localStorage.setItem(id, String(checked));
        if (checked) maps.push(char);
    }

    const useInclusive = type === ModifierType.INCLUSIVE && maps.length !== 3 && maps.length !== 0;
    const useExclusive = type === ModifierType.EXCLUSIVE && maps.length !== 0;
    if (useInclusive || useExclusive) {
        const expr = maps.length === 1 ? maps[0] : `(${maps.join('|')})`;
        return ` "${type === ModifierType.EXCLUSIVE ? '!' : ''}y: ${expr}"`;
    }
    return '';
}

// ─── UI Utilities ─────────────────────────────────────────────────────────────

function modal(id: string, status: boolean): void {
    document.getElementById('overlay')!.classList.toggle('hidden', !status);
    document.getElementById(id)!.classList.toggle('hidden', !status);
    document.body.classList.toggle('no-scroll', status);
}

function tracker(): void {
    console.log(`build-time ${(performance.now() - call).toFixed(1)}ms`);
    //debugSanityCheck();
}

function exceptional(error: any): void {
    console.error(error);
}

function toggle(attribute: string, selected: boolean): void {
    document.querySelectorAll(`[data-${attribute}="true"]`).forEach(e => {
        const el = e as HTMLElement;
        el.style.display = selected ? 'block' : 'none';
        if (!selected) el.classList.remove("selected-item");
    });
    document.querySelectorAll('.container-search').forEach(el => filter(el as HTMLElement));
}

function filter(element: HTMLElement): void {
    const query     = (element as HTMLInputElement).value;
    const container = element.closest('.container-search')?.nextElementSibling as HTMLElement;
    if (!container?.classList.contains('mod-container')) return;

    const t17El      = document.getElementById('t17')      as HTMLInputElement;
    const vaalEl     = document.getElementById('vaal')     as HTMLInputElement;
    const implicitEl = document.getElementById('implicit') as HTMLInputElement;

    // Try to compile the query as a regex. If invalid, fall back to plain substring match.
    // Matching is case-insensitive and uses the full mod text with real newlines so that
    // anchors like $ and ^ apply to the whole string, not per-line.
    let re: RegExp | null = null;
    if (query.length > 0) {
        try {
            re = new RegExp(query, 'i');
        } catch {
            // Invalid regex — fall back to literal substring match
            re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }
    }

    for (const child of Array.from(container.children) as HTMLElement[]) {
        // Use the full mod text with real newlines for matching so $ and ^ work correctly.
        // child.textContent already has real newlines (set via replace(/\\n/g, "\n") on creation).
        const text = child.textContent?.toLowerCase() ?? '';

        const matchesQ = re === null || re.test(text);

        if (!matchesQ) { child.style.display = 'none'; continue; }

        const isImplicit = child.dataset.implicit === 'true';
        const isVaal     = child.dataset.vaal     === 'true';
        const isT17      = child.dataset.t17      === 'true';
        const isNormal   = !isImplicit && !isVaal && !isT17;

        child.style.display = (
            (isImplicit && implicitEl.checked) ||
            (isVaal     && vaalEl.checked)     ||
            (isT17      && t17El.checked)      ||
            isNormal
        ) ? '' : 'none';
    }
}

function wipe(): void {
    document.getElementById('regex')!.innerText = '';
    document.getElementById('hint')!.innerText  = '';
    exclusive.length = 0;
    inclusive.length = 0;
    selection.clear();
    cache.clear();
    document.querySelectorAll('.selected-item, .disabled-item').forEach(el => {
        el.classList.remove('selected-item', 'disabled-item');
    });
}

function handleCheckboxChange(checkbox: HTMLInputElement): void {
    const group = Array.from(checkbox.classList).find(c => c.startsWith("btn-group-"));
    if (!group) return;
    if (checkbox.checked) {
        document.querySelectorAll<HTMLInputElement>(`input.${group}`).forEach(box => {
            if (box !== checkbox) box.checked = false;
        });
    } else {
        const siblings = Array.from(document.querySelectorAll<HTMLInputElement>(`input.${group}`));
        if (!siblings.some(b => b.checked)) checkbox.checked = true;
    }
}

function parse(input: string): string[] {
    const re = /"([^"]*)"|[^\s]+/g;
    const results: string[] = [];
    let match;
    while ((match = re.exec(input)) !== null) results.push(match[1] ?? match[0]);
    return results;
}

function toggleImplicitActive(id: string): void {
    const el = document.getElementById(id) as HTMLInputElement;
    el.checked = true;
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

function handleModImport(type: ModifierType, substring: string): void {
    const target = type === ModifierType.EXCLUSIVE ? 'exclusive' : 'inclusive';
    document.querySelectorAll(`#${target} .selectable`).forEach(element => {
        if (element.textContent?.toLowerCase().includes(substring)) {
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }
    });
}

function handleBulkModImport(type: ModifierType, substrings: string[]): void {
    for (const sub of substrings) handleModImport(type, sub);
}

function importExpression(): void {
    wipe();
    toggleImplicitActive('t17');
    toggleImplicitActive('vaal');
    toggleImplicitActive('implicit');

    const input   = document.getElementById('import-string') as HTMLInputElement;
    const entries = parse(input.value);
    input.value   = '';

    for (const entry of entries) {
        if (entry.startsWith("!")) {
            handleBulkModImport(ModifierType.EXCLUSIVE, entry.substring(1).split("|"));
        } else if (entry.includes("|")) {
            handleBulkModImport(ModifierType.INCLUSIVE, entry.split("|"));
        } else {
            handleModImport(ModifierType.INCLUSIVE, entry.startsWith('"') ? entry.slice(1, -1) : entry);
        }
    }
    construct();
}

// ─── Event Setup ──────────────────────────────────────────────────────────────

function setup(): void {
    document.querySelectorAll('.container-search').forEach(el => {
        el.addEventListener('input', e => filter(e.target as HTMLElement));
    });

    for (const attr of ['t17', 'vaal', 'implicit'] as const) {
        document.getElementById(attr)!.addEventListener('change', e => {
            toggle(attr, (e.target as HTMLInputElement).checked);
            selection.clear();
            construct();
        });
    }

    document.getElementById('clear')!.addEventListener('click', wipe);
    document.getElementById('reset')!.addEventListener('click', () => { localStorage.clear(); window.location.reload(); });
    document.getElementById('copy')!.addEventListener('click', () => {
        navigator.clipboard.writeText(document.getElementById('regex')!.innerText);
    });
    document.getElementById('import')!.addEventListener('click', () => modal('import-modal', true));
    document.getElementById('generate')!.addEventListener('click', () => {
        modal('loading-modal', true);
        generate();
    });
    document.getElementById('import-load')!.addEventListener('click', importExpression);
    document.getElementById('report')!.addEventListener('click', () => {
        window.open('https://github.com/hawolt/poe-regex/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=', '_blank');
    });
    document.getElementById('suggest')!.addEventListener('click', () => {
        window.open('https://github.com/hawolt/poe-regex/issues/new?assignees=&labels=enhancement&projects=&template=feature_request.md&title=', '_blank');
    });

    document.querySelectorAll('.close-modal').forEach(el => {
        el.addEventListener('click', e => {
            const content = (e.target as HTMLElement).closest('.modal-content');
            if (content?.parentElement?.id) modal(content.parentElement.id, false);
        });
    });

    document.querySelectorAll('.trigger-0').forEach(el => { el.addEventListener('change', () => construct()); });
    document.querySelectorAll('.trigger-1').forEach(el => { el.addEventListener('input',  () => construct()); });
    document.querySelectorAll('.trigger-2').forEach(el => { el.addEventListener('input',  () => selection.delete(ModifierType.INCLUSIVE)); });

    document.querySelectorAll('.trigger-3').forEach(el => {
        el.addEventListener('input', e => {
            exclusive = cleanup(exclusive);
            inclusive = cleanup(inclusive);
            const target = e.target as HTMLElement;
            localStorage.setItem("corrupted", target.id);
            let type: ModifierType | null = null;
            if (target.id === 'corrupted-include') type = ModifierType.INCLUSIVE;
            else if (target.id === 'corrupted-exclude') type = ModifierType.EXCLUSIVE;
            if (type !== null) {
                const mod = new Modifier("Corrupted", -1, [], true, false, false, false);
                (type === ModifierType.EXCLUSIVE ? exclusive : inclusive).push(mod);
            }
            construct();
        });
    });

    document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => handleCheckboxChange(cb));
    });
}

// ─── Debug: Standalone Regex Sanity Check ────────────────────────────────────
// Runs on startup after all modifiers are loaded.
// Tests every mod individually in both filter modes with all flags enabled,
// and logs any mod that fails to produce a regex to the console.

function debugSanityCheck(): void {
    console.group('[sanity] standalone regex check — testing all mods individually (t17+vaal+implicit enabled)');

    const emptyBlacklist = new Blacklist();
    const results: { idx: number; t17: string; vaal: string; implicit: string; mode: string; text: string; status: string }[] = [];

    for (const mod of modifiers) {
        for (const useAny of [false, true]) {
            const f = useAny
                ? new FilterModifierAny(true, true, true, modifiers, emptyBlacklist, blacklist)
                : new FilterModifierAll(true, true, true, modifiers, emptyBlacklist, blacklist);

            const result = new Set<string>();
            const assoc  = new MapAssociation();

            try {
                f.create(assoc, result, [mod], 0);
            } catch (e) {
                results.push({
                    idx:      mod.getIndex(),
                    t17:      mod.isT17()      ? '✓' : '',
                    vaal:     mod.isVaal()     ? '✓' : '',
                    implicit: mod.isImplicit() ? '✓' : '',
                    mode:     useAny ? 'any' : 'all',
                    text:     mod.getModifier().replace(/\\n/g, ' | '),
                    status:   `THREW: ${e}`,
                });
                continue;
            }

            if (result.size === 0) {
                results.push({
                    idx:      mod.getIndex(),
                    t17:      mod.isT17()      ? '✓' : '',
                    vaal:     mod.isVaal()     ? '✓' : '',
                    implicit: mod.isImplicit() ? '✓' : '',
                    mode:     useAny ? 'any' : 'all',
                    text:     mod.getModifier().replace(/\\n/g, ' | '),
                    status:   'FAIL — no regex produced',
                });
            }
        }
    }

    if (results.length === 0) {
        console.log('[sanity] ✅ All mods produced a regex in both filter modes.');
    } else {
        console.warn(`[sanity] ⚠ ${results.length} failure(s) found:`);
        console.table(results);
    }

    console.groupEnd();
}