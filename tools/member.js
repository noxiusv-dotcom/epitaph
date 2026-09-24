/* =====================================================================
   RAISING ONE OF THE UNBURIED
   The editor. Every control it draws is described by the ruleset: the die
   ladder, what a step costs, what may be carried, what a flaw gives back.
   Nothing here decides a value.
   ===================================================================== */

let editId = null;
function editing(){ return band().members.find(m => m.id === editId); }

function openMember(id){
  editId = id;
  drawMember();
  $("#sheet").classList.add("show");
  $("#scrim").classList.add("show");
  document.body.classList.add("locked");
}
function redraw(){ drawMember(); renderUnburied(band()); save(); }

/* ---- a row with a stepper, used by every stat ---- */
function stepRow(o){
  return `
  <div class="srow">
    <div class="srow-l">
      <b>${esc(o.title)}</b>
      <span>${esc(o.sub)}</span>
    </div>
    <div class="srow-r">
      <div class="stepper">
        <button data-step="${o.key}|-1" ${o.down ? "" : "disabled"} aria-label="Lower ${esc(o.title)}">−</button>
        <span>${esc(o.value)}</span>
        <button data-step="${o.key}|1" ${o.up ? "" : "disabled"} aria-label="Raise ${esc(o.title)}">+</button>
      </div>
      <span class="srow-hint mono">${esc(o.hint)}</span>
    </div>
  </div>`;
}

function drawMember(){
  const m = editing(); if(!m) return closeSheet();
  const b = band();
  const cost = unitCost(m), bd = costBreakdown(profileOf(m));

  const dieRows = DIE_STATS.map(k => {
    const st = RSX.stat[k], cur = m[k];
    const i = RSX.ladder.indexOf(dieNum(cur));
    const iMin = RSX.ladder.indexOf(dieNum(st.min)), iMax = RSX.ladder.indexOf(dieNum(st.max));
    const iBase = RSX.ladder.indexOf(dieNum(st.default));
    const next = i < iBase ? st.stepDownCost : st.stepUpCosts[i - iBase];
    return stepRow({key: "die:" + k, title: st.name, sub: "from " + st.default + " · " + st.min + "–" + st.max,
      value: cur, down: i > iMin, up: i < iMax,
      hint: i >= iMax ? "max" : (next === undefined ? "—" : "next +" + next)});
  }).join("");

  const mv = RSX.stat.move, ws = RSX.stat.wounds, as = RSX.stat.actions, sz = RSX.stat.size;
  const wStep = ws.upStep || 1, wCost = ws.upCostPerStep !== undefined ? ws.upCostPerStep : ws.upCostEach;
  const armObj = (m.armour || [])[0] ? RSX.armour[m.armour[0]] : null;
  const bodyRows =
    stepRow({key: "move", title: mv.name,
      sub: mv.step + "cm a step · " + mv.costPerStep + " pts" +
           (armObj && armObj.moveMod ? " · armour " + signed(armObj.moveMod) + "cm" : ""),
      value: effectiveMove(m) + "cm", down: m.move > mv.min, up: m.move < mv.max, hint: "±" + mv.costPerStep}) +
    stepRow({key: "wounds", title: ws.name,
      sub: "start " + ws.default + (wStep > 1 ? " · bought in " + wStep + "s, " + wCost + " a step" : ""),
      value: m.wounds, down: m.wounds > ws.min, up: m.wounds < ws.max, hint: m.wounds >= ws.max ? "max" : "+" + wCost}) +
    stepRow({key: "actions", title: as.name, sub: "start " + as.default,
      value: m.actions, down: m.actions > as.min,
      up: m.actions < as.max && as.upCosts[m.actions - as.default] !== undefined,
      hint: as.upCosts[m.actions - as.default] !== undefined ? "+" + as.upCosts[m.actions - as.default] : "max"}) +
    (sz ? stepRow({key: "size", title: sz.name,
      sub: (sz.effects || {})[m.size] || "",
      value: m.size.charAt(0).toUpperCase() + m.size.slice(1),
      down: sz.values.indexOf(m.size) > 0, up: sz.values.indexOf(m.size) < sz.values.length - 1,
      hint: (sz.costs || {})[m.size] ? signed(sz.costs[m.size]) : "free"}) : "");

  const n = squadOf(m), sq = RS.squads;
  const deploy = stepRow({key: "count", title: isSquad(m) ? "Squad" : "Alone",
    sub: isSquad(m) ? "one profile, " + n + " models · " + (sq.squadDiscount * 100) + "% together"
                    : "set " + sq.minSize + " or more to field a squad",
    value: n, down: n > 1, up: n < sq.maxSize, hint: n > 1 ? "×" + n : "—"});

  $("#sheetIn").innerHTML = `
    <div class="sheet-head">
      <button class="iconbtn" id="mBack" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" width="17" height="17"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <div class="eyebrow">One of the Unburied</div>
      <div class="m-cost" style="position:static">${cost}<small>points</small></div>
    </div>

    <div class="slab">
      <div class="field" style="margin-bottom:11px"><label>Name</label>
        <input class="input" id="fName" value="${esc(m.name)}" maxlength="42" placeholder="who were they"></div>
      <div class="field" style="margin-bottom:11px"><label>Epithet</label>
        <input class="input serif" id="fEpi" value="${esc(m.epithet)}" maxlength="42" placeholder="what they are called now"></div>
      <div class="field" style="margin-bottom:11px"><label>Role</label>
        <input class="input" id="fRole" value="${esc(m.role)}" maxlength="40" placeholder="what they do"></div>
      <div class="field"><label>Their story</label>
        <textarea class="input" id="fStory" rows="3" placeholder="how they came to be Unburied">${esc(m.story)}</textarea></div>
    </div>

    <div class="slab">
      <div class="head"><span class="eyebrow">Attributes</span><span class="rule"></span>
        <span class="quiet mono">${RS.dice.ladder.join(" · ")}</span></div>
      ${dieRows}
    </div>

    <div class="slab">
      <div class="head"><span class="eyebrow">Body</span><span class="rule"></span></div>
      ${bodyRows}
    </div>

    <div class="slab">
      <div class="head"><span class="eyebrow">How it deploys</span><span class="rule"></span>
        <span class="chip gilt">${activationsOf(m)} activation${activationsOf(m) === 1 ? "" : "s"}</span></div>
      ${deploy}
      <p class="quiet" style="margin:9px 0 0">${isSquad(m)
        ? memberCost(m) + " each × " + n + ", less " + (sq.squadDiscount * 100) + "% — <b>" + unitCost(m) + " points</b>. Activates " +
          activationsOf(m) + " time" + (activationsOf(m) === 1 ? "" : "s") + " a round, up to three models each time. Coherency " + sq.coherency + "cm."
        : "One activation per " + RS.activation.pointsPerActivation + " points, up to " + RS.activation.maxActivations + "."}</p>
    </div>

    ${gearSlab(m, "Weapons", "weapons")}
    ${gearSlab(m, "Armour", "armour")}
    ${gearSlab(m, "Carried", "items")}
    ${gearSlab(m, "Traits", "traits")}
    ${gearSlab(m, "Abilities", "abilities")}
    ${gearSlab(m, "Powers", "powers")}
    ${gearSlab(m, "Flaws", "flaws")}

    <div class="slab">
      <div class="head"><span class="eyebrow">What it costs</span><span class="rule"></span>
        <span class="chip gilt mono">${bd.total} points</span></div>
      ${bd.rows.map(r => `<div class="cost-row"><span>${esc(r.label)}</span><b class="mono ${r.cost < 0 ? "neg" : ""}">${signed(r.cost)}</b></div>`).join("")}
      ${n > 1 ? `<div class="cost-row"><span>Squad of ${n}, less ${(sq.squadDiscount * 100)}%</span><b class="mono">${unitCost(m)}</b></div>` : ""}
      <p class="quiet" style="margin:10px 0 0">The first ${RS.surcharge.freeUpgrades} upgrades cost list price; after that each
        adds +${RS.surcharge.perPriorUpgrade} for every upgrade already bought. Gear, size, resistances and flaws are exempt.</p>
    </div>

    <div class="sheet-actions">
      <button class="btn danger ghost" id="mDel">Lay to rest</button>
      <button class="btn primary" id="mDone">Done</button>
    </div>`;

  const root = $("#sheetIn");
  root.querySelector("#fName").oninput = e => { m.name = e.target.value; renderUnburied(band()); save(); };
  root.querySelector("#fEpi").oninput = e => { m.epithet = e.target.value; renderUnburied(band()); save(); };
  root.querySelector("#fRole").oninput = e => { m.role = e.target.value; renderUnburied(band()); save(); };
  root.querySelector("#fStory").oninput = e => { m.story = e.target.value; save(); };

  root.querySelectorAll("[data-step]").forEach(btn => btn.onclick = () => {
    const [key, dRaw] = btn.dataset.step.split("|"); const d = +dRaw;
    if(key.startsWith("die:")){
      const k = key.slice(4), st = RSX.stat[k];
      const nv = dieStep(m[k], d); if(!nv) return;
      const i = RSX.ladder.indexOf(dieNum(nv));
      if(i < RSX.ladder.indexOf(dieNum(st.min)) || i > RSX.ladder.indexOf(dieNum(st.max))) return;
      m[k] = nv;
    } else if(key === "move"){
      const nv = m.move + d * mv.step; if(nv < mv.min || nv > mv.max) return; m.move = nv;
    } else if(key === "wounds"){
      const nv = m.wounds + d * (d > 0 || m.wounds - wStep >= ws.default ? wStep : 1);
      if(nv < ws.min || nv > ws.max) return; m.wounds = nv;
    } else if(key === "actions"){
      const nv = m.actions + d; if(nv < as.min || nv > as.max) return; m.actions = nv;
    } else if(key === "size"){
      const i = sz.values.indexOf(m.size) + d; if(i < 0 || i >= sz.values.length) return; m.size = sz.values[i];
    } else if(key === "count"){
      let nv = n + d;
      if(nv > 1 && nv < sq.minSize) nv = d > 0 ? sq.minSize : 1;
      m.count = Math.max(1, Math.min(sq.maxSize, nv));
    }
    redraw();
  });

  bindGear(root, m);
  root.querySelector("#mBack").onclick = closeSheet;
  root.querySelector("#mDone").onclick = closeSheet;
  root.querySelector("#mDel").onclick = () => {
    const b2 = band();
    b2.members = b2.members.filter(x => x.id !== m.id);
    closeSheet(); renderUnburied(b2); save();
    toast("Laid to rest");
  };
}

/* ---- gear, traits, powers and flaws all render the same way ---- */
const GEAR_KIND = {
  weapons:  {cat:"weapons",  qty:true,  single:false, reskin:true,  add:"Add a weapon"},
  armour:   {cat:"armour",   qty:false, single:true,  reskin:true,  add:"Wear armour"},
  items:    {cat:"items",    qty:true,  single:false, reskin:true,  add:"Carry something"},
  traits:   {cat:"traits",   qty:false, single:false, reskin:false, add:"Add a trait"},
  abilities:{cat:"abilities",qty:false, single:false, reskin:false, add:"Add an ability"},
  powers:   {cat:"powers",   qty:false, single:false, reskin:false, add:"Learn a power"},
  flaws:    {cat:"flaws",    qty:false, single:false, reskin:false, add:"Take a flaw"}
};
function gearSlab(m, label, field){
  const k = GEAR_KIND[field], cat = catOf(k.cat), arr = m[field] || [];
  const rows = arr.map(entry => {
    const id = k.qty ? entry.id : (entry.id || entry);
    const o = cat[id]; if(!o) return "";
    const shown = k.reskin ? skinOf(m, id, o.name) : o.name;
    const mods = k.qty && field === "weapons" ? (entry.mods || []) : [];
    const modCost = mods.reduce((s, x) => s + ((CAT.mods[x] || {}).cost || 0), 0);
    const price = k.qty ? (o.cost + modCost) * (entry.qty || 1) : o.cost;
    return `
    <div class="grow">
      <div class="grow-main">
        <div class="grow-name">${esc(shown)}
          ${k.reskin ? `<button class="tiny" data-skin="${field}|${esc(id)}" title="Call it something else">✎</button>` : ""}</div>
        ${shown !== o.name ? `<div class="grow-sub">${esc(o.name)}</div>` : ""}
        <div class="grow-sub">${esc(o.desc)}</div>
        ${field === "weapons" ? `
          <div class="mods">
            ${mods.map(x => { const mo = CAT.mods[x]; return mo ? `<span class="mod">${esc(mo.name)} <b>${mo.cost}</b><button data-modoff="${esc(id)}|${esc(x)}" aria-label="Remove">×</button></span>` : ""; }).join("")}
            ${Object.values(CAT.mods).filter(x => !mods.includes(x.id)).length ? `
              <select class="mod-add" data-modadd="${esc(id)}" aria-label="Add an effect">
                <option value="">+ effect…</option>
                ${Object.values(CAT.mods).filter(x => !mods.includes(x.id))
                  .map(x => `<option value="${esc(x.id)}">${esc(x.name)} +${x.cost} — ${esc(x.desc)}</option>`).join("")}
              </select>` : ""}
          </div>` : ""}
      </div>
      <div class="grow-r">
        <span class="mono ${o.cost < 0 ? "neg" : ""}">${k.qty ? price + " pts" : signed(price)}</span>
        ${k.qty ? `<div class="stepper sm">
            <button data-qty="${field}|${esc(id)}|-1" aria-label="fewer">−</button>
            <span>${entry.qty || 1}</span>
            <button data-qty="${field}|${esc(id)}|1" aria-label="more">+</button></div>` : ""}
        <button class="tiny" data-drop="${field}|${esc(id)}" aria-label="Remove">×</button>
      </div>
    </div>`;
  }).join("");
  const total = arr.reduce((s, e) => {
    const id = k.qty ? e.id : (e.id || e), o = cat[id]; if(!o) return s;
    const mods = (e.mods || []).reduce((t, x) => t + ((CAT.mods[x] || {}).cost || 0), 0);
    return s + (k.qty ? (o.cost + mods) * (e.qty || 1) : o.cost);
  }, 0);
  return `
  <div class="slab">
    <div class="head"><span class="eyebrow">${esc(label)}</span><span class="rule"></span>
      <span class="quiet mono">${arr.length ? (k.qty ? total + " pts" : signed(total)) : "—"}</span></div>
    ${rows || `<p class="quiet" style="margin:0">Nothing yet.</p>`}
    <button class="btn sm ghost" data-add="${field}" style="margin-top:10px">${esc(k.add)}</button>
  </div>`;
}

function bindGear(root, m){
  root.querySelectorAll("[data-add]").forEach(b => b.onclick = () => openPicker(m, b.dataset.add));
  root.querySelectorAll("[data-drop]").forEach(b => b.onclick = () => {
    const [field, id] = b.dataset.drop.split("|");
    const k = GEAR_KIND[field];
    m[field] = k.qty ? m[field].filter(e => e.id !== id) : m[field].filter(e => (e.id || e) !== id);
    if(m.skins) delete m.skins[id];
    redraw();
  });
  root.querySelectorAll("[data-qty]").forEach(b => b.onclick = () => {
    const [field, id, d] = b.dataset.qty.split("|");
    const e = m[field].find(x => x.id === id); if(!e) return;
    e.qty = Math.max(1, (e.qty || 1) + +d);
    redraw();
  });
  root.querySelectorAll("[data-skin]").forEach(b => b.onclick = () => {
    const [field, id] = b.dataset.skin.split("|");
    askName(m, field, id);
  });
  root.querySelectorAll("[data-modoff]").forEach(b => b.onclick = () => {
    const [wid, mod] = b.dataset.modoff.split("|");
    const e = m.weapons.find(x => x.id === wid); if(!e) return;
    e.mods = (e.mods || []).filter(x => x !== mod);
    redraw();
  });
  root.querySelectorAll("[data-modadd]").forEach(sel => sel.onchange = () => {
    if(!sel.value) return;
    const e = m.weapons.find(x => x.id === sel.dataset.modadd); if(!e) return;
    e.mods = (e.mods || []).concat([sel.value]);
    redraw();
  });
}
