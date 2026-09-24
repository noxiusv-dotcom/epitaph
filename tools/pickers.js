/* =====================================================================
   CHOOSING THINGS
   The picker lists whatever the ruleset holds for that kind, with its
   price and its own words. It also enforces the few limits the ruleset
   states outright: one suit of armour, so many flaws, uniques, squad-only.
   ===================================================================== */

let pickCtx = null;

function openPicker(m, field){
  const k = GEAR_KIND[field];
  pickCtx = {m, field, k, q: ""};
  drawPicker();
  $("#sheet2").classList.add("show");
  $("#scrim2").classList.add("show");
}
function closePicker(){
  $("#sheet2").classList.remove("show");
  $("#scrim2").classList.remove("show");
  pickCtx = null;
}

/* What the ruleset forbids, said plainly rather than silently ignored. */
function pickBlocked(m, field, o){
  const raw = (RS[field === "flaws" ? "flaws" : field] || {});
  if(field === "flaws"){
    const cap = ((RS.flaws || {}).refundCap || {});
    if(cap.maxFlaws !== undefined && (m.flaws || []).length >= cap.maxFlaws)
      return "Only " + cap.maxFlaws + " flaws on one model.";
    const taken = (m.flaws || []).reduce((s, id) => s + -((catOf("flaws")[id] || {}).cost || 0), 0);
    if(cap.maxRefund !== undefined && taken + -o.cost > cap.maxRefund)
      return "Flaws give back at most " + cap.maxRefund + " points; this would pass it.";
  }
  const src = (RS.traits || []).find(t => t.id === o.id);
  if(src){
    if(src.unique && (m.traits || []).includes(o.id)) return "Only one.";
    if(src.squadOnly && !isSquad(m)) return "Squads only — this one fields alone.";
    if(src.max && (m.traits || []).filter(x => x === o.id).length >= src.max)
      return "At most " + src.max + ".";
  }
  /* A weakness offsets a nature; it cannot simply be banked. */
  const vuln = ((RS.traitTags || {}).vulnerabilities) || [];
  if(vuln.includes(o.id)){
    const spendOn = ((RS.traitTags || {}).resistances || []).concat(["aura", "regenerate"]);
    const spent = (m.traits || []).reduce((s, id) => s + (spendOn.includes(id) ? (catOf("traits")[id] || {}).cost || 0 : 0), 0)
      + (m.weapons || []).reduce((s, w) => s + (w.mods || []).reduce((t, x) => t + ((CAT.mods[x] || {}).cost || 0), 0), 0);
    const already = (m.traits || []).reduce((s, id) => s + (vuln.includes(id) ? -((catOf("traits")[id] || {}).cost || 0) : 0), 0);
    if(already + -o.cost > spent)
      return "A weakness offsets a nature. Buy a resistance, an aura or a weapon effect first, or this gives nothing back.";
  }
  return null;
}

function drawPicker(){
  const {m, field, k, q} = pickCtx;
  const cat = catOf(k.cat);
  const chosen = new Set((m[field] || []).map(e => e.id || e));
  const all = Object.values(cat);
  const hay = o => (o.name + " " + (o.desc || "") + " " + (o.examples || []).join(" ")).toLowerCase();
  const list = q ? all.filter(o => hay(o).includes(q.toLowerCase())) : all;

  $("#sheet2In").innerHTML = `
    <div class="sheet-head">
      <button class="iconbtn" id="pkX" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" width="17" height="17"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <div class="eyebrow">${esc(k.add)}</div>
      <span class="chip">${list.length}</span>
    </div>
    <input class="input" id="pkQ" placeholder="Search" value="${esc(q)}" style="margin-bottom:12px">
    <div class="picks">
      ${list.map(o => {
        const on = chosen.has(o.id);
        const why = on ? null : pickBlocked(m, field, o);
        return `
        <button class="pick ${on ? "on" : ""} ${why ? "no" : ""}" data-pick="${esc(o.id)}" ${why ? "disabled" : ""}>
          <div class="pick-main">
            <div class="pick-name">${esc(o.name)}${on ? ` <span class="chip gilt">taken</span>` : ""}</div>
            <div class="pick-desc">${esc(o.desc)}</div>
            ${o.examples ? `<div class="pick-eg">e.g. ${esc(o.examples.slice(0, 4).join(", "))}</div>` : ""}
            ${why ? `<div class="pick-no">${esc(why)}</div>` : ""}
          </div>
          <div class="pick-cost mono ${o.cost < 0 ? "neg" : ""}">${k.qty ? o.cost + " pts" : signed(o.cost)}</div>
        </button>`;
      }).join("") || `<p class="quiet">Nothing matches that.</p>`}
    </div>`;

  $("#pkX").onclick = closePicker;
  const qi = $("#pkQ");
  qi.oninput = e => { pickCtx.q = e.target.value; drawPicker(); $("#pkQ").focus(); };
  $("#sheet2In").querySelectorAll("[data-pick]").forEach(btn => btn.onclick = () => {
    const id = btn.dataset.pick, o = cat[id];
    const arr = m[field] = m[field] || [];
    if(k.qty){
      const e = arr.find(x => x.id === id);
      if(e) e.qty = (e.qty || 1) + 1;
      else arr.push({id, qty: 1, mods: []});
      toast(o.name + " taken");
    } else if(chosen.has(id)){
      m[field] = arr.filter(x => (x.id || x) !== id);
      if(m.skins) delete m.skins[id];
      toast(o.name + " dropped");
    } else {
      if(k.single){ arr.length = 0; if(m.skins) m.skins = {}; }
      arr.push(id);
      toast(o.name + " taken");
    }
    redraw(); drawPicker();
  });
}

/* ---- calling a thing by your own name for it ---- */
function askName(m, field, id){
  const cat = catOf(GEAR_KIND[field].cat), o = cat[id]; if(!o) return;
  const cur = (m.skins && m.skins[id]) || "";
  $("#sheet2In").innerHTML = `
    <div class="sheet-head">
      <button class="iconbtn" id="skX" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" width="17" height="17"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <div class="eyebrow">Call it something else</div>
    </div>
    <p class="lead">This changes the name on this model only. The stats and the cost stay
      exactly as they are.${o.examples ? " For instance: " + esc(o.examples.join(", ")) + "." : ""}</p>
    <div class="field" style="margin:14px 0"><label>${esc(o.name)}</label>
      <input class="input" id="skV" value="${esc(cur)}" placeholder="${esc(o.name)}" maxlength="40"></div>
    <div class="sheet-actions">
      <button class="btn ghost" id="skClear">Use the standard name</button>
      <button class="btn primary" id="skGo">Rename</button>
    </div>`;
  $("#sheet2").classList.add("show"); $("#scrim2").classList.add("show");
  const done = v => {
    m.skins = m.skins || {};
    if(v && v !== o.name) m.skins[id] = v.slice(0, 40); else delete m.skins[id];
    closePicker(); redraw();
  };
  $("#skX").onclick = closePicker;
  $("#skClear").onclick = () => done("");
  $("#skGo").onclick = () => done($("#skV").value.trim());
  $("#skV").onkeydown = e => { if(e.key === "Enter") done($("#skV").value.trim()); };
  setTimeout(() => { const i = $("#skV"); if(i){ i.focus(); i.select(); } }, 60);
}

/* ---- more than one band, because a person may keep several ---- */
function openBands(){
  const rows = store.bands.map(b => `
    <div class="grow">
      <button class="grow-main" data-band="${b.id}" style="text-align:left;background:none;border:0;color:inherit;font:inherit;cursor:pointer">
        <div class="grow-name">${esc(b.name)}${b.id === store.activeId ? ` <span class="chip gilt">open</span>` : ""}</div>
        <div class="grow-sub">${b.members.length} raised · ${bandSpent(b)} of ${b.budget} points fielded</div>
      </button>
      <div class="grow-r">
        <button class="tiny" data-bcopy="${b.id}" title="Copy">⧉</button>
        ${store.bands.length > 1 ? `<button class="tiny" data-bdel="${b.id}" aria-label="Delete">×</button>` : ""}
      </div>
    </div>`).join("");
  $("#sheet2In").innerHTML = `
    <div class="sheet-head">
      <button class="iconbtn" id="bX" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" width="17" height="17"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <div class="eyebrow">Your bands</div>
    </div>
    ${rows}
    <button class="btn sm ghost" id="bNew" style="margin-top:12px">Begin another band</button>`;
  $("#sheet2").classList.add("show"); $("#scrim2").classList.add("show");
  $("#bX").onclick = closePicker;
  $("#sheet2In").querySelectorAll("[data-band]").forEach(b => b.onclick = () => {
    store.activeId = b.dataset.band; closePicker(); render();
  });
  $("#sheet2In").querySelectorAll("[data-bcopy]").forEach(b => b.onclick = () => {
    const src = store.bands.find(x => x.id === b.dataset.bcopy);
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = uid(); copy.name = src.name + " (again)";
    copy.members.forEach(m => m.id = uid());
    store.bands.push(copy); save(); openBands(); toast("Copied");
  });
  $("#sheet2In").querySelectorAll("[data-bdel]").forEach(b => b.onclick = () => {
    store.bands = store.bands.filter(x => x.id !== b.dataset.bdel);
    if(!store.bands.some(x => x.id === store.activeId)) store.activeId = store.bands[0].id;
    save(); openBands(); render(); toast("Band removed");
  });
  $("#bNew").onclick = () => {
    const b = newBand("The Unburied");
    store.bands.push(b); store.activeId = b.id;
    closePicker(); render(); toast("A new band");
  };
}
