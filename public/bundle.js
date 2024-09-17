!function(e,t){if("object"==typeof exports&&"object"==typeof module)module.exports=t();else if("function"==typeof define&&define.amd)define([],t);else{var n=t();for(var r in n)("object"==typeof exports?exports:e)[r]=n[r]}}(self,(()=>(()=>{"use strict";var e;class t{constructor(e,t){this.mod=e,this.t17=t}getModifier(){return this.mod}isT17(){return this.t17}equals(e){return this===e||!!e&&this.mod===e.getModifier()&&this.t17===e.isT17()}}!function(e){e[e.INCLUSIVE=0]="INCLUSIVE",e[e.EXCLUSIVE=1]="EXCLUSIVE"}(e||(e={}));class n{constructor(e,t,n,r){this.modifiers=t,this.blacklist=r,this.excludes=n,this.t17=e}includes(e,t){for(const n of t)if(n.equals(e))return!0;return!1}substrings(e,t){let n=[],r=e.getModifier().toLowerCase();for(let e=0;e<r.length;e++)for(let o=e+1;o<=r.length;o++){let i=r.substring(e,o);1!=i.length&&(t.blacklisted(i)||n.push(i))}return n.sort(((e,t)=>e.length-t.length)),n}}class r extends n{check(e,t,n){if(this.excludes.blacklisted(e))return!1;for(let r=0;r<this.modifiers.length;r++){let o=this.modifiers[r];if(o.getModifier().toLowerCase().includes(e)){if(o.isT17()&&!this.t17)continue;let e=!1;for(const t of n)o.getModifier().toLowerCase().includes(t)&&(e=!0);if(e)continue;if(!this.includes(o,t))return!1}}return!0}create(e,t,n,r){if(0===n.length)return;if(r>this.modifiers.length)throw new Error("Infinite Recursion has been prevented");n=e.upgrade(this.t17,n,t);let o=new Set;for(let e=0;e<n.length;e++){let t=n[e];this.substrings(t,this.blacklist).forEach((e=>o.add(e)))}const i=new Map,s=Array.from(o).filter((e=>e.length>=2)).sort(((e,t)=>e.length-t.length));for(const e of s){if(e.length>=20)break;if(!e.startsWith(" ")&&!e.endsWith(" ")&&this.check(e,n,t))for(const t of n)t.getModifier().toLowerCase().includes(e.toLowerCase())&&(i.has(e)||i.set(e,0),i.set(e,(i.get(e)||0)+1))}let l=Array.from(i.entries());l.sort(((e,t)=>{const n=t[1]-e[1];return 0!==n?n:e[0].length+(e[0].includes("#")?2:0)-(t[0].length+(t[0].includes("#")?2:0))}));const c=l[0][0];n=n.filter((e=>!e.getModifier().toLowerCase().includes(c))),t.add(c),this.create(e,t,n,r+1)}}class o extends n{check(e,t,n){if(this.excludes.blacklisted(e))return!1;for(let n=0;n<this.modifiers.length;n++){let r=this.modifiers[n],o=r.getModifier().toLowerCase().includes(e.toLowerCase()),i=this.includes(r,t);if((!r.isT17()||this.t17)&&(!i&&o||i&&!o))return!1}return!0}create(e,t,n,r){if(0!==n.length)for(const e of n){let n=new Set,r=[];this.substrings(e,this.blacklist).forEach((e=>n.add(e)));for(const t in this.modifiers){let n=this.modifiers[t];n.getModifier().toLowerCase().includes(e.getModifier().toLowerCase())&&r.push(n)}r.push(e);let o=[],i=Array.from(n).sort(((e,t)=>e.length-t.length));for(const e of i)e.startsWith(" ")||e.endsWith(" ")||this.check(e,r,t)&&o.push(e);o.sort(((e,t)=>{const n=e.includes("#")||e.includes(" ")?e.length+2:e.length,r=t.includes("#")||t.includes(" ")?t.length+2:t.length;if(n!==r)return n-r;const o=e.includes(" ");return o===t.includes(" ")?0:o?1:-1})),o.length>0&&t.add(o[0])}}}class i{constructor(){this.blacklist=new Set}populate(e){for(let t=0;t<e.length;t++)this.blacklist.add(e[t].toLowerCase())}blacklisted(e){for(let t of this.blacklist)if(t.includes(e))return!0;return!1}}const s=[[90,[91]],[91,[90]],[18,[60]],[60,[18]],[17,[84]],[84,[17]],[40,[52]],[52,[40]],[19,[56]],[56,[19]],[47,[99]],[99,[47]],[28,[83]],[83,[28]],[49,[27]],[50,[27]],[27,[49,50]],[61,[25]],[64,[25]],[25,[61,64]],[66,[14]],[14,[66]],[72,[33]],[74,[33]],[75,[33]],[33,[72,74,75]],[86,[2]],[92,[2]],[2,[86,92]],[102,[21]],[21,[102]],[103,[22]],[22,[103]],[125,[1]],[1,[125]],[62,[0]],[0,[62]]];class l{constructor(e){this.mapping=new Map;let n=new Map;for(let r=0;r<s.length;r++){let o=s[r][0],i=e[o],l=new t(i.getModifier(),i.isT17());n.set(o,l)}for(let e=0;e<s.length;e++){let t=s[e],r=t[0],o=t[1],i=n.get(r),l=[];for(let e=0;e<o.length;e++){let t=o[e],r=n.get(t);r&&l.push(r)}i&&l&&this.mapping.set(i,l)}}upgrade(e,t,n){const r=new Set(t),o=Array.from(this.mapping.keys());for(const i of t)for(const t of o)if(i.equals(t)){let o=this.mapping.get(t)||[];for(const t of o)if(e||t.isT17()||t.getModifier().includes("#% more Monster Life")){let e=!1;for(const r of n)if(t.getModifier().toLowerCase().includes(r)){e=!0;break}e||r.add(t)}}return Array.from(r)}}const c=performance.now();let d=new Map,a=new Map,u=new i,f=[],h=[],g=[];async function m(e){const t=e.map((e=>fetch(e).then((t=>{if(!t.ok)throw new Error(`Failed to load ${e}: ${t.status} ${t.statusText}`);return t.text()}))));return Promise.all(t)}function p(t,n,r){const o=document.createElement("div");return o.classList.add("selectable"),r.isT17()&&(o.classList.add("t17"),o.style.display="none"),o.dataset.mod=t.toString(),o.dataset.t17=r.isT17().toString(),o.textContent=r.getModifier(),o.addEventListener("click",(o=>{let i=o.target;if(i.classList.contains("disabled-item"))return;i.classList.toggle("selected-item");let l=i.classList.contains("selected-item"),c=n==e.EXCLUSIVE?h:g;!function(t,n,r,o){let i=r==e.EXCLUSIVE?"inclusive":"exclusive",s=document.querySelector(`#${i} .selectable[data-mod="${t}"]`);n?(s.classList.add("disabled-item"),E(!n,r==e.EXCLUSIVE?g:h,o)):s.classList.remove("disabled-item")}(t,l,n,r),E(l,c,r),function(t,n){const r=Object.values(e).filter((e=>"number"==typeof e));for(const o of s)if(o[0]===t){let t=o[1];for(const o of t)for(const t of r){let r=e[t].toLowerCase(),i=document.querySelector(`#${r} .selectable[data-mod="${o}"]`);n?i.classList.add("disabled-item"):i.classList.remove("disabled-item")}break}}(t,l),y()})),o}function E(e,t,n){if(e)t.push(n);else{const e=t.indexOf(n);e>-1&&t.splice(e,1)}}function L(e){var t;const n=e.value,r=null===(t=e.closest(".container-search"))||void 0===t?void 0:t.nextElementSibling,o=document.getElementById("t17");if(r&&r.classList.contains("mod-container")){let e=r.children;for(let t=0;t<e.length;t++){const r=e[t];r.textContent&&r.textContent.toLowerCase().includes(n.toLowerCase())?(o.checked&&"true"===r.dataset.t17||"false"===r.dataset.t17)&&(r.style.display=""):r.style.display="none"}}}function y(){document.getElementById("regex").innerText="crunching numbers...",document.getElementById("hint").innerText="",setTimeout((()=>{let t=document.getElementById("any").checked,n=I(!0,e.EXCLUSIVE),r=I(t,e.INCLUSIVE),o=function(){let e=b("quantity","optimize-quantity","m q"),t=b("pack-size","optimize-pack","iz"),n=b("scarabs","optimize-scarab","abs"),r=b("maps","optimize-maps","ps:"),o=b("currency","optimize-currency","urr"),i="";return e&&(i+=e),t&&(i+=t),n&&(i+=n),r&&(i+=r),o&&(i+=o),i}(),i=function(){let t=document.getElementById("maps-include").checked?e.INCLUSIVE:e.EXCLUSIVE,n=[];document.getElementById("map-normal").checked&&n.push("n"),document.getElementById("map-rare").checked&&n.push("r"),document.getElementById("map-magic").checked&&n.push("m");let r=t==e.INCLUSIVE&&3!=n.length&&0!=n.length,o=t==e.EXCLUSIVE&&0!=n.length;return r||o?` "${t==e.EXCLUSIVE?"!":""}y: ${function(e){return 1==e.length?e[0]:`(${e.join("|")})`}(n)}"`:""}(),s=(n+(n.length>0?" ":"")+r+(r.length>0?" ":"")+o+i).trim();document.getElementById("regex").innerText=s;let l=document.getElementById("hint");l.innerText=s.length>0?`length: ${s.length} / 50`:"",l.style.color=s.length>50?"#ff4d4d":"#e0e0e0"}),100)}function I(t,n){const s=document.getElementById("t17");let c=function(t){let n=new i;return t==e.EXCLUSIVE&&n.populate([...g].map((e=>e.getModifier()))),t==e.INCLUSIVE&&n.populate([...h].map((e=>e.getModifier()))),n}(n),m=t?new r(s.checked,f,c,u):new o(s.checked,f,c,u),p=n==e.EXCLUSIVE?h:g,E="";if(function(e,t){if(e.length!==t.length)return!1;for(let n=0;n<e.length;n++)if(e[n]!==t[n])return!1;return!0}(d.get(n)||[],p))E=a.get(n)||"";else{let r=new Set,o=new l(f);try{if(m.create(o,r,p,0),d.set(n,[...p]),t)E=Array.from(r).join("|").replace(/#/g,"\\d+"),E=E.length>0?`"${n==e.EXCLUSIVE?"!":""}${E}"`:"";else{let e="";for(const t of r){let n=t.replace(/#/g,"\\d+");e+=t.includes(" ")?`"${n}" `:`${n} `}E=e}a.set(n,E)}catch(e){console.error(e)}}return E}function b(e,t,n){let r=function(e,t){let n=parseFloat(e);if(isNaN(n))return null;if(0===n)return null;if(t&&(n=10*Math.floor(n/10)),0===n)return"";let r=Math.floor(n%100/10),o=n%10;if(n>=200)return"2..";if(199===n)return"199";if(n>100)return 0==o?`1[${r}-9].`:0===r?`(\\d0[${o}-9]|\\d[1-9].)`:9===r?8!=o?`19[${r}-9]`:"19[89]":`1([${r}-9][${o}-9]|[${r+1}-9].)`;if(100===n)return"\\d{3}";if(n>=10){if(0===o){let e;return e=9===r?"9.":8===r?"[89].":`[${r}-9].`,`(${e}|1..)`}return 9===r?`(${r}[${o}-9]|1..)`:`(${r}[${o}-9]|[${r+1}-9].|1..)`}return n<10?9===n?"(9|\\d..?)":8===n?"([89]|\\d..?)":n>1?`([${n}-9]|\\d..?)`:"":e}(document.getElementById(e).value,document.getElementById(t).checked);return null===r?null:""===r?`"${n}" `:`"${n}.*${r}%" `}function C(e){return e.filter((e=>!e.getModifier().includes("Corrupted")))}return document.addEventListener("DOMContentLoaded",(()=>{m(["./league/settler/map.name.config","./league/settler/map.affix.config","./league/settler/map.general.config","./league/settler/map.blacklist.config"]).then((e=>function(e){const t=new i;for(let n=0;n<e.length;n++){let r=e[n].split("\n");t.populate(r)}return t}(e))).then((n=>{u=n,async function(){m(["./league/settler/map.mods.config"]).then((e=>e[0])).then((n=>function(n){let r=n.split("\n"),o=document.querySelectorAll(".mod-container");for(let n=0;n<r.length;n++){let i=r[n].trim(),s=i.indexOf("(T17)");-1!=s&&(i=i.substring(6));const l=new t(i,-1!=s);f.push(l);for(let t=0;t<o.length;t++){let r=0==t?e.EXCLUSIVE:e.INCLUSIVE;o[t].appendChild(p(n,r,l))}}}(n)))}().then((()=>function(){document.querySelectorAll(".container-search").forEach((e=>{e.addEventListener("input",(e=>{L(e.target)}))})),document.getElementById("t17").addEventListener("change",(e=>{const t=e.target;document.querySelectorAll('[data-t17="true"]').forEach((e=>{let n=e;n.style.display=t.checked?"block":"none",t.checked||n.classList.remove("selected-item")})),document.querySelectorAll(".container-search").forEach((e=>{L(e)}))})),document.getElementById("clear").addEventListener("click",(()=>{document.getElementById("regex").innerText="",document.getElementById("hint").innerText="",h.length=0,g.length=0,d.clear(),a.clear(),document.querySelectorAll(".selected-item, .disabled-item").forEach((e=>{e.classList.remove("selected-item","disabled-item")}))})),document.getElementById("copy").addEventListener("click",(()=>{let e=document.getElementById("regex").innerText;navigator.clipboard.writeText(e)})),document.querySelectorAll(".close-modal").forEach((e=>{e.addEventListener("click",(function(e){const t=e.target.closest(".modal-content");t&&t.parentElement&&t.parentElement.id&&function(e,t){const n=document.getElementById("overlay"),r=document.getElementById(e),o=document.body;n.classList.toggle("hidden",!0),r.classList.toggle("hidden",!0),o.classList.toggle("no-scroll",t)}(t.parentElement.id,!1)}))})),document.querySelectorAll(".trigger-0").forEach((e=>{e.addEventListener("change",(e=>{y()}))})),document.querySelectorAll(".trigger-1").forEach((e=>{e.addEventListener("input",(e=>{y()}))})),document.querySelectorAll(".trigger-2").forEach((t=>{t.addEventListener("input",(t=>{d.delete(e.INCLUSIVE)}))})),document.querySelectorAll(".trigger-3").forEach((n=>{n.addEventListener("input",(n=>{h=C(h),g=C(g);let r=null;switch(n.target.id){case"corrupted-include":r=e.INCLUSIVE;break;case"corrupted-exclude":r=e.EXCLUSIVE}if(null!=r){let n=new t("Corrupted",!1);(r===e.EXCLUSIVE?h:g).push(n)}y()}))}));const n=document.querySelectorAll('input[type="checkbox"]');n.forEach((e=>{e.addEventListener("change",(()=>{!function(e){const t=e.classList;let r="";for(const e of t)if(e.includes("btn-group-")){r=e;break}0!=r.length&&(e.checked?n.forEach((t=>{t.classList.contains(r)&&t!==e&&(t.checked=!1)})):Array.from(n).filter((e=>e.classList.contains(r))).some((e=>e.checked))||(e.checked=!0))}(e)}))}))}())).then((()=>function(){const e=performance.now()-c;console.log(`build-time ${e}ms`)}()))})).catch((e=>function(e){console.error(e)}(e)))})),{}})()));