/* ===================================================================
   RULESET LOADER — the JSON is the single source of truth.
   Nothing about the game is written in this file: dice, costs, gear,
   traits, powers, injuries and scenario rules all come from the ruleset.
   Everything is keyed by id; `name` is only ever a label to display.
   =================================================================== */
const RS_REQUIRED = ["meta","dice","stats","baseCost","minModelCost","surcharge",
  "activation","nerve","actions","reactions","strain","movement","shooting","melee",
  "damage","conditions","morale","squads","keywords","traits","abilities","weapons",
  "armour","items","powers","casting","injuries","campaign","scenario"];

let RS = null;            // the loaded ruleset
let RSX = null;           // indexes derived from it
let RS_ERRORS = [];

function rsFail(msg){ RS_ERRORS.push(msg); }

function loadRuleset(json){
  /* Validates loudly: a missing section or an unknown id is a hard error, not a
     silent default. Returns null and fills RS_ERRORS when the file is unusable. */
  RS_ERRORS = [];
  let r;
  try { r = (typeof json === "string") ? JSON.parse(json) : json; }
  catch(e){ rsFail("The ruleset is not valid JSON: " + e.message); return null; }

  RS_REQUIRED.forEach(k => { if(r[k] === undefined) rsFail("missing section: " + k); });
  if(RS_ERRORS.length) return null;

  const ver = String(r.meta.version || "");
  if(!/^\d+\.\d+(\.\d+)?$/.test(ver)) rsFail('meta.version must look like "0.8" or "0.8.1", got "' + ver + '"');

  // --- indexes, keyed by id
  const byId = (list, what) => {
    const m = {};
    (list || []).forEach(x => {
      if(!x || !x.id) return rsFail(what + ": an entry has no id");
      if(m[x.id]) rsFail(what + ": duplicate id " + x.id);
      m[x.id] = x;
    });
    return m;
  };
  const X = {
    ladder: (r.dice.ladder || []).map(d => +String(d).slice(1)),
    stat:   byId((r.stats || []).map(x => Object.assign({id:x.key}, x)), "stats"),
    trait:  byId(r.traits, "traits"),
    ability:byId(r.abilities, "abilities"),
    weapon: byId(r.weapons, "weapons"),
    armour: byId(r.armour, "armour"),
    item:   byId(r.items, "items"),
    power:  byId(r.powers, "powers"),
    keyword:byId(r.keywords, "keywords"),
    cond:   byId(r.conditions, "conditions"),
    objective: byId((r.scenario.victory || {}).objectiveTypes, "scenario.victory.objectiveTypes"),
    element:byId((r.scenario.budget || {}).costs, "scenario.budget.costs"),
    difficulty: byId(r.scenario.difficulty, "scenario.difficulty"),
    length: byId(r.scenario.lengths, "scenario.lengths")
  };
  if(!X.ladder.length) rsFail("dice.ladder is empty");

  // --- cross-references: every id a rule points at must exist
  (r.weapons || []).forEach(w => (w.keywords || []).forEach(k => {
    if(!X.keyword[k]) rsFail("weapon " + w.id + " uses unknown keyword " + k); }));
  (r.injuries || []).forEach(inj => (inj.replace || []).forEach(rep => {
    if(!(r.replacements || []).some(x => x.id === rep))
      rsFail("injury " + inj.id + " points at unknown replacement " + rep); }));
  ["fight","aim","will","wits","move","wounds","actions"].forEach(k => {
    if(!X.stat[k]) rsFail("stats is missing the " + k + " entry"); });

  if(RS_ERRORS.length) return null;
  RS = r; RSX = X;
  return r;
}

/* ---- dice helpers, all from the ladder in the file ---- */
/* The four attributes that are dice. Move, Health, Actions and Size are
   numbers or a list, and are handled on their own terms. */
const DIE_STATS = ["fight", "aim", "will", "wits"];
function dieNum(d){ return +String(d || "").slice(1) || 0; }
function dieName(n){ return "d" + n; }
function dieIndex(d){ return RSX.ladder.indexOf(dieNum(d)); }
function dieStep(d, n){
  const i = dieIndex(d) + n;
  if(i < 0) return null;                       // below the ladder: the test fails
  return dieName(RSX.ladder[Math.min(i, RSX.ladder.length - 1)]);
}
function statDefault(key){ return RSX.stat[key] ? RSX.stat[key].default : null; }

/* ---- the cost engine, straight from the file ----
   baseCost + stat steps + Wounds + actions + traits/abilities/powers, with the
   surcharge applied in purchase order (the first `freeUpgrades` are clean, then
   each upgrade adds +(n-1)); gear and downgrades are excluded from the surcharge;
   never below minModelCost. */
function upgradeList(p){
  const ups = [];                              // [{label, cost}] in purchase order
  let flat = 0;
  ["fight","aim","will","wits"].forEach(k => {
    const st = RSX.stat[k];
    const cur = dieIndex(p[k] || st.default), base = dieIndex(st.default);
    for(let i = base; i < cur; i++) ups.push({label: st.name + " " + dieName(RSX.ladder[i+1]), cost: st.stepUpCosts[i - base]});
    for(let i = cur; i < base; i++) flat -= st.stepDownCost;
  });
  const mv = RSX.stat.move;
  const dm = (p.move === undefined ? mv.default : p.move) - mv.default;
  flat += (dm / mv.step) * mv.costPerStep;
  const wst = RSX.stat.wounds;
  const w = (p.wounds === undefined ? wst.default : p.wounds);
  const hStep = wst.upStep || 1, hCost = (wst.upCostPerStep !== undefined ? wst.upCostPerStep : wst.upCostEach);
  for(let v = wst.default + hStep; v <= w; v += hStep) ups.push({label: wst.name + " " + v, cost: hCost});
  const odd = (w - wst.default) % hStep;      // a Fate result or a scar can leave an odd point
  if(w > wst.default && odd) ups.push({label: wst.name + " " + w, cost: Math.round(hCost / hStep)});
  for(let i = 0; i < wst.default - w; i++) flat -= wst.downRefunds[Math.min(i, wst.downRefunds.length - 1)];
  const ast = RSX.stat.actions;
  const a = (p.actions === undefined ? ast.default : p.actions);
  for(let i = ast.default; i < a; i++) ups.push({label: "Action " + (i+1), cost: ast.upCosts[i - ast.default]});
  /* Resistances, vulnerabilities and Size are what make a creature a creature rather
     than a min-maxed fighter. The surcharge exists to stop stat stacking, so these are
     paid flat and never count toward the upgrade number. */
  const freeOfSurcharge = new Set([].concat((RS.traitTags||{}).resistances||[], (RS.traitTags||{}).vulnerabilities||[]));
  (p.traits || []).forEach(id => {
    const o = RSX.trait[id]; if(!o) return rsFail("unknown trait " + id);
    if(freeOfSurcharge.has(id)) flat += o.cost; else ups.push({label:o.name, cost:o.cost});
  });
  const sz = RSX.stat.size;
  if(sz && p.size && p.size !== sz.default) flat += (sz.costs||{})[p.size] || 0;

  /* A weakness offsets a nature; it is not free points. Refunds from Vulnerable traits
     cannot exceed what the model spent on resistances, Burning aura, Regenerate and
     weapon effects — otherwise you take Vulnerable to an element nobody uses and bank it. */
  const vulnIds = new Set(((RS.traitTags||{}).vulnerabilities)||[]);
  const resIds  = new Set(((RS.traitTags||{}).resistances)||[]);
  let vulnRefund = 0, natureSpend = 0;
  (p.traits || []).forEach(id => {
    const o = RSX.trait[id]; if(!o) return;
    if(vulnIds.has(id)) vulnRefund += -o.cost;
    else if(resIds.has(id) || id === "aura" || id === "regenerate") natureSpend += o.cost;
  });
  (p.weaponMods || []).forEach(id => { const m = RSX.wmod[id]; if(m) natureSpend += m.cost; });
  if(vulnRefund > natureSpend) flat += (vulnRefund - natureSpend);   // claw back the excess

  /* Flaws: capped in number and in total refund, and never surcharged. */
  const fc = (RS.flaws || {}).refundCap || {};
  const maxF = fc.maxFlaws === undefined ? 99 : fc.maxFlaws;
  let flawRefund = 0;
  (p.flaws || []).slice(0, maxF).forEach(id => { const o = (CAT.flaw||{})[id]; if(o) flawRefund += -o.cost; });
  if(fc.maxRefund !== undefined) flawRefund = Math.min(flawRefund, fc.maxRefund);
  flat -= flawRefund;
  (p.abilities || []).forEach(id => { const o = RSX.ability[id]; if(!o) return rsFail("unknown ability " + id); ups.push({label:o.name, cost:o.cost}); });
  (p.powers || []).forEach(id => { const o = RSX.power[id]; if(!o) return rsFail("unknown power " + id); ups.push({label:o.name, cost:o.cost}); });
  return {ups, flat};
}
function gearCost(p){
  let g = 0;
  (p.weapons || []).forEach(id => { const o = RSX.weapon[id]; if(o) g += o.cost; });
  (p.weaponMods || []).forEach(id => { const o = RSX.wmod[id]; if(o) g += o.cost; });
  if(p.armour){ const o = RSX.armour[p.armour]; if(o) g += o.cost; }
  (p.items || []).forEach(id => { const o = RSX.item[id]; if(o) g += o.cost; });
  return g;
}
function modelCost(p){
  const {ups, flat} = upgradeList(p);
  const sc = RS.surcharge;
  let total = RS.baseCost + flat;
  ups.forEach((u, i) => {
    const n = i + 1;
    total += u.cost + (n > sc.freeUpgrades ? (n - 1) * sc.perPriorUpgrade : 0);
  });
  return Math.max(RS.minModelCost, Math.round(total + gearCost(p)));
}
function costBreakdown(p){
  const {ups, flat} = upgradeList(p);
  const sc = RS.surcharge;
  const rows = [{label: "Base", cost: RS.baseCost}];
  if(flat) rows.push({label: "Move, size, downgrades and resistances", cost: flat});
  ups.forEach((u, i) => {
    const n = i + 1, extra = n > sc.freeUpgrades ? (n - 1) * sc.perPriorUpgrade : 0;
    rows.push({label: u.label + (extra ? " (+" + extra + " surcharge)" : ""), cost: u.cost + extra});
  });
  const g = gearCost(p);
  if(g){
    const mods = (p.weaponMods || []).reduce((n, id) => n + ((RSX.wmod[id] || {}).cost || 0), 0);
    if(mods){ rows.push({label: "Gear", cost: g - mods}); rows.push({label: "Weapon effects", cost: mods}); }
    else rows.push({label: "Gear", cost: g});
  }
  return {rows, total: modelCost(p)};
}
/* squads: per-model cost x size, less the discount; the floor applies per model first */
function squadCost(p, size){
  const per = Math.max(RS.minModelCost, modelCost(p));
  return Math.round(per * size * (1 - (RS.squads.squadDiscount || 0)));
}
function unitCostOf(u){
  return (u.size && u.size > 1) ? squadCost(u, u.size) : modelCost(u);
}
/* activations: 1 per full pointsPerActivation, capped; squads by size */
function activationsOf(u){
  const a = RS.activation;
  if(u.size && u.size >= RS.squads.minSize) return Math.max(1, Math.ceil(u.size / 3));
  const n = Math.floor(unitCostOf(u) / a.pointsPerActivation);
  return Math.max(a.minActivations, Math.min(a.maxActivations, n));
}

