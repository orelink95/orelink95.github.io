// admin_tools/potion-maker.js — the potion maker (admin_tools/potion-maker.html), DM only
//
// Distill from a seed or pick a recipe, dress the bottle, keep it on a shelf
// (this browser only), and read everything about it: effect, reactions, value,
// craft DC, the brew mark players get at an alchemist's Workbench.
// Everything about potions themselves (rules, naming, drawing) lives in
// scripts/alchemy-engine.js. A potion becomes a Vault card in the dashboard
// (an item's “Brew a potion”, or “Import a recipe” with a file saved here).
//
// Players meet potions only on POI pages: in shops (bottle, name, price) and
// at an alchemist's Workbench (craft DC, tool, price): scripts/market.js.

document.addEventListener("DOMContentLoaded", async () => {
  "use strict";

  const A = window.Alchemy;
  const esc = A.esc;
  const $ = (id) => document.getElementById(id);

  const SHELF_STORAGE_KEY = "athenaeum_apothecary_shelf_v1";
  const DEFAULT_SEED = "ATHENAEUM-01";

  let DB = null;
  let currentPotion = null;

  // --- 1. SMALL UTILITIES --------------------------------------------------
  // The toast is fixed to the screen: out of <body>, whose filter would pin it
  // to the page instead (see liftOutOfBody, general-scripts.js).
  liftOutOfBody($("toast"));
  let toastTimer = 0;
  function toast(message, isError = false) {
    const el = $("toast");
    el.textContent = message;
    el.classList.toggle("alch-toast--error", isError);
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), isError ? 5200 : 2600);
  }

  function flashButton(btn, text) {
    if (!btn) return;
    const target = btn.querySelector("[data-flash]") || btn;
    const original = target.dataset.label || target.textContent;
    target.dataset.label = original;
    target.textContent = text;
    setTimeout(() => { target.textContent = original; }, 1400);
  }

  // localStorage can be full, disabled or unavailable (private windows):
  // reads fall back, writes report failure instead of throwing mid-action.
  function storageRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function storageWrite(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      toast("Could not save: this browser's storage is full or disabled.", true);
      return false;
    }
  }

  function downloadFile(filename, content, mimeType) {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking straight away can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const fileSlug = (text, fallback) =>
    String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || fallback;

  const newUid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  // --- 2. BOTTLE CONTROLS <-> SETTINGS OBJECT ------------------------------
  let fillOverrideActive = false;

  function readStudio() {
    return A.normaliseStudio({
      showSeal: $("toggle-seal").checked,
      showLabel: $("toggle-label").checked,
      wax: $("cust-wax").value,
      stamp: $("cust-stamp").value,
      neck: $("cust-neck").value,
      vellum: $("cust-vellum").value,
      glass: $("cust-glass").value,
      stopper: $("cust-stopper").value,
      texture: $("cust-texture").value,
      fillOverrideActive,
      fillValue: $("cust-fill").value,
      colorEnable: $("cust-color-enable").checked,
      col1: $("cust-col-primary").value,
      col2: $("cust-col-secondary").value,
      labelText: $("cust-label-text").value,
      labelSub: $("cust-label-sub").value
    });
  }

  function writeStudio(raw) {
    const s = A.normaliseStudio(raw);
    $("toggle-seal").checked = s.showSeal;
    $("toggle-label").checked = s.showLabel;
    $("cust-wax").value = s.wax;
    $("cust-stamp").value = s.stamp;
    $("cust-neck").value = s.neck;
    $("cust-vellum").value = s.vellum;
    $("cust-glass").value = s.glass;
    $("cust-stopper").value = s.stopper;
    $("cust-texture").value = s.texture;
    fillOverrideActive = s.fillOverrideActive;
    $("cust-color-enable").checked = s.colorEnable;
    $("cust-col-primary").value = s.col1;
    $("cust-col-secondary").value = s.col2;
    $("cust-label-text").value = s.labelText;
    $("cust-label-sub").value = s.labelSub;
    syncAutoControls(s.fillValue);
  }

  // Controls left on "auto" mirror what the current potion resolves to.
  function syncAutoControls(explicitFill) {
    const slider = $("cust-fill");
    if (fillOverrideActive) {
      if (explicitFill !== undefined) slider.value = explicitFill;
      $("fill-readout").textContent = `${slider.value}%`;
    } else {
      $("fill-readout").textContent = "Auto";
      if (currentPotion) slider.value = Math.round(currentPotion.baseFill * 100);
    }
    if (currentPotion && !$("cust-color-enable").checked) {
      $("cust-col-primary").value = currentPotion.active.color;
      $("cust-col-secondary").value = currentPotion.catalyst.color;
    }
  }

  // --- 3. RECIPE CONTROLS --------------------------------------------------
  function readRecipe() {
    return {
      vessel: $("sel-vessel").value,
      solvent: $("sel-solvent").value,
      active: $("sel-active").value,
      catalyst: $("sel-catalyst").value
    };
  }

  function writeRecipe(recipe) {
    $("sel-vessel").value = recipe.vessel;
    $("sel-solvent").value = recipe.solvent;
    $("sel-active").value = recipe.active;
    $("sel-catalyst").value = recipe.catalyst;
  }

  function populateSelect(selectId, items) {
    $(selectId).innerHTML = items.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
  }

  function showPotion(potion) {
    currentPotion = potion;
    syncAutoControls();
    renderBottle();
    renderDetails();
  }

  function brewFromSeed(seedStr) {
    const recipe = A.recipeFromSeed(DB, seedStr);
    writeRecipe(recipe);
    showPotion(A.brew(DB, recipe, seedStr));
  }

  // A hand-picked recipe is its own seed.
  function brewFromSelections() {
    const potion = A.brew(DB, readRecipe());
    if (!potion) return;
    $("seed-input").value = "";
    showPotion(potion);
  }

  // --- 4. BOTTLE & RECORD --------------------------------------------------
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function renderBottle() {
    if (!currentPotion) return;
    const studio = readStudio();
    const resolved = A.resolveStudio(currentPotion, studio);
    $("potion-stage").innerHTML = A.renderSVG(currentPotion, studio, {
      uid: "main",
      title: currentPotion.title,
      animate: !reducedMotion.matches
    });
    $("potion-stage").firstElementChild.id = "potion-svg";
    // the alcove glows with the liquid's colour
    $("specimen-alcove").style.setProperty("--alch-glow", resolved.col1);
  }

  const KIND = {
    boon: { label: "Synergy", icon: "auto_awesome" },
    bane: { label: "Adverse reaction", icon: "warning" },
    quirk: { label: "Oddity", icon: "help" }
  };

  // The potion's record: what players could learn of it (name, look, flavour,
  // the reagents' lore), then the DM's ledger (rules, value, DC, brew mark).
  function renderDetails() {
    const p = currentPotion;
    if (!p) return;
    const tagInfo = (id) => DB.reagents.tags.find((t) => t.id === id);
    const uniqueTags = [...new Set(p.tags)].map((t) => {
      const info = tagInfo(t);
      const glyph = info && info.glyph ? `<span class="alch-glyph" aria-hidden="true">${esc(info.glyph)}</span>` : "";
      return `<span class="alch-tag" title="${esc(info ? info.description : "")}">${glyph}${esc(info ? info.name : t)}</span>`;
    }).join("");
    const texture = A.resolveStudio(p, readStudio()).texture;
    const reagent = (glyph, role, item, sub) => `
        <div class="alch-reagent">
          <span class="alch-reagent__role"><span class="alch-glyph" aria-hidden="true">${glyph}</span> ${role}</span>
          <span class="alch-reagent__name">${esc(item.name)}</span>
          <span class="alch-reagent__sub">${esc(sub)}</span>
          ${item.lore ? `<span class="alch-reagent__lore">${esc(item.lore)}</span>` : ""}
        </div>`;

    $("output-panel").innerHTML = `
      <header class="alch-folio__head">
        <p class="alch-folio__meta">
          <span class="alch-rarity alch-rarity--${esc(p.rarity)}">Potion, ${esc(A.rarityLabel(p.rarity))}</span>
          <span>Index ${esc(p.active.code)}</span>
          <span>${esc(p.form)}</span>
          <span>${esc(p.vessel.slots)} ${p.vessel.slots === 1 ? "slot" : "slots"}</span>
        </p>
        <div class="alch-folio__title-row">
          <h2 id="folio-title" class="alch-folio__title" contenteditable="true" spellcheck="false" role="textbox" aria-label="Potion name" title="Click to rename">${esc(p.title)}</h2>
          <button type="button" id="btn-edit-title" class="alch-btn alch-btn--icon" title="Rename" aria-label="Rename the potion">
            <span class="material-symbols-outlined" aria-hidden="true">edit</span>
          </button>
        </div>
        <div class="alch-tags">${uniqueTags}</div>
      </header>

      <p class="alch-quote">${A.sensoryHTML(p, texture)}</p>
      ${p.oddity ? `<p class="alch-oddity"><span class="material-symbols-outlined" aria-hidden="true">visibility</span>${esc(p.oddity)}</p>` : ""}

      <h3 class="alch-rubric">Tria Prima</h3>
      <div class="alch-reagents">
        ${reagent("☿", "Menstruum · the solvent", p.solvent, `${p.solvent.viscosity}, keeps ${p.solvent.shelfLife}`)}
        ${reagent("🜍", "Nigredo · the active principle", p.active, p.active.biome)}
        ${reagent("🜔", "Fixative · the catalyst", p.catalyst, `${A.rarityLabel(p.catalyst.rarity)} grade`)}
      </div>

      <section class="alch-ledger" aria-label="DM ledger">
        <h3 class="alch-rubric">Virtues · DM only</h3>
        <dl class="alch-effects">
          <div><dt>Use</dt><dd>${esc(p.use)}</dd></div>
          <div><dt>Effect · ${esc(p.active.name)}</dt><dd>${esc(p.active.effect || "No effect written yet (dashboard → Active principles).")}</dd></div>
          <div><dt>Catalyst · ${esc(p.catalyst.name)}</dt><dd>${esc(p.catalyst.modifier || "No change written yet (dashboard → Catalysts).")}</dd></div>
        </dl>

        <h3 class="alch-rubric">Reactions</h3>
        <ul class="alch-reactions">${p.reactions.length
          ? p.reactions.map((r) => `
            <li class="alch-reaction alch-reaction--${r.kind}">
              <span class="material-symbols-outlined" aria-hidden="true">${KIND[r.kind].icon}</span>
              <span><strong>${esc(r.name)}</strong> <span class="alch-reaction__kind">${KIND[r.kind].label} · ${r.tags.map((t) => esc((tagInfo(t) || { name: t }).name)).join(" + ")}</span><br>${esc(r.effect || "No effect written yet.")}</span>
            </li>`).join("")
          : `<li class="alch-reaction">
              <span class="material-symbols-outlined" aria-hidden="true">verified</span>
              <span><strong>${p.stabilized ? "Stabilized" : "Stable"}</strong><br>${p.stabilized ? "The catalyst keeps the reagents from reacting." : "The reagents don't react with one another."}</span>
            </li>`}</ul>

        <div class="alch-appraisal">
          <div class="alch-stat"><span class="alch-label">Market value</span><span class="alch-stat__value">${esc(p.gpValue.toLocaleString("en"))} gp</span><span class="alch-stat__note">brewed at a bench: ${esc(A.brewCost(p).toLocaleString("en"))} gp</span></div>
          <div class="alch-stat"><span class="alch-label">Craft DC</span><span class="alch-stat__value">${esc(p.brewDC)}</span><span class="alch-stat__note">${esc(p.kit)}</span></div>
          <div class="alch-stat"><span class="alch-label">Brew mark</span><span class="alch-stat__value">${esc(A.brewMark(A.recipeOf(p)))}</span><span class="alch-stat__note">what a Workbench shows</span></div>
        </div>
      </section>

      <div class="alch-actions">
        <button type="button" id="btn-save-shelf" class="alch-btn alch-btn--gold">
          <span class="material-symbols-outlined" aria-hidden="true">bookmark_add</span><span data-flash>Save to shelf</span>
        </button>
        <button type="button" id="btn-copy-md" class="alch-btn">
          <span class="material-symbols-outlined" aria-hidden="true">content_copy</span><span data-flash>Copy as Markdown</span>
        </button>
        <button type="button" id="btn-save-recipe" class="alch-btn" title="A small file the dashboard turns into a Vault card (an item's “Import a recipe”)">
          <span class="material-symbols-outlined" aria-hidden="true">description</span><span data-flash>Save recipe</span>
        </button>
        <button type="button" id="btn-dl-svg" class="alch-btn">
          <span class="material-symbols-outlined" aria-hidden="true">download</span><span data-flash>Bottle as SVG</span>
        </button>
      </div>
    `;

    const titleEl = $("folio-title");
    titleEl.addEventListener("input", () => {
      currentPotion.title = titleEl.textContent.replace(/\s+/g, " ").trim();
    });
    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        titleEl.blur();
      }
    });
    // Paste as plain text only (no markup inside the heading).
    titleEl.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData?.getData("text/plain") || "").replace(/\s+/g, " ");
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      sel.deleteFromDocument();
      sel.getRangeAt(0).insertNode(document.createTextNode(text));
      sel.collapseToEnd();
      titleEl.dispatchEvent(new Event("input"));
    });
    // An emptied title falls back to the generated name, and the bottle's
    // accessible name follows the rename.
    titleEl.addEventListener("blur", () => {
      if (!currentPotion.title) {
        currentPotion.title = A.brew(DB, A.recipeOf(currentPotion), currentPotion.seed).title;
        titleEl.textContent = currentPotion.title;
      }
      renderBottle();
    });

    $("btn-edit-title").addEventListener("click", () => {
      titleEl.focus();
      const range = document.createRange();
      range.selectNodeContents(titleEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    $("btn-save-shelf").addEventListener("click", saveCurrentToShelf);
    $("btn-save-recipe").addEventListener("click", saveRecipe);
    $("btn-copy-md").addEventListener("click", copyMarkdown);
    $("btn-dl-svg").addEventListener("click", downloadSVG);
  }

  // --- 5. THE SHELF (localStorage + JSON backup) ---------------------------
  // A shelf entry stores the recipe, seed and bottle settings, never markup:
  // thumbnails are redrawn from that, so they cannot go stale and an imported
  // file cannot smuggle HTML into the page.
  function cleanShelfEntry(item, fallbackUid) {
    if (!item || typeof item !== "object" || !item.recipe || typeof item.recipe !== "object") return null;
    const recipe = {};
    for (const key of ["vessel", "solvent", "active", "catalyst"]) {
      if (typeof item.recipe[key] !== "string" || !item.recipe[key]) return null;
      recipe[key] = item.recipe[key].slice(0, 120);
    }
    const title = typeof item.title === "string" ? item.title.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    if (!title) return null;
    const uid = typeof item.uid === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(item.uid) ? item.uid : fallbackUid;
    return {
      uid,
      title,
      code: typeof item.code === "string" ? item.code.slice(0, 12) : "",
      seed: typeof item.seed === "string" && item.seed ? item.seed.slice(0, 400) : A.recipeSeed(recipe),
      recipe,
      studio: A.normaliseStudio(item.studio)
    };
  }

  function getShelfItems() {
    const raw = storageRead(SHELF_STORAGE_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw.map((item) => cleanShelfEntry(item, newUid())).filter(Boolean);
  }

  function setShelfItems(items) {
    const ok = storageWrite(SHELF_STORAGE_KEY, items);
    renderShelf();
    return ok;
  }

  function saveCurrentToShelf() {
    const p = currentPotion;
    const entry = {
      uid: newUid(),
      title: (p.title || "").trim() || "Unnamed Draught",
      code: p.active.code,
      seed: p.seed,
      recipe: A.recipeOf(p),
      studio: readStudio()
    };
    if (setShelfItems([entry, ...getShelfItems()])) flashButton($("btn-save-shelf"), "Shelved");
  }

  function loadEntry(item) {
    // Same seed as when it was shelved, so fill level, label glyphs and
    // auto-styling come back exactly as saved.
    const potion = A.brew(DB, item.recipe, item.seed);
    if (!potion) {
      const { missing } = A.resolveRecipe(DB, item.recipe);
      toast(`Cannot load “${item.title}”: unknown ${missing.join(", ")}.`, true);
      return false;
    }
    potion.title = item.title;
    writeRecipe(item.recipe);
    $("seed-input").value = item.seed === A.recipeSeed(item.recipe) ? "" : item.seed;
    currentPotion = potion;
    writeStudio(item.studio);
    showPotion(potion);
    $("specimen-alcove").scrollIntoView({ behavior: "smooth", block: "nearest" });
    return true;
  }

  function loadFromShelf(uid) {
    const item = getShelfItems().find((i) => i.uid === uid);
    if (item) loadEntry(item);
  }

  function renderShelf() {
    const grid = $("potion-shelf-grid");
    const items = getShelfItems();
    $("shelf-count").textContent = `${items.length} ${items.length === 1 ? "specimen" : "specimens"}`;

    if (items.length === 0) {
      grid.innerHTML = `<p class="alch-empty">The shelf is bare. Distill a potion above, then choose <strong>Save to shelf</strong>.</p>`;
      return;
    }

    grid.innerHTML = items.map((item) => {
      const potion = A.brew(DB, item.recipe, item.seed);
      const thumb = potion
        ? A.renderSVG(potion, item.studio, { uid: `shelf-${item.uid}`, width: 96, height: 125 })
        : `<span class="alch-specimen__missing material-symbols-outlined" title="${esc(A.resolveRecipe(DB, item.recipe).missing.join(", "))}">help</span>`;
      const hint = potion ? `Load ${item.title}` : `${item.title}: a reagent is missing from the archive`;
      return `
        <div class="alch-specimen${potion ? "" : " is-missing"}" data-uid="${esc(item.uid)}" role="button" tabindex="0" aria-label="${esc(hint)}" title="${esc(hint)}">
          <button type="button" class="alch-specimen__delete" data-del="${esc(item.uid)}" title="Remove from the shelf" aria-label="Remove ${esc(item.title)} from the shelf">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
          <div class="alch-specimen__thumb">${thumb}</div>
          <div class="alch-specimen__title">${esc(item.title)}</div>
          <div class="alch-specimen__meta">${esc(item.code)}</div>
        </div>
      `;
    }).join("");
  }

  function wireShelf() {
    const grid = $("potion-shelf-grid");
    // One delegated listener instead of re-binding every card on each render.
    grid.addEventListener("click", (e) => {
      const del = e.target.closest("[data-del]");
      if (del) {
        setShelfItems(getShelfItems().filter((i) => i.uid !== del.dataset.del));
        return;
      }
      const card = e.target.closest(".alch-specimen");
      if (card) loadFromShelf(card.dataset.uid);
    });
    grid.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("alch-specimen")) {
        e.preventDefault();
        loadFromShelf(e.target.dataset.uid);
      }
    });

    $("btn-export-shelf").addEventListener("click", exportShelfJSON);
    const fileInput = $("shelf-file-input");
    $("btn-import-shelf").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      importShelfJSON(e.target.files[0]);
      e.target.value = "";
    });
    $("btn-clear-shelf").addEventListener("click", () => {
      const count = getShelfItems().length;
      if (!count) return;
      if (!window.confirm(`Remove all ${count} specimens from the shelf? This cannot be undone.`)) return;
      setShelfItems([]);
    });
  }

  function exportShelfJSON() {
    const payload = {
      schema: "athenaeum-apothecary-shelf-v2",
      exportedAt: new Date().toISOString(),
      specimens: getShelfItems()
    };
    downloadFile(`apothecary-shelf-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), "application/json");
  }

  // Takes a shelf export (several potions) or a single saved recipe.
  function importShelfJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => toast("Import failed: the file could not be read.", true);
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const incoming = Array.isArray(parsed) ? parsed
          : parsed && Array.isArray(parsed.specimens) ? parsed.specimens
          : parsed && parsed.recipe ? [parsed]
          : null;
        if (!incoming) throw new Error("the file holds neither a shelf nor a recipe.");

        const existing = getShelfItems();
        const usedIds = new Set(existing.map((x) => x.uid));
        const added = [];
        for (const raw of incoming) {
          const entry = cleanShelfEntry(raw, newUid());
          if (!entry) continue;
          while (usedIds.has(entry.uid)) entry.uid = newUid();
          usedIds.add(entry.uid);
          if (!entry.code) {
            const active = DB.reagents.actives.find((a) => a.id === entry.recipe.active);
            entry.code = active ? active.code : "";
          }
          added.push(entry);
        }
        if (!added.length) throw new Error("no valid potion found in it.");

        if (!setShelfItems([...added, ...existing])) return;
        const unknown = added.filter((entry) => !A.brew(DB, entry.recipe, entry.seed)).length;
        toast(unknown
          ? `Imported ${added.length} ${added.length === 1 ? "specimen" : "specimens"}; ${unknown} use reagents missing from the archive.`
          : `Imported ${added.length} ${added.length === 1 ? "specimen" : "specimens"}.`, unknown > 0);
      } catch (err) {
        toast(`Import failed: ${err.message}`, true);
      }
    };
    reader.readAsText(file);
  }

  // --- 6. FILES ------------------------------------------------------------
  // The recipe file: the four ids, the seed and the look of the bottle. The
  // dashboard's “Import a recipe” (on an item) turns it into a Vault card.
  function saveRecipe() {
    const p = currentPotion;
    const payload = { schema: "athenaeum-potion-v1", title: p.title, ...A.potionRecord(p, readStudio()) };
    downloadFile(`${fileSlug(p.title, "potion")}.potion.json`, JSON.stringify(payload, null, 2) + "\n", "application/json");
    flashButton($("btn-save-recipe"), "Saved");
  }

  async function copyMarkdown() {
    let ok = false;
    try { await navigator.clipboard.writeText(A.toMarkdown(currentPotion)); ok = true; } catch (e) { ok = false; }
    if (ok) flashButton($("btn-copy-md"), "Copied");
    else toast("Copy failed: the browser blocked the clipboard.", true);
  }

  function downloadSVG() {
    // A standalone file gets its own ids and the XML header; note that the
    // label fonts are not embedded, so viewers without them use a fallback.
    const svg = A.renderSVG(currentPotion, readStudio(), { uid: "export", title: currentPotion.title });
    downloadFile(`${fileSlug(currentPotion.title, "potion")}.svg`, `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`, "image/svg+xml");
  }

  // --- 7. WIRING -----------------------------------------------------------
  function wireTabs() {
    const tabs = [
      { btn: "tab-workbench", panel: "panel-workbench" },
      { btn: "tab-studio", panel: "panel-studio" }
    ];
    const select = (chosen) => {
      tabs.forEach((t) => {
        const on = t === chosen;
        $(t.btn).classList.toggle("is-active", on);
        $(t.btn).setAttribute("aria-selected", String(on));
        $(t.panel).classList.toggle("hidden", !on);
      });
    };
    tabs.forEach((t) => $(t.btn).addEventListener("click", () => select(t)));
  }

  function wireSeedControls() {
    const seedInput = $("seed-input");
    const distill = () => {
      const seed = seedInput.value.trim() || DEFAULT_SEED;
      seedInput.value = seed;
      brewFromSeed(seed);
    };
    // "Distill" brews exactly what is typed; the die rolls a new seed.
    $("btn-roll").addEventListener("click", distill);
    $("btn-random").addEventListener("click", () => {
      seedInput.value = Math.random().toString(36).substring(2, 8).toUpperCase().padEnd(6, "0");
      distill();
    });
    seedInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        distill();
      }
    });
  }

  function wireStudio() {
    const redrawOnly = [
      "toggle-seal", "toggle-label", "cust-wax", "cust-stamp", "cust-neck", "cust-vellum",
      "cust-glass", "cust-stopper", "cust-col-primary", "cust-col-secondary", "cust-label-text", "cust-label-sub"
    ];
    redrawOnly.forEach((id) => $(id).addEventListener("input", renderBottle));

    // The liquid is described in the record, so it refreshes too.
    $("cust-texture").addEventListener("input", () => { renderBottle(); renderDetails(); });

    $("cust-color-enable").addEventListener("input", () => { syncAutoControls(); renderBottle(); });
    // Picking a colour by hand implies wanting it used.
    ["cust-col-primary", "cust-col-secondary"].forEach((id) => {
      $(id).addEventListener("input", () => {
        if (!$("cust-color-enable").checked) {
          $("cust-color-enable").checked = true;
          renderBottle();
        }
      });
    });

    $("cust-fill").addEventListener("input", () => {
      fillOverrideActive = true;
      syncAutoControls();
      renderBottle();
    });

    $("btn-reset-studio").addEventListener("click", () => {
      writeStudio(A.DEFAULT_STUDIO);
      renderBottle();
      renderDetails();
    });
  }

  // --- 8. START ------------------------------------------------------------
  try {
    const store = await Athenaeum.ready;
    DB = A.dbFromStore(store);
    if (!DB.vessels.length) throw new Error("data/vessels.json holds no usable vessel.");
    for (const [kind, file] of [["solvents", "solvents"], ["actives", "principles"], ["catalysts", "catalysts"]]) {
      if (!DB.reagents[kind].length) throw new Error(`data/${file}.json holds no usable reagent.`);
    }

    populateSelect("sel-vessel", DB.vessels);
    populateSelect("sel-solvent", DB.reagents.solvents);
    populateSelect("sel-active", DB.reagents.actives);
    populateSelect("sel-catalyst", DB.reagents.catalysts);
    ["sel-vessel", "sel-solvent", "sel-active", "sel-catalyst"].forEach((id) => {
      $(id).addEventListener("change", brewFromSelections);
    });

    wireTabs();
    wireSeedControls();
    wireStudio();
    wireShelf();
    reducedMotion.addEventListener("change", renderBottle);

    $("seed-input").value = DEFAULT_SEED;
    brewFromSeed(DEFAULT_SEED);
    renderShelf();
  } catch (err) {
    $("output-panel").innerHTML =
      `<p class="alch-reaction alch-reaction--clash"><span class="material-symbols-outlined" aria-hidden="true">warning</span><span><strong>The archives would not open.</strong> ${esc(err.message)}</span></p>`;
    console.error(err);
  }
});
