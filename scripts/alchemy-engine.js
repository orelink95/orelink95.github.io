/* ==========================================================================
   ALCHEMY ENGINE — pure potion logic and bottle drawing.
   No DOM access and no storage: everything here takes plain data and returns
   plain data or an SVG string, so the page, the shelf thumbnails and (later)
   the dashboard and Vault cards can all draw the same potion from its recipe.

   Exposed as window.Alchemy.
   ========================================================================== */
(function (root) {
  "use strict";

  // --- 1. SEEDED PRNG (Mulberry32 + FNV-1a hash) ---------------------------
  function hashSeed(str) {
    str = String(str);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function createRNG(seedStr) {
    let a = hashSeed(seedStr);
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

  // FNV-1a alone barely moves its high bits when only the tail of the string
  // changes, so comparing raw hashes would favour whichever id sorts a certain
  // way. This finaliser (murmur3's) spreads every input bit over the result.
  function mix32(h) {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85EBCA6B);
    h ^= h >>> 13;
    h = Math.imul(h, 0xC2B2AE35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  // Seeded choice that stays stable when the list grows: every item gets a
  // score from (seed, slot, its own id) and the highest wins. Adding a reagent
  // only changes the potions where the newcomer wins, instead of reshuffling
  // what every existing seed produces (which index-based picking does).
  function seededChoice(items, seedStr, slot) {
    let best = null;
    let bestScore = -1;
    for (const item of items) {
      const score = mix32(hashSeed(`${seedStr}|${slot}|${item.id}`));
      if (score > bestScore || (score === bestScore && best && item.id < best.id)) {
        best = item;
        bestScore = score;
      }
    }
    return best;
  }

  // --- 2. TEXT & VALUE SAFETY ----------------------------------------------
  function esc(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  // Only #rgb / #rrggbb survive; anything else falls back. Colours end up in
  // SVG attributes and inline styles, so they are never trusted as typed.
  function safeColor(value, fallback) {
    const v = String(value ?? "").trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) return ("#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
    return fallback;
  }

  // Outlines use absolute M, L, H, V, C, Q and Z only (what the engine can measure).
  const isPathData = (d) => typeof d === "string" && d.length > 0 && /^[MLCQHVZ0-9eE\s.,+-]+$/.test(d);
  const str = (v, fallback, max = 400) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);
  const num = (v, fallback) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : fallback);
  const lastWord = (s) => s.split(" ").slice(-1)[0];

  // --- 3. PALETTES & OPTION LISTS ------------------------------------------
  const WAX_PALETTES = {
    crimson:   { name: "Crimson Sealing Wax", fill: "#8b2635", stroke: "#4a1019", stamp: "#d96b7a" },
    verdigris: { name: "Verdigris Copper",    fill: "#1f5c52", stroke: "#0f332d", stamp: "#66c2b2" },
    gold:      { name: "Imperial Gold",       fill: "#b7882e", stroke: "#5c410f", stamp: "#f7dc6f" },
    obsidian:  { name: "Obsidian Pitch",      fill: "#1e2226", stroke: "#0b0d0f", stamp: "#85929e" },
    violet:    { name: "Arcane Violet",       fill: "#4a235a", stroke: "#240f2e", stamp: "#c39bd3" },
    cobalt:    { name: "Sapphire Cobalt",     fill: "#1f4e78", stroke: "#0e263d", stamp: "#7fb3d5" },
    ivory:     { name: "Bone Ivory",          fill: "#d5cbb8", stroke: "#7a705e", stamp: "#5c5242" },
    copper:    { name: "Burnished Bronze",    fill: "#935116", stroke: "#4a2709", stamp: "#f0b27a" }
  };

  const VELLUM_PALETTES = {
    aged:     { name: "Aged Ochre Vellum",        c1: "#ebe0c9", c2: "#cbb894", border: "#8c7355", ink: "#2b1d0e", sub: "#4a3520" },
    bleached: { name: "Bleached Ivory Parchment", c1: "#f9f6f0", c2: "#e3dccf", border: "#a39887", ink: "#1c1915", sub: "#524a3e" },
    charred:  { name: "Soot-Charred Rag",         c1: "#3a3532", c2: "#221f1d", border: "#6e552c", ink: "#e5be77", sub: "#b89f72" },
    blood:    { name: "Crimson-Stained Hide",     c1: "#d9b8b0", c2: "#9e6b62", border: "#5e241d", ink: "#2b0906", sub: "#4a1510" },
    mold:     { name: "Damp Verdigris Vellum",    c1: "#c5d6cc", c2: "#8aa899", border: "#3b5e4f", ink: "#11261d", sub: "#264739" },
    midnight: { name: "Midnight Velour",          c1: "#1f2430", c2: "#12151c", border: "#85929e", ink: "#d6eaf8", sub: "#85c1e9" }
  };

  const GLASS_TINTS = {
    clear:  { stroke: "#cfd8dc", fill: "none",    fillOp: "0" },
    smoked: { stroke: "#7f8c8d", fill: "#11171a", fillOp: "0.28" },
    green:  { stroke: "#76d7c4", fill: "#1abc9c", fillOp: "0.14" },
    amber:  { stroke: "#f5b041", fill: "#d68910", fillOp: "0.16" },
    cobalt: { stroke: "#5dade2", fill: "#1b4f72", fillOp: "0.22" }
  };

  const STAMPS = ["triquetra", "skull", "eye", "sun", "serpent", "none"];
  const NECKS = ["twine", "chain", "strap", "talisman", "tag", "none"];
  const STOPPERS = ["cork", "crystal", "brass", "skull"];
  const TEXTURES = ["gradient", "layered", "suspended", "marbled", "voltaic", "rainbow", "astral"];
  const RARITIES = ["common", "uncommon", "rare", "very-rare"];
  const FILL_MIN = 20;
  const FILL_MAX = 92;

  const ALCHEMICAL_GLYPHS = ["🜁", "🜂", "🜃", "🜄", "☿", "🜍", "🜔", "🜚", "☽", "☉", "♂", "♀", "♃", "♄"];
  // Alchemical symbols live in a Unicode block most system fonts lack; the
  // page loads Noto Sans Symbols for them, hence the explicit stacks below.
  const FONT_DISPLAY = "'Noto Serif', Georgia, serif";
  const FONT_MONO = "Manrope, 'Segoe UI', sans-serif";
  const FONT_GLYPH = "'Noto Sans Symbols', 'Noto Sans Symbols 2', 'Segoe UI Symbol', 'Noto Serif', serif";

  function defaultLabelGlyphs(seedStr) {
    const rng = createRNG(seedStr + ":glyphs");
    const g1 = pick(ALCHEMICAL_GLYPHS, rng);
    const g2 = pick(ALCHEMICAL_GLYPHS, rng);
    const g3 = pick(ALCHEMICAL_GLYPHS, rng);
    return `✦ ${g1} · ${g2} · ${g3} ✦`;
  }

  // --- 4. DATA NORMALISATION -----------------------------------------------
  // The data files are edited by hand (and soon through the dashboard), so a
  // missing field must never crash the page: every record is completed with
  // safe defaults, and records without an id or name are dropped.
  function uniqueById(list) {
    const seen = new Set();
    return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  }

  function normaliseVessels(raw) {
    const list = (Array.isArray(raw) ? raw : []).filter(
      (v) => v && typeof v.id === "string" && v.id && isPathData(v.glass)
    ).map((v) => ({
      id: v.id,
      name: str(v.name, v.id, 80),
      slots: num(v.slots, 1),
      // flat-sided glass: straight label, facet lines instead of round shading
      faceted: v.faceted === true,
      // one closed outline; the hollow inside is derived from it when drawing
      glass: v.glass
    }));
    return uniqueById(list);
  }

  // Rarity ladder (2024 DMG) and what each step is worth / how hard it is to brew.
  // Value is the DMG magic item value halved, as for every consumable.
  const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, "very-rare": 3 };
  const BASE_VALUE = [50, 200, 2000, 20000];
  const BASE_DC = [8, 11, 14, 17]; // before reagent and reaction adjustments
  const rarityLabel = (r) => String(r).replace("-", " ");

  const KITS = { alchemist: "Alchemist's Supplies", herbalism: "Herbalism Kit", poisoner: "Poisoner's Kit" };
  const REACTION_KINDS = ["boon", "bane", "quirk"];
  const DEFAULT_USE = "As a Bonus Action, you can drink it or administer it to a creature within 5 feet of you.";

  const tagId = (v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) : "");

  function normaliseTag(t) {
    if (!t || !tagId(t.id)) return null;
    const id = tagId(t.id);
    return {
      id,
      name: str(t.name, id.charAt(0).toUpperCase() + id.slice(1), 30),
      glyph: str(t.glyph, "", 4),
      description: str(t.description, "", 300)
    };
  }

  function normaliseSolvent(s) {
    if (!s || typeof s.id !== "string" || !s.id || !str(s.name, "")) return null;
    return {
      id: s.id,
      name: str(s.name, s.id, 80),
      tag: tagId(s.tag) || "luminous",
      viscosity: str(s.viscosity, "thin", 60),
      shelfLife: str(s.shelfLife, "6 months", 60),
      smell: str(s.smell, "sharp herbs and minerals", 120),
      taste: str(s.taste, "", 120),
      dcMod: num(s.dcMod, 0),
      lore: str(s.lore, "", 400)
    };
  }

  function normaliseActive(a) {
    if (!a || typeof a.id !== "string" || !a.id || !str(a.name, "")) return null;
    const name = str(a.name, a.id, 80);
    return {
      id: a.id,
      name,
      epithet: str(a.epithet, `of ${lastWord(name)}`, 60),
      form: str(a.form, "Draught", 30),
      code: str(a.code, `${name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X")}-00`, 12),
      biome: str(a.biome, "Uncharted Wilds", 80),
      tag: tagId(a.tag) || "luminous",
      rarity: RARITIES.includes(a.rarity) ? a.rarity : "common",
      color: safeColor(a.color, "#e67e22"),
      texture: TEXTURES.includes(a.texture) ? a.texture : "gradient",
      kit: Object.hasOwn(KITS, a.kit) ? a.kit : "alchemist",
      dcMod: num(a.dcMod, 0),
      lore: str(a.lore, "", 400),
      // DM-only text: may be absent where mechanics are not published
      effect: str(a.effect, "", 900)
    };
  }

  function normaliseCatalyst(c) {
    if (!c || typeof c.id !== "string" || !c.id || !str(c.name, "")) return null;
    const name = str(c.name, c.id, 80);
    const out = {
      id: c.id,
      name,
      prefix: str(c.prefix, name.split(" ")[0], 40),
      tag: tagId(c.tag) || "luminous",
      rarity: RARITIES.includes(c.rarity) ? c.rarity : "common",
      color: safeColor(c.color, "#8e44ad"),
      dcMod: num(c.dcMod, 0),
      lore: str(c.lore, "", 400),
      modifier: str(c.modifier, "", 900)
    };
    // `form` in the site's data files, `deliveryOverride` in the first draft's
    const delivery = str(c.form, "", 30) || str(c.deliveryOverride, "", 30);
    if (delivery) out.deliveryOverride = delivery;
    // A stabilizing catalyst stops every reaction between the reagents.
    if (c.stabilizes === true) out.stabilizes = true;
    return out;
  }

  // A reaction fires when two reagents' tags meet (the active principle with
  // the solvent, and with the catalyst), or when all three share one tag (a
  // triad, which replaces the pair reactions). Tags are compared unordered.
  const reactionKey = (tags) => tags.slice().sort().join("+");

  // Written either as { tags: [a, b] } / { tags: [a, a, a] }, or as the site's
  // records: { first, second, triad }.
  function normaliseReaction(r) {
    if (!r) return null;
    const given = Array.isArray(r.tags) ? r.tags
      : r.triad === true ? [r.first, r.first, r.first]
      : [r.first, r.second];
    if (given.length < 2 || given.length > 3) return null;
    const tags = given.map(tagId);
    if (tags.some((t) => !t)) return null;
    if (tags.length === 3 && new Set(tags).size !== 1) return null; // a triad is three of one tag
    // The effect is DM-only text and may be absent; the reaction still counts
    // (it shapes the bottle, the value and the craft DC).
    const effect = str(r.effect, "", 900);
    const kind = REACTION_KINDS.includes(r.kind) ? r.kind : "bane";
    return {
      tags,
      kind,
      name: str(r.name, kind === "boon" ? "Synergy" : kind === "bane" ? "Adverse Reaction" : "Oddity", 60),
      effect,
      // Craft DC added, and multiplier on the market value
      dc: num(r.dc, kind === "bane" ? 2 : kind === "boon" ? 1 : 0),
      value: Math.min(3, Math.max(0.1, num(r.value, kind === "boon" ? 1.2 : kind === "bane" ? 0.8 : 1)))
    };
  }

  // The draft's format: { "tagA+tagB": "NAME: what happens" }, always a clash.
  function legacyClashes(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
    return Object.entries(obj).map(([key, text]) => {
      if (typeof text !== "string") return null;
      const m = text.match(/^\s*([A-Z][A-Z' &-]+):\s*(.+)$/s);
      const name = m ? m[1].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";
      return { tags: key.split("+"), kind: "bane", name, effect: m ? m[2] : text };
    });
  }

  function normaliseForm(f) {
    const name = f && (str(f.name, "", 30) || str(f.form, "", 30));
    if (!name) return null;
    return { id: name, name, use: str(f.use, DEFAULT_USE, 400) };
  }

  function normaliseReagents(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const list = (arr, fn) => uniqueById((Array.isArray(arr) ? arr : []).map(fn).filter(Boolean));
    // One reaction per tag combination: the first listed wins.
    const seen = new Set();
    const reactions = [...(Array.isArray(src.reactions) ? src.reactions : []), ...legacyClashes(src.clashes)]
      .map(normaliseReaction)
      .filter((r) => r && !seen.has(reactionKey(r.tags)) && seen.add(reactionKey(r.tags)));
    return {
      tags: list(src.tags, normaliseTag),
      forms: list(src.forms, normaliseForm).map(({ name, use }) => ({ name, use })),
      solvents: list(src.solvents, normaliseSolvent),
      actives: list(src.actives, normaliseActive),
      catalysts: list(src.catalysts, normaliseCatalyst),
      reactions,
      oddities: (Array.isArray(src.oddities) ? src.oddities : []).map((o) => str(o, "", 300)).filter(Boolean)
    };
  }

  // --- 5. STUDIO SETTINGS (the cosmetic overrides) -------------------------
  const DEFAULT_STUDIO = Object.freeze({
    showSeal: true,
    showLabel: true,
    wax: "auto",
    stamp: "auto",
    neck: "auto",
    vellum: "auto",
    glass: "auto",
    stopper: "auto",
    texture: "auto",
    fillOverrideActive: false,
    fillValue: 65,
    colorEnable: false,
    col1: "#e74c3c",
    col2: "#f39c12",
    labelText: "",
    labelSub: ""
  });

  function normaliseStudio(raw) {
    const s = raw && typeof raw === "object" ? raw : {};
    const choice = (v, allowed) => (v === "auto" || allowed.includes(v) ? v : "auto");
    const fill = Math.round(num(s.fillValue, DEFAULT_STUDIO.fillValue));
    return {
      showSeal: s.showSeal !== false,
      showLabel: s.showLabel !== false,
      wax: choice(s.wax, Object.keys(WAX_PALETTES)),
      stamp: choice(s.stamp, STAMPS),
      neck: choice(s.neck, NECKS),
      vellum: choice(s.vellum, Object.keys(VELLUM_PALETTES)),
      glass: choice(s.glass, Object.keys(GLASS_TINTS)),
      stopper: choice(s.stopper, STOPPERS),
      texture: choice(s.texture, TEXTURES),
      fillOverrideActive: Boolean(s.fillOverrideActive),
      fillValue: Math.min(FILL_MAX, Math.max(FILL_MIN, fill)),
      colorEnable: Boolean(s.colorEnable),
      col1: safeColor(s.col1, DEFAULT_STUDIO.col1),
      col2: safeColor(s.col2, DEFAULT_STUDIO.col2),
      labelText: str(s.labelText, "", 14),
      labelSub: str(s.labelSub, "", 16)
    };
  }

  // --- 6. AUTO-STYLE RESOLVER (driven by tags, rarity & seed) --------------
  function resolveAutoStudio(potion, resolvedTexture) {
    const rng = createRNG(potion.seed + ":autostyle");
    const { tags } = potion;
    const has = (t) => tags.includes(t);
    const hasBane = potion.reactions.some((r) => r.kind === "bane");
    const rank = RARITY_RANK[potion.rarity] || 0;
    const isRare = rank >= 2;
    const isUncommon = rank === 1;

    let waxPool = ["crimson", "copper"];
    if (has("necrotic")) waxPool = ["obsidian", "violet", "ivory"];
    else if (has("corrosive")) waxPool = ["verdigris", "obsidian"];
    else if (has("cryogenic")) waxPool = ["cobalt", "ivory"];
    else if (has("psychoactive")) waxPool = ["violet", "cobalt"];
    else if (has("arcane")) waxPool = ["violet", "cobalt", "gold"];
    else if (has("igneous")) waxPool = ["crimson", "copper", "gold"];
    else if (has("verdant")) waxPool = ["verdigris", "copper"];
    else if (isRare) waxPool = ["gold", "violet"];
    else if (isUncommon) waxPool = ["cobalt", "verdigris", "copper"];

    let stampPool = ["triquetra"];
    if (has("necrotic")) stampPool = ["skull", "serpent"];
    else if (has("psychoactive") || has("arcane")) stampPool = ["eye", "triquetra"];
    else if (has("luminous") || has("igneous")) stampPool = ["sun", "triquetra"];
    else if (has("volatile") || has("corrosive")) stampPool = ["serpent", "skull"];
    else if (has("verdant")) stampPool = ["triquetra", "sun"];

    let stopperPool = ["cork", "cork", "brass"];
    if (has("necrotic")) stopperPool = ["skull", "skull", "cork"];
    else if (has("corrosive") || has("volatile")) stopperPool = ["brass", "crystal"];
    else if (isRare || has("luminous") || has("arcane")) stopperPool = ["crystal", "brass"];
    else if (has("verdant")) stopperPool = ["cork", "cork", "brass"];
    else if (isUncommon || has("igneous")) stopperPool = ["brass", "cork", "crystal"];

    let glassPool = ["clear", "clear", "amber", "green"];
    if (resolvedTexture === "astral" || resolvedTexture === "rainbow") glassPool = ["clear"];
    else if (has("necrotic")) glassPool = ["smoked", "smoked", "clear"];
    else if (has("corrosive")) glassPool = ["green", "amber"];
    else if (has("cryogenic") || has("psychoactive") || has("arcane")) glassPool = ["cobalt", "clear"];
    else if (has("verdant")) glassPool = ["green", "clear", "amber"];
    else if (has("viscous") || has("volatile") || has("igneous")) glassPool = ["amber", "clear"];

    let neckPool = ["twine", "tag"];
    if (has("necrotic")) neckPool = ["talisman", "strap"];
    else if (isRare) neckPool = ["chain", "strap", "tag"];
    else if (hasBane || has("volatile") || has("corrosive")) neckPool = ["strap", "tag"];
    else if (has("arcane")) neckPool = ["chain", "tag"];
    else if (isUncommon) neckPool = ["tag", "twine", "chain"];

    let vellumPool = ["aged", "aged", "bleached"];
    if (has("necrotic")) vellumPool = ["charred", "midnight"];
    else if (has("psychoactive") || has("arcane")) vellumPool = ["midnight", "aged"];
    else if (has("corrosive") || has("viscous") || has("verdant")) vellumPool = ["mold", "aged"];
    else if (hasBane || has("volatile") || has("igneous")) vellumPool = ["blood", "charred", "aged"];
    else if (has("luminous") || isRare) vellumPool = ["bleached", "aged"];

    return {
      wax: pick(waxPool, rng),
      stamp: pick(stampPool, rng),
      stopper: pick(stopperPool, rng),
      glass: pick(glassPool, rng),
      neck: pick(neckPool, rng),
      vellum: pick(vellumPool, rng)
    };
  }

  // Turns "auto" choices into concrete ones for a given potion.
  function resolveStudio(potion, studioRaw) {
    const s = normaliseStudio(studioRaw);
    const texture = s.texture === "auto" ? potion.active.texture : s.texture;
    const auto = resolveAutoStudio(potion, texture);
    const orAuto = (key) => (s[key] === "auto" ? auto[key] : s[key]);
    return {
      showSeal: s.showSeal,
      showLabel: s.showLabel,
      wax: orAuto("wax"),
      stamp: orAuto("stamp"),
      neck: orAuto("neck"),
      vellum: orAuto("vellum"),
      glass: orAuto("glass"),
      stopper: orAuto("stopper"),
      texture,
      fill: s.fillOverrideActive ? s.fillValue / 100 : potion.baseFill,
      col1: s.colorEnable ? s.col1 : potion.active.color,
      col2: s.colorEnable ? s.col2 : potion.catalyst.color,
      labelText: s.labelText,
      labelSub: s.labelSub
    };
  }

  // --- 7. NAMING, RULES & SYNTHESIS ----------------------------------------
  function potionForm(active, catalyst) {
    return catalyst.deliveryOverride || active.form || "Draught";
  }

  function buildPotionTitle(active, catalyst) {
    return `${catalyst.prefix} ${potionForm(active, catalyst)} ${active.epithet}`;
  }

  // The active principle sets the rarity; a catalyst two or more grades
  // above it lifts the potion one step (never above very rare).
  function potionRarity(active, catalyst) {
    let rank = RARITY_RANK[active.rarity] || 0;
    if ((RARITY_RANK[catalyst.rarity] || 0) >= rank + 2) rank = Math.min(3, rank + 1);
    return RARITIES[rank];
  }

  function roundPrice(v) {
    const step = v < 100 ? 5 : v < 1000 ? 10 : v < 10000 ? 50 : 500;
    return Math.max(5, Math.round(v / step) * step);
  }

  function calculateValue(rarity, catalyst, reactions) {
    let value = BASE_VALUE[RARITY_RANK[rarity]] * (1 + 0.1 * (RARITY_RANK[catalyst.rarity] || 0));
    for (const r of reactions) value *= r.value;
    return roundPrice(value);
  }

  // Craft DC on the 2024 scale (10 easy … 25 very hard): the rarity sets the
  // base, each reagent nudges it, and every reaction makes it harder.
  function calculateDC(rarity, solvent, active, catalyst, reactions) {
    const dc = BASE_DC[RARITY_RANK[rarity]] + solvent.dcMod + active.dcMod + catalyst.dcMod
      + reactions.reduce((sum, r) => sum + r.dc, 0);
    return Math.max(5, Math.min(30, Math.round(dc)));
  }

  const reactionIndex = new WeakMap();
  function lookupReaction(reagents, tags) {
    let index = reactionIndex.get(reagents.reactions);
    if (!index) {
      index = new Map(reagents.reactions.map((r) => [reactionKey(r.tags), r]));
      reactionIndex.set(reagents.reactions, index);
    }
    return index.get(reactionKey(tags)) || null;
  }

  function findReactions(reagents, solvent, active, catalyst) {
    if (catalyst.stabilizes) return [];
    const all = [solvent.tag, active.tag, catalyst.tag];
    if (new Set(all).size === 1) {
      const triad = lookupReaction(reagents, all);
      if (triad) return [triad];
    }
    const found = [];
    for (const pair of [[solvent.tag, active.tag], [active.tag, catalyst.tag]]) {
      const r = lookupReaction(reagents, pair);
      if (r && !found.includes(r)) found.push(r);
    }
    return found;
  }

  function synthesize(db, parts, seedStr) {
    const { vessel, solvent, active, catalyst } = parts;
    const reagents = db.reagents;
    const rng = createRNG(seedStr);
    const tags = [solvent.tag, active.tag, catalyst.tag];
    const baseFill = 0.46 + rng() * 0.38;

    const reactions = findReactions(reagents, solvent, active, catalyst);
    const banes = reactions.filter((r) => r.kind === "bane");
    const rarity = potionRarity(active, catalyst);
    const brewDC = calculateDC(rarity, solvent, active, catalyst, reactions);
    const form = potionForm(active, catalyst);
    const formEntry = (reagents.forms || []).find((f) => f.name.toLowerCase() === form.toLowerCase());
    const oddities = reagents.oddities || [];
    const oddity = oddities.length ? oddities[hashSeed(seedStr + ":oddity") % oddities.length] : "";

    const sideEffect = reactions.length
      ? reactions.map((r) => `${r.name.toUpperCase()}: ${r.effect}`).join(" ")
      : catalyst.stabilizes
        ? "STABILIZED: The catalyst keeps the reagents from reacting."
        : "STABLE: The reagents don't react with one another.";

    return {
      seed: seedStr,
      title: buildPotionTitle(active, catalyst),
      rarity,
      gpValue: calculateValue(rarity, catalyst, reactions),
      brewDC,
      kit: KITS[active.kit] || KITS.alchemist,
      form,
      use: formEntry ? formEntry.use : DEFAULT_USE,
      gmNote: "",
      vessel,
      solvent,
      active,
      catalyst,
      tags,
      baseFill,
      reactions,
      // kept for callers of the step-1 engine
      clashes: banes.map((r) => r.effect),
      isSynergy: reactions.some((r) => r.kind === "boon"),
      stabilized: Boolean(catalyst.stabilizes),
      oddity,
      sideEffect
    };
  }

  // A recipe is the four ids. `missing` lists what the current data files no
  // longer contain, so callers can refuse instead of quietly swapping in the
  // first reagent of the list.
  function resolveRecipe(db, recipe) {
    const r = recipe && typeof recipe === "object" ? recipe : {};
    const parts = {
      vessel: db.vessels.find((v) => v.id === r.vessel) || null,
      solvent: db.reagents.solvents.find((s) => s.id === r.solvent) || null,
      active: db.reagents.actives.find((a) => a.id === r.active) || null,
      catalyst: db.reagents.catalysts.find((c) => c.id === r.catalyst) || null
    };
    const missing = Object.keys(parts).filter((k) => !parts[k]).map((k) => `${k} “${r[k] ?? "?"}”`);
    return { parts, missing };
  }

  const recipeOf = (parts) => ({
    vessel: parts.vessel.id,
    solvent: parts.solvent.id,
    active: parts.active.id,
    catalyst: parts.catalyst.id
  });

  const recipeSeed = (recipe) => `${recipe.vessel}:${recipe.solvent}:${recipe.active}:${recipe.catalyst}`;

  function recipeFromSeed(db, seedStr) {
    return {
      vessel: seededChoice(db.vessels, seedStr, "vessel").id,
      solvent: seededChoice(db.reagents.solvents, seedStr, "solvent").id,
      active: seededChoice(db.reagents.actives, seedStr, "active").id,
      catalyst: seededChoice(db.reagents.catalysts, seedStr, "catalyst").id
    };
  }

  // Builds a potion from a recipe; `seedStr` defaults to the recipe itself.
  // Returns null when a reagent or the vessel is unknown.
  function brew(db, recipe, seedStr) {
    const { parts, missing } = resolveRecipe(db, recipe);
    if (missing.length) return null;
    return synthesize(db, parts, seedStr || recipeSeed(recipeOf(parts)));
  }

  // --- 8. DESCRIPTIONS -----------------------------------------------------
  const TEXTURE_WORDS = {
    gradient: "smooth", layered: "banded", suspended: "flake-strewn", marbled: "veined",
    voltaic: "crackling", rainbow: "prismatic", astral: "star-flecked"
  };

  // Returns safe HTML (the vessel name is emphasised).
  function sensoryHTML(potion, texture) {
    const { vessel, solvent, active, catalyst } = potion;
    const form = esc(potionForm(active, catalyst).toLowerCase());
    const vesselName = `<strong>${esc(vessel.name.toLowerCase())}</strong>`;
    const body = `${esc(solvent.viscosity)}, ${esc(TEXTURE_WORDS[texture] || texture)}`;
    const smell = esc(solvent.smell);
    const shelf = esc(solvent.shelfLife);
    const keeps = /^(indefinite|forever|never)/i.test(solvent.shelfLife) ? "indefinitely" : `for ${shelf}`;
    const taste = solvent.taste ? ` It tastes of ${esc(solvent.taste)}.` : "";

    if (form === "oil") {
      return `Sealed within a ${vesselName}. A ${body} oil exhaling sharp notes of ${smell}. It coats a blade or skin cleanly and keeps ${keeps}.`;
    }
    if (form === "inhalant") {
      return `Pressurized inside a ${vesselName}. A ${body} suspension reeking of ${smell}, which turns to vapour on contact with air. The seal holds ${keeps}.`;
    }
    return `Stoppered within a ${vesselName}. A ${body} ${form} exhaling notes of ${smell}.${taste} It keeps ${keeps}.`;
  }

  // One plain line for the front of an item card.
  function summaryText(potion, texture) {
    const { vessel, solvent, active, catalyst } = potion;
    const form = potionForm(active, catalyst).toLowerCase();
    return `A ${solvent.viscosity}, ${TEXTURE_WORDS[texture] || texture} ${form} in a ${vessel.name.toLowerCase()}, smelling of ${solvent.smell}.`;
  }

  const KIND_LABEL = { boon: "Synergy", bane: "Adverse reaction", quirk: "Oddity" };

  // What an item card (data/items.json) says of this potion. The body is
  // Markdown and holds the rules: it is what players read once the card is
  // in their Vault, so the DM edits it freely afterwards.
  function cardFields(potion, studioRaw) {
    const texture = resolveStudio(potion, studioRaw).texture;
    const label = rarityLabel(potion.rarity);
    const parts = [`*${potion.use}*`];
    if (potion.active.effect) parts.push(potion.active.effect);
    if (potion.catalyst.modifier) parts.push(`**${potion.catalyst.prefix}.** ${potion.catalyst.modifier}`);
    for (const r of potion.reactions) if (r.effect) parts.push(`**${r.name}.** ${r.effect}`);
    if (potion.oddity) parts.push(`*${potion.oddity}*`);
    return {
      name: potion.title,
      type: "Potion",
      rarity: label.charAt(0).toUpperCase() + label.slice(1),
      cost: `${potion.gpValue} gp`,
      weight: "0.5 lb.",
      summary: summaryText(potion, texture),
      body: parts.join("\n\n")
    };
  }

  // The four ids, the seed and the look: all an item card stores (item.potion).
  function potionRecord(potion, studioRaw) {
    return { seed: potion.seed, recipe: recipeOf(potion), studio: normaliseStudio(studioRaw) };
  }

  function toMarkdown(p) {
    const reactionLines = p.reactions.length
      ? p.reactions.map((r) => `\n  * **${r.name}** (${KIND_LABEL[r.kind].toLowerCase()})${r.effect ? `: ${r.effect}` : ""}`).join("")
      : ` ${p.stabilized ? "Stabilized: the reagents can't react." : "Stable: no reaction."}`;
    const noteLine = p.gmNote ? `\n* **GM notes:** ${p.gmNote}` : "";
    const oddityLine = p.oddity ? `\n* **Oddity:** ${p.oddity}` : "";
    return `### ${p.title}
*Potion, ${rarityLabel(p.rarity)}* · ${p.gpValue} GP · Craft DC ${p.brewDC} (${p.kit})
* **Tags:** ${[...new Set(p.tags)].join(", ")}
* **Use:** ${p.use}
* **Effect:** ${p.active.effect || "—"}
* **Catalyst (${p.catalyst.name}):** ${p.catalyst.modifier || "—"}
* **Reactions:**${reactionLines}
* **Appearance:** ${p.vessel.name}, ${p.solvent.viscosity} liquid smelling of ${p.solvent.smell}.
* **Reagents:** ${p.solvent.name} + ${p.active.name} (${p.active.biome}) + ${p.catalyst.name}.${oddityLine}${noteLine}`;
  }

  // --- 9. COLOUR HELPERS ---------------------------------------------------
  function rgbOf(hex) {
    const h = safeColor(hex, "#888888");
    return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  }

  function mix(a, b, t) {
    const A = rgbOf(a);
    const B = rgbOf(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }

  const lighten = (c, t) => mix(c, "#ffffff", t);
  const darken = (c, t) => mix(c, "#000000", t);

  // --- 10. VESSEL GEOMETRY -------------------------------------------------
  // A vessel is one outline (`glass`). Everything else is measured from it:
  // the hollow inside (a mask, see renderSVG), where the body starts, how wide
  // it is at any height, and the best band for the label.
  const WALL = 4.5;          // glass thickness, in drawing units
  const NECK_HALF = 15;      // every vessel shares this mouth (see data/vessels.json)
  const LABEL_HEIGHT = 40;

  function flattenPath(d) {
    const tokens = d.match(/[MLCQHVZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    const pts = [];
    let i = 0;
    let cmd = "";
    let cx = 0;
    let cy = 0;
    const next = () => Number(tokens[i++]);
    while (i < tokens.length) {
      if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++].toUpperCase();
      if (cmd === "Z") continue;
      if (cmd === "M" || cmd === "L") {
        cx = next(); cy = next();
        pts.push([cx, cy]);
        if (cmd === "M") cmd = "L";
      } else if (cmd === "H") {
        cx = next(); pts.push([cx, cy]);
      } else if (cmd === "V") {
        cy = next(); pts.push([cx, cy]);
      } else if (cmd === "C") {
        const x1 = next(), y1 = next(), x2 = next(), y2 = next(), x = next(), y = next();
        for (let s = 1; s <= 16; s++) {
          const t = s / 16, u = 1 - t;
          pts.push([
            u * u * u * cx + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
            u * u * u * cy + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y
          ]);
        }
        cx = x; cy = y;
      } else if (cmd === "Q") {
        const x1 = next(), y1 = next(), x = next(), y = next();
        for (let s = 1; s <= 8; s++) {
          const t = s / 8, u = 1 - t;
          pts.push([u * u * cx + 2 * u * t * x1 + t * t * x, u * u * cy + 2 * u * t * y1 + t * t * y]);
        }
        cx = x; cy = y;
      } else {
        i++; // unknown command: skip the token rather than loop forever
      }
    }
    return pts;
  }

  // Nearest glass wall left and right of the centre line (x = 100) at height y.
  function spanAt(poly, y) {
    let left = -Infinity;
    let right = Infinity;
    for (let k = 0; k < poly.length; k++) {
      const [x1, y1] = poly[k];
      const [x2, y2] = poly[(k + 1) % poly.length];
      if (y1 === y2 || y < Math.min(y1, y2) || y > Math.max(y1, y2)) continue;
      const x = x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
      if (x <= 100 && x > left) left = x;
      if (x >= 100 && x < right) right = x;
    }
    return [left, right];
  }

  const geometryCache = new Map();

  function vesselGeometry(vessel) {
    if (geometryCache.has(vessel.glass)) return geometryCache.get(vessel.glass);
    const poly = flattenPath(vessel.glass);
    let top = Infinity;
    let bottom = -Infinity;
    for (const [, y] of poly) {
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
    // Half-width of the glass at a height (0 outside the vessel).
    const halfAt = (y) => {
      const [l, r] = spanAt(poly, y);
      if (!Number.isFinite(l) || !Number.isFinite(r)) return 0;
      return Math.max(0, Math.min(100 - l, r - 100));
    };

    // The body starts where the glass clearly widens past the neck.
    let bodyTop = Math.min(bottom - 30, 84);
    for (let y = 66; y < bottom - 20; y++) {
      if (halfAt(y) > NECK_HALF + 2.5) { bodyTop = y; break; }
    }
    let maxHalf = 0;
    let maxHalfY = bodyTop;
    for (let y = bodyTop; y <= bottom - 1; y += 2) {
      const h = halfAt(y);
      if (h > maxHalf) { maxHalf = h; maxHalfY = y; }
    }

    // Label: the 40-unit band with the most room, preferring mid-body.
    // It never starts closer than 24 units to the shoulder, which keeps a
    // place for the wax seal above it.
    let best = null;
    for (let y0 = Math.max(bodyTop + 24, 96); y0 <= bottom - 10 - LABEL_HEIGHT; y0 += 2) {
      let minHalf = Infinity;
      for (let y = y0; y <= y0 + LABEL_HEIGHT; y += 2) minHalf = Math.min(minHalf, halfAt(y));
      const score = minHalf - Math.abs(y0 + LABEL_HEIGHT / 2 - 160) * 0.08;
      if (!best || score > best.score) best = { top: y0, minHalf, score };
    }
    if (!best) best = { top: Math.max(bodyTop + 6, bottom - 14 - LABEL_HEIGHT), minHalf: halfAt(bottom - 30) };
    const labelHalf = Math.max(11, Math.min(54, best.minHalf * (vessel.faceted ? 0.9 : 0.86) - 1));

    const geo = {
      top, bottom, bodyTop, maxHalf, maxHalfY, halfAt,
      baseHalf: Math.max(halfAt(bottom - 3), 8),
      label: { top: best.top, bottom: best.top + LABEL_HEIGHT, left: 100 - labelHalf, right: 100 + labelHalf },
      sealY: Math.min(Math.max(bodyTop + 13, 88), best.top - 11)
    };
    geometryCache.set(vessel.glass, geo);
    return geo;
  }

  // Shrinks a line of label text until it fits; textLength then pins the
  // final width so a missing web font cannot make it overflow either.
  function fitText(text, baseSize, charWidthEm, spacing, maxWidth) {
    const chars = Array.from(text).length || 1;
    const natural = chars * (baseSize * charWidthEm + spacing);
    if (natural <= maxWidth) return { size: baseSize, spacing, lengthAttr: "" };
    const scale = Math.max(0.5, maxWidth / natural);
    return {
      size: +(baseSize * scale).toFixed(2),
      spacing: +(spacing * scale).toFixed(2),
      lengthAttr: ` textLength="${maxWidth.toFixed(1)}" lengthAdjust="spacingAndGlyphs"`
    };
  }

  const n1 = (v) => (+v).toFixed(1);

  // A four-pointed glint.
  function sparklePath(x, y, r) {
    const k = r * 0.22;
    return `M${n1(x)},${n1(y - r)} Q${n1(x + k)},${n1(y - k)} ${n1(x + r)},${n1(y)} Q${n1(x + k)},${n1(y + k)} ${n1(x)},${n1(y + r)} Q${n1(x - k)},${n1(y + k)} ${n1(x - r)},${n1(y)} Q${n1(x - k)},${n1(y - k)} ${n1(x)},${n1(y - r)} Z`;
  }

  function frostCrystal(cx, cy, r, rotDeg) {
    let d = "";
    for (let i = 0; i < 6; i++) {
      const rad = ((rotDeg + i * 60) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      d += `M${n1(cx)},${n1(cy)} L${n1(cx + cos * r)},${n1(cy + sin * r)} `;
      for (const f of [0.45, 0.72]) {
        const bx = cx + cos * r * f;
        const by = cy + sin * r * f;
        const len = r * (f < 0.6 ? 0.34 : 0.22);
        d += `M${n1(bx)},${n1(by)} L${n1(bx + Math.cos(rad + 0.9) * len)},${n1(by + Math.sin(rad + 0.9) * len)} `;
        d += `M${n1(bx)},${n1(by)} L${n1(bx + Math.cos(rad - 0.9) * len)},${n1(by + Math.sin(rad - 0.9) * len)} `;
      }
    }
    return d;
  }

  // SMIL snippets, only emitted for the live preview (opts.animate).
  const twinkle = (on, dur, begin, lo, hi) =>
    on ? `<animate attributeName="opacity" values="${hi};${lo};${hi}" dur="${n1(dur)}s" begin="-${n1(begin)}s" repeatCount="indefinite"/>` : "";

  // --- 11. STOPPERS --------------------------------------------------------
  function renderStopper(style, rng, ref) {
    const cork = (topY) => {
      let speckles = "";
      for (let i = 0; i < 16; i++) {
        const y = topY + 3 + rng() * (62 - topY);
        const x = 89.5 + rng() * 21;
        const dark = rng() < 0.6;
        speckles += `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(0.5 + rng() * 0.9)}" ry="${n1(0.3 + rng() * 0.5)}" fill="${dark ? "#4e3218" : "#e6c9a0"}" opacity="${dark ? 0.55 : 0.4}"/>`;
      }
      return `
        <path d="M86.5,${topY} L113.5,${topY} L111,66 L89,66 Z" fill="${ref("cork-grad")}" stroke="#3d2815" stroke-width="1" stroke-linejoin="round"/>
        ${speckles}
        <ellipse cx="100" cy="${topY}" rx="13.5" ry="2.8" fill="#d6b184" stroke="#3d2815" stroke-width="0.8"/>
        <ellipse cx="97" cy="${topY - 0.3}" rx="6" ry="1.1" fill="#f0d9b4" opacity="0.55"/>`;
    };

    switch (style) {
      case "crystal":
        return `
        <path d="M90.5,50 L109.5,50 L108.5,66 L91.5,66 Z" fill="#dff1ff" opacity="0.5" stroke="#9cc9ea" stroke-width="0.8"/>
        <rect x="86" y="46.5" width="28" height="4.5" rx="2.2" fill="#cfe6f7" stroke="#5b9fd0" stroke-width="0.9"/>
        <polygon points="100,13 88,26 100,28.5" fill="#f6fcff"/>
        <polygon points="100,13 112,26 100,28.5" fill="#b7dcf5"/>
        <polygon points="88,26 100,28.5 100,47 91,43.5" fill="#d2ebfb"/>
        <polygon points="112,26 100,28.5 100,47 109,43.5" fill="#86bfe8"/>
        <polygon points="100,13 112,26 109,43.5 100,47 91,43.5 88,26" fill="none" stroke="#4f9bd0" stroke-width="1" stroke-linejoin="round"/>
        <path d="M100,13 L100,47 M88,26 L100,28.5 L112,26" fill="none" stroke="#ffffff" stroke-width="0.6" opacity="0.7"/>
        <path d="${sparklePath(93.5, 21, 3)}" fill="#ffffff" opacity="0.9"/>`;
      case "brass":
        return `
        <path d="M90.5,55 L109.5,55 L108.5,66 L91.5,66 Z" fill="#6e5a12" opacity="0.9"/>
        <path d="M80,47.5 Q100,44.5 120,47.5 L120,56 Q100,58.6 80,56 Z" fill="${ref("brass-grad")}" stroke="#5c410f" stroke-width="1"/>
        <rect x="88" y="37.5" width="24" height="9.5" fill="${ref("brass-grad")}" stroke="#5c410f" stroke-width="1"/>
        <path d="M91,38.5 V46 M94,38.5 V46 M97,38.5 V46 M100,38.5 V46 M103,38.5 V46 M106,38.5 V46 M109,38.5 V46" stroke="#4a3408" stroke-width="0.7" opacity="0.45"/>
        <rect x="85.5" y="34" width="29" height="4.2" rx="2.1" fill="${ref("brass-grad")}" stroke="#5c410f" stroke-width="1"/>
        <circle cx="100" cy="26.5" r="7.6" fill="${ref("brass-knob")}" stroke="#5c410f" stroke-width="1"/>
        <ellipse cx="97.2" cy="23.6" rx="2.6" ry="1.7" fill="#fff6cf" opacity="0.75"/>
        <path d="M82,49.6 Q100,46.8 118,49.6" fill="none" stroke="#fff3bf" stroke-width="0.7" opacity="0.6"/>`;
      case "skull":
        return `
        ${cork(47)}
        <path d="M100,15 C110.5,15 116.5,22 116.5,30.5 C116.5,35.5 114,38.6 111.5,40.4 L111.5,45.2 L88.5,45.2 L88.5,40.4 C86,38.6 83.5,35.5 83.5,30.5 C83.5,22 89.5,15 100,15 Z" fill="${ref("bone-grad")}" stroke="#4a4236" stroke-width="1.1" stroke-linejoin="round"/>
        <ellipse cx="93.6" cy="30.6" rx="3.7" ry="4.1" fill="#17130f"/>
        <ellipse cx="106.4" cy="30.6" rx="3.7" ry="4.1" fill="#17130f"/>
        <path d="M100,34.6 L97.9,39.6 L102.1,39.6 Z" fill="#2a241c"/>
        <path d="M91.4,41.4 V45 M94.8,41.6 V45 M98.2,41.8 V45 M101.8,41.8 V45 M105.2,41.6 V45 M108.6,41.4 V45 M89.5,41.3 H110.5" fill="none" stroke="#4a4236" stroke-width="0.7"/>
        <path d="M104,16.2 L105.6,19.6 L104.4,21.4 L107.2,24.6" fill="none" stroke="#6b6252" stroke-width="0.6"/>
        <path d="M89,22 C91,18.6 95,17 99,16.8" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.5"/>`;
      default:
        return cork(38);
    }
  }

  // --- 12. WAX (cap, drips, stamped seal) ----------------------------------
  function renderWaxCap(pal, rng, finial, maxDripY, ref) {
    // A cork is dipped whole; stoppers with a finial get a collar under it.
    const slots = [-11, -3.6, 4.2, 11.4];
    let drips = "";
    let glints = "";
    for (let i = slots.length - 1; i >= 0; i--) {
      if (rng() < 0.22) continue;
      const cx = 100 + slots[i] + (rng() * 2.4 - 1.2);
      const w = 1.6 + rng() * 0.8;
      const end = Math.min(maxDripY, 65 + rng() * 15);
      drips += ` L${n1(cx + w + 1)},62 Q${n1(cx + w)},62 ${n1(cx + w)},${n1(63.5)} L${n1(cx + w)},${n1(end - w)} A${n1(w)} ${n1(w)} 0 0 1 ${n1(cx - w)},${n1(end - w)} L${n1(cx - w)},63.5 Q${n1(cx - w)},62 ${n1(cx - w - 1)},62`;
      glints += `<path d="M${n1(cx - w * 0.35)},64 V${n1(end - w - 0.6)}" stroke="#ffffff" stroke-width="0.7" stroke-linecap="round" opacity="0.3"/>`;
    }
    const top = finial
      ? "M79,60 L79,56 L80,49.5 C80,46.8 88,45.6 100,45.6 C112,45.6 120,46.8 120,49.5 L121,56 L121,60 Q121,62 119,62"
      : "M79,60 L79,58 C79,51.5 84,49 84.6,41 C84.9,33.4 91,31.4 100,31.4 C109,31.4 115.1,33.4 115.4,41 C116,49 121,51.5 121,58 L121,60 Q121,62 119,62";
    const sheen = finial
      ? `<path d="M84.5,49.5 L84,57.5" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity="0.28"/>`
      : `<path d="M89.5,36.5 C88,41 87.4,46 87.6,51.5" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" opacity="0.28"/>
         <ellipse cx="100" cy="34.6" rx="9" ry="1.6" fill="#ffffff" opacity="0.14"/>`;
    return `
      <path d="${top}${drips} L81,62 Q79,62 79,60 Z" fill="${ref("wax-grad")}" stroke="${pal.stroke}" stroke-width="1" stroke-linejoin="round"/>
      <path d="M80,57.2 Q100,59.6 120,57.2" fill="none" stroke="${pal.stroke}" stroke-width="0.8" opacity="0.45"/>
      ${sheen}${glints}`;
  }

  function renderStampSigil(sigil, color, cx, cy) {
    const c = (dx, dy, r, extra) => `<circle cx="${n1(cx + dx)}" cy="${n1(cy + dy)}" r="${r}" ${extra}/>`;
    const stroke = `fill="none" stroke="${color}" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"`;
    switch (sigil) {
      case "skull":
        return `${c(0, -0.9, 3.3, stroke)}
          <path d="M${n1(cx - 1.9)},${n1(cy + 2)} V${n1(cy + 4.1)} H${n1(cx + 1.9)} V${n1(cy + 2)} M${n1(cx - 0.65)},${n1(cy + 2.6)} V${n1(cy + 4.1)} M${n1(cx + 0.65)},${n1(cy + 2.6)} V${n1(cy + 4.1)}" ${stroke}/>
          ${c(-1.25, -1.1, 0.85, `fill="${color}"`)}${c(1.25, -1.1, 0.85, `fill="${color}"`)}`;
      case "eye":
        return `<path d="M${n1(cx - 5)},${n1(cy + 0.4)} Q${n1(cx)},${n1(cy - 4)} ${n1(cx + 5)},${n1(cy + 0.4)} Q${n1(cx)},${n1(cy + 4.4)} ${n1(cx - 5)},${n1(cy + 0.4)} Z" ${stroke}/>
          ${c(0, 0.3, 1.7, `fill="${color}"`)}
          <path d="M${n1(cx)},${n1(cy - 3.2)} V${n1(cy - 5)} M${n1(cx - 2.6)},${n1(cy - 2.5)} L${n1(cx - 3.6)},${n1(cy - 4)} M${n1(cx + 2.6)},${n1(cy - 2.5)} L${n1(cx + 3.6)},${n1(cy - 4)}" ${stroke}/>`;
      case "sun": {
        let rays = "";
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          rays += `M${n1(cx + Math.cos(a) * 3.2)},${n1(cy + Math.sin(a) * 3.2)} L${n1(cx + Math.cos(a) * (i % 2 ? 4.4 : 5.2))},${n1(cy + Math.sin(a) * (i % 2 ? 4.4 : 5.2))} `;
        }
        return `${c(0, 0, 2.1, stroke)}${c(0, 0, 0.6, `fill="${color}"`)}<path d="${rays}" ${stroke}/>`;
      }
      case "serpent":
        return `<path d="M${n1(cx + 1.6)},${n1(cy - 3.9)} A4.2 4.2 0 1 1 ${n1(cx - 1.2)},${n1(cy - 4)}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M${n1(cx - 1.2)},${n1(cy - 5.3)} L${n1(cx + 1.4)},${n1(cy - 4.1)} L${n1(cx - 1)},${n1(cy - 2.8)} Z" fill="${color}"/>`;
      case "none":
        return "";
      default: {
        // triquetra: three interlaced rings and their shared heart
        const ring = (a) => c(Math.cos(a) * 2, Math.sin(a) * 2, 2.9, stroke);
        return `${ring(-Math.PI / 2)}${ring(Math.PI / 6)}${ring((5 * Math.PI) / 6)}${c(0, 0, 0.7, `fill="${color}"`)}`;
      }
    }
  }

  function renderSeal(pal, sigil, rng, cy, ref) {
    // Slightly irregular blob, as pressed wax spreads.
    const pts = [];
    const N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 9.4 + rng() * 1.8 - 0.7;
      pts.push([100 + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const start = mid(pts[N - 1], pts[0]);
    let d = `M${n1(start[0])},${n1(start[1])}`;
    for (let i = 0; i < N; i++) {
      const m = mid(pts[i], pts[(i + 1) % N]);
      d += ` Q${n1(pts[i][0])},${n1(pts[i][1])} ${n1(m[0])},${n1(m[1])}`;
    }
    return `
      <path d="${d} Z" transform="translate(0.8,1.4)" fill="#000000" opacity="0.4" filter="${ref("blur-s")}"/>
      <path d="${d} Z" fill="${ref("wax-seal")}" stroke="${pal.stroke}" stroke-width="1"/>
      <circle cx="100.3" cy="${n1(cy + 0.5)}" r="6.9" fill="none" stroke="${pal.stroke}" stroke-width="1" opacity="0.7"/>
      <circle cx="100" cy="${n1(cy)}" r="6.9" fill="none" stroke="${pal.stamp}" stroke-width="0.8"/>
      <g transform="translate(0.3,0.4)" opacity="0.55">${renderStampSigil(sigil, pal.stroke, 100, cy)}</g>
      ${renderStampSigil(sigil, pal.stamp, 100, cy)}
      <path d="M${n1(93.2)},${n1(cy - 5.6)} A8.4 8.4 0 0 1 ${n1(98.6)},${n1(cy - 8.2)}" fill="none" stroke="#ffffff" stroke-width="1.1" stroke-linecap="round" opacity="0.35"/>`;
  }

  // --- 13. NECK ACCESSORIES ------------------------------------------------
  const wrap = (y, sag = 2.2) => `M84.6,${n1(y)} Q100,${n1(y + sag * 2)} 115.4,${n1(y)}`;
  const onWrap = (y, t, sag = 2.2) => {
    const u = 1 - t;
    return [u * u * 84.6 + 2 * u * t * 100 + t * t * 115.4, u * u * y + 2 * u * t * (y + sag * 2) + t * t * y];
  };

  function renderNeckAccessory(style, potion, gemColor, ref) {
    switch (style) {
      case "none":
        return "";
      case "chain": {
        let links = "";
        for (const y of [65.2, 69.4]) {
          for (let k = 0; k <= 12; k++) {
            const [x, yy] = onWrap(y, k / 12, 1.8);
            links += k % 2
              ? `<ellipse cx="${n1(x)}" cy="${n1(yy)}" rx="0.8" ry="1.5" fill="none" stroke="#b8922e" stroke-width="0.8"/>`
              : `<ellipse cx="${n1(x)}" cy="${n1(yy)}" rx="1.9" ry="1.1" fill="none" stroke="#ecd075" stroke-width="0.8"/>`;
          }
        }
        let drop = "";
        for (let k = 1; k <= 8; k++) {
          const t = k / 9, u = 1 - t;
          const x = u * u * 86 + 2 * u * t * 74 + t * t * 71;
          const y = u * u * 70 + 2 * u * t * 80 + t * t * 94;
          drop += `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${k % 2 ? 0.8 : 1.3}" ry="${k % 2 ? 1.5 : 1.1}" fill="none" stroke="${k % 2 ? "#b8922e" : "#ecd075"}" stroke-width="0.8" transform="rotate(${k % 2 ? 12 : -30} ${n1(x)} ${n1(y)})"/>`;
        }
        return `<g>
          <path d="${wrap(71.6, 1.8)}" fill="none" stroke="#000000" stroke-width="1.6" opacity="0.3"/>
          ${links}${drop}
          <path d="M71,95 C66,100 65.4,106.5 71,110.5 C76.6,106.5 76,100 71,95 Z" fill="${ref("brass-grad")}" stroke="#5c410f" stroke-width="0.9"/>
          <path d="M71,98.2 C68.2,101.4 67.8,105 71,107.6 C74.2,105 73.8,101.4 71,98.2 Z" fill="${gemColor}" stroke="#2b1d0e" stroke-width="0.5"/>
          <ellipse cx="69.9" cy="101.6" rx="0.9" ry="1.5" fill="#ffffff" opacity="0.65"/>
        </g>`;
      }
      case "strap":
        return `<g>
          <path d="M84.2,62.6 Q100,66.6 115.8,62.6 L115.8,72.4 Q100,76.4 84.2,72.4 Z" fill="${ref("leather-grad")}" stroke="#1b0f0d" stroke-width="1"/>
          <path d="${wrap(64.2, 2)}" fill="none" stroke="#b08a63" stroke-width="0.6" stroke-dasharray="1.6 1.5" opacity="0.8"/>
          <path d="${wrap(70.8, 2)}" fill="none" stroke="#b08a63" stroke-width="0.6" stroke-dasharray="1.6 1.5" opacity="0.8"/>
          <path d="M109,66.2 L122.5,68.4 L121.6,74.2 L108.4,72.2 Z" fill="#4a2e22" stroke="#1b0f0d" stroke-width="0.9"/>
          <circle cx="114.6" cy="70.2" r="0.7" fill="#140a08"/><circle cx="118.4" cy="70.9" r="0.7" fill="#140a08"/>
          <rect x="101.6" y="63.6" width="9" height="11.6" rx="1.6" fill="none" stroke="${ref("brass-grad")}" stroke-width="2"/>
          <rect x="101.6" y="63.6" width="9" height="11.6" rx="1.6" fill="none" stroke="#5c410f" stroke-width="0.5" opacity="0.6"/>
          <path d="M101.8,69.4 H110.4" stroke="#f1d67a" stroke-width="1.3" stroke-linecap="round"/>
        </g>`;
      case "talisman":
        return `<g>
          <path d="${wrap(72, 2)}" fill="none" stroke="#000000" stroke-width="1.6" opacity="0.3"/>
          <path d="${wrap(65, 2)}" fill="none" stroke="#7a2224" stroke-width="2.4"/>
          <path d="${wrap(68.2, 2)}" fill="none" stroke="#5a1517" stroke-width="2.4"/>
          <path d="${wrap(70.6, 2)}" fill="none" stroke="#7a2224" stroke-width="1.6"/>
          <path d="M114.6,68 C124,74 130,84 131,95" fill="none" stroke="#6a1b1d" stroke-width="1.3"/>
          <path d="M113.8,69 C118,78 119,86 117.5,95" fill="none" stroke="#6a1b1d" stroke-width="1.1"/>
          <circle cx="122.4" cy="75.2" r="2.3" fill="#d9b23a" stroke="#2c1b0e" stroke-width="0.7"/>
          <circle cx="127.6" cy="83" r="2.3" fill="#4fbf86" stroke="#145a32" stroke-width="0.7"/>
          <circle cx="121.8" cy="74.5" r="0.7" fill="#ffffff" opacity="0.7"/><circle cx="127" cy="82.3" r="0.7" fill="#ffffff" opacity="0.7"/>
          <path d="M127,95.6 C125.6,89.6 136.4,89.6 135.4,95.8 C135.2,98.6 136.8,100.6 142.6,109.6 C136,106.6 133.2,104.4 131.4,102.4 C129.4,102.6 127.4,99.6 127,95.6 Z" fill="${ref("bone-grad")}" stroke="#4a4236" stroke-width="0.9" stroke-linejoin="round"/>
          <circle cx="131.6" cy="95.8" r="1.6" fill="#17130f"/>
          <path d="M117.5,95 C113.4,99 112.6,106 116,112.6 C120.6,107 121.2,100 117.5,95 Z" fill="#1d2126" stroke="#0b0d0f" stroke-width="0.6"/>
          <path d="M117.4,96 L116.2,111.4" stroke="#5d6770" stroke-width="0.5"/>
        </g>`;
      case "tag":
        return `<g>
          <path d="${wrap(71, 2)}" fill="none" stroke="#000000" stroke-width="1.4" opacity="0.3"/>
          <path d="${wrap(66.4, 2)}" fill="none" stroke="#b89a6a" stroke-width="2"/>
          <path d="${wrap(69, 2)}" fill="none" stroke="#9a7d52" stroke-width="1.6"/>
          <path d="M85,68 C72,72 63,78 58.6,87" fill="none" stroke="#b89a6a" stroke-width="1.1"/>
          <g transform="translate(57,86) rotate(16)">
            <polygon points="-9,0.8 9,0.8 13,5.6 13,30 -13,30 -13,5.6" fill="#000000" opacity="0.35" transform="translate(1,1.6)"/>
            <polygon points="-9,0 9,0 13,5 13,29 -13,29 -13,5" fill="${ref("tag-grad")}" stroke="#8c7355" stroke-width="1" stroke-linejoin="round"/>
            <polygon points="-7.6,2.4 7.6,2.4 10.6,6.2 10.6,26.6 -10.6,26.6 -10.6,6.2" fill="none" stroke="#8c7355" stroke-width="0.5" opacity="0.7"/>
            <circle cx="0" cy="5" r="2" fill="#17130f" stroke="#b08d57" stroke-width="1"/>
            <text x="0" y="17.4" text-anchor="middle" font-family="${FONT_GLYPH}" font-size="7" fill="#2b1d0e">☿</text>
            <text x="0" y="24.4" text-anchor="middle" font-family="${FONT_MONO}" font-size="4.6" font-weight="600" fill="#4a3520" letter-spacing="0.3">${esc(potion.active.code.split("-")[0].slice(0, 5))}</text>
          </g>
        </g>`;
      default: {
        // twine: three turns, a knot and two frayed ends
        const turn = (y, c) => `<path d="${wrap(y)}" fill="none" stroke="${c}" stroke-width="2.3"/><path d="${wrap(y)}" fill="none" stroke="#6f5533" stroke-width="2.3" stroke-dasharray="0.8 1.7" opacity="0.55"/>`;
        return `<g>
          <path d="${wrap(72.2)}" fill="none" stroke="#000000" stroke-width="1.6" opacity="0.3"/>
          ${turn(64.6, "#c7a877")}${turn(67.2, "#b8975f")}${turn(69.8, "#c7a877")}
          <path d="M110.4,69.2 C116,76 116.4,83 113.6,90 M109.6,69.6 C120.4,73.6 123,79.6 123.4,86.4" fill="none" stroke="#c0a070" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M113.6,90 l-1.4,2.6 M113.6,90 l0.2,3 M113.6,90 l1.6,2.4 M123.4,86.4 l-1.2,2.6 M123.4,86.4 l0.6,2.8 M123.4,86.4 l1.8,2" stroke="#c0a070" stroke-width="0.6" stroke-linecap="round"/>
          <ellipse cx="110" cy="68.8" rx="2.7" ry="2.2" fill="#b8975f" stroke="#6b5231" stroke-width="0.7"/>
        </g>`;
      }
    }
  }

  // --- 14. MASTER SVG RENDERER ---------------------------------------------
  // Returns a complete <svg> element as a string.
  //   opts.uid      suffix for every internal id, so several bottles can share
  //                 one page without their gradients and masks colliding
  //   opts.width / opts.height   rendered size (defaults 220 × 286)
  //   opts.title    accessible name
  //   opts.animate  true adds gentle motion (rising bubbles, twinkling motes);
  //                 leave it off for thumbnails and exported files
  function renderSVG(potion, studioRaw, opts = {}) {
    const uid = String(opts.uid ?? "main").replace(/[^A-Za-z0-9_-]/g, "") || "main";
    const id = (name) => `${name}-${uid}`;
    const ref = (name) => `url(#${id(name)})`;
    const st = resolveStudio(potion, studioRaw);
    const { vessel, tags } = potion;
    const G = vesselGeometry(vessel);
    const rng = createRNG(potion.seed + ":svg");
    const rand = (a, b) => a + rng() * (b - a);
    const has = (t) => tags.includes(t);
    const animate = Boolean(opts.animate);
    const { col1, col2, texture } = st;
    const colMid = mix(col1, col2, 0.5);
    const glass = vessel.glass;

    // Liquid level. The hollow is the outline shrunk by the wall thickness.
    const liquidBottom = G.bottom - WALL - 3;
    const liquidTop = liquidBottom - st.fill * (liquidBottom - 64);
    const liquidH = liquidBottom - liquidTop;
    const inner = (y) => Math.max(2, G.halfAt(y) - WALL);
    const xIn = (y, spread = 0.8) => 100 + (rng() * 2 - 1) * inner(y) * spread;
    const surfRx = inner(liquidTop);
    const surfRy = Math.max(1.2, Math.min(6.5, surfRx * 0.16)) * (has("viscous") ? 1.2 : 1);
    // A level seen slightly from above: full ellipse, or just its front arc.
    const frontArc = (y) => {
      const w = inner(y) + 1;
      const ry = Math.max(1.2, Math.min(6.5, w * 0.16));
      return { w, ry, d: `M${n1(100 - w)},${n1(y)} A${n1(w)} ${n1(ry)} 0 0 0 ${n1(100 + w)},${n1(y)}` };
    };
    const slab = (y, fill, opacity) => {
      const a = frontArc(y);
      return `<path d="${a.d} L190,${n1(y)} L190,250 L10,250 L10,${n1(y)} Z" fill="${fill}" opacity="${opacity}"/>`;
    };

    // ---- liquid body & texture
    let liquidBody = `<rect x="10" y="${n1(liquidTop)}" width="180" height="${n1(250 - liquidTop)}" fill="${ref("liq-grad")}"/>`;
    let overlay = "";
    let surfaceColor = lighten(col1, 0.24);

    if (texture === "layered") {
      const y1 = liquidTop + liquidH * 0.34;
      const y2 = liquidTop + liquidH * 0.68;
      const a1 = frontArc(y1);
      const a2 = frontArc(y2);
      liquidBody = `
        <rect x="10" y="${n1(liquidTop)}" width="180" height="${n1(250 - liquidTop)}" fill="${col1}"/>
        <ellipse cx="100" cy="${n1(y1)}" rx="${n1(a1.w)}" ry="${n1(a1.ry)}" fill="${lighten(colMid, 0.18)}" opacity="0.75"/>
        ${slab(y1, colMid, 1)}
        <path d="${a1.d}" fill="none" stroke="#ffffff" stroke-width="0.9" opacity="0.45"/>
        <ellipse cx="100" cy="${n1(y2)}" rx="${n1(a2.w)}" ry="${n1(a2.ry)}" fill="${lighten(col2, 0.18)}" opacity="0.75"/>
        ${slab(y2, col2, 1)}
        <path d="${a2.d}" fill="none" stroke="#ffffff" stroke-width="0.9" opacity="0.4"/>
        <rect x="10" y="${n1(y1 + 2)}" width="180" height="5" fill="${col1}" opacity="0.28" filter="${ref("blur-m")}"/>
        <rect x="10" y="${n1(y2 + 2)}" width="180" height="5" fill="${colMid}" opacity="0.28" filter="${ref("blur-m")}"/>`;
    } else if (texture === "rainbow") {
      surfaceColor = "#ff7c88";
      liquidBody = `<rect x="10" y="${n1(liquidTop)}" width="180" height="${n1(250 - liquidTop)}" fill="${ref("rainbow-grad")}"/>`;
      for (let i = 0; i < 5; i++) {
        const y = liquidTop + liquidH * (0.12 + i * 0.19);
        const a = frontArc(y);
        overlay += `<path d="${a.d}" fill="none" stroke="#ffffff" stroke-width="${n1(rand(1.5, 3.5))}" opacity="0.2" filter="${ref("blur-s")}"/>`;
      }
      for (let i = 0; i < 6; i++) {
        const y = rand(liquidTop + 8, liquidBottom - 6);
        overlay += `<path d="${sparklePath(xIn(y, 0.7), y, rand(1.6, 3.2))}" fill="#ffffff" opacity="0.8">${twinkle(animate, rand(1.6, 3), rand(0, 3), 0.15, 0.8)}</path>`;
      }
    } else if (texture === "astral") {
      surfaceColor = "#3a2466";
      let stars = "";
      for (let i = 0; i < 34; i++) {
        const y = rand(liquidTop + 4, liquidBottom - 3);
        const x = xIn(y, 0.9);
        const o = rand(0.35, 1);
        stars += i % 7 === 0
          ? `<path d="${sparklePath(x, y, rand(2, 3.6))}" fill="#ffffff" opacity="${n1(o)}">${twinkle(animate, rand(1.8, 3.6), rand(0, 4), 0.2, o)}</path>`
          : `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(rand(0.4, 1.2))}" fill="${i % 5 === 0 ? lighten(col1, 0.6) : "#ffffff"}" opacity="${n1(o)}">${i % 3 === 0 ? twinkle(animate, rand(1.4, 3.2), rand(0, 4), 0.15, o) : ""}</circle>`;
      }
      liquidBody = `
        <rect x="10" y="${n1(liquidTop)}" width="180" height="${n1(250 - liquidTop)}" fill="${ref("astral-grad")}"/>
        <ellipse cx="${n1(100 - surfRx * 0.2)}" cy="${n1(liquidTop + liquidH * 0.38)}" rx="${n1(G.maxHalf * 0.62)}" ry="${n1(liquidH * 0.26)}" fill="${col1}" filter="${ref("blur-l")}" opacity="0.55"/>
        <ellipse cx="${n1(100 + surfRx * 0.25)}" cy="${n1(liquidTop + liquidH * 0.72)}" rx="${n1(G.maxHalf * 0.55)}" ry="${n1(liquidH * 0.22)}" fill="${col2}" filter="${ref("blur-l")}" opacity="0.55"/>
        <path d="M${n1(100 - G.maxHalf)},${n1(liquidTop + liquidH * 0.8)} Q100,${n1(liquidTop + liquidH * 0.35)} ${n1(100 + G.maxHalf)},${n1(liquidTop + liquidH * 0.3)}" fill="none" stroke="#ffffff" stroke-width="7" opacity="0.1" filter="${ref("blur-m")}"/>
        ${stars}`;
    } else if (texture === "suspended") {
      const leaf = lighten(mix("#f7dc6f", col2, 0.25), 0.15);
      for (let i = 0; i < 22; i++) {
        const y = rand(liquidTop + 6, liquidBottom - 4);
        const x = xIn(y, 0.82);
        const s = rand(1.4, 4.2);
        const rot = rand(0, 180);
        const far = i % 3 === 0;
        overlay += `<polygon points="0,${n1(-s)} ${n1(s * 0.9)},${n1(-s * 0.1)} ${n1(s * 0.2)},${n1(s * 0.8)} ${n1(-s * 0.8)},${n1(s * 0.25)}" transform="translate(${n1(x)},${n1(y)}) rotate(${n1(rot)})" fill="${far ? darken(leaf, 0.15) : leaf}" stroke="#ffffff" stroke-width="0.35" opacity="${far ? 0.5 : 0.85}"${far ? ` filter="${ref("blur-s")}"` : ""}/>`;
      }
      for (let i = 0; i < 5; i++) {
        const y = rand(liquidTop + 8, liquidBottom - 6);
        overlay += `<path d="${sparklePath(xIn(y, 0.7), y, rand(1.4, 2.6))}" fill="#fffbe0" opacity="0.9">${twinkle(animate, rand(1.5, 3), rand(0, 3), 0.1, 0.9)}</path>`;
      }
    } else if (texture === "marbled") {
      const pale = lighten(col2, 0.55);
      for (let i = 0; i < 5; i++) {
        const y = liquidTop + liquidH * (0.14 + i * 0.17) + rand(-3, 3);
        const w = G.maxHalf;
        const d = `M${n1(100 - w)},${n1(y + rand(-6, 6))} C${n1(100 - w * 0.4)},${n1(y - rand(8, 16))} ${n1(100 - w * 0.1)},${n1(y + rand(8, 16))} 100,${n1(y)} S${n1(100 + w * 0.6)},${n1(y - rand(6, 14))} ${n1(100 + w)},${n1(y + rand(-6, 6))}`;
        overlay += `<path d="${d}" fill="none" stroke="${pale}" stroke-width="${n1(rand(4, 8))}" opacity="0.3" stroke-linecap="round" filter="${ref("blur-m")}"/>
          <path d="${d}" fill="none" stroke="#ffffff" stroke-width="${n1(rand(0.6, 1.4))}" opacity="0.55" stroke-linecap="round"/>`;
      }
    } else if (texture === "voltaic") {
      let bolts = "";
      for (let i = 0; i < 4; i++) {
        let y = liquidTop + rand(3, 8);
        let x = xIn(y, 0.6);
        let d = `M${n1(x)},${n1(y)}`;
        let branch = "";
        const steps = 6;
        for (let s = 1; s <= steps; s++) {
          y += (liquidH - 12) / steps;
          x = Math.max(100 - inner(y) + 3, Math.min(100 + inner(y) - 3, x + rand(-11, 11)));
          d += ` L${n1(x)},${n1(y)}`;
          if (s === 2 || s === 4) branch += `M${n1(x)},${n1(y)} l${n1(rand(-9, 9))},${n1(rand(4, 9))} l${n1(rand(-5, 5))},${n1(rand(3, 7))} `;
        }
        bolts += `<g>
          <path d="${d} ${branch}" fill="none" stroke="${lighten(col1, 0.5)}" stroke-width="4.5" opacity="0.5" stroke-linejoin="round" filter="${ref("blur-m")}"/>
          <path d="${d} ${branch}" fill="none" stroke="#f4fbff" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>
          ${animate ? `<animate attributeName="opacity" values="1;0.25;0.9;0.4;1" dur="${n1(rand(1.1, 2.4))}s" begin="-${n1(rand(0, 2))}s" repeatCount="indefinite"/>` : ""}
        </g>`;
      }
      overlay = bolts;
    } else {
      // plain gradient: two soft currents keep it from looking flat
      overlay = `
        <ellipse cx="${n1(100 - G.maxHalf * 0.25)}" cy="${n1(liquidTop + liquidH * 0.4)}" rx="${n1(G.maxHalf * 0.4)}" ry="${n1(liquidH * 0.2)}" fill="${lighten(col1, 0.35)}" opacity="0.28" filter="${ref("blur-l")}"/>
        <ellipse cx="${n1(100 + G.maxHalf * 0.2)}" cy="${n1(liquidTop + liquidH * 0.75)}" rx="${n1(G.maxHalf * 0.45)}" ry="${n1(liquidH * 0.16)}" fill="${darken(col2, 0.3)}" opacity="0.3" filter="${ref("blur-l")}"/>`;
    }

    // ---- what the tags add inside the liquid
    let inLiquid = "";
    let headspace = "";
    let aura = "";

    if (has("necrotic")) {
      const ink = darken(col2, 0.75);
      for (let i = 0; i < 3; i++) {
        const x0 = xIn(liquidBottom - 4, 0.6);
        const d = `M${n1(x0)},${n1(liquidBottom)} C${n1(x0 + rand(-16, 16))},${n1(liquidBottom - liquidH * 0.3)} ${n1(x0 + rand(-18, 18))},${n1(liquidBottom - liquidH * 0.55)} ${n1(x0 + rand(-10, 10))},${n1(liquidTop + liquidH * rand(0.1, 0.3))}`;
        inLiquid += `<path d="${d}" fill="none" stroke="${ink}" stroke-width="${n1(rand(4, 7))}" stroke-linecap="round" opacity="0.5" filter="${ref("blur-m")}"/>`;
      }
      inLiquid += `<ellipse cx="100" cy="${n1(liquidBottom + 1)}" rx="${n1(inner(liquidBottom - 3))}" ry="5" fill="${ink}" opacity="0.6" filter="${ref("blur-m")}"/>`;
      for (let i = 0; i < 6; i++) {
        const y = rand(liquidTop + 8, liquidBottom - 4);
        inLiquid += `<circle cx="${n1(xIn(y))}" cy="${n1(y)}" r="${n1(rand(0.5, 1.1))}" fill="#e8e2d5" opacity="0.6"/>`;
      }
    }

    if (has("psychoactive")) {
      const hues = ["#ff9ad5", "#8be9ff", "#c9a0ff"];
      for (let i = 0; i < 3; i++) {
        const y = liquidTop + liquidH * (0.25 + i * 0.25);
        const w = G.maxHalf * 0.8;
        const d = `M${n1(100 - w)},${n1(y)} C${n1(100 - w * 0.3)},${n1(y - 18)} ${n1(100 + w * 0.3)},${n1(y + 18)} ${n1(100 + w)},${n1(y + rand(-8, 8))}`;
        inLiquid += `<path d="${d}" fill="none" stroke="${hues[i]}" stroke-width="6" stroke-linecap="round" opacity="0.32" filter="${ref("blur-m")}"/>`;
      }
    }

    if (has("igneous")) {
      // a glowing bed of embers, sparks drifting up, heat shimmer above
      inLiquid += `<ellipse cx="100" cy="${n1(liquidBottom - 1)}" rx="${n1(inner(liquidBottom - 4) * 0.95)}" ry="${n1(Math.min(16, liquidH * 0.28))}" fill="#ff7a1a" opacity="0.5" filter="${ref("blur-l")}"/>`;
      for (let i = 0; i < 12; i++) {
        const y = rand(liquidTop + 8, liquidBottom - 3);
        const x = xIn(y, 0.75);
        const r = rand(0.6, 1.6);
        const rise = Math.max(4, y - liquidTop - 4);
        const dur = rand(3, 6);
        const motion = animate
          ? `<animateTransform attributeName="transform" type="translate" values="0 0;${n1(rand(-4, 4))} ${n1(-rise)}" dur="${n1(dur)}s" begin="-${n1(rand(0, dur))}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;0.8;0" dur="${n1(dur)}s" begin="-${n1(rand(0, dur))}s" repeatCount="indefinite"/>`
          : "";
        inLiquid += `<g>${motion}<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r * 2.4)}" fill="#ff9a3c" opacity="0.45" filter="${ref("blur-s")}"/><circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="#ffe08a"/></g>`;
      }
      for (let i = 0; i < 3; i++) {
        const x = 100 + (i - 1) * surfRx * 0.42;
        const y0 = liquidTop - 3;
        const y1 = Math.max(66, liquidTop - rand(14, 24));
        headspace += `<path d="M${n1(x)},${n1(y0)} q4,-4 0,-8 t0,-8 t0,${n1(y1 - y0 + 16)}" fill="none" stroke="#ffd2a0" stroke-width="1.2" opacity="0.28" stroke-linecap="round"/>`;
      }
    }

    if (has("verdant")) {
      // stems rising from the base, with leaves; seeds drifting
      const stem = darken(mix("#4f9a3a", col2, 0.2), 0.15);
      const leaf = mix("#6fbf4a", col1, 0.18);
      for (let i = 0; i < 3; i++) {
        const x0 = 100 + (i - 1) * inner(liquidBottom - 4) * 0.45 + rand(-3, 3);
        const top = liquidTop + liquidH * rand(0.22, 0.5);
        const bend = rand(-12, 12);
        const d = `M${n1(x0)},${n1(liquidBottom + 2)} C${n1(x0 + bend)},${n1(liquidBottom - liquidH * 0.3)} ${n1(x0 - bend)},${n1(top + liquidH * 0.2)} ${n1(x0 + bend * 0.4)},${n1(top)}`;
        inLiquid += `<path d="${d}" fill="none" stroke="${stem}" stroke-width="1.6" stroke-linecap="round" opacity="0.9"/>`;
        for (let k = 1; k <= 3; k++) {
          const t = k / 4;
          const ly = liquidBottom + 2 - (liquidBottom + 2 - top) * t;
          const lx = x0 + bend * (0.6 - t) * 0.8;
          const side = k % 2 ? 1 : -1;
          const rot = side * rand(30, 55);
          inLiquid += `<ellipse cx="${n1(lx + side * 3.4)}" cy="${n1(ly)}" rx="3.8" ry="1.6" transform="rotate(${n1(rot)} ${n1(lx + side * 3.4)} ${n1(ly)})" fill="${leaf}" stroke="${stem}" stroke-width="0.4" opacity="0.92"/>`;
        }
        inLiquid += `<circle cx="${n1(x0 + bend * 0.4)}" cy="${n1(top - 1.4)}" r="1.5" fill="${lighten(leaf, 0.4)}"/>`;
      }
      for (let i = 0; i < 7; i++) {
        const y = rand(liquidTop + 6, liquidBottom - 6);
        inLiquid += `<ellipse cx="${n1(xIn(y, 0.75))}" cy="${n1(y)}" rx="0.9" ry="0.55" fill="#f4f1d0" opacity="0.7"/>`;
      }
    }

    if (has("arcane")) {
      // a slowly turning rune ring hanging mid-liquid, and drifting motes
      // hang it in the largest stretch of liquid the label leaves visible
      const L = G.label;
      const bands = st.showLabel
        ? [[Math.max(liquidTop, L.bottom), liquidBottom], [liquidTop, Math.min(liquidBottom, L.top)]]
        : [[liquidTop, liquidBottom]];
      const [b0, b1] = bands.reduce((best, b) => (b[1] - b[0] > best[1] - best[0] ? b : best));
      const cy = (b0 + b1) / 2;
      const r = Math.min(inner(cy) * 0.6, (b1 - b0) / 2 - 2, 22);
      // pale liquids get dark ink, dark liquids glowing ink
      const [lr, lg, lb] = rgbOf(mix(col1, col2, 0.6));
      const pale = (0.2126 * lr + 0.7152 * lg + 0.0722 * lb) / 255 > 0.55;
      const ink = pale ? darken(mix("#5b3fc4", col1, 0.15), 0.1) : lighten(mix("#b7a4ff", col1, 0.25), 0.25);
      if (r > 6) {
        let ticks = "";
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const r1 = r * (k % 3 === 0 ? 0.72 : 0.84);
          ticks += `M${n1(100 + Math.cos(a) * r1)},${n1(cy + Math.sin(a) * r1)} L${n1(100 + Math.cos(a) * r)},${n1(cy + Math.sin(a) * r)} `;
        }
        const tri = [0, 1, 2].map((k) => {
          const a = -Math.PI / 2 + (k / 3) * Math.PI * 2;
          return `${n1(100 + Math.cos(a) * r * 0.6)},${n1(cy + Math.sin(a) * r * 0.6)}`;
        }).join(" ");
        const spin = animate
          ? `<animateTransform attributeName="transform" type="rotate" from="0 100 ${n1(cy)}" to="360 100 ${n1(cy)}" dur="40s" repeatCount="indefinite"/>`
          : "";
        inLiquid += `<g opacity="0.75">${spin}
          <circle cx="100" cy="${n1(cy)}" r="${n1(r)}" fill="none" stroke="${ink}" stroke-width="2.6" opacity="0.35" filter="${ref("blur-s")}"/>
          <circle cx="100" cy="${n1(cy)}" r="${n1(r)}" fill="none" stroke="${ink}" stroke-width="0.8"/>
          <circle cx="100" cy="${n1(cy)}" r="${n1(r * 0.6)}" fill="none" stroke="${ink}" stroke-width="0.5" stroke-dasharray="1.5 2"/>
          <path d="${ticks}" stroke="${ink}" stroke-width="0.6"/>
          <polygon points="${tri}" fill="none" stroke="${ink}" stroke-width="0.6"/>
        </g>`;
      }
      for (let i = 0; i < 8; i++) {
        const y = rand(liquidTop + 6, liquidBottom - 5);
        const o = rand(0.4, 0.95);
        inLiquid += `<circle cx="${n1(xIn(y, 0.8))}" cy="${n1(y)}" r="${n1(rand(0.6, 1.3))}" fill="${ink}" opacity="${n1(o)}">${twinkle(animate, rand(1.6, 3.4), rand(0, 3), 0.15, o)}</circle>`;
      }
    }

    if (has("luminous")) {
      const glow = lighten(col1, 0.55);
      inLiquid += `<ellipse cx="100" cy="${n1(liquidTop + liquidH * 0.5)}" rx="${n1(G.maxHalf * 0.6)}" ry="${n1(liquidH * 0.42)}" fill="${glow}" opacity="0.3" filter="${ref("blur-l")}"/>`;
      for (let i = 0; i < 9; i++) {
        const y = rand(liquidTop + 6, liquidBottom - 5);
        const x = xIn(y, 0.75);
        inLiquid += `<g>${twinkle(animate, rand(1.8, 3.6), rand(0, 4), 0.25, 1)}<circle cx="${n1(x)}" cy="${n1(y)}" r="2.6" fill="${glow}" opacity="0.55" filter="${ref("blur-s")}"/><circle cx="${n1(x)}" cy="${n1(y)}" r="0.8" fill="#ffffff"/></g>`;
      }
      aura = `<ellipse cx="100" cy="${n1((G.bodyTop + G.bottom) / 2)}" rx="${n1(G.maxHalf + 20)}" ry="${n1((G.bottom - G.bodyTop) / 2 + 16)}" fill="${glow}" opacity="0.2" filter="${ref("blur-xl")}">${twinkle(animate, 4.2, 0, 0.1, 0.24)}</ellipse>`;
    }

    if (has("volatile") || has("corrosive")) {
      const count = has("volatile") ? 14 : 9;
      for (let i = 0; i < count; i++) {
        const y = rand(liquidTop + 6, liquidBottom - 3);
        const x = xIn(y, 0.78);
        const r = rand(0.9, 3.2);
        const rise = y - liquidTop - 2;
        const dur = rand(2.6, 5.5);
        const motion = animate
          ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 ${n1(-rise)}" dur="${n1(dur)}s" begin="-${n1(rand(0, dur))}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" dur="${n1(dur)}s" begin="-${n1(rand(0, dur))}s" repeatCount="indefinite"/>`
          : "";
        inLiquid += `<g>${motion}<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="#ffffff" fill-opacity="0.12" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.65"/><circle cx="${n1(x - r * 0.35)}" cy="${n1(y - r * 0.35)}" r="${n1(Math.max(0.3, r * 0.22))}" fill="#ffffff" opacity="0.85"/></g>`;
      }
      // froth clinging to the surface
      for (let i = 0; i < 12; i++) {
        const a = rand(0, Math.PI);
        const x = 100 + Math.cos(a) * surfRx * rand(0.55, 0.98);
        const y = liquidTop + Math.sin(a) * surfRy * rand(0.2, 0.9);
        headspace += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(rand(0.8, 1.9))}" fill="#ffffff" fill-opacity="0.25" stroke="#ffffff" stroke-width="0.4" stroke-opacity="0.7"/>`;
      }
    }

    if (has("volatile")) {
      for (let i = 0; i < 3; i++) {
        const x = 100 + (i - 1) * surfRx * 0.45 + rand(-2, 2);
        const topY = Math.max(66, liquidTop - rand(18, 34));
        headspace += `<path d="M${n1(x)},${n1(liquidTop - 1)} C${n1(x + rand(-7, 7))},${n1(liquidTop - 9)} ${n1(x + rand(-8, 8))},${n1(topY + 8)} ${n1(100 + (x - 100) * 0.3)},${n1(topY)}" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.2" filter="${ref("blur-m")}"/>`;
      }
    }

    if (has("corrosive")) {
      headspace += `<ellipse cx="100" cy="${n1(liquidTop - 5)}" rx="${n1(surfRx)}" ry="7" fill="${lighten(col1, 0.4)}" opacity="0.22" filter="${ref("blur-m")}"/>`;
    }

    if (has("viscous")) {
      // a film left on the glass above the level, with slow runs
      headspace += `<rect x="10" y="${n1(liquidTop - 6)}" width="180" height="6.5" fill="${col1}" opacity="0.3"/>`;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          const y0 = liquidTop - rand(12, 24);
          const x = 100 + side * (inner(y0) - rand(1.5, 6));
          headspace += `<path d="M${n1(x)},${n1(y0)} V${n1(liquidTop - 1)}" stroke="${lighten(col1, 0.15)}" stroke-width="${n1(rand(1.6, 2.6))}" stroke-linecap="round" opacity="0.4"/>`;
        }
      }
      for (let i = 0; i < 3; i++) {
        const y = rand(liquidTop + 10, liquidBottom - 8);
        const r = rand(2.5, 4.5);
        const x = xIn(y, 0.6);
        inLiquid += `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(r)}" fill="#ffffff" fill-opacity="0.08" stroke="#ffffff" stroke-width="0.6" stroke-opacity="0.45"/><circle cx="${n1(x - r * 0.35)}" cy="${n1(y - r * 0.35)}" r="${n1(r * 0.22)}" fill="#ffffff" opacity="0.7"/>`;
      }
    }

    if (has("cryogenic")) {
      for (let i = 0; i < 4; i++) {
        const x = 100 + rand(-0.75, 0.75) * surfRx;
        const s = rand(2.5, 5);
        headspace += `<polygon points="${n1(x - s)},${n1(liquidTop + 1)} ${n1(x - s * 0.3)},${n1(liquidTop - s * 0.9)} ${n1(x + s * 0.8)},${n1(liquidTop - s * 0.4)} ${n1(x + s)},${n1(liquidTop + 1.4)}" fill="#e8f8ff" stroke="#ffffff" stroke-width="0.4" opacity="0.8"/>`;
      }
    }

    // ---- surface
    const surface = `
      <ellipse cx="100" cy="${n1(liquidTop)}" rx="${n1(surfRx + 1)}" ry="${n1(surfRy)}" fill="${surfaceColor}"/>
      <ellipse cx="100" cy="${n1(liquidTop)}" rx="${n1(surfRx + 1)}" ry="${n1(surfRy)}" fill="${ref("surface-shade")}"/>
      <ellipse cx="${n1(100 - surfRx * 0.38)}" cy="${n1(liquidTop - surfRy * 0.15)}" rx="${n1(surfRx * 0.3)}" ry="${n1(surfRy * 0.34)}" fill="#ffffff" opacity="0.32"/>
      <path d="M${n1(99 - surfRx)},${n1(liquidTop)} A${n1(surfRx + 1)} ${n1(surfRy)} 0 0 0 ${n1(101 + surfRx)},${n1(liquidTop)}" fill="none" stroke="#ffffff" stroke-width="1" opacity="0.55"/>
      <path d="M${n1(99 - surfRx)},${n1(liquidTop)} A${n1(surfRx + 1)} ${n1(surfRy)} 0 0 1 ${n1(101 + surfRx)},${n1(liquidTop)}" fill="none" stroke="#000000" stroke-width="0.8" opacity="0.25"/>`;

    // ---- glass highlights that follow the outline
    const bodyH = G.bottom - G.bodyTop;
    let streak = "";
    {
      const y0 = G.bodyTop + bodyH * 0.1;
      const y1 = G.bodyTop + bodyH * 0.62;
      const outer = [];
      const innerPts = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14;
        const y = y0 + (y1 - y0) * t;
        const half = G.halfAt(y);
        if (half < 12) continue;
        const edge = 100 - half + WALL + 2.2;
        const thick = 1 + 4.6 * Math.pow(Math.sin(Math.PI * t), 0.8);
        outer.push(`${n1(edge)},${n1(y)}`);
        innerPts.unshift(`${n1(Math.min(edge + thick, 97))},${n1(y)}`);
      }
      if (outer.length > 3) streak += `<polygon points="${outer.join(" ")} ${innerPts.join(" ")}" fill="#ffffff" opacity="0.5"/>`;
      const y2 = G.bodyTop + bodyH * 0.7;
      const y3 = G.bodyTop + bodyH * 0.8;
      if (G.halfAt(y2) > 12 && G.halfAt(y3) > 12) {
        streak += `<path d="M${n1(100 - G.halfAt(y2) + WALL + 3)},${n1(y2)} L${n1(100 - G.halfAt(y3) + WALL + 3.4)},${n1(y3)}" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" opacity="0.4"/>`;
      }
      // rim light along the far side
      const rim = [];
      for (let k = 0; k <= 12; k++) {
        const y = G.bodyTop + bodyH * (0.22 + 0.6 * (k / 12));
        const half = G.halfAt(y);
        if (half > 12) rim.push(`${n1(100 + half - WALL - 1.6)},${n1(y)}`);
      }
      if (rim.length > 3) streak += `<polyline points="${rim.join(" ")}" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round" opacity="0.26"/>`;
    }

    let facets = "";
    if (vessel.faceted) {
      const fx = G.maxHalf * 0.42;
      const yA = G.bodyTop + 6;
      const yB = G.bottom - 2;
      facets = `
        <rect x="${n1(100 - fx)}" y="${n1(yA)}" width="${n1(fx * 2)}" height="${n1(yB - yA)}" fill="#ffffff" opacity="0.05"/>
        <rect x="${n1(100 + fx)}" y="${n1(yA)}" width="80" height="${n1(yB - yA)}" fill="#000000" opacity="0.14"/>
        <path d="M${n1(100 - fx)},${n1(yA)} V${n1(yB)} M${n1(100 + fx)},${n1(yA)} V${n1(yB)}" stroke="#ffffff" stroke-width="0.9" opacity="0.35"/>
        <path d="M${n1(100 - fx + 1.2)},${n1(yA)} V${n1(yB)} M${n1(100 + fx + 1.2)},${n1(yA)} V${n1(yB)}" stroke="#000000" stroke-width="0.9" opacity="0.25"/>`;
    }

    // ---- frost & etching on the outside
    let outside = "";
    if (has("cryogenic")) {
      let shards = "";
      const w = G.halfAt(G.bottom - 6);
      for (let i = 0; i < 11; i++) {
        const bx = 100 - w + (i / 10) * w * 2 + rand(-3, 3);
        const peak = G.bottom - rand(10, 30);
        const hw = rand(4, 9);
        shards += `<polygon points="${n1(bx - hw)},${n1(G.bottom + 2)} ${n1(bx + rand(-2, 2))},${n1(peak)} ${n1(bx + hw)},${n1(G.bottom + 2)}" fill="#eaf8ff" opacity="${n1(rand(0.16, 0.34))}"/>`;
      }
      let crystals = "";
      for (let i = 0; i < 7; i++) {
        const y = rand(G.bodyTop + 12, G.bottom - 12);
        const side = i % 2 ? 1 : -1;
        const half = G.halfAt(y);
        if (half < 14) continue;
        crystals += `<path d="${frostCrystal(100 + side * (half - rand(7, 13)), y, rand(4, 8), rand(0, 60))}" fill="none" stroke="#ffffff" stroke-width="0.8" stroke-linecap="round" opacity="${n1(rand(0.5, 0.85))}"/>`;
      }
      outside += `<g clip-path="${ref("glass-clip")}">
        <path d="${glass}" fill="none" stroke="#e8f6ff" stroke-width="24" opacity="0.42" filter="${ref("blur-l")}" mask="${ref("frost-mask")}"/>
        ${shards}${crystals}
      </g>`;
    }
    if (has("corrosive")) {
      let pits = "";
      for (let i = 0; i < 12; i++) {
        const y = rand(G.bodyTop + 8, G.bottom - 8);
        const side = i % 2 ? 1 : -1;
        const half = G.halfAt(y);
        if (half < 14) continue;
        const x = 100 + side * (half - rand(2.5, 9));
        pits += `<ellipse cx="${n1(x)}" cy="${n1(y)}" rx="${n1(rand(0.6, 1.6))}" ry="${n1(rand(0.5, 1.2))}" fill="#ffffff" opacity="0.16" stroke="#000000" stroke-width="0.3" stroke-opacity="0.3"/>`;
      }
      outside += `<g clip-path="${ref("glass-clip")}">${pits}</g>`;
    }

    // ---- label
    const vellum = VELLUM_PALETTES[st.vellum] || VELLUM_PALETTES.aged;
    let label = "";
    let labelClip = "";
    if (st.showLabel) {
      const L = G.label;
      const sag = vessel.faceted ? 0 : Math.min(3, (L.right - L.left) * 0.035);
      const edge = (x, yA, yB, dir) => {
        // a deckled side, top to bottom (dir 1) or bottom to top (dir -1)
        let d = "";
        const steps = 6;
        for (let k = 1; k <= steps; k++) {
          const t = dir === 1 ? k / steps : 1 - k / steps;
          const y = yA + (yB - yA) * t;
          const jitter = k === steps ? 0 : rand(0, 1.8) * (x > 100 ? -1 : 1);
          d += ` L${n1(x + jitter)},${n1(y)}`;
        }
        return d;
      };
      const shape = `M${n1(L.left)},${L.top} Q100,${n1(L.top + sag * 2)} ${n1(L.right)},${L.top}${edge(L.right, L.top, L.bottom, 1)} Q100,${n1(L.bottom + sag * 2)} ${n1(L.left)},${L.bottom}${edge(L.left, L.top, L.bottom, -1)} Z`;
      const rule = (y, inset) => `M${n1(L.left + inset)},${n1(y)} Q100,${n1(y + sag * 2)} ${n1(L.right - inset)},${n1(y)}`;
      const width = L.right - L.left;
      const main = st.labelText || potion.active.code;
      const sub = st.labelSub || defaultLabelGlyphs(potion.seed);
      const textMax = Math.max(10, width - 13);
      const fMain = fitText(main, 9.4, 0.7, 0.7, textMax);
      const fSub = fitText(sub, 7.4, 0.62, 0.4, textMax);
      let stains = "";
      for (let i = 0; i < 4; i++) {
        stains += `<ellipse cx="${n1(rand(L.left, L.right))}" cy="${n1(rand(L.top, L.bottom))}" rx="${n1(rand(4, 11))}" ry="${n1(rand(3, 7))}" fill="${vellum.border}" opacity="${n1(rand(0.1, 0.24))}" filter="${ref("blur-m")}"/>`;
      }
      const mainY = L.top + 17.5;
      const subY = L.top + 31.5;
      label = `
      <g clip-path="${ref("glass-clip")}">
        <path d="${shape}" transform="translate(0.9,1.5)" fill="#000000" opacity="0.4" filter="${ref("blur-s")}"/>
        <path d="${shape}" fill="${ref("parchment-grad")}" stroke="${vellum.border}" stroke-width="0.9" stroke-linejoin="round"/>
        <g clip-path="${ref("label-clip")}">
          ${stains}
          <rect x="${n1(L.left)}" y="${L.top - 2}" width="${n1(width)}" height="${LABEL_HEIGHT + 10}" fill="${ref("label-shade")}"/>
        </g>
        <path d="${rule(L.top + 3.6, 3.5)}" fill="none" stroke="${vellum.border}" stroke-width="0.9" opacity="0.8"/>
        <path d="${rule(L.top + 5.4, 3.5)}" fill="none" stroke="${vellum.border}" stroke-width="0.4" opacity="0.7"/>
        <path d="${rule(L.bottom - 3.6, 3.5)}" fill="none" stroke="${vellum.border}" stroke-width="0.9" opacity="0.8"/>
        <path d="${rule(L.bottom - 5.4, 3.5)}" fill="none" stroke="${vellum.border}" stroke-width="0.4" opacity="0.7"/>
        <path d="M${n1(100 - width * 0.26)},${n1(L.top + 22.6 + sag)} H${n1(100 - 3.4)} M${n1(100 + 3.4)},${n1(L.top + 22.6 + sag)} H${n1(100 + width * 0.26)}" stroke="${vellum.sub}" stroke-width="0.5" opacity="0.7"/>
        <path d="M100,${n1(L.top + 20.8 + sag)} l1.8,1.8 l-1.8,1.8 l-1.8,-1.8 Z" fill="${vellum.sub}" opacity="0.8"/>
        <path id="${id("label-main")}" d="${rule(mainY, 5)}" fill="none"/>
        <path id="${id("label-sub")}" d="${rule(subY, 5)}" fill="none"/>
        <text font-family="${FONT_DISPLAY}" font-size="${fMain.size}" font-weight="700" fill="${vellum.ink}" letter-spacing="${fMain.spacing}"><textPath href="#${id("label-main")}" startOffset="50%" text-anchor="middle"${fMain.lengthAttr}>${esc(main)}</textPath></text>
        <text font-family="${FONT_GLYPH}" font-size="${fSub.size}" fill="${vellum.sub}" letter-spacing="${fSub.spacing}"><textPath href="#${id("label-sub")}" startOffset="50%" text-anchor="middle"${fSub.lengthAttr}>${esc(sub)}</textPath></text>
      </g>`;
      labelClip = `<clipPath id="${id("label-clip")}"><path d="${shape}"/></clipPath>`;
    }

    // ---- wax, neck accessory, seal
    const waxPal = WAX_PALETTES[st.wax] || WAX_PALETTES.crimson;
    const finial = st.stopper !== "cork";
    const stopperRng = createRNG(potion.seed + ":stopper");
    const waxRng = createRNG(potion.seed + ":wax");
    const waxCap = st.showSeal ? renderWaxCap(waxPal, waxRng, finial, Math.min(G.bodyTop + 4, 84), ref) : "";
    const seal = st.showSeal ? renderSeal(waxPal, st.stamp, waxRng, G.sealY, ref) : "";

    // ---- sparkles for rare brews
    let glints = "";
    if ((RARITY_RANK[potion.rarity] || 0) >= 2) {
      const spots = [
        [100 - G.maxHalf - 6, G.maxHalfY - 26, 4.5],
        [100 + G.maxHalf + 4, G.maxHalfY + 8, 3.4],
        [100 + G.maxHalf * 0.55, G.bodyTop + 4, 2.6]
      ];
      spots.forEach(([x, y, r], i) => {
        glints += `<path d="${sparklePath(x, y, r)}" fill="#fff8dc" opacity="0.85">${twinkle(animate, 2.4 + i * 0.7, i * 0.9, 0.1, 0.85)}</path>`;
      });
    }

    const tint = GLASS_TINTS[st.glass] || GLASS_TINTS.clear;
    const glassEdge = mix(tint.stroke, "#b9c4c8", 0.4); // tinted glass keeps a grey edge
    const width = Math.max(1, Math.round(num(opts.width, 220)));
    const height = Math.max(1, Math.round(num(opts.height, 286)));
    const titleNode = opts.title ? `<title>${esc(opts.title)}</title>` : "";
    const left = n1(100 - G.maxHalf);
    const right = n1(100 + G.maxHalf);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="${width}" height="${height}" role="img"${opts.title ? "" : ' aria-hidden="true"'}>
    ${titleNode}
    <defs>
      <clipPath id="${id("glass-clip")}"><path d="${glass}"/></clipPath>
      ${labelClip}
      <!-- the hollow: the outline minus its wall, thicker at the base -->
      <mask id="${id("cavity")}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="260">
        <path d="${glass}" fill="#ffffff"/>
        <path d="${glass}" fill="none" stroke="#000000" stroke-width="${WALL * 2}" stroke-linejoin="round"/>
        <path d="${glass}" fill="none" stroke="#000000" stroke-width="${WALL * 2}" stroke-linejoin="round" transform="translate(0,-3)"/>
      </mask>
      <mask id="${id("inner-edge")}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="260">
        <path d="${glass}" fill="none" stroke="#ffffff" stroke-width="${WALL * 2 + 1.5}" stroke-linejoin="round"/>
        <path d="${glass}" fill="none" stroke="#000000" stroke-width="${WALL * 2}" stroke-linejoin="round"/>
      </mask>
      <linearGradient id="${id("fade-left")}" gradientUnits="userSpaceOnUse" x1="${left}" y1="0" x2="${right}" y2="0">
        <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#000000"/>
      </linearGradient>
      <linearGradient id="${id("fade-right")}" gradientUnits="userSpaceOnUse" x1="${left}" y1="0" x2="${right}" y2="0">
        <stop offset="0.45" stop-color="#000000"/><stop offset="1" stop-color="#ffffff"/>
      </linearGradient>
      <linearGradient id="${id("fade-up")}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(G.bodyTop)}" x2="0" y2="${n1(G.bottom)}">
        <stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#ffffff"/>
      </linearGradient>
      <mask id="${id("left-mask")}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="260"><rect width="200" height="260" fill="${ref("fade-left")}"/></mask>
      <mask id="${id("right-mask")}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="260"><rect width="200" height="260" fill="${ref("fade-right")}"/></mask>
      <mask id="${id("frost-mask")}" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="260"><rect width="200" height="260" fill="${ref("fade-up")}"/></mask>
      <filter id="${id("blur-s")}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>
      <filter id="${id("blur-m")}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.6"/></filter>
      <filter id="${id("blur-l")}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
      <filter id="${id("blur-xl")}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="11"/></filter>
      <linearGradient id="${id("liq-grad")}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(liquidTop)}" x2="0" y2="${n1(liquidBottom + 4)}">
        <stop offset="0" stop-color="${col1}"/><stop offset="1" stop-color="${col2}"/>
      </linearGradient>
      <linearGradient id="${id("rainbow-grad")}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(liquidTop)}" x2="0" y2="${n1(liquidBottom + 4)}">
        <stop offset="0" stop-color="#ff4d6d"/><stop offset="0.2" stop-color="#ff9f1c"/><stop offset="0.4" stop-color="#ffe066"/>
        <stop offset="0.6" stop-color="#2ec4b6"/><stop offset="0.8" stop-color="#3a86ff"/><stop offset="1" stop-color="#9b5de5"/>
      </linearGradient>
      <linearGradient id="${id("astral-grad")}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(liquidTop)}" x2="0" y2="${n1(liquidBottom + 4)}">
        <stop offset="0" stop-color="#1c1038"/><stop offset="1" stop-color="#070412"/>
      </linearGradient>
      <linearGradient id="${id("depth")}" gradientUnits="userSpaceOnUse" x1="${left}" y1="0" x2="${right}" y2="0">
        <stop offset="0" stop-color="#000000" stop-opacity="0.45"/><stop offset="0.24" stop-color="#000000" stop-opacity="0"/>
        <stop offset="0.6" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.55"/>
      </linearGradient>
      <linearGradient id="${id("floor")}" gradientUnits="userSpaceOnUse" x1="0" y1="${n1(liquidBottom - 34)}" x2="0" y2="${n1(liquidBottom + 4)}">
        <stop offset="0" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.34"/>
      </linearGradient>
      <linearGradient id="${id("surface-shade")}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000000" stop-opacity="0.3"/><stop offset="0.3" stop-color="#ffffff" stop-opacity="0.12"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.38"/>
      </linearGradient>
      <linearGradient id="${id("glass-stroke")}" gradientUnits="userSpaceOnUse" x1="${left}" y1="${n1(G.top)}" x2="${right}" y2="${n1(G.bottom)}">
        <stop offset="0" stop-color="${lighten(glassEdge, 0.3)}"/><stop offset="0.5" stop-color="${glassEdge}"/><stop offset="1" stop-color="${darken(glassEdge, 0.55)}"/>
      </linearGradient>
      <linearGradient id="${id("parchment-grad")}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${vellum.c1}"/><stop offset="1" stop-color="${vellum.c2}"/>
      </linearGradient>
      <linearGradient id="${id("label-shade")}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#000000" stop-opacity="${vessel.faceted ? 0.1 : 0.3}"/><stop offset="0.28" stop-color="#ffffff" stop-opacity="0.08"/>
        <stop offset="0.7" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="${vessel.faceted ? 0.16 : 0.36}"/>
      </linearGradient>
      <linearGradient id="${id("wax-grad")}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${lighten(waxPal.fill, 0.2)}"/><stop offset="0.4" stop-color="${waxPal.fill}"/><stop offset="1" stop-color="${darken(waxPal.fill, 0.35)}"/>
      </linearGradient>
      <radialGradient id="${id("wax-seal")}" cx="0.38" cy="0.32" r="0.8">
        <stop offset="0" stop-color="${lighten(waxPal.fill, 0.22)}"/><stop offset="0.55" stop-color="${waxPal.fill}"/><stop offset="1" stop-color="${darken(waxPal.fill, 0.35)}"/>
      </radialGradient>
      <linearGradient id="${id("cork-grad")}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#7a5230"/><stop offset="0.32" stop-color="#c9a070"/><stop offset="0.62" stop-color="#a87c4f"/><stop offset="1" stop-color="#63401f"/>
      </linearGradient>
      <linearGradient id="${id("brass-grad")}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6e5310"/><stop offset="0.3" stop-color="#f3d778"/><stop offset="0.58" stop-color="#c9a227"/><stop offset="1" stop-color="#6f5410"/>
      </linearGradient>
      <radialGradient id="${id("brass-knob")}" cx="0.36" cy="0.32" r="0.75">
        <stop offset="0" stop-color="#fbe9a4"/><stop offset="0.5" stop-color="#d4ac2e"/><stop offset="1" stop-color="#6f5410"/>
      </radialGradient>
      <radialGradient id="${id("bone-grad")}" cx="0.38" cy="0.3" r="0.85">
        <stop offset="0" stop-color="#f7f1e2"/><stop offset="0.6" stop-color="#ddd3bd"/><stop offset="1" stop-color="#a99e86"/>
      </radialGradient>
      <linearGradient id="${id("leather-grad")}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#3a231a"/><stop offset="0.35" stop-color="#6a4532"/><stop offset="1" stop-color="#2c1a13"/>
      </linearGradient>
      <linearGradient id="${id("tag-grad")}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f1e6cf"/><stop offset="1" stop-color="#cdb98f"/>
      </linearGradient>
    </defs>

    <!-- light the bottle throws, then its shadow -->
    ${aura}
    <ellipse cx="100" cy="${n1(G.bottom + 5)}" rx="${n1(Math.max(G.maxHalf * 0.95, 30))}" ry="8" fill="#000000" opacity="0.6" filter="${ref("blur-l")}"/>
    <ellipse cx="106" cy="${n1(G.bottom + 6)}" rx="${n1(Math.max(G.maxHalf * 0.6, 20))}" ry="5" fill="${colMid}" opacity="0.4" filter="${ref("blur-l")}"/>
    <ellipse cx="100" cy="${n1(G.bottom + 1.5)}" rx="${n1(G.baseHalf * 0.92)}" ry="2.6" fill="#000000" opacity="0.7"/>

    <!-- stopper (its plug shows through the neck) -->
    ${renderStopper(st.stopper, stopperRng, ref)}

    <!-- back of the glass -->
    <path d="${glass}" fill="${tint.fill}" opacity="${tint.fillOp}"/>
    <path d="${glass}" fill="#ffffff" opacity="0.04"/>

    <!-- the liquid, inside the hollow -->
    <g mask="${ref("cavity")}">
      ${liquidBody}
      ${overlay}
      ${inLiquid}
      <rect x="10" y="${n1(liquidTop)}" width="180" height="${n1(250 - liquidTop)}" fill="${ref("depth")}"/>
      <rect x="10" y="${n1(liquidBottom - 34)}" width="180" height="60" fill="${ref("floor")}"/>
      <ellipse cx="${n1(100 - G.maxHalf * 0.28)}" cy="${n1(liquidTop + liquidH * 0.45)}" rx="${n1(G.maxHalf * 0.34)}" ry="${n1(liquidH * 0.4)}" fill="#ffffff" opacity="0.1" filter="${ref("blur-l")}"/>
      ${surface}
      ${headspace}
    </g>

    <!-- glass: thickness at the edges, light from the upper left -->
    <g clip-path="${ref("glass-clip")}" pointer-events="none">
      <path d="${glass}" fill="none" stroke="#000000" stroke-width="13" opacity="0.26" filter="${ref("blur-m")}"/>
      <path d="${glass}" fill="none" stroke="#000000" stroke-width="20" opacity="0.3" filter="${ref("blur-m")}" mask="${ref("right-mask")}"/>
      <path d="${glass}" fill="none" stroke="#ffffff" stroke-width="18" opacity="0.26" filter="${ref("blur-m")}" mask="${ref("left-mask")}"/>
      ${facets}
      <rect width="200" height="260" fill="#ffffff" opacity="0.3" mask="${ref("inner-edge")}"/>
      ${streak}
      <path d="M91.4,64 L91,${n1(Math.min(G.bodyTop - 2, 80))} L93.6,${n1(Math.min(G.bodyTop - 2, 80))} L94,64 Z" fill="#ffffff" opacity="0.34"/>
      <ellipse cx="100" cy="${n1(G.bottom - 3.4)}" rx="${n1(G.baseHalf * 0.72)}" ry="2" fill="#ffffff" opacity="0.2"/>
    </g>

    <!-- glass outline and lip -->
    <path d="${glass}" fill="none" stroke="${ref("glass-stroke")}" stroke-width="2.3" stroke-linejoin="round" opacity="0.9"/>
    <path d="${glass}" fill="none" stroke="#ffffff" stroke-width="0.6" opacity="0.3" stroke-linejoin="round"/>
    <path d="M83,55.2 H117" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.55"/>

    ${outside}
    ${label}
    ${waxCap}
    ${renderNeckAccessory(st.neck, potion, col1, ref)}
    ${seal}
    ${glints}
  </svg>`;
  }

  // --- 15. THE SITE'S DATA ------------------------------------------------
  // Builds the engine's database from the Athenaeum store (data/schema.js:
  // solvent, principle, catalyst, vessel, reaction and the `alchemy` object).
  const storeDb = new WeakMap();
  function dbFromStore(store) {
    if (!store || typeof store.all !== "function") return null;
    if (storeDb.has(store)) return storeDb.get(store);
    const alchemy = (store.singletons && store.singletons.alchemy) || {};
    const meta = new Map((Array.isArray(alchemy.tags) ? alchemy.tags : []).map((t) => [tagId(t && t.id), t]));
    const listed = typeof store.enumOptions === "function" ? store.enumOptions("potionTag") : [];
    const tagIds = listed.length ? listed : [...meta.keys()].map((id) => ({ id }));
    const db = {
      vessels: normaliseVessels(store.all("vessel")),
      reagents: normaliseReagents({
        tags: tagIds.map((o) => ({ ...(meta.get(o.id) || {}), id: o.id, name: o.label })),
        forms: alchemy.forms,
        oddities: alchemy.oddities,
        solvents: store.all("solvent"),
        actives: store.all("principle"),
        catalysts: store.all("catalyst"),
        reactions: store.all("reaction")
      })
    };
    storeDb.set(store, db);
    return db;
  }

  // The bottle of an item card: item.potion = { seed, recipe, studio }.
  // Returns "" when the item has no potion or a reagent no longer exists.
  function itemArt(item, store, opts = {}) {
    const rec = item && item.potion;
    const db = dbFromStore(store);
    if (!rec || typeof rec !== "object" || !db) return "";
    const potion = brew(db, rec.recipe, typeof rec.seed === "string" && rec.seed ? rec.seed : undefined);
    if (!potion) return "";
    return renderSVG(potion, rec.studio, {
      uid: `${opts.uid || "card"}-${String(item.id || "x")}`,
      width: opts.width || 200,
      height: opts.height || 260,
      title: opts.title,
      animate: opts.animate
    });
  }

  // --- 16. SHOPS & ALCHEMISTS (poi.shop.potions, poi.alchemist) -----------
  const rarityRank = (r) => RARITY_RANK[r] ?? 0;

  // A copy of the database narrowed to some reagents (ids; an empty or
  // missing list keeps them all).
  function narrowDb(db, only = {}) {
    const keep = (list, ids) => (Array.isArray(ids) && ids.length ? list.filter((x) => ids.includes(x.id)) : list);
    return {
      vessels: keep(db.vessels, only.vessels),
      reagents: {
        ...db.reagents,
        solvents: keep(db.reagents.solvents, only.solvents),
        actives: keep(db.reagents.actives, only.actives),
        catalysts: keep(db.reagents.catalysts, only.catalysts)
      }
    };
  }

  // The potions on a shop's shelf: `count` different potions, none above
  // `maxRarity`, drawn from the market code (same code = same shelf for
  // everyone). Each keeps its seed, so the DM rebuilds the very same potion.
  function shopPotions(db, opts = {}) {
    const count = Math.max(0, Math.min(24, Math.round(num(opts.count, 0))));
    const cap = rarityRank(RARITIES.includes(opts.maxRarity) ? opts.maxRarity : "uncommon");
    const base = narrowDb(db, { actives: opts.principles });
    const pool = { ...base, reagents: { ...base.reagents, actives: base.reagents.actives.filter((a) => rarityRank(a.rarity) <= cap) } };
    if (!count || !pool.vessels.length || !pool.reagents.solvents.length || !pool.reagents.actives.length || !pool.reagents.catalysts.length) return [];
    const out = [];
    const seen = new Set();
    const stem = `${String(opts.code ?? "").trim().toUpperCase()}|${opts.poiId || ""}|potions`;
    for (let k = 0; out.length < count && k < count * 12; k++) {
      const seed = `${stem}|${k}`;
      const potion = brew(db, recipeFromSeed(pool, seed), seed);
      // a high-grade catalyst can lift the rarity above the shop's cap
      if (!potion || rarityRank(potion.rarity) > cap || seen.has(potion.active.id)) continue;
      seen.add(potion.active.id);
      out.push(potion);
    }
    return out.sort((a, b) => a.gpValue - b.gpValue);
  }

  // A brew mark: six letters a player reads out to the DM, who finds the
  // recipe from it (findByMark). No vowels but A, no 0/O/1/I: no words, no
  // misreadings.
  const MARK_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  function brewMark(recipe) {
    let h = mix32(hashSeed(`mark|${recipeSeed(recipe)}`)) >>> 2; // 30 bits
    let out = "";
    for (let i = 0; i < 6; i++) { out = MARK_ALPHABET[h & 31] + out; h >>>= 5; }
    return `${out.slice(0, 3)}-${out.slice(3)}`;
  }
  const cleanMark = (mark) => String(mark || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0").replace(/I/g, "1");

  // Every recipe of a set of stocks ({vessels, solvents, actives, catalysts}:
  // ids, empty = all) whose mark matches. The DM searches the alchemists'
  // stocks first, then the whole archive (a few hundred thousand recipes).
  function findByMark(db, mark, stocks) {
    const want = cleanMark(mark);
    if (want.length !== 6) return [];
    const found = [];
    const keys = new Set();
    for (const stock of (Array.isArray(stocks) && stocks.length ? stocks : [{}])) {
      const d = narrowDb(db, stock);
      for (const v of d.vessels) for (const s of d.reagents.solvents) for (const a of d.reagents.actives) for (const c of d.reagents.catalysts) {
        const recipe = { vessel: v.id, solvent: s.id, active: a.id, catalyst: c.id };
        if (cleanMark(brewMark(recipe)) !== want) continue;
        const key = recipeSeed(recipe);
        if (!keys.has(key)) { keys.add(key); found.push(recipe); }
      }
    }
    return found;
  }

  // What brewing it yourself costs at an alchemist's bench: `fee` percent of
  // the potion's value (default 50, the 2024 crafting cost of a magic item).
  function brewCost(potion, fee) {
    const pct = Number.isFinite(Number(fee)) && Number(fee) > 0 ? Number(fee) : 50;
    return roundPrice((potion.gpValue * pct) / 100);
  }

  root.Alchemy = {
    // randomness
    hashSeed, createRNG, seededChoice,
    // safety helpers
    esc, safeColor,
    // registries
    WAX_PALETTES, VELLUM_PALETTES, GLASS_TINTS, STAMPS, NECKS, STOPPERS, TEXTURES, RARITIES, KITS,
    rarityLabel,
    FILL_MIN, FILL_MAX, DEFAULT_STUDIO,
    // data
    normaliseVessels, normaliseReagents, normaliseSolvent, normaliseActive, normaliseCatalyst, normaliseStudio,
    normaliseReaction,
    // potions
    resolveRecipe, recipeOf, recipeSeed, recipeFromSeed, brew, synthesize, resolveStudio,
    // output
    renderSVG, sensoryHTML, summaryText, toMarkdown, defaultLabelGlyphs, vesselGeometry, mix,
    // the site
    dbFromStore, itemArt, cardFields, potionRecord,
    narrowDb, shopPotions, brewMark, findByMark, brewCost
  };
})(typeof window !== "undefined" ? window : globalThis);
