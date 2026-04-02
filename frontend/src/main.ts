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
let cache:     Map<ModifierType, string>     = new Map();
let blacklist  = new Blacklist();
let modifiers: Modifier[] = [];
let exclusive: Modifier[] = [];
let inclusive: Modifier[] = [];

// Built once in buildModifiers for O(1) group-member lookup in recomputeDisabled.
let assocMap: Map<number, number[]> = new Map();

let userHideSet:   Set<string>           = new Set();
let userWeightMap: Map<string, number>   = new Map();
let activeProfile: string                = "default";

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const blacklistFiles = [
        "./data/map.name.config",
        "./data/map.affix.config",
        "./data/map.general.config",
        "./data/map.blacklist.config"
    ];

    const userAffixP  = fetch("./data/map.affix.blacklist.config").then(r => r.ok ? r.text() : "").catch(() => "");
    const userWeightP = fetch("./data/map.weight.config").then(r => r.ok ? r.text() : "").catch(() => "");

    Promise.all([readText(blacklistFiles), userAffixP, userWeightP])
        .then(([responses, userAffix, userWeight]) => {
            blacklist = initBlacklist(responses);

            userHideSet = new Set(
                userAffix.split("\n").map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#'))
            );
            if (userHideSet.size > 0) console.log(`[user-affix] hiding ${userHideSet.size} pattern(s)`);

            userWeightMap = new Map();
            for (const raw of userWeight.split("\n")) {
                const line = raw.trim();
                if (!line || line.startsWith('#')) continue;
                const eq = line.lastIndexOf('=');
                if (eq === -1) continue;
                const key = line.substring(0, eq).trim().toLowerCase();
                const val = parseInt(line.substring(eq + 1).trim(), 10);
                if (key && !isNaN(val)) userWeightMap.set(key, val);
            }
            if (userWeightMap.size > 0) console.log(`[user-weight] loaded ${userWeightMap.size} rule(s)`);
        })
        .then(() => loadModifiers())
        .then(() => setup())
        .then(() => tracker())
        .catch(err => exceptional(err));
});

// ─── Loading ──────────────────────────────────────────────────────────────────

async function loadModifiers(): Promise<void> {
    const [modJson, fallbackText] = await Promise.all([
        fetch("./data/map.mod.config.json").then(r => { if (!r.ok) throw new Error(`Failed: ${r.status}`); return r.json(); }),
        fetch("./data/map.fallback.config").then(r => { if (!r.ok) throw new Error(`Failed: ${r.status}`); return r.text(); }),
    ]);

    const fallbacks = new Map<string, string>();
    for (const raw of fallbackText.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith('##')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.substring(0, eq).trim();
        const fb  = line.substring(eq + 1).trim();
        if (key && fb) { fallbacks.set(key, fb); console.log(`[fallback] "${key}" → "${fb}"`); }
    }
    console.log(`[fallback] loaded ${fallbacks.size} fallback(s)`);
    buildModifiers(modJson, fallbacks);
}

async function readText(urls: string[]): Promise<string[]> {
    return Promise.all(urls.map(url =>
        fetch(url).then(r => { if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`); return r.text(); })
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
    interface FlatEntry { text: string; groups: string[]; t17: boolean; vaal: boolean; implicit: boolean; }

    const flatEntries:   FlatEntry[] = [];
    const regularTexts   = new Set<string>();
    const implicitTexts  = new Set<string>();

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

    const visibleEntries = userHideSet.size === 0 ? flatEntries : flatEntries.filter(e => {
        const lower = e.text.toLowerCase();
        for (const p of userHideSet) if (lower.includes(p)) { console.log(`[user-affix] hiding: "${e.text.substring(0, 80)}"`); return false; }
        return true;
    });

    // Build group associations → O(1) Map for recomputeDisabled
    const groupToIndices = new Map<string, number[]>();
    for (let i = 0; i < visibleEntries.length; i++) {
        for (const g of visibleEntries[i].groups) {
            if (!groupToIndices.has(g)) groupToIndices.set(g, []);
            groupToIndices.get(g)!.push(i);
        }
    }
    assocMap = new Map();
    const assocSet = new Map<number, Set<number>>();
    for (const [, indices] of groupToIndices) {
        if (indices.length < 2) continue;
        for (const a of indices) {
            for (const b of indices) {
                if (a === b) continue;
                if (!assocSet.has(a)) assocSet.set(a, new Set());
                assocSet.get(a)!.add(b);
            }
        }
    }
    // Populate both the local Map (for recomputeDisabled) and the Global array (for MapAssociation)
    associations.length = 0;
    for (const [k, v] of assocSet) {
        const arr = Array.from(v);
        assocMap.set(k, arr);
        associations.push([k, arr]);
    }

    // Build line relations
    lineRelations.clear();
    const addLineRelation = (a: number, b: number) => {
        if (!lineRelations.has(a)) lineRelations.set(a, new Set());
        if (!lineRelations.has(b)) lineRelations.set(b, new Set());
        lineRelations.get(a)!.add(b);
        lineRelations.get(b)!.add(a);
    };
    const lineToIndices = new Map<string, number[]>();
    for (let i = 0; i < visibleEntries.length; i++) {
        for (const line of visibleEntries[i].text.toLowerCase().split('\\n').map(l => l.trim())) {
            if (!line) continue;
            if (!lineToIndices.has(line)) lineToIndices.set(line, []);
            lineToIndices.get(line)!.push(i);
        }
    }
    for (const [, indices] of lineToIndices) {
        if (indices.length < 2) continue;
        for (const a of indices) for (const b of indices) if (a !== b) addLineRelation(a, b);
    }

    const regularEntries:  { idx: number }[] = [];
    const t17Entries:      { idx: number }[] = [];
    const vaalEntries:     { idx: number }[] = [];
    const implicitEntries: { idx: number }[] = [];

    for (let i = 0; i < visibleEntries.length; i++) {
        const e  = visibleEntries[i];
        const fb = fallbacks.get(e.text) ?? null;
        const mod = new Modifier(e.text, i, e.groups, true, e.t17, e.vaal, e.implicit, fb);
        modifiers.push(mod);
        if (e.implicit)       implicitEntries.push({ idx: i });
        else if (e.vaal)      vaalEntries.push({ idx: i });
        else if (e.t17)       t17Entries.push({ idx: i });
        else                  regularEntries.push({ idx: i });
    }

    console.log(`[buildModifiers] total=${visibleEntries.length} (${flatEntries.length - visibleEntries.length} hidden) regular=${regularEntries.length} t17=${t17Entries.length} vaal=${vaalEntries.length} implicit=${implicitEntries.length}`);

    const getWeight = (idx: number): number => {
        if (!userWeightMap.size) return 0;
        const text = modifiers[idx].getModifier().toLowerCase();
        let best = 0;
        for (const [p, w] of userWeightMap) if (text.includes(p) && w > best) best = w;
        return best;
    };
    const byWeightDesc = (a: { idx: number }, b: { idx: number }) => getWeight(b.idx) - getWeight(a.idx);
    regularEntries.sort(byWeightDesc);
    t17Entries.sort(byWeightDesc);
    vaalEntries.sort(byWeightDesc);
    implicitEntries.sort(byWeightDesc);

    const targets = document.querySelectorAll(".mod-container");
    for (const { idx } of regularEntries) {
        for (let j = 0; j < targets.length; j++)
            targets[j].appendChild(createSelectableContainer(idx, j === 0 ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE, modifiers[idx]));
    }
    for (const { idx } of t17Entries) {
        for (let j = 0; j < targets.length; j++)
            targets[j].insertBefore(createSelectableContainer(idx, j === 0 ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE, modifiers[idx]), targets[j].firstChild);
    }
    for (const { idx } of vaalEntries) {
        for (let j = 0; j < targets.length; j++)
            targets[j].insertBefore(createSelectableContainer(idx, j === 0 ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE, modifiers[idx]), targets[j].firstChild);
    }
    for (const { idx } of implicitEntries) {
        for (let j = 0; j < targets.length; j++)
            targets[j].insertBefore(createSelectableContainer(idx, j === 0 ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE, modifiers[idx]), targets[j].firstChild);
    }

    rebuild();
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

function createSelectableContainer(index: number, type: ModifierType, modifier: Modifier): HTMLDivElement {
    const div = document.createElement("div");
    div.classList.add("selectable");
    if (modifier.isImplicit()) { div.classList.add("implicit"); div.style.display = "none"; }
    else if (modifier.isVaal()) { div.classList.add("vaal"); div.style.display = "none"; }
    else if (modifier.isT17())  { div.classList.add("t17");  div.style.display = "none"; }
    div.dataset.mod      = index.toString();
    div.dataset.t17      = modifier.isT17().toString();
    div.dataset.vaal     = modifier.isVaal().toString();
    div.dataset.implicit = modifier.isImplicit().toString();
    div.textContent      = modifier.getModifier().replace(/\\n/g, "\n");

    div.addEventListener('click', (event) => {
        const el = event.target as HTMLElement;
        if (el.classList.contains('disabled-item')) return;
        el.classList.toggle('selected-item');
        const active = el.classList.contains('selected-item');
        const array  = type === ModifierType.EXCLUSIVE ? exclusive : inclusive;
        disableCounterpart(index, active, type, modifier);
        handleModifierSelection(active, array, modifier);
        recomputeDisabled();
        const optimizeChecked = (document.getElementById('optimize') as HTMLInputElement).checked;
        console.log(`[click] idx=${index} active=${active} excl=${exclusive.length} incl=${inclusive.length}`);
        if (!optimizeChecked) modal('loading-modal', true);
        construct();
    });
    return div;
}

function handleModifierSelection(active: boolean, array: Modifier[], modifier: Modifier): void {
    if (active) { array.push(modifier); }
    else { const i = array.indexOf(modifier); if (i > -1) array.splice(i, 1); }
}

function disableCounterpart(index: number, active: boolean, type: ModifierType, modifier: Modifier): void {
    const col = type === ModifierType.EXCLUSIVE ? 'inclusive' : 'exclusive';
    const el  = document.querySelector(`#${col} .selectable[data-mod="${index}"]`);
    if (!el) return;
    if (active) {
        el.classList.add('disabled-item');
        handleModifierSelection(false, type === ModifierType.EXCLUSIVE ? inclusive : exclusive, modifier);
    } else {
        el.classList.remove('disabled-item');
    }
}

// Recomputes all disabled-item states from scratch based on the full current
// selection. A mod is disabled if every one of its lines is already covered by
// the union of all currently selected mods — meaning it has no unique line left
// that could distinguish it from the current selection in a regex.
// Also disables the same mod in the opposite column (counterpart).
function recomputeDisabled(): void {
    const t17On      = (document.getElementById('t17')      as HTMLInputElement).checked;
    const vaalOn     = (document.getElementById('vaal')     as HTMLInputElement).checked;
    const implicitOn = (document.getElementById('implicit') as HTMLInputElement).checked;

    const isVisible = (mod: Modifier) =>
        !(mod.isT17() && !t17On) && !(mod.isVaal() && !vaalOn) && !(mod.isImplicit() && !implicitOn);

    // Clear all current disabled states (except selected-item — those are correct)
    document.querySelectorAll('.disabled-item').forEach(el => el.classList.remove('disabled-item'));

    // Re-disable counterparts (same mod in opposite column)
    const selectedIndices = new Set([...exclusive, ...inclusive].map(m => m.getIndex()));
    for (const [type, array] of [[ModifierType.EXCLUSIVE, exclusive], [ModifierType.INCLUSIVE, inclusive]] as [ModifierType, Modifier[]][]) {
        const col = type === ModifierType.EXCLUSIVE ? 'inclusive' : 'exclusive';
        for (const mod of array) {
            document.querySelector(`#${col} .selectable[data-mod="${mod.getIndex()}"]`)?.classList.add('disabled-item');
        }
    }

    if (!exclusive.length && !inclusive.length) return;

    // Build the set of lines covered by ALL currently selected mods combined
    const coveredLines = new Set<string>();
    for (const mod of [...exclusive, ...inclusive]) {
        for (const l of mod.getModifier().toLowerCase().split('\\n').map(l => l.trim())) {
            coveredLines.add(l);
        }
    }

    // Collect all mods reachable via line-relations from any selected mod
    const visited = new Set<number>(selectedIndices);
    const queue   = [...selectedIndices];
    while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const r of (lineRelations.get(cur) ?? [])) {
            if (visited.has(r)) continue;
            visited.add(r);
            const rel = modifiers[r];
            if (rel && isVisible(rel)) queue.push(r);
        }
    }

    // Disable any reachable mod whose every line is covered by the selection
    for (const r of visited) {
        if (selectedIndices.has(r)) continue;
        const rel = modifiers[r];
        if (!rel || !isVisible(rel)) continue;
        const relLines = rel.getModifier().toLowerCase().split('\\n').map(l => l.trim());
        if (relLines.every(l => coveredLines.has(l))) {
            for (const col of ['exclusive', 'inclusive']) {
                document.querySelector(`#${col} .selectable[data-mod="${r}"]`)?.classList.add('disabled-item');
            }
        }
    }
}

// ─── Rebuild from localStorage ────────────────────────────────────────────────

function rebuild(): void {
    activeProfile = localStorage.getItem('activeProfile') ?? 'default';
    if (!localStorage.getItem(PROFILE_KEY_PREFIX + 'default'))
        localStorage.setItem(PROFILE_KEY_PREFIX + 'default', packState(captureState('default')));

    restoreCheckbox('t17',      val => toggle('t17',      val));
    restoreCheckbox('vaal',     val => toggle('vaal',     val));
    restoreCheckbox('implicit', val => toggle('implicit', val));

    const typeStored = localStorage.getItem('maps-include');
    const mapType = Number(typeStored ?? 0) as ModifierType;
    (document.getElementById('maps-include') as HTMLInputElement).checked = mapType === ModifierType.INCLUSIVE;
    (document.getElementById('maps-exclude') as HTMLInputElement).checked = mapType !== ModifierType.INCLUSIVE;

    for (const id of ['map-normal', 'map-rare', 'map-magic']) {
        const stored = localStorage.getItem(id);
        if (stored) (document.getElementById(id) as HTMLInputElement).checked = stored === "true";
    }

    const savedRegex = localStorage.getItem("regex");
    if (savedRegex) { document.getElementById('regex')!.innerText = savedRegex; restoreSelectionsFromRegex(savedRegex); }

    const corruptedStored = localStorage.getItem('corrupted');
    if (corruptedStored) {
        const el = document.getElementById(corruptedStored) as HTMLInputElement;
        if (el) { el.checked = true; handleCheckboxChange(el); }
    }

    for (const [main, secondary] of [
        ['quantity', 'optimize-quantity'], ['pack-size', 'optimize-pack'],
        ['scarabs',  'optimize-scarab'],   ['maps',      'optimize-maps'],
        ['currency', 'optimize-currency'], ['rarity',    'optimize-rarity'],
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
        const containerId = arg.includes('!') ? 'exclusive' : 'inclusive';
        const container   = document.getElementById(containerId)?.querySelector('.mod-container');
        if (!container) continue;
        const re = new RegExp(arg.replace('!', ''), 'i');
        for (const child of Array.from(container.children) as HTMLElement[]) {
            if (child.dataset.t17      === 'true' && t17Stored      === 'false') continue;
            if (child.dataset.vaal     === 'true' && vaalStored     === 'false') continue;
            if (child.dataset.implicit === 'true' && implicitStored === 'false') continue;
            if (child.classList.contains('disabled-item')) continue;
            if (!child.textContent || !re.test(child.textContent)) continue;
            const modIndex = Number(child.dataset.mod);
            const modifier = modifiers.find(m => m.getIndex() === modIndex);
            if (!modifier) continue;
            child.classList.add('selected-item');
            const type = containerId === 'exclusive' ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE;
            disableCounterpart(modIndex, true, type, modifier);
            handleModifierSelection(true, type === ModifierType.EXCLUSIVE ? exclusive : inclusive, modifier);
        }
    }
    // Recompute all disabled states once after all selections are restored
    recomputeDisabled();
}

// ─── Regex Generation ─────────────────────────────────────────────────────────

function rollbackLastMod(type: ModifierType): void {
    const array = type === ModifierType.EXCLUSIVE ? exclusive : inclusive;
    if (!array.length) return;
    const mod = array[array.length - 1];
    console.warn(`[rollback] ${ModifierType[type]} idx=${mod.getIndex()} "${mod.getModifier().substring(0, 60)}"`);
    handleModifierSelection(false, array, mod);
    disableCounterpart(mod.getIndex(), false, type, mod);
    const col = type === ModifierType.EXCLUSIVE ? 'exclusive' : 'inclusive';
    document.querySelector(`#${col} .selectable[data-mod="${mod.getIndex()}"]`)?.classList.remove('selected-item');
    recomputeDisabled();
    selection.delete(type);
    cache.delete(type);
}

function generate(): void {
    console.log(`[generate] excl=${exclusive.length} incl=${inclusive.length}`);
    document.getElementById('regex')!.innerText = "crunching numbers...";
    document.getElementById('hint')!.innerText  = "";

    setTimeout(() => {
        const any = (document.getElementById('any') as HTMLInputElement).checked;
        localStorage.setItem("any", String(any));
        let exclusiveExpr = "", inclusiveExpr = "", failed = false;

        try { exclusiveExpr = buildModifierExpression(true, ModifierType.EXCLUSIVE); }
        catch (e) { console.error("[generate] EXCLUSIVE threw:", e); rollbackLastMod(ModifierType.EXCLUSIVE); failed = true; }

        if (!failed) try { inclusiveExpr = buildModifierExpression(any, ModifierType.INCLUSIVE); }
        catch (e) { console.error("[generate] INCLUSIVE threw:", e); rollbackLastMod(ModifierType.INCLUSIVE); failed = true; }

        if (failed) {
            document.getElementById('regex')!.innerText = "";
            document.getElementById('hint')!.innerText  = "⚠ Could not find a unique pattern — mod was deselected.";
            modal('loading-modal', false);
            return;
        }

        const utilityExpr   = buildUtilityExpression();
        const mapExpr       = buildMapExpression();
        const corruptedExpr = buildCorruptedExpression();

        let base = exclusiveExpr + ' ' + inclusiveExpr;
        base += inclusiveExpr.trim().endsWith('"') ? '' : ' ';
        const regex = (base + utilityExpr + mapExpr + corruptedExpr).trim();

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
    return a.length === b.length && a.every((v, i) => v === b[i]);
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
        filter.create(association, result, target, 0);
        console.log(`[buildModifierExpression] result=${JSON.stringify(Array.from(result))}`);
        selection.set(type, [...target]);

        const corrupted = localStorage.getItem('corrupted') ?? 'corrupted-ignore';

        if (any) {
            const weave = (type === ModifierType.EXCLUSIVE && corrupted === 'corrupted-exclude')
                || (type === ModifierType.INCLUSIVE && corrupted === 'corrupted-include');
            if (weave) result.add('pte');
            const joined = Array.from(result).join("|").replace(/#/g, "\\d+");
            regex = joined ? `"${type === ModifierType.EXCLUSIVE ? '!' : ''}${joined}"` : "";
        } else {
            let builder = "";
            for (const mod of result) {
                const value = mod.replace(/#/g, "\\d+");
                builder += mod.includes(" ") ? `"${value}" ` : `${value} `;
            }
            if (type === ModifierType.INCLUSIVE && corrupted === 'corrupted-include') builder += '"pte" ';
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

function buildCorruptedExpression(): string {
    const corrupted = localStorage.getItem('corrupted') ?? 'corrupted-ignore';
    if (corrupted === 'corrupted-exclude' && exclusive.length === 0) return ' "!pte"';
    if (corrupted === 'corrupted-include' && inclusive.length === 0) return ' "pte"';
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

function exceptional(error: any): void { console.error(error); }

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
    let re: RegExp | null = null;
    if (query.length > 0) {
        try { re = new RegExp(query, 'i'); }
        catch { re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
    }
    for (const child of Array.from(container.children) as HTMLElement[]) {
        const text = child.textContent?.toLowerCase() ?? '';
        if (re && !re.test(text)) { child.style.display = 'none'; continue; }
        const isImplicit = child.dataset.implicit === 'true';
        const isVaal     = child.dataset.vaal     === 'true';
        const isT17      = child.dataset.t17      === 'true';
        const isNormal   = !isImplicit && !isVaal && !isT17;
        child.style.display = (
            (isImplicit && implicitEl.checked) || (isVaal && vaalEl.checked) ||
            (isT17 && t17El.checked) || isNormal
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
    document.querySelectorAll('.selected-item, .disabled-item').forEach(el =>
        el.classList.remove('selected-item', 'disabled-item')
    );
}

function handleCheckboxChange(checkbox: HTMLInputElement): void {
    const group = Array.from(checkbox.classList).find(c => c.startsWith("btn-group-"));
    if (!group) return;
    if (checkbox.checked) {
        document.querySelectorAll<HTMLInputElement>(`input.${group}`).forEach(b => { if (b !== checkbox) b.checked = false; });
    } else {
        const siblings = Array.from(document.querySelectorAll<HTMLInputElement>(`input.${group}`));
        if (!siblings.some(b => b.checked)) checkbox.checked = true;
    }
}

// ─── Event Setup ──────────────────────────────────────────────────────────────

function setup(): void {
    document.querySelectorAll('.container-search').forEach(el =>
        el.addEventListener('input', e => filter(e.target as HTMLElement))
    );

    for (const attr of ['t17', 'vaal', 'implicit'] as const) {
        document.getElementById(attr)!.addEventListener('change', e => {
            const checked = (e.target as HTMLInputElement).checked;

            if (!checked) {
                // Remove mods of this type from selection arrays
                const isOfType = (mod: Modifier) =>
                    (attr === 't17' && mod.isT17()) || (attr === 'vaal' && mod.isVaal()) || (attr === 'implicit' && mod.isImplicit());
                exclusive = exclusive.filter(m => !isOfType(m));
                inclusive = inclusive.filter(m => !isOfType(m));
            }

            // Update visibility first so recomputeDisabled reads the new state
            toggle(attr, checked);

            // Rebuild all disabled states from scratch for the new visibility context
            recomputeDisabled();

            selection.clear();
            cache.clear();
            construct();
        });
    }

    document.getElementById('clear')!.addEventListener('click', wipe);
    document.getElementById('reset')!.addEventListener('click', () => { localStorage.clear(); window.location.reload(); });
    document.getElementById('copy')!.addEventListener('click', () =>
        navigator.clipboard.writeText(document.getElementById('regex')!.innerText)
    );
    document.getElementById('generate')!.addEventListener('click', () => { modal('loading-modal', true); generate(); });
    document.getElementById('report')!.addEventListener('click', () =>
        window.open('https://github.com/hawolt/poe-regex/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=', '_blank')
    );
    document.getElementById('suggest')!.addEventListener('click', () =>
        window.open('https://github.com/hawolt/poe-regex/issues/new?assignees=&labels=enhancement&projects=&template=feature_request.md&title=', '_blank')
    );
    document.getElementById('export')?.addEventListener('click', openExportModal);
    document.getElementById('profiles')?.addEventListener('click', () => { renderProfileList(); modal('profiles-modal', true); });
    document.getElementById('export-copy')?.addEventListener('click', copyExportString);
    document.getElementById('export-import-load')?.addEventListener('click', importFromExportString);
    document.getElementById('profile-save')?.addEventListener('click', saveProfile);

    document.querySelectorAll('.close-modal').forEach(el =>
        el.addEventListener('click', e => {
            const content = (e.target as HTMLElement).closest('.modal-content');
            if (content?.parentElement?.id) modal(content.parentElement.id, false);
        })
    );

    document.querySelectorAll('.trigger-0').forEach(el => el.addEventListener('change', () => construct()));
    document.querySelectorAll('.trigger-1').forEach(el => el.addEventListener('input',  () => construct()));
    document.querySelectorAll('.trigger-2').forEach(el => el.addEventListener('input',  () => selection.delete(ModifierType.INCLUSIVE)));
    document.querySelectorAll('.trigger-3').forEach(el =>
        el.addEventListener('input', e => {
            localStorage.setItem("corrupted", (e.target as HTMLElement).id);
            selection.clear(); cache.clear();
            construct();
        })
    );
    document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach(cb =>
        cb.addEventListener('change', () => handleCheckboxChange(cb))
    );
}

// ─── Debug ────────────────────────────────────────────────────────────────────

function debugSanityCheck(): void {
    console.group('[sanity] testing all mods individually');
    const empty = new Blacklist();
    const results: any[] = [];
    for (const mod of modifiers) {
        for (const useAny of [false, true]) {
            const f = useAny
                ? new FilterModifierAny(true, true, true, modifiers, empty, blacklist)
                : new FilterModifierAll(true, true, true, modifiers, empty, blacklist);
            const result = new Set<string>();
            try { f.create(new MapAssociation(), result, [mod], 0); }
            catch { results.push({ idx: mod.getIndex(), mode: useAny ? 'any' : 'all', text: mod.getModifier().substring(0, 80), status: '✗' }); }
        }
    }
    if (!results.length) console.log('All mods passed ✓'); else console.table(results);
    console.groupEnd();
}

// ─── State Capture / Apply ────────────────────────────────────────────────────

interface ConfigState {
    profileName: string;
    t17: boolean; vaal: boolean; implicit: boolean; any: boolean;
    mapsInclude: boolean; mapNormal: boolean; mapMagic: boolean; mapRare: boolean;
    corrupted: string;
    quantity: string;  optimizeQuantity: boolean;
    packSize: string;  optimizePack:     boolean;
    scarabs:  string;  optimizeScarab:   boolean;
    maps:     string;  optimizeMaps:     boolean;
    currency: string;  optimizeCurrency: boolean;
    rarity:   string;  optimizeRarity:   boolean;
    regex: string;
}

function captureState(profileName?: string): ConfigState {
    const g = (id: string) => document.getElementById(id) as HTMLInputElement;
    return {
        profileName:     profileName ?? activeProfile,
        t17:             g('t17').checked,      vaal:        g('vaal').checked,
        implicit:        g('implicit').checked, any:         g('any').checked,
        mapsInclude:     g('maps-include').checked,
        mapNormal:       g('map-normal').checked, mapMagic:  g('map-magic').checked, mapRare: g('map-rare').checked,
        corrupted:       localStorage.getItem('corrupted') ?? 'corrupted-ignore',
        quantity:        g('quantity').value,  optimizeQuantity: g('optimize-quantity').checked,
        packSize:        g('pack-size').value, optimizePack:     g('optimize-pack').checked,
        scarabs:         g('scarabs').value,   optimizeScarab:   g('optimize-scarab').checked,
        maps:            g('maps').value,      optimizeMaps:     g('optimize-maps').checked,
        currency:        g('currency').value,  optimizeCurrency: g('optimize-currency').checked,
        rarity:          g('rarity').value,    optimizeRarity:   g('optimize-rarity').checked,
        regex:           document.getElementById('regex')!.innerText,
    };
}

function applyState(state: ConfigState): void {
    const sc = (id: string, val: boolean) => { (document.getElementById(id) as HTMLInputElement).checked = val; };
    const sv = (id: string, val: string)  => { (document.getElementById(id) as HTMLInputElement).value   = val; };

    sc('t17', state.t17);           toggle('t17', state.t17);
    sc('vaal', state.vaal);         toggle('vaal', state.vaal);
    sc('implicit', state.implicit); toggle('implicit', state.implicit);
    sc('any', state.any); sc('all', !state.any);
    sc('maps-include', state.mapsInclude); sc('maps-exclude', !state.mapsInclude);
    sc('map-normal', state.mapNormal); sc('map-magic', state.mapMagic); sc('map-rare', state.mapRare);

    const corruptedEl = document.getElementById(state.corrupted) as HTMLInputElement | null;
    if (corruptedEl) { corruptedEl.checked = true; handleCheckboxChange(corruptedEl); }

    sv('quantity',  state.quantity);  sc('optimize-quantity', state.optimizeQuantity);
    sv('pack-size', state.packSize);  sc('optimize-pack',     state.optimizePack);
    sv('scarabs',   state.scarabs);   sc('optimize-scarab',   state.optimizeScarab);
    sv('maps',      state.maps);      sc('optimize-maps',     state.optimizeMaps);
    sv('currency',  state.currency);  sc('optimize-currency', state.optimizeCurrency);
    sv('rarity',    state.rarity);    sc('optimize-rarity',   state.optimizeRarity);

    if (state.regex) {
        document.getElementById('regex')!.innerText = state.regex;
        localStorage.setItem('regex', state.regex);
        restoreSelectionsFromRegex(state.regex);
    }
}

// ─── Minified Export Format (version 2) ───────────────────────────────────────
// [v, bits, qty, pack, scar, maps, curr, rar, corruptedIdx, regex, profileName]
// bits: 0=t17 1=vaal 2=implicit 3=any 4=mapsInclude 5=mapNormal 6=mapMagic
//       7=mapRare 8=optQty 9=optPack 10=optScarab 11=optMaps 12=optCurr 13=optRar
// corruptedIdx: 0=ignore 1=include 2=exclude

const CORRUPT_TO_IDX: Record<string, number> = { 'corrupted-ignore': 0, 'corrupted-include': 1, 'corrupted-exclude': 2 };
const CORRUPT_FROM_IDX = ['corrupted-ignore', 'corrupted-include', 'corrupted-exclude'];

function packState(state: ConfigState): string {
    const bits = [
        state.t17, state.vaal, state.implicit, state.any,
        state.mapsInclude, state.mapNormal, state.mapMagic, state.mapRare,
        state.optimizeQuantity, state.optimizePack, state.optimizeScarab,
        state.optimizeMaps, state.optimizeCurrency, state.optimizeRarity,
    ].reduce((acc, b, i) => acc | (b ? 1 << i : 0), 0);
    return btoa(unescape(encodeURIComponent(JSON.stringify([
        2, bits, state.quantity, state.packSize, state.scarabs, state.maps,
        state.currency, state.rarity, CORRUPT_TO_IDX[state.corrupted] ?? 0,
        state.regex, state.profileName,
    ]))));
}

function unpackState(b64: string): ConfigState | null {
    try {
        const raw = JSON.parse(decodeURIComponent(escape(atob(b64))));
        if (!Array.isArray(raw)) return (raw?.version === 1) ? raw as ConfigState : null;
        const [version, bits, qty, pack, scar, maps, curr, rar, corrIdx, regex, profileName] = raw;
        if (version !== 2) return null;
        const bit = (n: number) => Boolean(bits & (1 << n));
        return {
            profileName:      typeof profileName === 'string' ? profileName : 'imported',
            t17: bit(0),      vaal: bit(1),       implicit: bit(2),    any: bit(3),
            mapsInclude: bit(4), mapNormal: bit(5), mapMagic: bit(6),  mapRare: bit(7),
            optimizeQuantity: bit(8),  optimizePack: bit(9),  optimizeScarab: bit(10),
            optimizeMaps: bit(11),     optimizeCurrency: bit(12),       optimizeRarity: bit(13),
            corrupted: CORRUPT_FROM_IDX[corrIdx] ?? 'corrupted-ignore',
            quantity: qty ?? '', packSize: pack ?? '', scarabs: scar ?? '',
            maps: maps ?? '', currency: curr ?? '', rarity: rar ?? '', regex: regex ?? '',
        };
    } catch { return null; }
}

// ─── Export / Share ───────────────────────────────────────────────────────────

function openExportModal(): void {
    (document.getElementById('export-string') as HTMLTextAreaElement).value = packState(captureState());
    (document.getElementById('export-import-string') as HTMLTextAreaElement).value = '';
    modal('export-modal', true);
}

function copyExportString(): void {
    const ta  = document.getElementById('export-string') as HTMLTextAreaElement;
    const btn = document.getElementById('export-copy')!;
    navigator.clipboard.writeText(ta.value).then(() => {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
    }).catch(() => { ta.select(); document.execCommand('copy'); });
}

function importFromExportString(): void {
    const ta    = document.getElementById('export-import-string') as HTMLTextAreaElement;
    const state = unpackState(ta.value.trim());
    if (!state) { alert('Invalid export string.'); return; }

    let name = state.profileName ?? 'imported';
    if (name === 'default' && localStorage.getItem(PROFILE_KEY_PREFIX + 'default')) name = 'imported';
    if (localStorage.getItem(PROFILE_KEY_PREFIX + name)) {
        let n = 2;
        while (localStorage.getItem(PROFILE_KEY_PREFIX + `${name} (${n})`)) n++;
        name = `${name} (${n})`;
    }
    state.profileName = name;
    localStorage.setItem(PROFILE_KEY_PREFIX + name, packState(state));
    activeProfile = name;
    localStorage.setItem('activeProfile', activeProfile);
    wipe();
    applyState(state);
    modal('export-modal', false);
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

const PROFILE_KEY_PREFIX = 'profile::';

function allProfileNames(): string[] {
    const names: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (key.startsWith(PROFILE_KEY_PREFIX)) names.push(key.slice(PROFILE_KEY_PREFIX.length));
    }
    return names.sort((a, b) => a === 'default' ? -1 : b === 'default' ? 1 : a.localeCompare(b));
}

function setActiveProfile(name: string): void { activeProfile = name; localStorage.setItem('activeProfile', name); }

function saveProfile(): void {
    const input = document.getElementById('profile-name-input') as HTMLInputElement;
    const name  = input.value.trim() || activeProfile;
    localStorage.setItem(PROFILE_KEY_PREFIX + name, packState(captureState(name)));
    setActiveProfile(name);
    input.value = '';
    renderProfileList();
}

function loadProfile(name: string): void {
    const raw = localStorage.getItem(PROFILE_KEY_PREFIX + name);
    if (!raw) return;
    const state = unpackState(raw);
    if (!state) { alert('Profile data is corrupted.'); return; }
    wipe(); applyState(state); setActiveProfile(name);
    modal('profiles-modal', false);
}

function deleteProfile(name: string): void {
    if (name === 'default') { alert('The "default" profile cannot be deleted.'); return; }
    if (!confirm(`Delete profile "${name}"?`)) return;
    localStorage.removeItem(PROFILE_KEY_PREFIX + name);
    if (activeProfile === name) setActiveProfile('default');
    renderProfileList();
}

function renderProfileList(): void {
    const list = document.getElementById('profile-list')!;
    list.innerHTML = '';
    const names = allProfileNames();
    if (!names.length) {
        const empty = document.createElement('span');
        empty.textContent = 'No profiles saved yet.';
        empty.style.cssText = 'opacity:.5;font-size:14px;padding:4px 0';
        list.appendChild(empty);
        return;
    }
    for (const name of names) {
        const isActive = name === activeProfile;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center';

        const label = document.createElement('span');
        label.textContent = name + (isActive ? ' ✦' : '');
        label.style.cssText = `flex:1;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left;${isActive ? 'color:#4A90E2;font-weight:bold' : ''}`;

        const loadBtn = document.createElement('button');
        loadBtn.textContent = isActive ? 'Active' : 'Load';
        loadBtn.className   = 'styled-button';
        loadBtn.disabled    = isActive;
        loadBtn.style.cssText = `padding:6px 14px;font-size:13px;flex-shrink:0;${isActive ? 'opacity:.5;cursor:default' : ''}`;
        if (!isActive) loadBtn.addEventListener('click', () => loadProfile(name));

        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.className   = 'styled-button header-button';
        delBtn.style.cssText = 'padding:6px 10px;font-size:13px;flex-shrink:0';
        delBtn.title = name === 'default' ? 'Cannot delete default profile' : `Delete "${name}"`;
        delBtn.addEventListener('click', () => deleteProfile(name));

        row.appendChild(label); row.appendChild(loadBtn); row.appendChild(delBtn);
        list.appendChild(row);
    }
}