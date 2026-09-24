/* =====================================================================
   EPITAPH
   Two halves. YOUR UNBURIED live on this device and are yours alone.
   THE REALM is the shared table: scenarios, and the person hosting them.

   The ruleset JSON is the only place the game is written down. Nothing
   about dice, costs, gear or rules is hard-coded below; if a value is not
   in the file, the app does not know it.
   ===================================================================== */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, m =>
  ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
const uid = () => Math.random().toString(36).slice(2, 9);
const signed = n => (n >= 0 ? "+" : "−") + Math.abs(n);

/* ---------------------------------------------------------------- state */
const STORE_KEY = "ep_bands_v1";
let store = {bands: [], activeId: null, way: "unburied"};

function load(){
  try{
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if(raw && Array.isArray(raw.bands)) store = Object.assign(store, raw);
  }catch(e){}
  if(!store.bands.length) store.bands = [newBand("The Unburied")];
  if(!store.bands.some(b => b.id === store.activeId)) store.activeId = store.bands[0].id;
  store.bands.forEach(mendBand);
}
function save(){ try{ localStorage.setItem(STORE_KEY, JSON.stringify(store)); }catch(e){} }

function newBand(name){
  return {id: uid(), name: name || "The Unburied", budget: 500, members: [], sealed: false};
}
function band(){ return store.bands.find(b => b.id === store.activeId) || store.bands[0]; }

/* A model is only ever what the ruleset says a model is. Anything missing is
   filled from the file, never from a number written in this app. */
function newMember(){
  const h = ((RS.campaign || {}).hire || {}).baseProfile || {};
  const m = {
    id: uid(), name: "", epithet: "", role: "", story: "",
    fielded: true, count: 1,
    move: h.move !== undefined ? h.move : statDefault("move"),
    wounds: h.wounds !== undefined ? h.wounds : statDefault("wounds"),
    actions: h.actions !== undefined ? h.actions : statDefault("actions"),
    size: statDefault("size"),
    traits: [], abilities: [], powers: [], flaws: [],
    weapons: [], armour: [], items: [], skins: {}
  };
  DIE_STATS.forEach(k => m[k] = h[k] || statDefault(k));
  return m;
}
/* Older saves, or a ruleset that has moved on, should not crash the app. */
function mendBand(b){
  b.members = (b.members || []).map(m => {
    const base = newMember();
    const out = Object.assign(base, m);
    out.id = m.id || base.id;
    DIE_STATS.forEach(k => { if(!RSX.ladder.includes(dieNum(out[k]))) out[k] = statDefault(k); });
    ["traits","abilities","powers","flaws"].forEach(k =>
      out[k] = (out[k] || []).filter(id => catOf(k)[id]));
    out.weapons = (out.weapons || []).filter(e => RSX.weapon[e.id])
      .map(e => ({id: e.id, qty: Math.max(1, e.qty || 1), mods: (e.mods || []).filter(x => RSX.wmod[x])}));
    out.armour = (out.armour || []).filter(id => RSX.armour[id.id || id]).map(id => id.id || id).slice(0, 1);
    out.items = (out.items || []).filter(e => RSX.item[e.id]).map(e => ({id: e.id, qty: Math.max(1, e.qty || 1)}));
    return out;
  });
  return b;
}

/* ---------------------------------------------------------------- catalogues
   Everything a player can pick comes from the ruleset, indexed by id. */
let CAT = {};
function catOf(kind){ return CAT[kind] || {}; }
function buildCatalogues(){
  const kw = ids => (ids || []).map(k => k.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase())).join(" · ");
  const map = (list, shape) => {
    const o = {};
    (list || []).forEach(x => o[x.id] = Object.assign(
      {id: x.id, name: x.name, cost: x.cost, examples: x.examples || null},
      shape ? shape(x) : {desc: x.desc || ""}));
    return o;
  };
  const tier = {};
  (RS.powerTiers || []).forEach(t => tier[t.id] = t);
  const order = id => (tier[id] && tier[id].order) || 99;

  CAT.traits    = map(RS.traits);
  CAT.abilities = map(RS.abilities);
  CAT.flaws     = map((RS.flaws || {}).list || []);
  CAT.items     = map(RS.items, x => ({desc: x.desc + (x.limited ? "  (" + x.limited + " use" + (x.limited > 1 ? "s" : "") + ")" : "")}));
  CAT.armour    = map(RS.armour, x => ({
    desc: [x.save ? "Save " + x.save : "", x.moveMod ? "Move " + signed(x.moveMod) + "cm" : "", x.desc || ""]
            .filter(Boolean).join(" · ")
  }));
  CAT.weapons   = map(RS.weapons, x => ({
    kind: x.type, range: x.range, damage: x.damage,
    desc: [x.type === "melee" ? "Melee" : "Ranged",
           x.range ? x.range + "cm" : null,
           x.damage + " dmg",
           kw(x.keywords) || null].filter(Boolean).join(" · ")
  }));
  CAT.powers    = map(RS.powers.slice().sort((a, b) =>
      (order(a.tier) - order(b.tier)) || (a.cost - b.cost) || a.name.localeCompare(b.name)),
    x => {
      const t = tier[x.tier] || {short: x.tier, name: x.tier, blurb: ""};
      return {tier: x.tier,
        desc: [t.short + " (" + t.name + ")", (x.tags || []).join(", "), x.range ? x.range + "cm" : null]
                .filter(Boolean).join(" · ") + "\n" + t.blurb +
              (x.levels ? "\n" + x.levels.map(l => "L" + l.level + " " + l.desc).join("  ") : (x.desc ? "\n" + x.desc : ""))};
    });
  CAT.mods = map(RS.weaponMods || []);
  RSX.wmod = CAT.mods;
}

/* ---------------------------------------------------------------- costing
   The cost engine lives in core-rules and takes the ruleset's own shape,
   so the app's shape is translated once, here, and nowhere else. */
function profileOf(m){
  const p = {
    move: m.move, wounds: m.wounds, actions: m.actions, size: m.size,
    traits: m.traits || [], abilities: m.abilities || [],
    powers: m.powers || [], flaws: m.flaws || [],
    weapons: [], weaponMods: [], items: [], armour: (m.armour || [])[0] || null
  };
  DIE_STATS.forEach(k => p[k] = m[k]);
  (m.weapons || []).forEach(e => {
    for(let i = 0; i < (e.qty || 1); i++){
      p.weapons.push(e.id);
      (e.mods || []).forEach(x => p.weaponMods.push(x));
    }
  });
  (m.items || []).forEach(e => { for(let i = 0; i < (e.qty || 1); i++) p.items.push(e.id); });
  return p;
}
function memberCost(m){ return modelCost(profileOf(m)); }
function squadOf(m){ return Math.max(1, m.count || 1); }
function isSquad(m){ return squadOf(m) >= RS.squads.minSize; }
function unitCost(m){ return isSquad(m) ? squadCost(profileOf(m), squadOf(m)) : memberCost(m); }
function activationsOf(m){
  const a = RS.activation;
  if(isSquad(m)) return Math.max(1, Math.ceil(squadOf(m) / 3));
  return Math.max(a.minActivations, Math.min(a.maxActivations,
    Math.floor(unitCost(m) / a.pointsPerActivation)));
}
function fielded(m){ return m.fielded !== false; }
function bandSpent(b){ return b.members.filter(fielded).reduce((s, m) => s + unitCost(m), 0); }
function bandActs(b){ return b.members.filter(fielded).reduce((s, m) => s + activationsOf(m), 0); }

/* A model's own name for a piece of gear. Stats and cost always come from the
   id, so renaming something can never move a number. */
function skinOf(m, id, fallback){ return (m.skins && m.skins[id]) || fallback; }
function effectiveMove(m){
  let v = m.move === undefined ? statDefault("move") : m.move;
  const a = (m.armour || [])[0];
  const o = a ? RSX.armour[a] : null;
  if(o && o.moveMod) v += o.moveMod;
  return Math.max(1, v);
}

/* ---------------------------------------------------------------- chrome */
let toastT = null;
function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2100);
}
function openSheet(html, after){
  $("#sheetIn").innerHTML = html;
  $("#sheet").classList.add("show");
  $("#scrim").classList.add("show");
  document.body.classList.add("locked");
  if(after) after($("#sheetIn"));
}
function closeSheet(){
  $("#sheet").classList.remove("show");
  $("#scrim").classList.remove("show");
  document.body.classList.remove("locked");
}

/* ---------------------------------------------------------------- render */
function render(){
  const b = band();
  $("#rsVer").textContent = RS.meta.name + " · ruleset " + RS.meta.version;
  $$(".way").forEach(w => w.classList.toggle("on", w.dataset.way === store.way));
  $("#viewUnburied").hidden = store.way !== "unburied";
  $("#viewRealm").hidden = store.way !== "realm";
  if(store.way === "unburied") renderUnburied(b);
  save();
}

function renderUnburied(b){
  const spent = bandSpent(b), over = spent > b.budget;
  const pct = b.budget > 0 ? Math.min(100, spent / b.budget * 100) : 0;
  const nField = b.members.filter(fielded).length;

  $("#bandHead").innerHTML = `
    <div class="band">
      <input class="band-name" id="bandName" value="${esc(b.name)}" maxlength="42" spellcheck="false">
      <button class="btn sm ghost" id="bandMenu">Bands</button>
    </div>
    <div class="gauge">
      <div class="gauge-line">
        <b class="${over ? "over" : ""}">${spent}</b>
        <span>of</span>
        <input class="input mono" id="bandBudget" value="${b.budget}" inputmode="numeric"
               style="width:76px;padding:3px 7px;font-size:13px;text-align:center">
        <span>points fielded</span>
        <span class="rule"></span>
        <span class="chip ${over ? "bad" : ""}">${over ? "over by " + (spent - b.budget) : (b.budget - spent) + " left"}</span>
      </div>
      <div class="bar"><i class="${over ? "over" : ""}" style="width:${pct}%"></i></div>
      <div class="gauge-line" style="margin-top:9px">
        <span class="chip">${nField} of ${b.members.length} fielded</span>
        <span class="chip">${bandActs(b)} activations a round</span>
      </div>
    </div>`;

  $("#bandName").oninput = e => { b.name = e.target.value; save(); };
  $("#bandBudget").oninput = e => {
    b.budget = Math.max(0, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0);
    renderUnburied(b);
  };
  $("#bandMenu").onclick = openBands;

  const list = $("#roster");
  list.innerHTML = "";
  if(!b.members.length){
    list.insertAdjacentHTML("beforeend", `
      <div class="empty" style="grid-column:1/-1">
        <div class="big">No one yet</div>
        <div class="quiet">The Unburied are what you make of them. Raise the first.</div>
      </div>`);
  }
  b.members.slice().sort((x, y) => (fielded(y) - fielded(x))).forEach(m => {
    const n = squadOf(m), cost = unitCost(m);
    const el = document.createElement("button");
    el.className = "marker" + (fielded(m) ? "" : " benched");
    el.innerHTML = `
      <div class="m-cost">${cost}<small>points</small></div>
      <span class="m-name">${esc(m.name) || "<span style='color:var(--ash-mute)'>Unnamed</span>"}</span>
      ${m.epithet ? `<span class="m-epithet">“${esc(m.epithet)}”</span>` : ""}
      ${m.role ? `<span class="m-role">${esc(m.role)}</span>` : ""}
      <div class="m-stats">
        ${DIE_STATS.map(k => `<div class="m-stat"><b>${esc(m[k])}</b><span>${esc(RSX.stat[k].name.slice(0,3))}</span></div>`).join("")}
        <div class="m-stat"><b>${m.wounds}</b><span>${esc(RSX.stat.wounds.name.slice(0,3))}</span></div>
      </div>
      <div class="m-foot">
        ${n > 1 ? `<span class="chip">squad ×${n}</span>` : ""}
        <span class="chip">${effectiveMove(m)}cm</span>
        <span class="chip">${activationsOf(m)} act</span>
        ${(m.flaws || []).length ? `<span class="chip bad">${m.flaws.length} flaw${m.flaws.length > 1 ? "s" : ""}</span>` : ""}
        <span class="rule"></span>
        <span class="chip ${fielded(m) ? "gilt" : ""}" data-field>${fielded(m) ? "fielded" : "benched"}</span>
      </div>`;
    el.onclick = ev => {
      if(ev.target.closest("[data-field]")){ m.fielded = !fielded(m); renderUnburied(b); return; }
      openMember(m.id);
    };
    list.appendChild(el);
  });
  const add = document.createElement("button");
  add.className = "marker add";
  add.innerHTML = `<div class="plus">†</div><span>Raise one of the Unburied</span>`;
  add.onclick = () => {
    const m = newMember();
    b.members.push(m); save();
    openMember(m.id);
  };
  list.appendChild(add);
}

/* ---------------------------------------------------------------- boot */
function boot(){
  const el = document.getElementById("rulesetJSON");
  const ok = loadRuleset(el ? el.textContent : "{}");
  if(!ok){
    document.body.innerHTML = `<div class="fatal">
      <h2>The ruleset would not load</h2>
      <p class="lead">Epitaph refuses to run on rules it cannot read, rather than guess at a value.</p>
      <ul>${RS_ERRORS.map(e => "<li>" + esc(e) + "</li>").join("")}</ul></div>`;
    return;
  }
  buildCatalogues();
  load();
  $$(".way").forEach(w => w.onclick = () => { store.way = w.dataset.way; render(); });
  $("#scrim").onclick = closeSheet;
  $("#scrim2").onclick = closePicker;
  render();
}
