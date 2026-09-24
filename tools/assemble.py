"""Build ep2.html from its parts. One file out, because that is what an
Artifact and a Pages host both want."""
import json, os, sys

RS = sys.argv[1] if len(sys.argv) > 1 else "../sim/ruleset-0.10.5.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "../ep2.html"

rules = json.load(open(RS, encoding="utf-8"))
pretty = json.dumps(rules, indent=2, ensure_ascii=False)
assert "</script" not in pretty, "the ruleset contains </script and would end the block early"

parts = ["shell.html"]
scripts = ["core-rules.js", "app.js", "member.js", "pickers.js", "quest.js", "realm.js"]
scripts = [s for s in scripts if os.path.exists(s)]

BODY = '''
<body>
<header>
  <div class="masthead">
    <div class="sigil" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
           stroke-linecap="round" stroke-linejoin="round" width="19" height="19">
        <path d="M6 21V9a6 6 0 0 1 12 0v12"/><path d="M4 21h16"/><path d="M12 12v5"/><path d="M9.5 14.5h5"/>
      </svg>
    </div>
    <div class="brand">
      <h1>Epitaph</h1>
      <div class="sub" id="rsVer">loading</div>
    </div>
    <button class="iconbtn" id="btnTheme" aria-label="Light or dark">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="17" height="17">
        <circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/>
      </svg>
    </button>
  </div>
  <nav class="ways">
    <button class="way on" data-way="unburied">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6 21V9a6 6 0 0 1 12 0v12"/><path d="M4 21h16"/></svg>
      Your Unburied
    </button>
    <button class="way" data-way="realm">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z"/><path d="M9 4v13M15 7v13"/></svg>
      The Realm
    </button>
  </nav>
</header>

<main>
  <section id="viewUnburied">
    <div id="bandHead"></div>
    <div class="markers" id="roster" style="margin-top:16px"></div>
  </section>

  <section id="viewRealm" hidden>
    <div class="slab">
      <div class="head"><span class="eyebrow">The Realm</span><span class="rule"></span></div>
      <p class="lead">The shared table: a scenario, and whoever is running it.
         Not built yet \u2014 this is where the generator and the host will live.</p>
    </div>
  </section>
</main>

<div class="scrim" id="scrim"></div>
<div class="sheet" id="sheet" role="dialog" aria-modal="true"><div class="sheet-in" id="sheetIn"></div></div>
<div class="scrim two" id="scrim2"></div>
<div class="sheet two" id="sheet2" role="dialog" aria-modal="true"><div class="sheet-in" id="sheet2In"></div></div>
<div class="toast" id="toast" role="status"></div>
'''

out = ["<!doctype html>", "<html lang=\"en\">", "<head>", "<meta charset=\"utf-8\">",
       "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">",
       "<meta name=\"theme-color\" content=\"#0d0f12\">"]
for p in parts:
    out.append(open(p, encoding="utf-8").read())
out.append("</head>")
out.append(BODY)
out.append('<script type="application/json" id="rulesetJSON">\n' + pretty + '\n</script>')
out.append("<script>")
for sc in scripts:
    out.append("/* ---- " + sc + " ---- */")
    out.append(open(sc, encoding="utf-8").read())
out.append("""
/* light / dark is the viewer's choice and is remembered on this device */
(function(){
  const k="ep_theme";
  try{ const t=localStorage.getItem(k); if(t) document.documentElement.setAttribute("data-theme",t); }catch(e){}
  const b=document.getElementById("btnTheme");
  if(b) b.onclick=()=>{
    const cur=document.documentElement.getAttribute("data-theme");
    const next=cur==="dark"?"light":cur==="light"?"dark":
      (matchMedia("(prefers-color-scheme: dark)").matches?"light":"dark");
    document.documentElement.setAttribute("data-theme",next);
    try{ localStorage.setItem(k,next); }catch(e){}
  };
})();
boot();
""")
out.append("</script>")
out.append("</body></html>")

html = "\n".join(out)
open(OUT + ".tmp", "w", encoding="utf-8", newline="\n").write(html)
os.replace(OUT + ".tmp", OUT)
print("built %s  %d KB  (ruleset %s, %d script%s)" %
      (OUT, len(html.encode("utf-8"))//1024, rules["meta"]["version"], len(scripts), "" if len(scripts)==1 else "s"))
