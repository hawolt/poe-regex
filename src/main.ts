import {upgrade} from "./T17";
import {Modifier} from "./Modifier";
import {ModifierType} from "./ModifierType";
import {ExcludeFilter} from "./ExcludeFilter";
import {Blacklist} from "./Blacklist";

const call = performance.now();

let blacklist = new Blacklist();
let modifiers: Modifier[] = [];
let exclusive: string[] = [];
let inclusive: string[] = [];

document.addEventListener('DOMContentLoaded', () => {
    const entries = [
        "./league/settler/map.name.config",
        "./league/settler/map.affix.config", // probably better to disable this due to heavy overlaps
        "./league/settler/map.general.config"
    ];
    read(entries)
        .then(responses => initialize(responses))
        .then(list => {
            blacklist = list;
            load().then(() => setup()).then(() => tracker());
        })
        .catch(error => exceptional(error));
});

function setup() {
    document.querySelectorAll('.container-search').forEach(element => {
        element.addEventListener('input', (event) => {
            const query = (event.target as HTMLInputElement).value;
            const container = (event.target as HTMLElement).closest('.container-search')?.nextElementSibling as HTMLElement;
            if (container && container.classList.contains('mod-container')) {
                let children = container.children;
                for (let i = 0; i < children.length; i++) {
                    const child = children[i] as HTMLElement;
                    if (child.textContent && child.textContent.toLowerCase().includes(query)) {
                        child.style.display = '';
                    } else {
                        child.style.display = 'none';
                    }
                }
            }
        });
    });

    document.getElementById('generate')!.addEventListener('click', () => {
        document.getElementById('hint')!.innerText = `length: 0 / 50`;
        document.getElementById('regex')!.innerText = "";
        setTimeout(generate, 1000);
        modal(true);
    });
}

function generate() {
    let exclude = new ExcludeFilter(modifiers, blacklist);
    let result: Set<string> = new Set<string>();
    try {
        exclude.create(result, upgrade(exclusive));
        let regex = Array.from(result).join("|").replace(/#/g, "\\d+");
        regex = `"!${regex}"`;

        document.getElementById('regex')!.innerText = regex;
        document.getElementById('hint')!.innerText = `length: ${regex.length} / 50`;
    } catch (error) {
        console.error(error);
    }
    modal(false);
}

function modal(status: boolean) {
    console.log("modal show: " + status);
    const overlay = document.getElementById('overlay')!;
    const modal = document.getElementById('modal')!;
    const body = document.body!;

    overlay.classList.toggle('hidden', !status);
    modal.classList.toggle('hidden', !status);
    body.classList.toggle('no-scroll', status);
}

function tracker() {
    const time = performance.now() - call;
    console.log(`build-time ${time}ms`)
}

async function load() {
    read(["./league/settler/map.mods.config"])
        .then(responses => responses[0])
        .then(response => build(response))
}


async function read(urls: string[]): Promise<string[]> {
    const requests = urls.map(url => fetch(url).then(response => {
        if (!response.ok) {
            throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
        }
        return response.text();
    }));
    return Promise.all(requests);
}

function initialize(array: string[]): Blacklist {
    const blacklist = new Blacklist();
    for (let i = 0; i < array.length; i++) {
        let content = array[i];
        let lines = content.split("\n");
        blacklist.populate(lines);
    }
    return blacklist;
}

function build(config: string) {
    let line = config.split("\n");
    let targets = document.querySelectorAll(".mod-container")
    for (let i = 0; i < line.length; i++) {
        let modifier = line[i].trim();
        let index = modifier.indexOf("(T17)");
        if (index != -1) modifier = modifier.substring(6);
        const mod = new Modifier(modifier, index == -1);
        modifiers.push(mod);
        for (let j = 0; j < targets.length; j++) {
            let type = j == 0 ? ModifierType.EXCLUSIVE : ModifierType.INCLUSIVE;
            targets[j].appendChild(createSelectableContainer(type, mod));
        }
    }
}

function createSelectableContainer(type: ModifierType, modifier: Modifier): HTMLDivElement {
    const div = document.createElement("div");

    div.className = "selectable";
    div.dataset.t17 = modifier.isT17().toString();
    div.textContent = modifier.getModifier();
    div.addEventListener('click', (event) => {
        let element = (event.target as HTMLElement);
        element.classList.toggle('selected-item');
        let active = element.classList.contains('selected-item');
        let array = type == ModifierType.EXCLUSIVE ? exclusive : inclusive;
        if (active) {
            array.push(modifier.getModifier());
        } else {
            const index = array.indexOf(modifier.getModifier());
            if (index > -1) {
                array.splice(index, 1);
            }
        }
    });

    return div;
}

function exceptional(error: any) {
    console.error(error);
}
