!function(e,t){if("object"==typeof exports&&"object"==typeof module)module.exports=t();else if("function"==typeof define&&define.amd)define([],t);else{var n=t();for(var o in n)("object"==typeof exports?exports:e)[o]=n[o]}}(self,(()=>(()=>{"use strict";var e;class t{constructor(e,t){this.mod=e,this.t17=t}getModifier(){return this.mod}isT17(){return this.t17}equals(e){return this===e||!!e&&this.mod===e.getModifier()&&this.t17===e.isT17()}}function n(e,t){let n=[],o=e.getModifier().toLowerCase();for(let e=0;e<o.length;e++)for(let r=e+1;r<=o.length;r++){let l=o.substring(e,r);1!=l.length&&(t.blacklisted(l)||n.push(l))}return n.sort(((e,t)=>e.length-t.length)),n}!function(e){e[e.INCLUSIVE=0]="INCLUSIVE",e[e.EXCLUSIVE=1]="EXCLUSIVE"}(e||(e={}));class o{constructor(e,t,n){this.modifiers=t,this.blacklist=n,this.t17=e}includes(e,t){for(const n of t)if(n.equals(e))return!0;return!1}unique(e,t,n){for(let o=0;o<this.modifiers.length;o++){let r=this.modifiers[o];if(r.getModifier().toLowerCase().includes(e)){if(r.isT17()&&!this.t17)continue;let e=!1;for(const t of n)r.getModifier().toLowerCase().includes(t)&&(e=!0);if(e)continue;if(!this.includes(r,t))return!1}}return!0}create(e,t,o){if(0===o.length)return;o=e.upgrade(this.t17,o,t);let r=new Set;for(let e=0;e<o.length;e++)n(o[e],this.blacklist).forEach((e=>r.add(e)));const l=new Map;let i=2;for(;o.length>0;){const e=i,n=Array.from(r).filter((t=>t.length===e));if(0===n.length&&l.size>0)break;for(const e of n){if(e.length>=20)break;if(this.unique(e,o,t))for(const t of o)t.getModifier().toLowerCase().includes(e.toLowerCase())&&(l.has(e)||l.set(e,0),l.set(e,(l.get(e)||0)+1))}i+=1}let s=Array.from(l.entries());s.sort(((e,t)=>{const n=t[1]-e[1];return 0!==n?n:e[0].length+(e[0].includes("#")?2:0)-(t[0].length+(t[0].includes("#")?2:0))}));const c=s[0][0];o=o.filter((e=>!e.getModifier().toLowerCase().includes(c))),t.add(c),this.create(e,t,o)}}class r{constructor(){this.blacklist=new Set}populate(e){for(let t=0;t<e.length;t++)this.blacklist.add(e[t].toLowerCase())}blacklisted(e){for(let t of this.blacklist)if(t.includes(e))return!0;return!1}}class l{constructor(e){this.array=[[90,[91]],[91,[90]],[18,[60]],[60,[18]],[49,[50,27]],[50,[49,27]],[27,[49,50]],[61,[64,25]],[64,[61,25]],[25,[61,64]],[66,[14]],[14,[66]],[72,[74,75,33]],[74,[72,75,33]],[75,[72,74,33]],[33,[72,74,75]],[86,[92,2]],[92,[86,2]],[2,[86,92]],[102,[21]],[21,[102]],[103,[22]],[22,[103]],[125,[1]],[1,[125]]],this.mapping=new Map;let n=new Map;for(let o=0;o<this.array.length;o++){let r=this.array[o][0],l=e[r],i=new t(l.getModifier(),l.isT17());n.set(r,i)}for(let e=0;e<this.array.length;e++){let t=this.array[e],o=t[0],r=t[1],l=n.get(o),i=[];for(let e=0;e<r.length;e++){let t=r[e],o=n.get(t);o&&i.push(o)}l&&i&&this.mapping.set(l,i)}}upgrade(e,t,n){const o=new Set(t),r=Array.from(this.mapping.keys());for(const l of t)for(const t of r)if(l.equals(t)){let r=this.mapping.get(t)||[];for(const l of r)if(e||l.isT17()||l.getModifier().includes("#% more Monster Life")){let e=!1;for(const t of n)if(l.getModifier().toLowerCase().includes(t)){e=!0;break}e||(console.log("+ "+t.getModifier()),console.log("> "+l.getModifier()),console.log("---"),o.add(l))}}return Array.from(o)}}function i(e,t,n){let o=parseFloat(e);if(isNaN(o))return null;if(t&&(o=10*Math.floor(o/10)),0===o)return null;let r=Math.floor(o%100/10),l=o%10;if(o>=200)return"2..";if(199===o)return"199";if(o>100)return 0==l?`1[${r}-9].`:0===r?`(\\d0[${l}-9]|\\d[1-9].)`:9===r?8!=l?`19[${r}-9]`:"19[89]":`1([${r}-9][${l}-9]|[${r+1}-9].)`;if(100===o)return"\\d{3}";if(o>=10){if(0===l){let e;return e=9===r?"9.":8===r?"[89].":`[${r}-9].`,n?`(${e}|1..)`:e}return 9===r?n?`(${r}[${l}-9]|1..)`:`${r}[${l}-9]`:n?`(${r}[${l}-9]|[${r+1}-9].|1..)`:`${r}[${l}-9]|[${r+1}-9].`}return o<10?9===o?"(9|\\d..?)":8===o?"([89]|\\d..?)":o>1?`([${o}-9]|\\d..?)`:"":e}const s=performance.now();let c=new Map,a=new Map,d=new r,u=[],f=[],g=[];function h(e){const t=document.getElementById("overlay"),n=document.getElementById("modal"),o=document.body;t.classList.toggle("hidden",!e),n.classList.toggle("hidden",!e),o.classList.toggle("no-scroll",e)}async function m(e){const t=e.map((e=>fetch(e).then((t=>{if(!t.ok)throw new Error(`Failed to load ${e}: ${t.status} ${t.statusText}`);return t.text()}))));return Promise.all(t)}function E(t,n){const o=document.createElement("div");return o.classList.add("selectable"),n.isT17()&&(o.classList.add("t17"),o.style.display="none"),o.dataset.t17=n.isT17().toString(),o.textContent=n.getModifier(),o.addEventListener("click",(o=>{let r=o.target;r.classList.toggle("selected-item");let l=r.classList.contains("selected-item"),i=t==e.EXCLUSIVE?f:g;if(l)i.push(n);else{const e=i.indexOf(n);e>-1&&i.splice(e,1)}y()})),o}function p(e){var t;const n=e.value,o=null===(t=e.closest(".container-search"))||void 0===t?void 0:t.nextElementSibling,r=document.getElementById("t17");if(o&&o.classList.contains("mod-container")){let e=o.children;for(let t=0;t<e.length;t++){const o=e[t];o.textContent&&o.textContent.toLowerCase().includes(n.toLowerCase())?(r.checked&&"true"===o.dataset.t17||"false"===o.dataset.t17)&&(o.style.display=""):o.style.display="none"}}}function y(){document.getElementById("regex").innerText="crunching numbers...",document.getElementById("hint").innerText="",setTimeout((()=>{let t=document.getElementById("any").checked,n=L(!0,e.EXCLUSIVE),o=L(t,e.INCLUSIVE),r=function(){let e=i(document.getElementById("quantity").value,document.getElementById("optimize-quantity").checked,!0),t=i(document.getElementById("pack-size").value,document.getElementById("optimize-pack").checked,!1),n=i(document.getElementById("scarabs").value,document.getElementById("optimize-scarab").checked,!0),o="";return e&&(o+='"m q.*'+e+'%" '),t&&(o+='"iz.*'+t+'%" '),n&&(o+='"abs.*'+n+'%" '),o}(),l=function(){let t=document.getElementById("maps-include").checked?e.INCLUSIVE:e.EXCLUSIVE,n=[];document.getElementById("map-normal").checked&&n.push("n"),document.getElementById("map-rare").checked&&n.push("r"),document.getElementById("map-magic").checked&&n.push("m");let o=t==e.INCLUSIVE&&3!=n.length&&0!=n.length,r=t==e.EXCLUSIVE&&0!=n.length;return o||r?` "${t==e.EXCLUSIVE?"!":""}y: ${function(e){return 1==e.length?e[0]:`(${e.join("|")})`}(n)}"`:""}(),s=(n+(n.length>0?" ":"")+o+(o.length>0?" ":"")+r+l).trim();document.getElementById("regex").innerText=s;let c=document.getElementById("hint");c.innerText=s.length>0?`length: ${s.length} / 50`:"",c.style.color=s.length>50?"#ff4d4d":"#e0e0e0",h(!1)}),100)}function L(t,n){const r=document.getElementById("t17");let i=new o(r.checked,u,d),s=n==e.EXCLUSIVE?f:g,h="";if(function(e,t){if(e.length!==t.length)return!1;for(let n=0;n<e.length;n++)if(e[n]!==t[n])return!1;return!0}(c.get(n)||[],s))h=a.get(n)||"";else{let o=new Set,r=new l(u);try{if(i.create(r,o,s),c.set(n,[...s]),t)h=Array.from(o).join("|").replace(/#/g,"\\d+"),h=h.length>0?`"${n==e.EXCLUSIVE?"!":""}${h}"`:"";else{let e="";for(const t of o)e+=t.includes(" ")?`"${t}" `:`${t} `;h=e}a.set(n,h)}catch(e){console.error(e)}}return h}return document.addEventListener("DOMContentLoaded",(()=>{m(["./league/settler/map.name.config","./league/settler/map.affix.config","./league/settler/map.general.config","./league/settler/map.blacklist.config"]).then((e=>function(e){const t=new r;for(let n=0;n<e.length;n++){let o=e[n].split("\n");t.populate(o)}return t}(e))).then((n=>{d=n,async function(){m(["./league/settler/map.mods.config"]).then((e=>e[0])).then((n=>function(n){let o=n.split("\n"),r=document.querySelectorAll(".mod-container");for(let n=0;n<o.length;n++){let l=o[n].trim(),i=l.indexOf("(T17)");-1!=i&&(l=l.substring(6));const s=new t(l,-1!=i);u.push(s);for(let t=0;t<r.length;t++){let n=0==t?e.EXCLUSIVE:e.INCLUSIVE;r[t].appendChild(E(n,s))}}}(n)))}().then((()=>function(){document.querySelectorAll(".container-search").forEach((e=>{e.addEventListener("input",(e=>{p(e.target)}))})),document.getElementById("t17").addEventListener("change",(e=>{const t=e.target;document.querySelectorAll('[data-t17="true"]').forEach((e=>{let n=e;n.style.display=t.checked?"block":"none",t.checked||n.classList.remove("selected-item")})),document.querySelectorAll(".container-search").forEach((e=>{p(e)}))})),document.getElementById("generate").addEventListener("click",(()=>{c.clear(),h(!0),y()})),document.querySelectorAll(".trigger-0").forEach((e=>{e.addEventListener("change",(e=>{y()}))})),document.querySelectorAll(".trigger-1").forEach((e=>{e.addEventListener("input",(e=>{y()}))})),document.querySelectorAll(".trigger-2").forEach((t=>{t.addEventListener("input",(t=>{c.delete(e.INCLUSIVE)}))}));const t=document.querySelectorAll('input[type="checkbox"]');t.forEach((e=>{e.addEventListener("change",(()=>{!function(e){const n=e.classList;let o="";for(const e of n)if(e.includes("btn-group-")){o=e;break}0!=o.length&&(e.checked?t.forEach((t=>{t.classList.contains(o)&&t!==e&&(t.checked=!1)})):Array.from(t).filter((e=>e.classList.contains(o))).some((e=>e.checked))||(e.checked=!0))}(e)}))}))}())).then((()=>function(){const e=performance.now()-s;console.log(`build-time ${e}ms`)}()))})).catch((e=>function(e){console.error(e)}(e)))})),{}})()));