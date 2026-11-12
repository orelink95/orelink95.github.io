/* =====================================================================
   SIGIL ENGINE  —  magic circles and their grimoire folio
   ---------------------------------------------------------------------
   Shared by the Sigil Maker (sigil-maker.html) and the admin dashboard
   (Folios, data/folios.json). No page code here: data tables, the seeded
   generator, the SVG / canvas renderers, the lore text and the book export.

       const S = Athenaeum.sigil;
       S.generate(seed, archetypeId, purposeId)   -> rings
       S.validState(recipe) / S.normalise(recipe) -> a "Save recipe" file, checked and completed
       S.sceneSVG(state, {mode, bg, anim})        -> SVG markup of the circle
       S.buildLore(state)                         -> the generated text of the book
       S.applyText(lore, folio.text)              -> with the DM's own words
       S.renderBook(state, scale, {which, cover, text}) -> canvas of the open book
       S.bookPDF(state, {layout, text}) / S.bookPNG(state, {text}) / S.platePNG(state) -> Blob
       S.registerFont({id, name, b64, mime, lower})  -> an uploaded alphabet
       S.BOOK_COLOURS / S.bookColours(state, folio)  -> the 12 colours of the binding and the initial
   ===================================================================== */
(function (root) {
'use strict';
/* =====================================================================
   RANDOMNESS (seeded)
   ===================================================================== */
function hashStr(s){
  let h1=1779033703,h2=3144134277,h3=1013904242,h4=2773480762;
  for(let i=0;i<s.length;i++){const k=s.charCodeAt(i);
    h1=h2^Math.imul(h1^k,597399067);h2=h3^Math.imul(h2^k,2869860233);
    h3=h4^Math.imul(h3^k,951274213);h4=h1^Math.imul(h4^k,2716044179);}
  h1=Math.imul(h3^(h1>>>18),597399067);h2=Math.imul(h4^(h2>>>22),2869860233);
  h3=Math.imul(h1^(h3>>>17),951274213);h4=Math.imul(h2^(h4>>>19),2716044179);
  return (h1^h2^h3^h4)>>>0;
}
function makeRng(seedStr){
  let a=hashStr(String(seedStr));
  const next=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
  return {
    next,
    int:(lo,hi)=>lo+Math.floor(next()*(hi-lo+1)),
    pick:arr=>arr[Math.floor(next()*arr.length)],
    chance:p=>next()<p,
  };
}
const SEED_WORDS=['VERDANT','AUREATE','UMBRAL','SOLAR','LUNAR','OCCULT','ASHEN','GILDED','HOLLOW','ELDER','SABLE','ARGENT','BRAMBLE','HALLOWED','SUNKEN','THORNED','VESPER','EMBER','MOSSBOUND','IRON'];
function randomSeed(){
  const w=SEED_WORDS[Math.floor(Math.random()*SEED_WORDS.length)];
  const h=Math.floor(Math.random()*0xFFFF).toString(16).toUpperCase().padStart(4,'0');
  return `${w}-${h}`;
}

/* =====================================================================
   SCRIPTS & GLYPH SETS
   ===================================================================== */
const FONTS = {
  latin:'Cinzel, "Noto Sans Symbols 2", Georgia, serif',
  runic:'"Noto Sans Runic", "Segoe UI Historic", sans-serif',
  ogham:'"Noto Sans Ogham", "Segoe UI Historic", sans-serif',
  greek:'"EB Garamond", "Noto Sans Symbols 2", Georgia, serif',
  sym:'"Noto Sans Symbols", "Noto Sans Symbols 2", "Segoe UI Symbol", sans-serif'
};
const g = (s)=>s.split('|').map(x=>{const [c,n]=x.split(':');return {c,n};});
const AZ='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c=>({c,n:c}));
const SETS_RAW = {
  latin:{label:'Roman capitals', plural:'Roman letters', lore:'Roman capitals', font:FONTS.latin, alphabet:true, base:'latin', adv:.80, sep:'·', rep:'✠',
    glyphs:'ABCDEFGHIKLMNOPQRSTVXYZ'.split('').map(c=>({c,n:c}))},
  uncial:{label:'Uncial', plural:'uncial letters', lore:'an uncial hand', font:'"Uncial Antiqua", Cinzel, "Noto Sans Symbols 2", serif', alphabet:true, base:'latin', adv:.86, sep:'·', rep:'✠', glyphs:AZ},
  blackletter:{label:'Blackletter', plural:'blackletter letters', lore:'a black gothic hand', font:'UnifrakturMaguntia, "Noto Sans Symbols 2", serif', alphabet:true, base:'latin', bookCase:true, adv:.58, sep:'·', rep:'✠', glyphs:AZ},
  manuscript:{label:'Bookhand', plural:'bookhand letters', lore:'a plain bookhand', font:'MedievalSharp, "Noto Sans Symbols 2", serif', alphabet:true, base:'latin', adv:.74, sep:'·', rep:'✠', glyphs:AZ},
  arcane:{label:'Arcane capitals', plural:'arcane capitals', lore:'arcane capitals', font:'Metamorphous, Cinzel, "Noto Sans Symbols 2", serif', alphabet:true, base:'latin', adv:.86, sep:'·', rep:'✠', glyphs:AZ},
  runic:{label:'Elder Futhark', plural:'runes', font:FONTS.runic, alphabet:true, adv:.62, sep:'᛫', rep:'᛬',
    glyphs:g('ᚠ:Fehu|ᚢ:Uruz|ᚦ:Thurisaz|ᚨ:Ansuz|ᚱ:Raidō|ᚲ:Kaunan|ᚷ:Gebō|ᚹ:Wunjō|ᚺ:Hagalaz|ᚾ:Naudiz|ᛁ:Īsaz|ᛃ:Jēra|ᛇ:Eihwaz|ᛈ:Perþ|ᛉ:Algiz|ᛊ:Sōwilō|ᛏ:Tīwaz|ᛒ:Berkanan|ᛖ:Ehwaz|ᛗ:Mannaz|ᛚ:Laguz|ᛜ:Ingwaz|ᛞ:Dagaz|ᛟ:Ōþila')},
  ogham:{label:'Ogham', plural:'ogham letters', font:FONTS.ogham, alphabet:true, adv:.78, sep:' ', rep:'᚜᚛',
    glyphs:g('ᚁ:Beith|ᚂ:Luis|ᚃ:Fearn|ᚄ:Sail|ᚅ:Nion|ᚆ:Úath|ᚇ:Dair|ᚈ:Tinne|ᚉ:Coll|ᚊ:Ceirt|ᚋ:Muin|ᚌ:Gort|ᚍ:nGéadal|ᚎ:Straif|ᚏ:Ruis|ᚐ:Ailm|ᚑ:Onn|ᚒ:Úr|ᚓ:Edad|ᚔ:Idad')},
  greek:{label:'Greek capitals', plural:'Greek letters', lore:'Greek capitals', font:FONTS.greek, alphabet:true, adv:.76, sep:'·', rep:'⁘',
    glyphs:g('Α:Alpha|Β:Beta|Γ:Gamma|Δ:Delta|Ε:Epsilon|Ζ:Zeta|Η:Eta|Θ:Theta|Ι:Iota|Κ:Kappa|Λ:Lambda|Μ:Mu|Ν:Nu|Ξ:Xi|Ο:Omicron|Π:Pi|Ρ:Rho|Σ:Sigma|Τ:Tau|Υ:Upsilon|Φ:Phi|Χ:Chi|Ψ:Psi|Ω:Omega')},
  glagolitic:{label:'Glagolitic', plural:'Glagolitic letters', lore:'Glagolitic letters', font:'"Noto Sans Glagolitic", "Segoe UI Historic", sans-serif', alphabet:true, adv:.82, sep:'·', rep:'⁘',
    glyphs:g('Ⰰ:Azŭ|Ⰱ:Buky|Ⰲ:Vědě|Ⰳ:Glagoli|Ⰴ:Dobro|Ⰵ:Jestŭ|Ⰶ:Živěte|Ⰷ:Dzělo|Ⰸ:Zemlja|Ⰹ:Iže|Ⰻ:I|Ⰼ:Djervĭ|Ⰽ:Kako|Ⰾ:Ljudije|Ⰿ:Myslite|Ⱀ:Našĭ|Ⱁ:Onŭ|Ⱂ:Pokoji|Ⱃ:Rĭci|Ⱄ:Slovo|Ⱅ:Tvrĭdo|Ⱆ:Ukŭ|Ⱇ:Frĭtŭ|Ⱈ:Xěrŭ|Ⱉ:Otŭ|Ⱋ:Šta|Ⱌ:Ci|Ⱍ:Črĭvĭ|Ⱎ:Ša|Ⱏ:Jerŭ|Ⱐ:Jerĭ|Ⱑ:Jatĭ|Ⱓ:Ju')},
  gothic:{label:'Gothic', plural:'Gothic letters', lore:'the Gothic letters of Wulfila', font:'"Noto Sans Gothic", "Segoe UI Historic", sans-serif', alphabet:true, adv:.74, sep:'·', rep:'⁘',
    glyphs:g('𐌰:Ahsa|𐌱:Bairkan|𐌲:Giba|𐌳:Dags|𐌴:Aíƕus|𐌵:Qaírþra|𐌶:Iuja|𐌷:Hagl|𐌸:Þiuþ|𐌹:Eis|𐌺:Kusma|𐌻:Lagus|𐌼:Manna|𐌽:Nauþs|𐌾:Jēr|𐌿:Ūrus|𐍀:Paírþra|𐍂:Raida|𐍃:Sauil|𐍄:Teiws|𐍅:Winja|𐍆:Faíhu|𐍇:Iggws|𐍈:Ƕaír|𐍉:Ōþal')},
  phoenician:{label:'Phoenician', plural:'Phoenician letters', lore:'Phoenician letters', font:'"Noto Sans Phoenician", "Segoe UI Historic", sans-serif', alphabet:true, adv:.74, sep:'·', rep:'⁘',
    glyphs:g('𐤀:ʾAlp|𐤁:Bēt|𐤂:Gaml|𐤃:Delt|𐤄:Hē|𐤅:Wāw|𐤆:Zayin|𐤇:Ḥēt|𐤈:Ṭēt|𐤉:Yōd|𐤊:Kaf|𐤋:Lamd|𐤌:Mēm|𐤍:Nūn|𐤎:Semk|𐤏:ʿAyin|𐤐:Pē|𐤑:Ṣādē|𐤒:Qōp|𐤓:Rōš|𐤔:Šīn|𐤕:Tāw')},
  olditalic:{label:'Etruscan', plural:'Etruscan letters', lore:'Etruscan letters', font:'"Noto Sans Old Italic", "Segoe UI Historic", sans-serif', alphabet:true, adv:.72, sep:'·', rep:'⁘',
    glyphs:g('𐌀:A|𐌁:Be|𐌂:Ke|𐌃:De|𐌄:E|𐌅:Ve|𐌆:Ze|𐌇:He|𐌈:The|𐌉:I|𐌊:Ka|𐌋:El|𐌌:Em|𐌍:En|𐌎:Esh|𐌏:O|𐌐:Pe|𐌑:She|𐌒:Ku|𐌓:Er|𐌔:Es|𐌕:Te|𐌖:U|𐌗:Eks|𐌘:Phe|𐌙:Khe|𐌚:Ef')},
  zodiac:{label:'Zodiac', plural:'signs of the zodiac', font:FONTS.sym, vs:true,
    glyphs:g('♈:Aries|♉:Taurus|♊:Gemini|♋:Cancer|♌:Leo|♍:Virgo|♎:Libra|♏:Scorpio|♐:Sagittarius|♑:Capricornus|♒:Aquarius|♓:Pisces')},
  planets:{label:'Planets', plural:'planetary signs', font:FONTS.sym, vs:true,
    glyphs:g('☉:Sol|☽:Luna|☿:Mercurius|♀:Venus|♂:Mars|♃:Iuppiter|♄:Saturnus')},
  alchemy:{label:'Alchemy', plural:'alchemical signs', font:FONTS.sym, vs:true,
    glyphs:g('🜍:Sulphur|☿:Mercury|🜔:Salt|🜚:Gold|🜛:Silver|🜠:Copper|🜩:Tin|🜪:Lead|🜫:Antimony|🜨:Verdigris|🜕:Nitre|🜹:Sal ammoniac|🜈:Aqua vitae|🜎:Philosophers’ sulphur')},
  elements:{label:'Elements', plural:'elemental signs', font:FONTS.sym, vs:true,
    glyphs:g('🜂:Fire|🜄:Water|🜁:Air|🜃:Earth|🜀:Quintessence')},
  aspects:{label:'Astral aspects', plural:'astral signs', font:FONTS.sym, vs:true,
    glyphs:g('☌:Conjunction|☍:Opposition|△:Trine|□:Square|⚹:Sextile|⚺:Semisextile|⚻:Quincunx|⚼:Sesquiquadrate|☊:Head of the dragon|☋:Tail of the dragon|☄:Comet')},
  hermetic:{label:'Hermetic signs', plural:'hermetic signs', font:FONTS.sym, vs:true,
    glyphs:g('☥:Ankh|⚚:Staff of Hermes|☤:Caduceus|⚕:Rod of Asclepius|⛤:Pentagram|⛧:Inverted pentagram|⚝:Outlined star|⚜:Fleur-de-lis|✠:Maltese cross|☩:Cross of Jerusalem|⚘:Flower|⚔:Crossed swords|🜲:Regulus|🝞:Sublimation')}
};
/* unknown set ids (e.g. a removed custom font) fall back to Roman capitals */
const SETS = new Proxy(SETS_RAW,{get:(t,k)=>(k in t)?t[k]:(typeof k==='string'&&k!=='none'?t.latin:undefined)});
const alphabets = ()=>Object.keys(SETS_RAW).filter(k=>SETS_RAW[k].alphabet);
const symbolSets = ()=>Object.keys(SETS_RAW).filter(k=>!SETS_RAW[k].alphabet);
const glyphChar = (setId,i)=>{const s=SETS[setId];const e=s.glyphs[((i%s.glyphs.length)+s.glyphs.length)%s.glyphs.length];return s.vs&&e.c.length===1?e.c+'︎':(s.lower?e.c.toLowerCase():e.c);};
const glyphName = (setId,i)=>{const s=SETS[setId];return s.glyphs[((i%s.glyphs.length)+s.glyphs.length)%s.glyphs.length].n;};

const TRANS = {
  runic:{di:{TH:'ᚦ',NG:'ᛜ'},m:{A:'ᚨ',B:'ᛒ',C:'ᚲ',D:'ᛞ',E:'ᛖ',F:'ᚠ',G:'ᚷ',H:'ᚺ',I:'ᛁ',J:'ᛃ',K:'ᚲ',L:'ᛚ',M:'ᛗ',N:'ᚾ',O:'ᛟ',P:'ᛈ',Q:'ᚲ',R:'ᚱ',S:'ᛊ',T:'ᛏ',U:'ᚢ',V:'ᚹ',W:'ᚹ',X:'ᚲᛊ',Y:'ᛁ',Z:'ᛉ',Þ:'ᚦ',Æ:'ᚨ',Ð:'ᛞ'}},
  ogham:{di:{NG:'ᚍ'},m:{A:'ᚐ',B:'ᚁ',C:'ᚉ',D:'ᚇ',E:'ᚓ',F:'ᚃ',G:'ᚌ',H:'ᚆ',I:'ᚔ',J:'ᚔ',K:'ᚉ',L:'ᚂ',M:'ᚋ',N:'ᚅ',O:'ᚑ',P:'ᚚ',Q:'ᚊ',R:'ᚏ',S:'ᚄ',T:'ᚈ',U:'ᚒ',V:'ᚃ',W:'ᚃ',X:'ᚉᚄ',Y:'ᚔ',Z:'ᚎ'}},
  greek:{di:{TH:'Θ',PH:'Φ',PS:'Ψ',CH:'Χ',KH:'Χ',KS:'Ξ'},m:{A:'Α',B:'Β',C:'Κ',D:'Δ',E:'Ε',F:'Φ',G:'Γ',H:'Η',I:'Ι',J:'Ι',K:'Κ',L:'Λ',M:'Μ',N:'Ν',O:'Ο',P:'Π',Q:'Κ',R:'Ρ',S:'Σ',T:'Τ',U:'Υ',V:'Υ',W:'Ω',X:'Ξ',Y:'Υ',Z:'Ζ'}},
  glagolitic:{di:{ZH:'Ⰶ',DZ:'Ⰷ',CH:'Ⱍ',SH:'Ⱎ',TS:'Ⱌ',KH:'Ⱈ',JU:'Ⱓ',YU:'Ⱓ'},m:{A:'Ⰰ',B:'Ⰱ',V:'Ⰲ',W:'Ⰲ',G:'Ⰳ',D:'Ⰴ',E:'Ⰵ',Z:'Ⰸ',I:'Ⰻ',J:'Ⰼ',Y:'Ⰹ',K:'Ⰽ',C:'Ⰽ',Q:'Ⰽ',L:'Ⰾ',M:'Ⰿ',N:'Ⱀ',O:'Ⱁ',P:'Ⱂ',R:'Ⱃ',S:'Ⱄ',T:'Ⱅ',U:'Ⱆ',F:'Ⱇ',H:'Ⱈ',X:'ⰍⰔ'}},
  gothic:{di:{TH:'𐌸',HW:'𐍈',KW:'𐌵',QU:'𐌵'},m:{A:'𐌰',B:'𐌱',G:'𐌲',D:'𐌳',E:'𐌴',Q:'𐌵',Z:'𐌶',H:'𐌷',I:'𐌹',K:'𐌺',C:'𐌺',L:'𐌻',M:'𐌼',N:'𐌽',J:'𐌾',Y:'𐌾',U:'𐌿',P:'𐍀',R:'𐍂',S:'𐍃',T:'𐍄',W:'𐍅',V:'𐍅',F:'𐍆',X:'𐍇',O:'𐍉'}},
  phoenician:{di:{SH:'𐤔',TH:'𐤕',CH:'𐤇',TS:'𐤑',PH:'𐤐'},m:{A:'𐤀',B:'𐤁',G:'𐤂',D:'𐤃',E:'𐤄',H:'𐤄',V:'𐤅',W:'𐤅',U:'𐤅',Z:'𐤆',I:'𐤉',J:'𐤉',Y:'𐤉',K:'𐤊',C:'𐤊',L:'𐤋',M:'𐤌',N:'𐤍',S:'𐤎',X:'𐤎',O:'𐤏',P:'𐤐',F:'𐤐',Q:'𐤒',R:'𐤓',T:'𐤕'}},
  olditalic:{di:{TH:'𐌈',PH:'𐌘',KH:'𐌙',CH:'𐌙',SH:'𐌑'},m:{A:'𐌀',B:'𐌁',C:'𐌂',D:'𐌃',E:'𐌄',V:'𐌅',W:'𐌅',Z:'𐌆',H:'𐌇',I:'𐌉',J:'𐌉',Y:'𐌉',K:'𐌊',L:'𐌋',M:'𐌌',N:'𐌍',O:'𐌏',P:'𐌐',Q:'𐌒',R:'𐌓',S:'𐌔',T:'𐌕',U:'𐌖',X:'𐌗',F:'𐌚'}}
};
function translitWord(w, script, classical){
  const S=SETS[script];
  const W=w.normalize('NFD').replace(/[̀-ͯ]/g,'');
  if(S.base==='latin'){
    if(S.bookCase){ const s=W.replace(/[^A-Za-z0-9]/g,''); return Array.from(s.charAt(0).toUpperCase()+s.slice(1).toLowerCase()); }
    let s=W.toUpperCase().replace(/[^A-Z0-9ÆŒ]/g,'');
    if(classical) s=s.replace(/U/g,'V').replace(/J/g,'I').replace(/W/g,'VV');
    if(S.lower) s=s.toLowerCase();
    return Array.from(s);
  }
  const T=TRANS[script]; const out=[];
  const raw=Array.from(w.toUpperCase());
  for(let i=0;i<raw.length;i++){
    const two=(raw[i]+(raw[i+1]||''));
    if(T.di[two]){out.push(T.di[two]);i++;continue;}
    const ch=raw[i].normalize('NFD').replace(/[̀-ͯ]/g,'');
    if(T.m[ch]) out.push(...Array.from(T.m[ch]));
    else if(SETS[script].glyphs.some(gl=>gl.c===raw[i])) out.push(raw[i]);
  }
  return out;
}
function translitSeq(text, script, classical){
  const words=String(text||'').split(/[\s·.,;:]+/).filter(Boolean).map(w=>translitWord(w,script,classical)).filter(a=>a.length);
  const seq=[]; words.forEach((w,i)=>{ if(i) seq.push(SETS[script].sep); seq.push(...w); });
  return seq;
}

/* =====================================================================
   MOTTOES (with glosses for the lore page)
   ===================================================================== */
const MOTTO = {
  'VIRESCIT VULNERE VIRTUS':'courage grows green from a wound',
  'ARDENS SED VIRENS':'burning, yet flourishing',
  'VISITA INTERIORA TERRAE RECTIFICANDO INVENIES OCCULTUM LAPIDEM':'visit the inner earth; by setting it right you will find the hidden stone',
  'IGNE NATURA RENOVATUR INTEGRA':'by fire, nature is made whole again',
  'FIAT LUX':'let there be light',
  'PER ASPERA AD ASTRA':'through hardship to the stars',
  'SIC ITUR AD ASTRA':'thus one goes to the stars',
  'SOL OMNIBUS LUCET':'the sun shines for all',
  'SOL INVICTUS':'the unconquered sun',
  'FLECTERE SI NEQUEO SUPEROS ACHERONTA MOVEBO':'if I cannot bend the gods above, I shall move the river of the dead',
  'NEMO ME IMPUNE LACESSIT':'no one provokes me unpunished',
  'DIES IRAE DIES ILLA':'day of wrath, that day',
  'OMNIA MUTANTUR NIHIL INTERIT':'all things change, nothing perishes',
  'NATURA NIHIL FRUSTRA FACIT':'nature does nothing in vain',
  'ARBOR VITAE':'the tree of life',
  'ALU LAUKAZ ALU':'charm words of the gold bracteates: alu, laukaz (leek)',
  'GIBU AUJA':'I give good fortune',
  'EK ERILAZ':'I, the rune-master',
  'LATHU LAUKAZ GAKAZ ALU':'a charm formula from a gold bracteate',
  'ΓΝΩΘΙ ΣΕΑΥΤΟΝ':'know thyself',
  'ΜΗΔΕΝ ΑΓΑΝ':'nothing in excess',
  'ΠΑΝΤΑ ΡΕΙ':'everything flows',
  'ΕΝ ΤΟ ΠΑΝ':'the all is one',
  'MEMENTO MORI':'remember that you will die',
  'QUOD EST SUPERIUS EST SICUT QUOD EST INFERIUS':'what is above is like what is below',
  'SOLVE ET COAGULA':'dissolve and bind',
  'HIC SUNT DRACONES':'here be dragons',
  'FLUCTUAT NEC MERGITUR':'tossed by the waves, yet she does not sink',
  'MARE LIBERUM':'the free sea',
  'NAVIGARE NECESSE EST':'to sail is necessary',
  'HONI SOIT QUI MAL Y PENSE':'shame on whoever thinks ill of it',
  'NEC PLURIBUS IMPAR':'not unequal to many',
  'SEMPER FIDELIS':'always faithful'
};

/* =====================================================================
   ARCHETYPES & PURPOSES
   ===================================================================== */
const ARCH = [
  {id:'verdant', name:'Verdant Arcanum', epithet:'Emerald halos and gilded orbits',
   inks:{primary:['#1d6a45','#5cc189'],gilt:['#a87a1e','#e6c46c'],ink:['#2a2016','#e8e1c9']},
   inkNames:'verdigris and gold leaf', material:'verdigris and powdered malachite',
   script:'latin', sets:['alchemy','planets','elements'], core:['alchemy','planets'],
   phrases:['VIRESCIT VULNERE VIRTUS','ARDENS SED VIRENS','IGNE NATURA RENOVATUR INTEGRA','VISITA INTERIORA TERRAE RECTIFICANDO INVENIES OCCULTUM LAPIDEM','FIAT LUX'],
   stars:[[7,2],[7,3],[6,2],[8,3]], petals:['vesica','loops','scallop','chain'], figures:['leaves','foil','rosette']},
  {id:'celestial', name:'Celestial Solar', epithet:'Sunbursts and zodiac bands',
   inks:{primary:['#1e4c7a','#86b6e8'],gilt:['#a97710','#f0c75e'],ink:['#231b12','#ece4cc']},
   inkNames:'lapis blue and burnished gold', material:'gold leaf and lapis ink',
   script:'latin', sets:['zodiac','planets'], core:['planets'],
   phrases:['PER ASPERA AD ASTRA','SIC ITUR AD ASTRA','SOL OMNIBUS LUCET','SOL INVICTUS'],
   stars:[[8,3],[12,5],[6,2],[8,2]], petals:['scallop','beads','vesica','flames'], figures:['sun','crescent','rosette']},
  {id:'infernal', name:'Infernal Brimstone', epithet:'Sulphur seals and binding sigils',
   inks:{primary:['#7c1c14','#e35d4c'],gilt:['#80632a','#c9a24a'],ink:['#1b130e','#e6d8c6']},
   inkNames:'cinnabar and tarnished brass', material:'sulphur, ash and cinnabar',
   script:'latin', sets:['alchemy','planets'], core:['alchemy','planets'],
   phrases:['FLECTERE SI NEQUEO SUPEROS ACHERONTA MOVEBO','NEMO ME IMPUNE LACESSIT','DIES IRAE DIES ILLA','MEMENTO MORI'],
   stars:[[5,2],[7,3],[9,4]], petals:['crescent','beads','thorns','flames'], figures:['eye','crescent','cross']},
  {id:'druidic', name:'Druidic Grove', epithet:'Ogham staves and grove wards',
   inks:{primary:['#3b5d27','#93c463'],gilt:['#8c5b26','#d79c5b'],ink:['#251c12','#e8e1c9']},
   inkNames:'moss green and bronze', material:'oak-gall ink and crushed moss',
   script:'ogham', sets:['ogham','elements'], core:['elements','ogham'],
   phrases:['OMNIA MUTANTUR NIHIL INTERIT','NATURA NIHIL FRUSTRA FACIT','ARBOR VITAE'],
   stars:[[3,1],[6,2],[9,2],[9,4]], petals:['vesica','loops','crescent','waves'], figures:['leaves','spiral','foil']},
  {id:'runic', name:'Rune-Ward', epithet:'Elder Futhark staves in iron',
   inks:{primary:['#2d4a5e','#93bad0'],gilt:['#93702a','#dbb65c'],ink:['#1c1712','#e6e1d2']},
   inkNames:'iron blue and red gold', material:'red ochre mixed with blood of the oath-taker',
   script:'runic', sets:['runic'], core:['runic'],
   phrases:['ALU LAUKAZ ALU','GIBU AUJA','EK ERILAZ','LATHU LAUKAZ GAKAZ ALU'],
   stars:[[8,3],[6,2],[4,1],[8,2]], petals:['beads','scallop','thorns','chain'], figures:['cross','sun','spiral']},
  {id:'amethyst', name:'Mystic Amethyst', epithet:'Platonic yantras in violet',
   inks:{primary:['#5a2c84','#bc93e6'],gilt:['#a0781d','#e7c361'],ink:['#21181e','#ece3dc']},
   inkNames:'amethyst violet and gold', material:'amethyst dust and gilded ink',
   script:'greek', sets:['greek','planets','elements'], core:['elements','greek'],
   phrases:['ΓΝΩΘΙ ΣΕΑΥΤΟΝ','ΜΗΔΕΝ ΑΓΑΝ','ΠΑΝΤΑ ΡΕΙ','ΕΝ ΤΟ ΠΑΝ'],
   stars:[[6,2],[12,5],[5,2],[10,3]], petals:['vesica','loops','waves'], figures:['rosette','eye','vesica']},
  {id:'inkwork', name:'Aged Ink', epithet:'Woodcut lines on old vellum',
   inks:{primary:['#3a2918','#d8c69f'],gilt:['#7b5a31','#b9965f'],ink:['#2a1d11','#efe3c4']},
   inkNames:'iron-gall ink and sepia', material:'iron-gall ink',
   script:'latin', sets:['alchemy','zodiac','planets'], core:['alchemy','planets'],
   phrases:['MEMENTO MORI','QUOD EST SUPERIUS EST SICUT QUOD EST INFERIUS','SOLVE ET COAGULA','HIC SUNT DRACONES'],
   stars:[[5,2],[6,2],[7,3],[8,3]], petals:['crescent','scallop','vesica','chain'], figures:['eye','crescent','vesica']},
  {id:'tidal', name:'Tidal Covenant', epithet:'Sea-witch wards in teal and pearl',
   inks:{primary:['#165e5c','#5cc6c0'],gilt:['#8b763a','#dac47c'],ink:['#18211f','#e3ebe8']},
   inkNames:'sea-green and pearl gold', material:'squid ink and crushed pearl',
   script:'uncial', sets:['aspects','planets','elements'], core:['planets','aspects'],
   phrases:['FLUCTUAT NEC MERGITUR','MARE LIBERUM','NAVIGARE NECESSE EST'],
   stars:[[7,3],[9,4],[6,2]], petals:['waves','scallop','crescent'], figures:['crescent','spiral','foil']},
  {id:'heraldic', name:'Gilded Court', epithet:'Heraldic seals in gules and or',
   inks:{primary:['#8c1b1b','#e2675a'],gilt:['#b08a2e','#ecc965'],ink:['#1b2340','#d9def0']},
   inkNames:'gules, or and azure', material:'vermilion and shell gold',
   script:'blackletter', sets:['hermetic','latin'], core:['hermetic'],
   phrases:['HONI SOIT QUI MAL Y PENSE','NEC PLURIBUS IMPAR','SEMPER FIDELIS'],
   stars:[[8,3],[6,2],[4,1]], petals:['beads','thorns','vesica'], figures:['cross','foil','sun']}
];
const archById = id => ARCH.find(a=>a.id===id) || ARCH[0];

const PURPOSES = [
  {id:'summoning', name:'Summoning', noun:'summoning circle', chapter:'De Evocatione', verb:'draws in and holds', object:'whatever answers the call',
   final:'speak the name only once the last line is closed', peril:'A broken line frees what was bound.'},
  {id:'warding', name:'Warding', noun:'ward', chapter:'De Custodia', verb:'turns aside', object:'harm sent against those within',
   final:'never cross the outer line while the ward holds', peril:'A smudged letter opens a door in the ward.'},
  {id:'passage', name:'Passage', noun:'waypoint', chapter:'De Itineribus', verb:'anchors', object:'the far end of the road',
   final:'step onto the centre as the hour turns', peril:'Travellers without the counter-sign arrive scattered.'},
  {id:'transmutation', name:'Transmutation', noun:'transmutation array', chapter:'De Transmutatione', verb:'holds in balance', object:'the four elements',
   final:'set the vessel upon the central sign', peril:'An unbalanced array turns lead to ash, not gold.'},
  {id:'wild', name:'Wild', noun:'sigil', chapter:'De Signis Incertis', verb:'gathers', object:'the will of its maker',
   final:'let no other eye read it before it is used', peril:'Unrecorded. Proceed with care.'}
];
const purposeById = id => PURPOSES.find(p=>p.id===id) || PURPOSES[0];

/* =====================================================================
   RING TYPES: defaults, editor fields, summaries
   ===================================================================== */
const INK_OPTS=[['primary','Primary ink'],['gilt','Gilding'],['ink','Dark ink'],['vermilion','Vermilion'],['lapis','Lapis blue'],['malachite','Malachite green'],['silver','Silver'],['purple','Tyrian purple'],['custom','Custom colour']];
const FIXED_INKS={vermilion:['#a8321f','#e8705a'],lapis:['#24508f','#86b0ec'],malachite:['#1f6e52','#62c7a0'],silver:['#6f7880','#cfd6dc'],purple:['#66173f','#d27fae']};
const F=(key,label,kind,o={})=>({key,label,kind,...o});
const fInk=F('ink','Ink','select',{options:INK_OPTS});
const fColor=F('color','Custom colour','color',{show:p=>p.ink==='custom'});
const fW=F('weight','Line weight','range',{min:.5,max:8,step:.5});
const setOpts=(ids)=>ids.map(id=>[id,SETS[id].label]);
const allSetOpts=()=>setOpts([...alphabets(),...symbolSets()]);
const SHAPES_LIST=[['star','Star or polygon'],['cross','Cross'],['sun','Sunburst'],['crescent','Crescent moon'],['eye','Eye'],['vesica','Vesica piscis'],['rosette','Rosette of circles'],['leaves','Knot of leaves'],['foil','Gothic foil'],['spiral','Spiral']];
const SHAPE_COUNT_LABEL={star:'Points',cross:'Arms',sun:'Rays',rosette:'Circles',leaves:'Leaves',foil:'Lobes',spiral:'Half-turns'};
const FILL_OPTS=[['none','Open'],['paper','Parchment (hides lines beneath)'],['solid','Solid ink']];
const PETAL_OPTS=[['vesica','Petals'],['crescent','Crescents'],['scallop','Scallops'],['loops','Interlaced rings'],['beads','Beads'],['thorns','Thorns'],['waves','Waves'],['flames','Flames'],['chain','Chain links']];
const PETAL_PLURAL={vesica:'petals',crescent:'crescents',scallop:'scallops',loops:'interlaced rings',beads:'beads',thorns:'thorns',waves:'waves',flames:'flames',chain:'chain links'};

const TYPES = {
  circle:{label:'Circle', d:{r:300,weight:2,double:false,gap:8,dash:'none',ink:'primary',color:'#2f7d55'},
    fields:[F('r','Radius','range',{min:10,max:495}),fW,F('double','Double line','toggle'),F('gap','Gap between lines','range',{min:3,max:30,show:p=>p.double}),
      F('dash','Line style','select',{options:[['none','Solid'],['dot','Dotted'],['dash','Dashed']]}),fInk,fColor],
    sum:p=>`Radius ${p.r}${p.double?' · double':''}${p.dash==='dot'?' · dotted':p.dash==='dash'?' · dashed':''}`},
  inscription:{label:'Inscription', d:{r:430,size:26,text:'FIAT LUX',script:'latin',classical:true,fill:'repeat',dir:'out',frame:true,weight:1.5,ink:'gilt',color:'#2f7d55'},
    fields:[F('text','Words','text'),F('motto','Choose a motto','motto'),F('script','Script','select',{options:()=>setOpts(alphabets())}),
      F('classical','Carve U as V','toggle',{show:p=>SETS[p.script].base==='latin'&&!SETS[p.script].bookCase}),
      F('r','Radius','range',{min:40,max:485}),F('size','Letter size','range',{min:10,max:48}),
      F('fill','Spacing','select',{options:[['repeat','Repeat around the ring'],['once','Write once, from the top']]}),
      F('dir','Facing','select',{options:[['out','Read from outside'],['in','Read from inside']]}),
      F('frame','Ruled band','toggle'),fW,fInk,fColor],
    sum:p=>`${SETS[p.script].label} · “${String(p.text).slice(0,22)}${String(p.text).length>22?'…':''}”`},
  star:{label:'Star or figure', d:{shape:'star',r:380,n:7,k:2,rot:0,width:40,fillMode:'none',weight:2,nodes:false,inner:false,ink:'primary',color:'#2f7d55'},
    fields:[F('shape','Shape','select',{options:SHAPES_LIST}),
      F('n',p=>SHAPE_COUNT_LABEL[p.shape]||'Count','range',{min:2,max:12,show:p=>p.shape in SHAPE_COUNT_LABEL}),
      F('k','Step','range',{min:1,max:5,maxOf:p=>Math.max(1,Math.floor((p.n-1)/2)),show:p=>p.shape==='star'}),
      F('r','Radius','range',{min:20,max:495}),F('rot','Rotation','range',{min:0,max:360,unit:'°'}),
      F('width',p=>({cross:'Arm width',sun:'Disc size',crescent:'Thinness',eye:'Opening',leaves:'Leaf width',foil:'Lobe size'})[p.shape]||'Width','range',{min:10,max:90,unit:'%',show:p=>['cross','sun','crescent','eye','leaves','foil'].includes(p.shape)}),
      F('fillMode','Fill','select',{options:FILL_OPTS,show:p=>p.shape!=='spiral'}),
      F('nodes','Mark the points','toggle',{show:p=>p.shape==='star'}),
      F('inner',p=>p.shape==='star'?'Inscribed circle':'Encircle','toggle',{show:p=>['star','leaves','foil','rosette','cross'].includes(p.shape)}),
      fW,fInk,fColor],
    sum:p=>`${figureName(p)} · radius ${p.r}`},
  glyphs:{label:'Glyph ring', d:{r:250,count:12,set:'zodiac',size:24,offset:0,band:true,frame:'none',orient:'radial',weight:1.2,ink:'ink',color:'#2f7d55'},
    fields:[F('set','Glyphs','select',{options:allSetOpts}),F('count','Count','range',{min:2,max:40}),
      F('offset','First glyph','range',{min:0,max:35,fmt:(v,p)=>glyphName(p.set,v)}),
      F('r','Radius','range',{min:30,max:485}),F('size','Glyph size','range',{min:8,max:60}),
      F('band','Ruled band','toggle'),F('frame','Frame each glyph','select',{options:[['none','No frame'],['circle','Circle'],['diamond','Lozenge'],['square','Square'],['shield','Shield']]}),
      F('orient','Orientation','select',{options:[['radial','Turned with the ring'],['upright','Upright']]}),fW,fInk,fColor],
    sum:p=>`${p.count} ${SETS[p.set].plural}`},
  spokes:{label:'Spokes', d:{r1:100,r2:300,count:8,rot:0,style:'line',weight:1.5,ink:'gilt',color:'#2f7d55'},
    fields:[F('count','Count','range',{min:2,max:48}),F('r1','Inner radius','range',{min:0,max:480}),F('r2','Outer radius','range',{min:10,max:495}),
      F('rot','Rotation','range',{min:0,max:360,unit:'°'}),F('style','Style','select',{options:[['line','Plain'],['double','Double'],['dagger','Spear-tipped'],['dotted','Dotted'],['wavy','Serpentine'],['arrow','Arrow-headed']]}),fW,fInk,fColor],
    sum:p=>`${p.count} spokes · ${p.r1}–${p.r2}`},
  ticks:{label:'Degree ticks', d:{r:450,count:72,len:10,major:6,dir:'in',weight:1,ink:'ink',color:'#2f7d55'},
    fields:[F('count','Count','range',{min:8,max:180}),F('r','Radius','range',{min:20,max:495}),F('len','Length','range',{min:3,max:40}),
      F('major','Long tick every','range',{min:0,max:12,fmt:v=>v?String(v):'never'}),F('dir','Direction','select',{options:[['in','Inward'],['out','Outward'],['both','Both ways']]}),fW,fInk,fColor],
    sum:p=>`${p.count} ticks · radius ${p.r}`},
  petals:{label:'Ornament band', d:{r:300,count:12,size:18,style:'vesica',rot:0,weight:1.2,ink:'gilt',color:'#2f7d55'},
    fields:[F('style','Pattern','select',{options:PETAL_OPTS}),
      F('count','Count','range',{min:3,max:60}),F('r','Radius','range',{min:20,max:490}),F('size','Size','range',{min:3,max:70}),
      F('rot','Rotation','range',{min:0,max:360,unit:'°'}),fW,fInk,fColor],
    sum:p=>`${p.count} ${PETAL_PLURAL[p.style]||p.style}`},
  orbits:{label:'Satellites', d:{r:300,count:6,size:24,rot:0,set:'planets',offset:0,track:true,double:false,weight:1.5,ink:'primary',color:'#2f7d55'},
    fields:[F('count','Count','range',{min:2,max:16}),F('r','Orbit radius','range',{min:20,max:490}),F('size','Size','range',{min:6,max:70}),
      F('rot','Rotation','range',{min:0,max:360,unit:'°'}),F('set','Glyphs inside','select',{options:()=>[['none','None'],...allSetOpts()]}),
      F('offset','First glyph','range',{min:0,max:35,show:p=>p.set!=='none',fmt:(v,p)=>p.set==='none'?v:glyphName(p.set,v)}),
      F('track','Draw the orbit','toggle'),F('double','Double rim','toggle'),fW,fInk,fColor],
    sum:p=>`${p.count} satellites · radius ${p.r}`},
  core:{label:'Centre sign', d:{size:60,set:'planets',index:0,frames:2,weight:2,ink:'primary',color:'#2f7d55'},
    fields:[F('set','Glyphs','select',{options:allSetOpts}),F('index','Sign','range',{min:0,max:35,fmt:(v,p)=>glyphName(p.set,v)}),
      F('size','Size','range',{min:16,max:200}),F('frames','Frames','range',{min:0,max:4}),fW,fInk,fColor],
    sum:p=>`${glyphName(p.set,p.index)} · ${SETS[p.set].label}`}
};
const COMMON_FIELDS=[F('spin','Turning','select',{options:[['0','Still'],['1','Sunwise'],['-1','Widdershins']]}),F('period','Turn time','range',{min:20,max:300,unit:' s',show:p=>+p.spin!==0})];
const TYPE_ORDER=['circle','inscription','star','glyphs','spokes','ticks','petals','orbits','core'];

let uidN=0; const uid=()=>`r${Date.now().toString(36)}${(uidN++).toString(36)}`;
function mk(type,p={}){return {id:uid(),type,locked:false,visible:true,p:Object.assign({spin:'0',period:120},TYPES[type].d,p)};}

const NUMW=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve'];
function starName(n,k){
  if(k===1) return ({3:'triangle',4:'square',5:'pentagon',6:'hexagon',7:'heptagon',8:'octagon',9:'enneagon',10:'decagon',11:'hendecagon',12:'dodecagon'})[n];
  const named={'5/2':'pentagram','6/2':'hexagram','7/2':'heptagram','7/3':'heptagram','8/2':'octagram','8/3':'octagram','9/2':'enneagram','9/3':'enneagram','9/4':'enneagram','10/3':'decagram','10/4':'decagram','12/5':'dodecagram'};
  return named[`${n}/${k}`] || `${NUMW[n]}-pointed star`;
}
function figureName(p){
  const n=Math.round(p.n), w=NUMW[n]||String(n);
  switch(p.shape||'star'){
    case 'star': return starName(n,p.k);
    case 'cross': return n===4?'cross pattée':`${w}-armed cross`;
    case 'sun': return `sunburst of ${w} rays`;
    case 'crescent': return 'crescent moon';
    case 'eye': return 'open eye';
    case 'vesica': return 'vesica piscis';
    case 'rosette': return n===6?'seed of life':`rosette of ${w} circles`;
    case 'leaves': return n===3?'triquetra':`knot of ${w} leaves`;
    case 'foil': return ({3:'trefoil',4:'quatrefoil',5:'cinquefoil',6:'sexfoil'})[n]||`${w}-lobed foil`;
    case 'spiral': return 'spiral';
  }
  return 'figure';
}

/* =====================================================================
   GENERATION
   ===================================================================== */
function generate(seed, archId, purposeId){
  const A=archById(archId), P=purposeById(purposeId);
  const R=makeRng(`${seed}|${A.id}|${P.id}`);
  const L=[]; const add=(t,p)=>L.push(mk(t,p));
  const spin=()=>R.chance(.35)?R.pick(['1','-1']):'0';
  const per=()=>R.int(80,200);
  const set=()=>R.pick(A.sets);
  const [n,k]=R.pick(A.stars);
  const phrase=()=>R.pick(A.phrases);
  const figure=(r,o={})=>{ const shape=R.pick(A.figures);
    const n={cross:R.pick([4,4,6,8]),sun:R.pick([8,12,16]),rosette:6,leaves:R.pick([3,3,4]),foil:R.pick([3,4,4,5,6]),spiral:R.pick([4,6])}[shape]||5;
    return {shape,r,n,k:1,rot:0,width:R.int(30,55),fillMode:shape==='eye'||shape==='crescent'?'paper':'none',inner:R.chance(.5),weight:2,ink:'gilt',...o}; };

  if(P.id==='summoning'){
    add('circle',{r:470,weight:3,double:true,gap:R.int(8,12),ink:'primary'});
    add('inscription',{r:432,size:R.int(24,30),text:phrase(),script:A.script,ink:'gilt',spin:spin(),period:per()});
    add('circle',{r:398,weight:2,ink:'primary'});
    add('star',{r:398,n,k,weight:2.5,ink:'primary',inner:R.chance(.4)});
    if(R.chance(.6)) add('petals',{r:310,count:n*R.pick([1,2]),size:R.int(14,22),style:R.pick(A.petals),rot:180/n,ink:'gilt'});
    add('orbits',{r:398,count:n,size:R.int(20,27),set:set(),offset:R.int(0,20),track:false,double:R.chance(.5),ink:'gilt'});
    add('glyphs',{r:250,count:R.pick([7,12,n*2]),set:set(),size:22,offset:R.int(0,20),ink:'ink',spin:spin(),period:per()});
    add('circle',{r:208,weight:1.5,ink:'primary'});
    if(R.chance(.45)) add('star',figure(160,{ink:'gilt'})); else add('star',{r:208,n,k:1,rot:180/n,weight:1.5,ink:'gilt'});
    add('core',{size:R.int(62,78),set:R.pick(A.core),index:R.int(0,20),frames:2,ink:'primary'});
  } else if(P.id==='warding'){
    add('circle',{r:472,weight:2.5,double:true,gap:8,ink:'primary'});
    add('ticks',{r:455,count:R.pick([60,72,90]),len:10,major:R.pick([5,6]),dir:'in',ink:'ink'});
    const gs=set();
    add('glyphs',{r:416,count:Math.min(24,Math.max(8,SETS[gs].glyphs.length)),set:gs,size:R.int(22,28),offset:R.int(0,10),ink:'ink',spin:spin(),period:per()});
    add('circle',{r:388,weight:2,ink:'primary'});
    add('star',{r:388,n:8,k:1,rot:22.5,weight:2,ink:'gilt'});
    add('star',{r:388,n:8,k:3,weight:2,ink:'primary',nodes:true});
    add('inscription',{r:270,size:R.int(18,22),text:phrase(),script:A.script,ink:'gilt',spin:spin(),period:per()});
    const n2=R.pick([4,6,8]);
    add('star',{r:244,n:n2,k:n2===4?1:2,rot:n2===4?45:0,weight:1.6,ink:'primary'});
    add('circle',{r:150,weight:1.6,double:true,gap:6,ink:'primary'});
    add('spokes',{r1:78,r2:150,count:R.pick([8,16]),style:'dagger',ink:'gilt'});
    add('core',{size:R.int(48,58),set:R.pick(A.core),index:R.int(0,20),frames:1,ink:'primary'});
  } else if(P.id==='passage'){
    add('circle',{r:470,weight:3,double:true,gap:8,ink:'primary'});
    add('ticks',{r:455,count:72,len:11,major:6,dir:'in',ink:'ink'});
    const gs=A.sets.includes('zodiac')?'zodiac':set();
    add('glyphs',{r:414,count:12,set:gs,size:28,offset:0,ink:'primary',spin:spin(),period:per()});
    add('spokes',{r1:120,r2:388,count:R.pick([8,16]),style:'dagger',ink:'gilt'});
    add('circle',{r:388,weight:2,ink:'primary'});
    const oc=R.pick([4,6,8]);
    add('orbits',{r:300,count:oc,size:R.int(20,26),rot:180/oc,set:set(),offset:R.int(0,20),track:true,ink:'primary',spin:spin(),period:per()});
    add('star',{r:222,n:8,k:3,weight:2,ink:'gilt'});
    if(R.chance(.4)) add('star',figure(200,{ink:'primary',fillMode:'paper'})); else add('star',{r:222,n:4,k:1,rot:45,weight:1.4,ink:'primary'});
    add('petals',{r:146,count:16,size:10,style:'scallop',ink:'gilt'});
    add('core',{size:R.int(58,70),set:R.pick(A.core),index:R.int(0,20),frames:2,ink:'primary'});
  } else if(P.id==='transmutation'){
    add('circle',{r:470,weight:3,double:true,gap:10,ink:'primary'});
    add('inscription',{r:434,size:R.int(22,27),text:phrase(),script:A.script,ink:'gilt',spin:spin(),period:per()});
    add('circle',{r:404,weight:2,ink:'primary'});
    add('star',{r:404,n:3,k:1,rot:0,weight:2.5,ink:'primary'});
    add('star',{r:404,n:3,k:1,rot:180,weight:2.5,ink:'gilt'});
    add('orbits',{r:404,count:6,size:26,set:A.sets.includes('alchemy')?'alchemy':set(),offset:R.int(0,8),track:false,ink:'primary'});
    add('circle',{r:202,weight:2,ink:'primary'});
    add('star',{r:202,n:4,k:1,rot:45,weight:1.8,ink:'gilt'});
    add('circle',{r:143,weight:1.5,ink:'primary'});
    if(R.chance(.4)) add('star',figure(130,{ink:'primary'})); else add('star',{r:143,n:3,k:1,rot:180,weight:1.5,ink:'primary'});
    add('core',{size:R.int(42,52),set:R.pick(A.core),index:R.int(0,20),frames:1,ink:'gilt'});
  } else {
    let r=470;
    add('circle',{r,weight:R.pick([2,2.5,3]),double:R.chance(.6),gap:R.int(6,12),ink:'primary'}); r-=14;
    let steps=R.int(4,6);
    while(steps-- > 0 && r>170){
      const t=R.pick(['inscription','glyphs','ticks','petals','star','orbits','star','figure']);
      if(t==='figure'){ add('star',figure(r-6,{ink:R.pick(['primary','gilt']),fillMode:'none'})); r=Math.round(r*.55); continue; }
      if(t==='inscription'){const s=R.int(16,26);add('inscription',{r:r-s*.85,size:s,text:phrase(),script:A.script,ink:R.pick(['gilt','primary']),spin:spin(),period:per()});r-=s*1.7+10;}
      else if(t==='glyphs'){const s=R.int(18,28);const gs=set();add('glyphs',{r:r-s,count:R.int(6,18),set:gs,size:s,offset:R.int(0,20),ink:'ink',spin:spin(),period:per()});r-=s*2+10;}
      else if(t==='ticks'){add('ticks',{r,count:R.pick([36,60,72,90]),len:R.int(6,14),major:R.pick([0,3,5,6]),dir:'in',ink:'ink'});r-=22;}
      else if(t==='petals'){const s=R.int(10,22);add('petals',{r:r-s,count:R.int(8,24),size:s,style:R.pick(A.petals),ink:'gilt'});r-=s*2+8;}
      else if(t==='orbits'){const s=R.int(14,24);const c=R.int(3,9);add('orbits',{r:r-s,count:c,size:s,set:set(),offset:R.int(0,20),track:R.chance(.6),ink:'primary'});r-=s*2+10;}
      else {const [sn,sk]=R.pick(A.stars);add('circle',{r,weight:1.6,ink:'primary'});add('star',{r,n:sn,k:sk,rot:R.chance(.5)?0:180/sn,weight:2,ink:R.pick(['primary','gilt']),nodes:R.chance(.3)});r=Math.round(r*Math.cos(Math.PI*sk/sn))-8;}
    }
    add('circle',{r:Math.max(70,Math.min(r,160)),weight:1.6,double:R.chance(.5),gap:6,ink:'primary'});
    add('core',{size:Math.max(40,Math.min(r,160)-22),set:R.pick(A.core),index:R.int(0,20),frames:1,ink:'primary'});
  }
  return L;
}

function rerollRing(ring, A){
  const R=makeRng(Math.random()+'x'); const p=ring.p;
  switch(ring.type){
    case 'circle': p.double=R.chance(.5); p.dash=R.pick(['none','none','dot','dash']); p.weight=R.pick([1,1.5,2,2.5,3]); break;
    case 'inscription': { const ph=A.phrases.filter(x=>x!==p.text); p.text=R.pick(ph.length?ph:A.phrases); break; }
    case 'star': {
      if((p.shape||'star')==='star'){ const [n,k]=R.pick(A.stars.concat([[5,2],[7,3],[8,3],[9,4],[6,1],[12,5]])); p.n=n;p.k=k; p.nodes=R.chance(.4); }
      else { p.n=R.int(3,8); p.width=R.int(25,65); p.inner=R.chance(.5); }
      break; }
    case 'glyphs': p.set=R.pick(A.sets); p.count=R.pick([6,7,8,12,16,24]); p.offset=R.int(0,20); p.frame=R.pick(['none','none','circle','diamond']); break;
    case 'spokes': p.count=R.pick([6,8,12,16,24]); p.style=R.pick(['line','double','dagger','dotted','wavy','arrow']); break;
    case 'ticks': p.count=R.pick([36,60,72,90,120]); p.major=R.pick([0,3,5,6]); break;
    case 'petals': p.style=R.pick(PETAL_OPTS.map(o=>o[0])); p.count=R.pick([6,8,12,16,24]); break;
    case 'orbits': p.count=R.pick([3,4,5,6,7,8]); p.set=R.pick(A.sets.concat(['none'])); p.offset=R.int(0,20); p.double=R.chance(.5); break;
    case 'core': p.set=R.pick(A.core); p.index=R.int(0,30); p.frames=R.int(1,3); break;
  }
}

/* =====================================================================
   GEOMETRY → DRAWING ITEMS (shared by SVG and canvas)
   item kinds: c (circle), p (path), t (text)
   ===================================================================== */
const rad=d=>d*Math.PI/180;
const polar=(r,deg)=>[r*Math.sin(rad(deg)), -r*Math.cos(rad(deg))];
const f2=v=>Math.round(v*100)/100;
const circlePath=r=>`M0 ${f2(-r)}A${f2(r)} ${f2(r)} 0 1 1 0 ${f2(r)}A${f2(r)} ${f2(r)} 0 1 1 0 ${f2(-r)}Z`;
const gcd=(a,b)=>b?gcd(b,a%b):a;

/* ----- figures that can replace a star ----- */
const FIGURES = {
  cross(p,fill){
    const n=Math.max(3,Math.round(p.n)), r=p.r, phi=180/n, w1=r*p.width/100*.55, c=r*.1+w1*.25, cj=c/Math.cos(rad(phi));
    const pts=[];
    for(let i=0;i<n;i++){ const a=p.rot+i*360/n; const [ex,ey]=polar(r,a); const px=Math.cos(rad(a)), py=Math.sin(rad(a));
      pts.push(polar(cj,a-phi),[ex-px*w1,ey-py*w1],[ex+px*w1,ey+py*w1]); }
    const it=[{k:'p',d:'M'+pts.map(([x,y])=>`${f2(x)} ${f2(y)}`).join('L')+'Z',ink:p.ink,w:p.weight,fill}];
    if(p.inner) it.unshift({k:'c',r:r*.62,ink:p.ink,w:p.weight*.8});
    return it;
  },
  sun(p,fill){
    const n=Math.max(3,Math.round(p.n)), r=p.r, inner=r*(.28+p.width/250);
    let d=''; for(let i=0;i<=2*n;i++){ const a=p.rot+i*180/n; const rr=i%2?inner*1.06:(i%4===0?r:r*.8); const [x,y]=polar(rr,a); d+=`${i?'L':'M'}${f2(x)} ${f2(y)}`; }
    return [{k:'p',d:d+'Z',ink:p.ink,w:p.weight,fill},{k:'c',r:inner,ink:p.ink,w:p.weight,fill:'paper'},{k:'c',r:inner*.78,ink:p.ink,w:p.weight*.6}];
  },
  crescent(p,fill){
    const r=p.r, r2=r*.86, e=r*(.22+p.width/180);
    const y=(r2*r2-r*r-e*e)/(2*e), x=Math.sqrt(Math.max(0,r*r-y*y));
    const d=`M${f2(-x)} ${f2(y)}A${f2(r)} ${f2(r)} 0 1 0 ${f2(x)} ${f2(y)}A${f2(r2)} ${f2(r2)} 0 1 1 ${f2(-x)} ${f2(y)}Z`;
    return [{k:'p',d,tr:{x:0,y:0,a:p.rot},ink:p.ink,w:p.weight,fill}];
  },
  eye(p,fill){
    const r=p.r, sag=r*Math.max(.12,p.width/100)*.9, R=(r*r+sag*sag)/(2*sag);
    const tr={x:0,y:0,a:p.rot};
    return [{k:'p',d:`M${f2(-r)} 0A${f2(R)} ${f2(R)} 0 0 1 ${f2(r)} 0A${f2(R)} ${f2(R)} 0 0 1 ${f2(-r)} 0Z`,tr,ink:p.ink,w:p.weight,fill},
      {k:'c',r:sag*.68,ink:p.ink,w:p.weight,fill:'paper'},{k:'c',r:sag*.27,ink:p.ink,w:0,fill:p.ink}];
  },
  vesica(p,fill){
    const R=p.r/1.5; const [x1,y1]=polar(R/2,p.rot+90), [x2,y2]=polar(R/2,p.rot-90);
    return [{k:'c',x:x1,y:y1,r:R,ink:p.ink,w:p.weight,fill},{k:'c',x:x2,y:y2,r:R,ink:p.ink,w:p.weight}];
  },
  rosette(p,fill){
    const n=Math.max(2,Math.round(p.n)), rho=p.r/2; const it=[];
    if(p.inner) it.push({k:'c',r:p.r,ink:p.ink,w:p.weight,fill});
    it.push({k:'c',r:rho,ink:p.ink,w:p.weight,fill:p.inner?null:fill});
    for(let i=0;i<n;i++){ const [x,y]=polar(rho,p.rot+i*360/n); it.push({k:'c',x,y,r:rho,ink:p.ink,w:p.weight}); }
    return it;
  },
  leaves(p,fill){
    const n=Math.max(2,Math.round(p.n)), r=p.r, w=r*p.width/100*.5, R=((r/2)**2+w*w)/(2*w); const it=[];
    if(p.inner) it.push({k:'c',r:r*.56,ink:p.ink,w:p.weight});
    for(let i=0;i<n;i++) it.push({k:'p',d:`M0 0A${f2(R)} ${f2(R)} 0 0 1 0 ${f2(-r)}A${f2(R)} ${f2(R)} 0 0 1 0 0Z`,tr:{x:0,y:0,a:p.rot+i*360/n},ink:p.ink,w:p.weight,fill});
    return it;
  },
  foil(p,fill){
    const n=Math.max(3,Math.round(p.n)), r=p.r, phi=Math.PI/n, sp=Math.sin(phi);
    const rho=Math.min(r*.95, r*sp/(1+sp)*(1+p.width/180)), dd=r-rho;
    const t=dd*Math.cos(phi)-Math.sqrt(Math.max(0,rho*rho-dd*dd*sp*sp));
    const I=i=>polar(t,p.rot+(i+.5)*360/n);
    let [sx,sy]=I(-1); let d=`M${f2(sx)} ${f2(sy)}`;
    for(let i=0;i<n;i++){ const [x,y]=I(i); d+=`A${f2(rho)} ${f2(rho)} 0 1 1 ${f2(x)} ${f2(y)}`; }
    const it=[{k:'p',d:d+'Z',ink:p.ink,w:p.weight,fill}];
    if(p.inner) it.unshift({k:'c',r,ink:p.ink,w:p.weight*.8});
    return it;
  },
  spiral(p){
    const turns=Math.max(1,Math.round(p.n))/2; const steps=Math.round(120*turns); let d='';
    for(let i=0;i<=steps;i++){ const t=i/steps; const [x,y]=polar(p.r*t,p.rot+t*turns*360); d+=`${i?'L':'M'}${f2(x)} ${f2(y)}`; }
    return [{k:'p',d,ink:p.ink,w:p.weight}];
  }
};

const RENDER = {
  circle(p){
    const it=[{k:'c',r:p.r,ink:p.ink,w:p.weight,dash:p.dash}];
    if(p.double) it.push({k:'c',r:Math.max(1,p.r-p.gap),ink:p.ink,w:Math.max(.5,p.weight*.55),dash:p.dash});
    return it;
  },
  inscription(p){
    const S=SETS[p.script]; const it=[];
    const seq=translitSeq(p.text,p.script,p.classical);
    const half=p.size*.74;
    if(p.frame){
      it.push({k:'p',d:circlePath(p.r+half)+circlePath(Math.max(1,p.r-half)),fill:'paper',rule:'evenodd'});
      it.push({k:'c',r:p.r+half,ink:p.ink,w:p.weight});
      it.push({k:'c',r:Math.max(1,p.r-half),ink:p.ink,w:p.weight});
    }
    if(!seq.length) return it;
    const circ=2*Math.PI*p.r;
    let chars, size=p.size, step;
    if(p.fill==='repeat'){
      const unit=[...seq, ' ', ...Array.from(S.rep), ' '];
      const slots=Math.floor(circ/(size*S.adv));
      let reps=Math.max(1,Math.floor(slots/unit.length));
      chars=[]; for(let i=0;i<reps;i++) chars.push(...unit);
      if(chars.length>slots){ size=Math.max(6,circ/(chars.length*S.adv)); }
      step=360/chars.length;
    } else {
      chars=[...Array.from(p.script==='ogham'?'᚛':S.rep), ' ', ...seq, ...(p.script==='ogham'?['᚜']:[])];
      step=(size*S.adv)/p.r*180/Math.PI;
      if(step*chars.length>356){ step=356/chars.length; size=Math.max(6,rad(step)*p.r/S.adv); }
    }
    const total=step*chars.length;
    const start=p.fill==='repeat'?0:-total/2+step/2;
    chars.forEach((ch,i)=>{
      if(ch===' ') return;
      const a = p.dir==='in' ? 180-(start+i*step) : start+i*step;
      const [x,y]=polar(p.r,a);
      it.push({k:'t',s:ch,x,y,a:p.dir==='in'?a+180:a,size,font:S.font,ink:p.ink});
    });
    return it;
  },
  star(p){
    const shape=p.shape||'star';
    const fillRole=p.fillMode==='paper'?'paper':p.fillMode==='solid'?p.ink:null;
    if(shape!=='star') return FIGURES[shape](p,fillRole);
    const n=Math.round(p.n), k=Math.max(1,Math.min(Math.round(p.k),Math.floor((n-1)/2)||1));
    const v=[...Array(n)].map((_,i)=>polar(p.r,p.rot+i*360/n));
    const G=gcd(n,k); let d='';
    for(let s=0;s<G;s++){ let idx=s; d+=`M${f2(v[idx][0])} ${f2(v[idx][1])}`; for(let j=1;j<n/G;j++){ idx=(idx+k)%n; d+=`L${f2(v[idx][0])} ${f2(v[idx][1])}`;} d+='Z'; }
    const it=[{k:'p',d,ink:p.ink,w:p.weight,fill:fillRole}];
    if(p.inner) it.push({k:'c',r:p.r*Math.cos(Math.PI*k/n),ink:p.ink,w:Math.max(.5,p.weight*.6)});
    if(p.nodes) v.forEach(([x,y])=>it.push({k:'c',x,y,r:Math.max(3,p.weight*3.2),ink:p.ink,w:p.weight*.8,fill:'paper'}));
    return it;
  },
  glyphs(p){
    const S=SETS[p.set]; const it=[]; const half=p.size*.95;
    if(p.band){
      it.push({k:'p',d:circlePath(p.r+half)+circlePath(Math.max(1,p.r-half)),fill:'paper',rule:'evenodd'});
      it.push({k:'c',r:p.r+half,ink:p.ink,w:p.weight});
      it.push({k:'c',r:Math.max(1,p.r-half),ink:p.ink,w:p.weight});
    }
    for(let i=0;i<p.count;i++){
      const a=i*360/p.count; const [x,y]=polar(p.r,a); const s=p.size*.78; const fa=p.orient==='radial'?a:0;
      if(p.frame==='circle') it.push({k:'c',x,y,r:p.size*.72,ink:p.ink,w:p.weight*.8,fill:'paper'});
      if(p.frame==='diamond') it.push({k:'p',d:`M0 ${f2(-s)}L${f2(s)} 0L0 ${f2(s)}L${f2(-s)} 0Z`,tr:{x,y,a},ink:p.ink,w:p.weight*.8,fill:'paper'});
      if(p.frame==='square'){ const q=s*.78; it.push({k:'p',d:`M${f2(-q)} ${f2(-q)}H${f2(q)}V${f2(q)}H${f2(-q)}Z`,tr:{x,y,a:fa},ink:p.ink,w:p.weight*.8,fill:'paper'}); }
      if(p.frame==='shield'){ const q=s*.75; it.push({k:'p',d:`M${f2(-q)} ${f2(-q*.95)}H${f2(q)}V${f2(q*.1)}C${f2(q)} ${f2(q*.75)} ${f2(q*.35)} ${f2(q*1.05)} 0 ${f2(q*1.25)}C${f2(-q*.35)} ${f2(q*1.05)} ${f2(-q)} ${f2(q*.75)} ${f2(-q)} ${f2(q*.1)}Z`,tr:{x,y,a:fa},ink:p.ink,w:p.weight*.8,fill:'paper'}); }
      it.push({k:'t',s:glyphChar(p.set,p.offset+i),x,y,a:fa,size:p.size*(p.frame==='none'?1:.74),font:S.font,ink:p.ink});
    }
    return it;
  },
  spokes(p){
    const it=[]; let d='';
    for(let i=0;i<p.count;i++){
      const a=p.rot+i*360/p.count; const [x1,y1]=polar(p.r1,a), [x2,y2]=polar(p.r2,a);
      if(p.style==='double'){
        const off=Math.max(2,p.weight*2); const ox=Math.cos(rad(a))*off, oy=Math.sin(rad(a))*off;
        d+=`M${f2(x1+ox)} ${f2(y1+oy)}L${f2(x2+ox)} ${f2(y2+oy)}M${f2(x1-ox)} ${f2(y1-oy)}L${f2(x2-ox)} ${f2(y2-oy)}`;
      } else if(p.style==='dagger'||p.style==='arrow'){
        const tip=Math.min(26,(p.r2-p.r1)*.18); const [xb,yb]=polar(p.r2-tip,a);
        d+=`M${f2(x1)} ${f2(y1)}L${f2(xb)} ${f2(yb)}`;
        const s=tip*(p.style==='arrow'?.55:.32);
        it.push({k:'p',d:p.style==='arrow'?`M0 ${f2(-tip)}L${f2(s)} ${f2(tip*.15)}L0 0L${f2(-s)} ${f2(tip*.15)}Z`:`M0 ${f2(-tip)}L${f2(s)} 0L0 ${f2(tip*.35)}L${f2(-s)} 0Z`,tr:{x:xb,y:yb,a},ink:p.ink,w:p.weight*.7,fill:p.ink});
      } else if(p.style==='wavy'){
        const len=p.r2-p.r1, waves=Math.max(2,Math.round(len/40)), amp=Math.max(3,Math.min(10,len/30));
        for(let j=0;j<=waves*12;j++){ const t=j/(waves*12); const rr=p.r1+len*t; const off=Math.sin(t*waves*2*Math.PI)*amp;
          const [bx,by]=polar(rr,a); const px=Math.cos(rad(a))*off, py=Math.sin(rad(a))*off;
          d+=`${j?'L':'M'}${f2(bx+px)} ${f2(by+py)}`; }
      } else d+=`M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`;
    }
    it.unshift({k:'p',d,ink:p.ink,w:p.weight,dash:p.style==='dotted'?'dot':'none'});
    return it;
  },
  ticks(p){
    let d='';
    for(let i=0;i<p.count;i++){
      const a=i*360/p.count; const L=(p.major&&i%p.major===0)?p.len*1.8:p.len;
      const r1=p.dir==='out'?p.r:p.dir==='both'?p.r-L/2:p.r-L, r2=p.dir==='out'?p.r+L:p.dir==='both'?p.r+L/2:p.r;
      const [x1,y1]=polar(r1,a),[x2,y2]=polar(r2,a); d+=`M${f2(x1)} ${f2(y1)}L${f2(x2)} ${f2(y2)}`;
    }
    return [{k:'p',d,ink:p.ink,w:p.weight}];
  },
  petals(p){
    const it=[]; const n=p.count; const s=p.size;
    if(p.style==='scallop'){
      const chord=2*p.r*Math.sin(Math.PI/n); const sg=Math.max(1,s); const rho=(chord*chord/4+sg*sg)/(2*sg);
      let d=''; for(let i=0;i<n;i++){ const [x1,y1]=polar(p.r,p.rot+i*360/n),[x2,y2]=polar(p.r,p.rot+(i+1)*360/n);
        d+=(i===0?`M${f2(x1)} ${f2(y1)}`:'')+`A${f2(rho)} ${f2(rho)} 0 ${sg>chord/2?1:0} 1 ${f2(x2)} ${f2(y2)}`; }
      it.push({k:'p',d:d+'Z',ink:p.ink,w:p.weight});
      return it;
    }
    if(p.style==='thorns'){
      let d=''; for(let i=0;i<=2*n;i++){ const [x,y]=polar(i%2?p.r+s:p.r,p.rot+i*180/n); d+=`${i?'L':'M'}${f2(x)} ${f2(y)}`; }
      it.push({k:'p',d:d+'Z',ink:p.ink,w:p.weight,fill:'paper'}); return it;
    }
    if(p.style==='waves'){
      let d=''; const steps=n*16; for(let i=0;i<=steps;i++){ const a=p.rot+i*360/steps; const [x,y]=polar(p.r+s*.5*Math.sin(rad(i*360/steps*n)),a); d+=`${i?'L':'M'}${f2(x)} ${f2(y)}`; }
      it.push({k:'p',d:d+'Z',ink:p.ink,w:p.weight}); return it;
    }
    for(let i=0;i<n;i++){
      const a=p.rot+i*360/n; const [x,y]=polar(p.r,a);
      if(p.style==='vesica'){ const w=s*.42, R=(s*s+w*w)/(2*w);
        it.push({k:'p',d:`M0 ${f2(-s)}A${f2(R)} ${f2(R)} 0 0 1 0 ${f2(s)}A${f2(R)} ${f2(R)} 0 0 1 0 ${f2(-s)}Z`,tr:{x,y,a},ink:p.ink,w:p.weight,fill:'paper'}); }
      else if(p.style==='crescent'){ const dd=s*.42, R2=(s*s+dd*dd)/(2*dd);
        it.push({k:'p',d:`M${f2(-s)} 0A${f2(s)} ${f2(s)} 0 0 1 ${f2(s)} 0A${f2(R2)} ${f2(R2)} 0 0 0 ${f2(-s)} 0Z`,tr:{x,y,a},ink:p.ink,w:p.weight*.6,fill:p.ink}); }
      else if(p.style==='loops'){ it.push({k:'c',x,y,r:s,ink:p.ink,w:p.weight}); }
      else if(p.style==='flames'){ const q=s;
        it.push({k:'p',d:`M0 ${f2(-q)}C${f2(q*.55)} ${f2(-q*.35)} ${f2(q*.5)} ${f2(q*.3)} 0 ${f2(q*.55)}C${f2(-q*.5)} ${f2(q*.3)} ${f2(-q*.55)} ${f2(-q*.35)} 0 ${f2(-q)}ZM0 ${f2(-q*.35)}C${f2(q*.22)} ${f2(-q*.05)} ${f2(q*.2)} ${f2(q*.25)} 0 ${f2(q*.35)}C${f2(-q*.2)} ${f2(q*.25)} ${f2(-q*.22)} ${f2(-q*.05)} 0 ${f2(-q*.35)}Z`,tr:{x,y,a},ink:p.ink,w:p.weight,fill:'paper'}); }
      else if(p.style==='chain'){ const link=Math.PI*p.r/n*1.12; const ry=i%2?s*.32:s*.5; const rx=i%2?link*.62:link*.62;
        it.push({k:'p',d:`M${f2(-rx)} 0A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(rx)} 0A${f2(rx)} ${f2(ry)} 0 1 0 ${f2(-rx)} 0Z`,tr:{x,y,a},ink:p.ink,w:p.weight,fill:i%2?null:null}); }
      else { it.push({k:'c',x,y,r:Math.max(1.5,s*.3),ink:p.ink,w:0,fill:p.ink}); }
    }
    return it;
  },
  orbits(p){
    const it=[];
    if(p.track) it.push({k:'c',r:p.r,ink:p.ink,w:p.weight*.7,dash:'dash'});
    for(let i=0;i<p.count;i++){
      const a=p.rot+i*360/p.count; const [x,y]=polar(p.r,a);
      it.push({k:'c',x,y,r:p.size,ink:p.ink,w:p.weight,fill:'paper'});
      if(p.double) it.push({k:'c',x,y,r:p.size*.78,ink:p.ink,w:p.weight*.6});
      if(p.set!=='none') it.push({k:'t',s:glyphChar(p.set,p.offset+i),x,y,a:0,size:p.size*(p.double?.95:1.12),font:SETS[p.set].font,ink:p.ink});
    }
    return it;
  },
  core(p){
    const it=[];
    for(let i=p.frames-1;i>=0;i--) it.push({k:'c',r:p.size+i*11,ink:p.ink,w:i===0?p.weight:p.weight*.6,fill:i===0?'paper':null});
    if(p.frames===0) it.push({k:'c',r:p.size,ink:p.ink,w:0,fill:'paper'});
    it.push({k:'t',s:glyphChar(p.set,p.index),x:0,y:0,a:0,size:p.size*1.2,font:SETS[p.set].font,ink:p.ink});
    return it;
  }
};

/* =====================================================================
   COLOUR
   ===================================================================== */
function hexMix(hex,to,t){
  const h=x=>parseInt(x,16); const a=[h(hex.slice(1,3)),h(hex.slice(3,5)),h(hex.slice(5,7))], b=[h(to.slice(1,3)),h(to.slice(3,5)),h(to.slice(5,7))];
  return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*t).toString(16).padStart(2,'0')).join('');
}
const PAPER={light:'#efe2c0', dark:'#0e1511'};
function palette(st, mode, bg){
  const A=archById(st.inkArch); const pal={};
  for(const role of ['primary','gilt','ink']){
    const custom=st.inkOverride&&st.inkOverride[role];
    if(mode==='light') pal[role]=custom||A.inks[role][0];
    else pal[role]=custom?hexMix(custom,'#f4ecd6',.45):A.inks[role][1];
  }
  for(const k in FIXED_INKS) pal[k]=FIXED_INKS[k][mode==='light'?0:1];
  pal.paper = bg==='transparent' ? 'none' : PAPER[mode];
  pal.wash = pal.primary;
  pal.mode = mode;
  return pal;
}
function ringPal(pal,p){
  if(p.ink!=='custom') return pal;
  const c=/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:'#2f7d55';
  return {...pal, custom: pal.mode==='light'?c:hexMix(c,'#f4ecd6',.45)};
}

/* =====================================================================
   SVG OUTPUT
   ===================================================================== */
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const DASH=(d,w)=>d==='dot'?`0 ${f2(w*3.2)}`:d==='dash'?`${f2(w*5)} ${f2(w*3.5)}`:null;
const FONT_CSS_URL='https://fonts.googleapis.com/css2?family=Cinzel:wght@600&amp;family=EB+Garamond&amp;family=Noto+Sans+Runic&amp;family=Noto+Sans+Ogham&amp;family=Noto+Sans+Symbols&amp;family=Noto+Sans+Symbols+2&amp;family=MedievalSharp&amp;family=Uncial+Antiqua&amp;family=Metamorphous&amp;family=UnifrakturMaguntia&amp;family=Noto+Sans+Glagolitic&amp;family=Noto+Sans+Gothic&amp;family=Noto+Sans+Phoenician&amp;family=Noto+Sans+Old+Italic&amp;display=swap';
function usedUserFonts(st){
  const ids=new Set();
  st.rings.forEach(r=>{ [r.p.script,r.p.set].forEach(s=>{ if(typeof s==='string'&&s.startsWith('font-')) ids.add(s.slice(5)); }); });
  return USER_FONTS.filter(f=>ids.has(f.id));
}

function itemSVG(it,pal,W){
  const col=r=>r==null?'none':pal[r]||'none';
  if(it.k==='c'){
    const w=it.w*W; const dash=it.dash&&it.dash!=='none'?DASH(it.dash,w):null;
    return `<circle cx="${f2(it.x||0)}" cy="${f2(it.y||0)}" r="${f2(it.r)}" fill="${col(it.fill)}" stroke="${w>0?col(it.ink):'none'}" stroke-width="${f2(w)}"${dash?` stroke-dasharray="${dash}" stroke-linecap="round"`:''}/>`;
  }
  if(it.k==='p'){
    const w=(it.w||0)*W; const dash=it.dash&&it.dash!=='none'?DASH(it.dash,w):null;
    const tr=it.tr?` transform="translate(${f2(it.tr.x)} ${f2(it.tr.y)}) rotate(${f2(it.tr.a)})"`:'';
    return `<path d="${it.d}"${tr} fill="${col(it.fill)}"${it.rule?` fill-rule="${it.rule}"`:''} stroke="${w>0&&it.ink?col(it.ink):'none'}" stroke-width="${f2(w)}" stroke-linejoin="round" stroke-linecap="round"${dash?` stroke-dasharray="${dash}"`:''}/>`;
  }
  if(it.k==='t'){
    return `<text x="${f2(it.x)}" y="${f2(it.y)}" font-family="${esc(it.font)}" font-size="${f2(it.size)}" fill="${col(it.ink)}" text-anchor="middle" dominant-baseline="central"${it.a?` transform="rotate(${f2(it.a)} ${f2(it.x)} ${f2(it.y)})"`:''}>${esc(it.s)}</text>`;
  }
  return '';
}
function sceneSVG(st,{mode='light',bg='none',anim=false,forExport=false,selected=null,thumb=false}={}){
  const pal=palette(st,mode,bg); const W=st.weight||1;
  let o=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-500 -500 1000 1000"${forExport?' width="1000" height="1000"':''}>`;
  if(forExport) o+=`<style>@import url('${FONT_CSS_URL}');${usedUserFonts(st).map(f=>`@font-face{font-family:"${fontFamilyOf(f.id)}";src:url(data:${f.mime};base64,${f.b64});}`).join('')}</style>`;
  o+=`<defs><radialGradient id="wash${thumb?'t':''}" r="0.5"><stop offset="0" stop-color="${pal.wash}" stop-opacity="${mode==='light'?.16:.22}"/><stop offset=".75" stop-color="${pal.wash}" stop-opacity="${mode==='light'?.05:.06}"/><stop offset="1" stop-color="${pal.wash}" stop-opacity="0"/></radialGradient>`;
  if(bg==='parchment') o+=`<radialGradient id="parch" r="0.71"><stop offset="0" stop-color="${PAPER.light}"/><stop offset=".68" stop-color="${PAPER.light}"/><stop offset="1" stop-color="#d4bc89"/></radialGradient>`;
  o+='</defs>';
  if(bg==='parchment') o+=`<rect x="-500" y="-500" width="1000" height="1000" fill="url(#parch)"/>`;
  if(bg==='night') o+=`<rect x="-500" y="-500" width="1000" height="1000" fill="${PAPER.dark}"/>`;
  if(st.wash!==false) o+=`<circle r="480" fill="url(#wash${thumb?'t':''})"/>`;
  for(const ring of st.rings){
    if(!ring.visible) continue;
    const items=RENDER[ring.type](ring.p); const rp=ringPal(pal,ring.p);
    const body=items.map(it=>itemSVG(it,rp,W)).join('');
    const sp=+ring.p.spin;
    const inner = (anim && sp) ? `<g><animateTransform attributeName="transform" type="rotate" from="0 0 0" to="${sp*360} 0 0" dur="${ring.p.period}s" repeatCount="indefinite"/>${body}</g>` : body;
    o+=`<g${thumb?'':` data-ring="${ring.id}"`}${selected===ring.id?' class="sel"':''}>${inner}</g>`;
  }
  return o+'</svg>';
}

/* =====================================================================
   CANVAS OUTPUT (PNG)
   ===================================================================== */
async function ensureFonts(){
  if(!document.fonts) return;
  const loads=[['600 40px Cinzel','ABC'],['40px "EB Garamond"','ΑΒΓ'],['40px "Noto Sans Runic"','ᚠᚢᚦ'],['40px "Noto Sans Ogham"','ᚁᚂ'],['40px "Noto Sans Symbols"','☉♈🜍'],['40px "Noto Sans Symbols 2"','✠⁘'],['40px "Uncial Antiqua"','AB'],['40px MedievalSharp','AB'],['40px Metamorphous','AB'],['40px UnifrakturMaguntia','Ab'],['40px "Noto Sans Glagolitic"','ⰀⰁ'],['40px "Noto Sans Gothic"','𐌰𐌱'],['40px "Noto Sans Phoenician"','𐤀𐤁'],['40px "Noto Sans Old Italic"','𐌀𐌁'],...USER_FONTS.map(f=>[`40px "${fontFamilyOf(f.id)}"`,'AB'])];
  try{ await Promise.all(loads.map(([f,t])=>document.fonts.load(f,t))); }catch(e){}
}
function drawCanvas(st,size,{mode,bg}){
  const cv=document.createElement('canvas'); cv.width=size; cv.height=size;
  const c=cv.getContext('2d'); const pal=palette(st,mode,bg); const W=st.weight||1;
  c.setTransform(size/1000,0,0,size/1000,size/2,size/2);
  if(bg==='parchment'){ const gr=c.createRadialGradient(0,0,0,0,0,707); gr.addColorStop(0,PAPER.light); gr.addColorStop(.68,PAPER.light); gr.addColorStop(1,'#d4bc89'); c.fillStyle=gr; c.fillRect(-500,-500,1000,1000); }
  if(bg==='night'){ c.fillStyle=PAPER.dark; c.fillRect(-500,-500,1000,1000); }
  if(st.wash!==false){ const gr=c.createRadialGradient(0,0,0,0,0,480); const a=mode==='light'?.16:.22;
    const rgba=(hex,al)=>`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${al})`;
    gr.addColorStop(0,rgba(pal.wash,a)); gr.addColorStop(.75,rgba(pal.wash,mode==='light'?.05:.06)); gr.addColorStop(1,rgba(pal.wash,0));
    c.fillStyle=gr; c.beginPath(); c.arc(0,0,480,0,Math.PI*2); c.fill(); }
  let rp=pal;
  const col=r=>r==null?null:(rp[r]==='none'||!rp[r]?null:rp[r]);
  for(const ring of st.rings){
    if(!ring.visible) continue;
    rp=ringPal(pal,ring.p);
    for(const it of RENDER[ring.type](ring.p)){
      c.save();
      if(it.k==='c'){
        c.beginPath(); c.arc(it.x||0,it.y||0,it.r,0,Math.PI*2);
        const fill=col(it.fill); if(fill){c.fillStyle=fill;c.fill();}
        const w=it.w*W; if(w>0&&col(it.ink)){ c.lineWidth=w; c.strokeStyle=col(it.ink);
          if(it.dash==='dot'){c.setLineDash([0.001,w*3.2]);c.lineCap='round';} else if(it.dash==='dash'){c.setLineDash([w*5,w*3.5]);c.lineCap='round';}
          c.stroke(); }
      } else if(it.k==='p'){
        if(it.tr){ c.translate(it.tr.x,it.tr.y); c.rotate(rad(it.tr.a)); }
        const path=new Path2D(it.d);
        const fill=col(it.fill); if(fill){c.fillStyle=fill;c.fill(path,it.rule||'nonzero');}
        const w=(it.w||0)*W; if(w>0&&it.ink&&col(it.ink)){ c.lineWidth=w; c.strokeStyle=col(it.ink); c.lineJoin='round'; c.lineCap='round';
          if(it.dash==='dot') c.setLineDash([0.001,w*3.2]); else if(it.dash==='dash') c.setLineDash([w*5,w*3.5]);
          c.stroke(path); }
      } else if(it.k==='t'){
        c.translate(it.x,it.y); if(it.a) c.rotate(rad(it.a));
        c.font=`${it.size}px ${it.font}`; c.textAlign='center'; c.textBaseline='middle'; c.fillStyle=col(it.ink);
        c.fillText(it.s,0,0);
      }
      c.restore();
    }
  }
  return cv;
}

/* =====================================================================
   YOUR ALPHABETS (uploaded font files)
   ===================================================================== */
const USER_FONTS=[];
const fontFamilyOf=id=>`SigilUser-${id}`;
function abToB64(buf){ let s=''; const b=new Uint8Array(buf); for(let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000)); return btoa(s); }
function b64ToAb(b64){ const s=atob(b64); const b=new Uint8Array(s.length); for(let i=0;i<s.length;i++) b[i]=s.charCodeAt(i); return b.buffer; }
async function registerFont(f){
  const ff=new FontFace(fontFamilyOf(f.id), b64ToAb(f.b64)); await ff.load(); document.fonts.add(ff);
  SETS_RAW[`font-${f.id}`]={label:f.name, plural:`${f.name} letters`, lore:`the ${f.name} alphabet`, font:`"${fontFamilyOf(f.id)}", Cinzel, "Noto Sans Symbols 2", serif`,
    alphabet:true, base:'latin', lower:!!f.lower, adv:.82, sep:'·', rep:'✠', glyphs:AZ, user:f.id};
  if(!USER_FONTS.find(x=>x.id===f.id)) USER_FONTS.push(f);
}
function saveUserFonts(){ try{ localStorage.setItem('sigil-grimoire-fonts', JSON.stringify(USER_FONTS)); return true; }catch(e){ return false; } }
async function loadUserFonts(){ let arr=[]; try{ arr=JSON.parse(localStorage.getItem('sigil-grimoire-fonts'))||[]; }catch(e){} for(const f of arr){ try{ await registerFont(f); }catch(e){} } }
const FONT_MIME={ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'};

/* =====================================================================
   BOOK (whole spread → canvas → PNG / PDF)
   page = 1000 × 1414 units (A-series ratio)
   ===================================================================== */
const PG={w:1000,h:1414,pad:92};
const BOOKF={
  title:'"MedievalSharp", "IM Fell English", Georgia, serif',
  book:'"IM Fell English", "EB Garamond", Georgia, serif',
  sc:'"IM Fell English SC", "IM Fell English", Georgia, serif',
  initial:'"UnifrakturMaguntia", "IM Fell English", serif'
};
const BINK={ink:'#2b2117',sub:'#5e4b30',head:'#6b5636',rubric:'#9a2b1d',gold:'#a98228',faint:'#8a7552'};
/* The 12 colours of the binding (cover) and of the illuminated initial.
   cover: three stops of the leather; cap: the initial's ground (light, dark); letter: its colour.
   Ids match the bookColour enum of data/schema.js. */
const BOOK_COLOURS=[
  {id:'verdigris',label:'Verdigris',cover:['#1f4a33','#163826','#10291b'],cap:['#2f7a51','#1c4c32'],letter:'#ecc760'},
  {id:'oxblood',label:'Oxblood',cover:['#5c1b1b','#46140f','#2e0c0a'],cap:['#8e2a22','#5c1712'],letter:'#ecc760'},
  {id:'lapis',label:'Lapis',cover:['#1e3762','#162a4c','#0e1a33'],cap:['#2e5597','#1b3566'],letter:'#ecc760'},
  {id:'sable',label:'Sable',cover:['#2c2927','#1e1c1b','#121110'],cap:['#3d3935','#1d1b1a'],letter:'#ecc760'},
  {id:'tyrian',label:'Tyrian purple',cover:['#4c1d42','#3a1532','#260d21'],cap:['#76315f','#4a1c40'],letter:'#ecc760'},
  {id:'indigo',label:'Indigo',cover:['#282c5e','#1e2147','#14162f'],cap:['#3d4396','#262a5e'],letter:'#ecc760'},
  {id:'teal',label:'Teal',cover:['#174c4b','#113a3a','#0a2727'],cap:['#24716d','#154645'],letter:'#ecc760'},
  {id:'slate',label:'Slate',cover:['#3b4652','#2d363f','#1f262d'],cap:['#55626f','#343e48'],letter:'#ecc760'},
  {id:'umber',label:'Umber',cover:['#4d3421','#3a2718','#281a10'],cap:['#7a5332','#4b321f'],letter:'#ecc760'},
  {id:'vermilion',label:'Vermilion',cover:['#9a3221','#7a2618','#531a10'],cap:['#b8402b','#7e2818'],letter:'#f6dc8a'},
  {id:'saffron',label:'Saffron',cover:['#7c5619','#604213','#422c0b'],cap:['#c08a2a','#85591a'],letter:'#fff1c4'},
  {id:'vellum',label:'Vellum',cover:['#d3c196','#bba578','#9c865a'],cap:['#f3e7c7','#d9c492'],letter:'#8f2a1c',light:true}
];
const bookColour=id=>BOOK_COLOURS.find(c=>c.id===id)||BOOK_COLOURS[0];
/* The circle's own choice (recipe: book.cover / book.initial), unless a folio picks another */
function bookColours(st,text){
  const b=(st&&st.book)||{};
  return {cover:bookColour((text&&text.coverColour)||b.cover), initial:bookColour((text&&text.initialColour)||b.initial)};
}
async function ensureBookFonts(){
  if(typeof document==='undefined'||!document.fonts) return;
  const loads=[['40px MedievalSharp','Ab'],['40px "IM Fell English"','Ab'],['italic 40px "IM Fell English"','Ab'],['40px "IM Fell English SC"','Ab'],['40px UnifrakturMaguntia','T']];
  try{ await Promise.all(loads.map(([f,t])=>document.fonts.load(f,t))); }catch(e){}
  await ensureFonts();
}
function setLS(c,v){ try{ c.letterSpacing=v; }catch(e){} }
function pageBackground(c,x0,side,seedStr){
  c.save();
  c.fillStyle='#efe2c0'; c.fillRect(x0,0,PG.w,PG.h);
  const R=makeRng(seedStr+side);
  for(let i=0;i<5200;i++){ const x=x0+R.next()*PG.w, y=R.next()*PG.h; c.fillStyle=`rgba(${R.chance(.5)?'120,90,40':'255,250,235'},${.03+R.next()*.07})`; c.fillRect(x,y,1+R.next()*1.6,1+R.next()*1.6); }
  const vg=c.createRadialGradient(x0+PG.w/2,PG.h/2,PG.h*.42,x0+PG.w/2,PG.h/2,PG.h*.78);
  vg.addColorStop(0,'rgba(150,110,50,0)'); vg.addColorStop(1,'rgba(150,110,50,.30)'); c.fillStyle=vg; c.fillRect(x0,0,PG.w,PG.h);
  const gx=side==='verso'?x0+PG.w:x0; const gg=c.createLinearGradient(gx,0,side==='verso'?gx-130:gx+130,0);
  gg.addColorStop(0,'rgba(70,45,15,.40)'); gg.addColorStop(.35,'rgba(70,45,15,.10)'); gg.addColorStop(1,'rgba(70,45,15,0)');
  c.fillStyle=gg; c.fillRect(x0,0,PG.w,PG.h);
  // corner ornaments on the outer edge
  const corner=new Path2D('M3 3h36M3 3v36M8 8h20M8 8v20M8 8l9 9M28 3c0 5 4 8 8 5M3 28c5 0 8 4 5 8');
  const outerX = side==='verso'? x0+14 : x0+PG.w-14;
  [[outerX,14,side==='verso'?1:-1,1],[outerX,PG.h-14,side==='verso'?1:-1,-1]].forEach(([x,y,sx,sy])=>{
    c.save(); c.translate(x,y); c.scale(sx*1.7,sy*1.7); c.strokeStyle=BINK.gold; c.lineWidth=1.3; c.stroke(corner);
    c.beginPath(); c.arc(17,17,2,0,Math.PI*2); c.fillStyle=BINK.gold; c.fill(); c.restore(); });
  c.restore();
}
function runHead(c,x0,left,right,leftItalic){
  const y=PG.pad+18, xl=x0+PG.pad+8, xr=x0+PG.w-PG.pad-8;
  c.textBaseline='alphabetic';
  c.fillStyle=BINK.head;
  c.font=leftItalic?`italic 30px ${BOOKF.book}`:`25px ${BOOKF.sc}`; setLS(c,leftItalic?'0px':'2px'); c.textAlign='left'; c.fillText(left||'',xl,y);
  c.font=leftItalic?`25px ${BOOKF.sc}`:`italic 30px ${BOOKF.book}`; setLS(c,leftItalic?'2px':'0px'); c.textAlign='right'; c.fillText(right||'',xr,y);
  setLS(c,'0px');
  c.strokeStyle='rgba(107,86,54,.45)'; c.lineWidth=1.5; c.beginPath(); c.moveTo(xl,y+14); c.lineTo(xr,y+14); c.stroke();
  return y+14;
}
/* word-wrap a list of runs; widthAt(lineIndex) gives the available width */
function layoutRuns(c,runs,widthAt,fontOf){
  const words=[];
  let glue=false;
  runs.forEach(r=>{ String(r.t).split(/(\s+)/).forEach(tok=>{ if(!tok) return; if(/^\s+$/.test(tok)){ glue=false; return; }
    if(glue&&words.length) words[words.length-1].segs.push({t:tok,r}); else words.push({segs:[{t:tok,r}],r}); glue=true; }); });
  words.forEach(w=>{ w.w=0; w.segs.forEach(s=>{ c.font=fontOf(s.r); s.w=c.measureText(s.t).width; w.w+=s.w; }); w.t=w.segs.map(s=>s.t).join(''); });
  c.font=fontOf({}); const sp=c.measureText(' ').width;
  const lines=[]; let cur=[], curW=0;
  words.forEach(w=>{
    const need=cur.length?curW+sp+w.w:w.w;
    if(cur.length && need>widthAt(lines.length)){ lines.push(cur); cur=[w]; curW=w.w; }
    else { if(cur.length) curW+=sp; cur.push(w); curW+=w.w; }
  });
  if(cur.length) lines.push(cur);
  return {lines,sp};
}
function drawLines(c,lay,x,y,lh,widthAt,indentAt,fontOf,colorOf,justify=true){
  lay.lines.forEach((line,li)=>{
    const W=widthAt(li); const total=line.reduce((s,w)=>s+w.w,0); const gaps=line.length-1;
    const last=li===lay.lines.length-1;
    const gap=(justify&&!last&&gaps>0)?(W-total)/gaps:lay.sp;
    let cx=x+indentAt(li);
    line.forEach(w=>{ let sx=cx; w.segs.forEach(s=>{ c.font=fontOf(s.r); c.fillStyle=colorOf(s.r); c.fillText(s.t,sx,y+li*lh); sx+=s.w; }); cx+=w.w+gap; });
  });
  return y+lay.lines.length*lh;
}
function drawVerso(c,x0,L,seed){
  pageBackground(c,x0,'verso',seed);
  const top=runHead(c,x0,L.folioV,L.chapter,true);
  if(L.marginal){ c.save(); c.translate(x0+PG.pad+14,PG.h/2); c.rotate(-Math.PI/2); c.font=`21px ${BOOKF.sc}`; setLS(c,'3px'); c.fillStyle=BINK.faint; c.textAlign='center'; c.fillText(L.marginal,0,0); setLS(c,'0px'); c.restore(); }
  const left=x0+PG.pad+56, W=PG.w-PG.pad*2-56-8, bottom=PG.h-PG.pad-10;
  // try decreasing sizes until everything fits
  for(let fs=31;fs>=16;fs-=1){
    const r=layoutVerso(c,L,left,W,top+46,fs,false);
    if(r<=bottom||fs===16){ layoutVerso(c,L,left,W,top+46,fs,true); break; }
  }
}
function layoutVerso(c,L,left,W,y0,fs,draw){
  let y=y0; c.textAlign='left'; c.textBaseline='alphabetic';
  // title
  const tfs=Math.round(fs*2.1), tlh=tfs*1.08;
  if(L.titleLa){
    const tl=layoutRuns(c,[{t:L.titleLa}],()=>W,()=>`${tfs}px ${BOOKF.title}`);
    y+=tfs*.85;
    if(draw) drawLines(c,tl,left,y,tlh,()=>W,()=>0,()=>`${tfs}px ${BOOKF.title}`,()=>'#241a10',false);
    y+=(tl.lines.length-1)*tlh;
  }
  // gloss
  if(L.titleEn){
    const gfs=Math.round(fs*1.05);
    const gl=layoutRuns(c,[{t:L.titleEn}],()=>W,()=>`italic ${gfs}px ${BOOKF.book}`);
    y+=fs*1.25; if(draw) drawLines(c,gl,left,y,gfs*1.2,()=>W,()=>0,()=>`italic ${gfs}px ${BOOKF.book}`,()=>BINK.sub,false);
    y+=(gl.lines.length-1)*gfs*1.2;
  }
  // fleuron
  y+=fs*.95;
  if(draw){ c.save(); c.translate(left,y); c.scale(1.9,1.9); c.strokeStyle=BINK.gold; c.fillStyle=BINK.gold; c.lineWidth=.8;
    c.beginPath(); c.moveTo(2,7); c.lineTo(46,7); c.moveTo(74,7); c.lineTo(118,7); c.stroke();
    c.beginPath(); c.moveTo(60,1); c.lineTo(66,7); c.lineTo(60,13); c.lineTo(54,7); c.closePath(); c.fill();
    c.beginPath(); c.arc(49,7,1.6,0,7); c.arc(71,7,1.6,0,7); c.fill(); c.restore(); }
  y+=fs*1.6;
  // body: paragraphs, the first one with an illuminated initial
  const lh=fs*1.5, box=lh*2.85, indentN=3;
  const fontOf=r=>r&&r.sc?`${fs}px ${BOOKF.sc}`:r&&r.it?`italic ${fs}px ${BOOKF.book}`:`${fs}px ${BOOKF.book}`;
  L.paras.forEach((runs,pi)=>{
    if(!runs.length) return;
    const cap=pi===0&&L.dropCap&&L.initial;
    const widthAt=cap?(i=>i<indentN?W-box-fs*.6:W):(i=>i===0&&pi>0?W-fs*1.4:W);
    const indentAt=cap?(i=>i<indentN?box+fs*.6:0):(i=>i===0&&pi>0?fs*1.4:0);
    const bl=layoutRuns(c,runs,widthAt,fontOf);
    if(draw){
      if(cap){
        const bx=left, by=y-fs*.8+2;
        const cc=L.capColour||BOOK_COLOURS[0];
        const g=c.createRadialGradient(bx+box*.35,by+box*.3,2,bx+box/2,by+box/2,box*.75); g.addColorStop(0,cc.cap[0]); g.addColorStop(1,cc.cap[1]);
        c.fillStyle=g; c.fillRect(bx,by,box,box);
        c.strokeStyle='#b8902f'; c.lineWidth=3; c.strokeRect(bx+1.5,by+1.5,box-3,box-3);
        c.strokeStyle='rgba(230,196,108,.6)'; c.lineWidth=1; c.strokeRect(bx+6,by+6,box-12,box-12);
        c.font=`${Math.round(box*.72)}px ${BOOKF.initial}`; c.fillStyle=cc.letter; c.textAlign='center'; c.textBaseline='middle'; c.fillText(L.initial,bx+box/2,by+box/2+box*.04);
        c.textAlign='left'; c.textBaseline='alphabetic';
      }
      drawLines(c,bl,left,y,lh,widthAt,indentAt,fontOf,()=>BINK.ink,true);
    }
    y+=(cap?Math.max(bl.lines.length*lh, box+fs*.4):bl.lines.length*lh)+fs*.25;
  });
  y+=fs*1.65-lh;
  // rubric
  if(L.rubricLabel||L.rubricText){
    const rRuns=[...(L.rubricLabel?[{t:L.rubricLabel,sc:true}]:[]),...(L.rubricText?[{t:(L.rubricLabel?' ':'')+L.rubricText}]:[])];
    const rFont=r=>r&&r.sc?`${fs}px ${BOOKF.sc}`:`italic ${fs}px ${BOOKF.book}`;
    y+=lh;
    const rl=layoutRuns(c,rRuns,()=>W,rFont);
    if(draw) drawLines(c,rl,left,y,lh*.97,()=>W,()=>0,rFont,()=>BINK.rubric,false);
    y+=(rl.lines.length-1)*lh*.97 + fs*.8;
  }
  // properties with dotted leaders
  const pfs=Math.round(fs*.95), plh=pfs*1.5;
  if(L.props.length) y+=plh;
  L.props.forEach(([k,v])=>{
    c.font=`${pfs}px ${BOOKF.sc}`; const kw=c.measureText(k).width;
    const vl=layoutRuns(c,[{t:v||' '}],()=>W-kw-60,()=>`${pfs}px ${BOOKF.book}`);
    if(draw){
      c.fillStyle=BINK.sub; c.font=`${pfs}px ${BOOKF.sc}`; c.textAlign='left'; c.fillText(k,left,y);
      c.font=`${pfs}px ${BOOKF.book}`; c.fillStyle=BINK.ink; c.textAlign='right';
      vl.lines.forEach((ln,i)=>c.fillText(ln.map(w=>w.t).join(' '),left+W,y+i*plh));
      c.textAlign='left';
      const firstW=vl.lines.length?(c.font=`${pfs}px ${BOOKF.book}`, c.measureText(vl.lines[0].map(w=>w.t).join(' ')).width):0;
      c.strokeStyle='rgba(94,75,48,.6)'; c.lineWidth=1.6; c.setLineDash([1.5,5]); c.lineCap='round';
      c.beginPath(); c.moveTo(left+kw+10,y-4); c.lineTo(left+W-firstW-10,y-4); c.stroke(); c.setLineDash([]);
    }
    y+=Math.max(1,vl.lines.length)*plh;
  });
  return y;
}
async function drawRecto(c,x0,L,st){
  pageBackground(c,x0,'recto',st.seed);
  const top=runHead(c,x0,L.tabula,L.folioR,false);
  const size=PG.w-PG.pad*2-10; const px=x0+(PG.w-size)/2, py=top+Math.max(50,(PG.h-PG.pad-top-(size+140))/2);
  const sc=c.getTransform().a; const res=Math.min(4096,Math.max(256,Math.round(size*sc*1.05)));
  const plate=drawCanvas(st,res,{mode:'light',bg:'none'});
  c.drawImage(plate,px,py,size,size);
  c.textAlign='center'; c.textBaseline='alphabetic';
  if(L.capTitle){ c.font=`50px ${BOOKF.title}`; c.fillStyle='#241a10'; c.fillText(L.capTitle,x0+PG.w/2,py+size+82,size); }
  if(L.capMeta){ c.font=`23px ${BOOKF.sc}`; setLS(c,'3px'); c.fillStyle='#7a6544'; c.fillText(L.capMeta,x0+PG.w/2,py+size+124,size); setLS(c,'0px'); }
}
/* which: 'spread' | 'verso' | 'recto'; cover adds the green leather binding; text: the DM's own words (see applyText) */
async function renderBook(st,scale,{which='spread',cover=false,text=null}={}){
  await ensureBookFonts();
  const L=applyText(buildLore(st),text);
  const bk=bookColours(st,text); L.capColour=bk.initial;
  const pages=which==='spread'?2:1; const border=cover?70:0;
  const W=(PG.w*pages+border*2), H=PG.h+border*2+(cover?16:0);
  const cv=document.createElement('canvas'); cv.width=Math.round(W*scale); cv.height=Math.round(H*scale);
  const c=cv.getContext('2d'); c.scale(scale,scale);
  if(cover){
    const cv0=bk.cover.cover, tool=bk.cover.light?'110,80,30':'214,177,90';
    const g=c.createLinearGradient(0,0,W,H); g.addColorStop(0,cv0[0]); g.addColorStop(.55,cv0[1]); g.addColorStop(1,cv0[2]);
    c.fillStyle=g; c.fillRect(0,0,W,H);
    c.strokeStyle=`rgba(${tool},.6)`; c.lineWidth=2; c.strokeRect(18,18,W-36,H-36);
    c.strokeStyle=`rgba(${tool},.35)`; c.lineWidth=1.5; c.strokeRect(28,28,W-56,H-56);
    // page block edges beneath the paper
    for(let i=4;i>=1;i--){ c.fillStyle=i%2?'#cdb57f':'#bfa56c'; c.fillRect(border-1,border+i*3,PG.w*pages+2,PG.h); }
  }
  c.save(); c.translate(border,border);
  if(which!=='recto') drawVerso(c,0,L,st.seed);
  if(which!=='verso') await drawRecto(c,which==='spread'?PG.w:0,L,st);
  c.restore();
  return cv;
}
let jsPDFPromise=null;
function loadJsPDF(){
  if(window.jspdf) return Promise.resolve(window.jspdf);
  if(!jsPDFPromise) jsPDFPromise=new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload=()=>window.jspdf?res(window.jspdf):rej(new Error('jsPDF missing')); s.onerror=()=>{ jsPDFPromise=null; rej(new Error('load failed')); }; document.head.appendChild(s); });
  return jsPDFPromise;
}
/* layout: 'spread' (one A3 landscape sheet) | 'pages' (two A4 pages). Resolves to a PDF Blob. */
async function bookPDF(st,{layout='spread',text=null}={}){
  const {jsPDF}=await loadJsPDF(); const scale=1.65; // ≈ 200 dpi on A4
  let pdf;
  if(layout==='spread'){
    const cv=await renderBook(st,scale,{which:'spread',text});
    pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a3',compress:true});
    pdf.addImage(cv.toDataURL('image/jpeg',.9),'JPEG',0,0,420,297);
  } else {
    pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
    const v=await renderBook(st,scale,{which:'verso',text}); pdf.addImage(v.toDataURL('image/jpeg',.9),'JPEG',0,0,210,297);
    pdf.addPage('a4','portrait');
    const r=await renderBook(st,scale,{which:'recto',text}); pdf.addImage(r.toDataURL('image/jpeg',.9),'JPEG',0,0,210,297);
  }
  const L=applyText(buildLore(st),text);
  pdf.setProperties({title:L.titleLa||L.capTitle||'Folio',subject:L.titleEn||'',creator:'Sigil Grimoire'});
  return pdf.output('blob');
}
const canvasBlob=cv=>new Promise((res,rej)=>cv.toBlob(b=>b?res(b):rej(new Error('canvas')),'image/png'));
async function bookPNG(st,{text=null,scale=2}={}){ return canvasBlob(await renderBook(st,scale,{which:'spread',cover:true,text})); }
async function platePNG(st,{size=2048,bg='parchment'}={}){ await ensureFonts(); return canvasBlob(drawCanvas(st,size,{mode:bg==='night'?'dark':'light',bg})); }

/* =====================================================================
   LORE (left page) and the DM's own words
   ===================================================================== */
const HEADS=[['Sigillum','Seal'],['Circulus','Circle'],['Clavis','Key'],['Vinculum','Binding'],['Custodia','Ward'],['Porta','Gate'],['Signum','Sign']];
const GENS=[['Lunae Silentis','the Silent Moon'],['Ignis Aeterni','the Undying Fire'],['Portae Clausae','the Closed Gate'],['Stellae Errantis','the Wandering Star'],
  ['Viae Occultae','the Hidden Road'],['Sanguinis Antiqui','the Old Blood'],['Silvae Virentis','the Greening Wood'],['Solis Invicti','the Unconquered Sun'],
  ['Umbrae Profundae','the Deep Shadow'],['Aquae Vivae','the Living Water'],['Coronae Aureae','the Golden Crown'],['Draconis Dormientis','the Sleeping Dragon'],
  ['Ventorum Septem','the Seven Winds'],['Noctis Perpetuae','the Endless Night']];
const SURFACES=['a floor of unhewn stone','vellum stretched on an ash hoop','the threshold of a door','salted earth','a slab of black basalt','the deck of a ship at anchor','a hearthstone swept clean'];
const RITES=['one hour, begun at dusk','the burning of a single candle','moonrise to moonset','seven slow breaths','a day and a night','the space of a whispered psalm'];
const ZOD_GEN=['Arietis','Tauri','Geminorum','Cancri','Leonis','Virginis','Librae','Scorpii','Sagittarii','Capricorni','Aquarii','Piscium'];
const HOURS=['Solis','Lunae','Martis','Mercurii','Iovis','Veneris','Saturni'];
function roman(n){const m=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let s='';for(const [v,r] of m){while(n>=v){s+=r;n-=v;}}return s;}
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);

/* Runs of one paragraph: *italic* and **small capitals** */
function parseInline(s){
  const out=[]; String(s).replace(/\s*\n\s*/g,' ').split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).forEach(tok=>{
    if(!tok) return;
    if(/^\*\*[^*]+\*\*$/.test(tok)) out.push({t:tok.slice(2,-2),sc:true});
    else if(/^\*[^*]+\*$/.test(tok)) out.push({t:tok.slice(1,-1),it:true});
    else out.push({t:tok});
  });
  return out;
}
const parseParas=text=>String(text||'').split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean).map(parseInline);
/* The first letter of the first paragraph goes into the illuminated initial */
function splitInitial(paras){
  const first=paras[0]&&paras[0][0];
  if(!first) return {initial:'',paras};
  const m=/^(\s*)(\S)/.exec(first.t); if(!m) return {initial:'',paras};
  const rest=[{...first,t:first.t.slice(m[0].length)},...paras[0].slice(1)];
  return {initial:m[2],paras:[rest,...paras.slice(1)]};
}
function parasHTML(paras){
  return paras.map(runs=>runs.map(r=>r.sc?`<span class="inscr">${esc(r.t)}</span>`:r.it?`<i>${esc(r.t)}</i>`:esc(r.t)).join(''));
}

function buildLore(st){
  const A=archById(st.arch), P=purposeById(st.purpose);
  const R=makeRng(`${st.seed}|lore|${P.id}`);
  const head=R.pick(HEADS), gen=R.pick(GENS);
  const verso=R.int(6,90)*2, chapter=R.int(1,12), plate=R.int(1,40);
  const sunDeg=R.int(1,30), sunSign=R.pick(ZOD_GEN), hour=R.pick(HOURS);
  const surface=R.pick(SURFACES), rite=R.pick(RITES);
  const vis=st.rings.filter(r=>r.visible);
  const stars=vis.filter(r=>r.type==='star');
  let starDesc=null, mainStar=null;
  if(stars.length){
    const maxR=Math.max(...stars.map(s=>s.p.r));
    const top=stars.filter(s=>Math.abs(s.p.r-maxR)<2);
    mainStar=top.find(s=>(s.p.shape||'star')==='star'&&s.p.k>1)||top[0];
    const tri=top.filter(s=>(s.p.shape||'star')==='star'&&s.p.n===3&&s.p.k===1);
    starDesc = tri.length>=2 ? 'hexagram of two interlaced triangles' : figureName(mainStar.p);
  }
  const figs=stars.filter(s=>s!==mainStar&&(s.p.shape||'star')!=='star');
  const insc=vis.filter(r=>r.type==='inscription').sort((a,b)=>b.p.r-a.p.r);
  const glyphRing=vis.find(r=>r.type==='glyphs');
  const core=vis.find(r=>r.type==='core');
  const orbits=vis.find(r=>r.type==='orbits');

  const runs=[]; const T=t=>runs.push({t}); const SC=t=>runs.push({t,sc:true});
  T(`This ${P.noun} is drawn in ${A.material} upon ${surface}.`);
  if(starDesc) T(` Its ${starDesc} ${P.verb} ${P.object}.`);
  if(figs.length) T(` Within it lies ${/^[aeiou]/i.test(figureName(figs[0].p))?'an':'a'} ${figureName(figs[0].p)}.`);
  if(insc.length){
    const i0=insc[0].p; const gl=MOTTO[String(i0.text).toUpperCase().trim()]; const S=SETS[i0.script];
    T(` The ${insc.length>1?'outer ':''}band bears the words `); SC(String(i0.text).toUpperCase());
    T(`${gl?`, “${gl}”,`:''} written in ${S.lore||S.label}.`);
  }
  if(glyphRing) T(` ${cap(NUMW[glyphRing.p.count]||String(glyphRing.p.count))} ${SETS[glyphRing.p.set].plural} stand in a ring about the centre.`);
  else if(orbits&&orbits.p.set!=='none') T(` ${cap(NUMW[orbits.p.count]||String(orbits.p.count))} lesser circles hold ${SETS[orbits.p.set].plural}.`);
  if(core) T(` At its heart is set the sign of ${glyphName(core.p.set,core.p.index)}.`);
  if(!vis.length){ runs.length=0; T('This page waits for a circle. Add a ring from the stack to begin.'); }

  const spins=vis.map(r=>+r.p.spin).filter(Boolean);
  const dir = spins.length && spins.filter(s=>s<0).length>spins.length/2 ? 'widdershins' : 'sunwise';

  const inks = st.inkOverride && Object.keys(st.inkOverride).length ? 'inks of the scribe’s own mixing' : archById(st.inkArch).inkNames;
  const isStar=mainStar&&(mainStar.p.shape||'star')==='star';
  const props=[
    ['Purpose', P.name],
    ['Rings', String(vis.length)],
    isStar ? ['Points', mainStar.p.k>1?`${mainStar.p.n}, star {${mainStar.p.n}/${mainStar.p.k}}`:String(mainStar.p.n)] : ['Figure', mainStar?cap(figureName(mainStar.p)):'none'],
    ['Inks', inks],
    ['Rite', rite],
    ['Peril', P.peril]
  ];
  const titleLa=`${head[0]} ${gen[0]}`;
  return finishLore({
    titleLa, titleEn:`The ${head[1]} of ${gen[1]}`,
    chapter:`Caput ${roman(chapter)} · ${P.chapter}`, folioV:`Folio ${roman(verso)}`, folioR:`Folio ${roman(verso+1)}`,
    tabula:`Tabula ${roman(plate)}`, marginal:`Sol in ${roman(sunDeg)}° ${sunSign} · Hora ${hour}`,
    fullParas:[runs], dropCap:true,
    rubricLabel:'Rubrica.', rubricText:`Trace the rings from the outermost inward, ${dir}, and ${P.final}.`, props,
    capTitle:titleLa, capMeta:`Plate ${roman(plate)} · ${A.name} · Seed ${st.seed}`
  });
}
/* Derived fields: the initial, the paragraphs without it, the HTML for the live book */
function finishLore(L){
  const sp=L.dropCap?splitInitial(L.fullParas):{initial:'',paras:L.fullParas};
  L.initial=sp.initial; L.paras=sp.paras;
  const html=parasHTML(L.paras);
  L.bodyHTML=html; L.body=html[0]||'';
  L.rubric=(L.rubricLabel?`<b>${esc(L.rubricLabel)}</b> `:'')+esc(L.rubricText||'');
  return L;
}
/* The DM's own words (a folio's `text`): an empty field keeps the generated
   text, a single "-" leaves that part blank. */
const TEXT_KEYS={folioLeft:'folioV',chapter:'chapter',marginal:'marginal',title:'titleLa',subtitle:'titleEn',
  rubricLabel:'rubricLabel',rubric:'rubricText',plateNumber:'tabula',folioRight:'folioR',caption:'capTitle',captionNote:'capMeta'};
function applyText(L,t){
  if(!t) return L;
  const out={...L};
  const val=v=>typeof v==='string'&&v.trim()!==''?(v.trim()==='-'?'':v.trim()):null;
  for(const [k,lk] of Object.entries(TEXT_KEYS)){ const v=val(t[k]); if(v!==null) out[lk]=v; }
  if(val(t.title)!==null&&val(t.caption)===null) out.capTitle=out.titleLa;
  if(val(t.rubric)===''&&val(t.rubricLabel)===null) out.rubricLabel='';
  const body=val(t.body); if(body!==null) out.fullParas=parseParas(body);
  if(t.noInitial) out.dropCap=false;
  if(t.hideTable) out.props=[];
  else if(Array.isArray(t.table)&&t.table.some(r=>r&&(r.label||r.value))) out.props=t.table.filter(r=>r&&(r.label||r.value)).map(r=>[String(r.label||''),String(r.value||'')]);
  return finishLore(out);
}


/* =====================================================================
   RECIPES (a saved circle: the Sigil Maker's "Save recipe" file)
   ===================================================================== */
function validState(o){ return !!o && typeof o.seed==='string' && Array.isArray(o.rings) && o.rings.every(r=>r&&TYPES[r.type]&&r.p&&typeof r.id==='string'); }
function normalise(o){
  o.arch=archById(o.arch).id; o.inkArch=archById(o.inkArch||o.arch).id; o.purpose=purposeById(o.purpose).id;
  o.inkOverride=o.inkOverride||{}; o.weight=+o.weight||1; o.wash=o.wash!==false;
  o.book={cover:bookColour((o.book||{}).cover).id, initial:bookColour((o.book||{}).initial).id};
  o.rings.forEach(r=>{ r.p=Object.assign({spin:'0',period:120},TYPES[r.type].d,r.p); r.visible=r.visible!==false; r.locked=!!r.locked; });
  return o;
}

root.Athenaeum = root.Athenaeum || {};
root.Athenaeum.sigil = {
  hashStr, makeRng, SEED_WORDS, randomSeed, FONTS, g, AZ, SETS_RAW, SETS, alphabets, symbolSets, glyphChar, glyphName, TRANS, translitWord, translitSeq, MOTTO, ARCH, archById, PURPOSES, purposeById, INK_OPTS, FIXED_INKS, F, fInk, fColor, fW, setOpts, allSetOpts, SHAPES_LIST, SHAPE_COUNT_LABEL, FILL_OPTS, PETAL_OPTS, PETAL_PLURAL, TYPES, COMMON_FIELDS, TYPE_ORDER, mk, NUMW, starName, figureName, generate, rerollRing, rad, polar, f2, circlePath, gcd, FIGURES, RENDER, hexMix, PAPER, palette, ringPal, esc, DASH, FONT_CSS_URL, usedUserFonts, itemSVG, sceneSVG, ensureFonts, drawCanvas, USER_FONTS, fontFamilyOf, abToB64, b64ToAb, registerFont, saveUserFonts, loadUserFonts, FONT_MIME, PG, BOOKF, BINK, ensureBookFonts, setLS, pageBackground, runHead, layoutRuns, drawLines, drawVerso, layoutVerso, drawRecto, renderBook, loadJsPDF, bookPDF, canvasBlob, bookPNG, platePNG, HEADS, GENS, SURFACES, RITES, ZOD_GEN, HOURS, roman, cap, parseInline, parseParas, splitInitial, parasHTML, buildLore, finishLore, TEXT_KEYS, applyText, uid, validState, normalise, BOOK_COLOURS, bookColour, bookColours
};
})(window);
