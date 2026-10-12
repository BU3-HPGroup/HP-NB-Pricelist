/* HP Product Pricelist (notebooks) — "Match specs"
   Drop in a client's requirement (photo, screenshot, PDF, or pasted text). The page reads it, turns it into a
   checklist (processor, memory, storage, screen, touch / 2-in-1, OS, graphics, AI/NPU, camera, Office, warranty,
   qty, budget…) and ranks the laptops on the pricelist (and the last-time-buy list) against it, explaining every
   difference from the requirement.

   Ported from the HP Business PC pricelist's matcher. 100% in the browser and free: text recognition
   (Tesseract.js) and PDF reading (pdf.js) are bundled in assets/vendor/, so nothing is uploaded anywhere.
   Model specs come from the pricelist itself (and the HP spec sheet when one is attached to a model);
   RAM upgradeability from data/upgrades.json (HP Maintenance and Service Guides). Nothing is guessed:
   a spec the pricelist doesn't state is shown as "Not listed". */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const API = () => window.HPPL;
  const X = () => window.HPPLX;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const peso = (v) => (typeof v === "number" && isFinite(v) ? "₱" + Math.round(v).toLocaleString("en-PH") : "—");
  const VENDOR = "assets/vendor/";
  const abs = (p) => new URL(p, location.href).href;
  const ICON = {
    match: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 3h3a2 2 0 0 1 2 2v1"/><path d="M4 8V6a2 2 0 0 1 2-2"/><rect x="3" y="8" width="11" height="13" rx="2"/><path d="M6 12h5M6 15.5h5M6 19h3"/><circle cx="17.5" cy="15.5" r="3.5"/><path d="m20 18 2 2"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
    dl: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  };
  const ST = { // status → icon + words
    better: { i: "▲", t: "Exceeds" }, ok: { i: "✓", t: "Meets" }, fix: { i: "+", t: "Meets with upgrade" },
    differs: { i: "≈", t: "Different" }, unknown: { i: "?", t: "Not listed" }, below: { i: "✕", t: "Below" }, info: { i: "i", t: "" },
  };

  // =====================================================================================
  // 1) Processor classes — an approximate guide for comparing generations and brands
  // =====================================================================================
  const ORD = (n) => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
  function cpuInfo(raw) {
    const s0 = " " + norm(String(raw || "").replace(/\bI([3579])(?=[\s-]|$)/g, "i$1")).toLowerCase().replace(/processors?|cpu|™|®/g, " ").replace(/\(copilot\)/g, " ").replace(/\s+/g, " ") + " ";
    let m, r = null;
    if ((m = s0.match(/(?:core\s*)?ultra\s*x?(\d)(?:\s*-?\s*(\d{3})([a-z]{0,2})\b)?/)) || (m = s0.match(/\bu([579])\s*-\s*(\d{3})([a-z]{0,2})\b/)) || (m = s0.match(/\bu([579])\s+(\d{3})([a-z]{0,2})\b/))) {
      const ser = m[2] ? +m[2][0] : null;
      r = { brand: "Intel", line: "Core Ultra", tier: +m[1], model: m[2] || "", suf: (m[3] || "").toUpperCase(), era: ser === 1 ? 14.5 : ser === 2 ? 15 : ser === 3 ? 16 : null, gen: ser ? `Series ${ser}` : "" };
    } else if ((m = s0.match(/core\s*-?\s*i\s*-?\s*([3579])(?:\s*-?\s*(\d{4,5})([a-z]{0,2})\b)?/)) || (m = s0.match(/(?<![a-z])i([3579])(?:\s*-\s*(\d{4,5})([a-z]{0,2}))?\b/)) || (m = s0.match(/(?<![a-z])i([3579])(\d{4,5})([a-z]{0,2})\b/))) {
      const mod = m[2] || "", g = mod.length === 5 ? +mod.slice(0, 2) : mod.length === 4 ? +mod[0] : null;
      r = { brand: "Intel", line: "Core i", tier: +m[1], model: mod, suf: (m[3] || "").toUpperCase(), era: g, gen: g ? ORD(g) + " gen" : "" };
    } else if ((m = s0.match(/\bcore\s*([357])\s*-?\s*(\d{3})([a-z]{0,2})\b/)) || (m = s0.match(/(?<![a-z])c([357])\s*-\s*(\d{3})([a-z]{0,2})\b/))) {
      const ser = +m[2][0];
      r = { brand: "Intel", line: "Core", tier: +m[1], model: m[2], suf: (m[3] || "").toUpperCase(), era: ser === 1 ? 13.5 : ser === 2 ? 14 : 14.5, gen: `Series ${ser}` };
    } else if ((m = s0.match(/\bcore\s*([357])\b(?!\s*-?\s*\d)/))) {
      r = { brand: "Intel", line: "Core", tier: +m[1], model: "", suf: "", era: null, gen: "" };
    } else if ((m = s0.match(/ryzen\s*(ai\s*)?(?:pro\s*)?([3579])\s*(pro\s*)?-?\s*(\d{3,4})?\s*([a-z]{0,3})\b/)) || (m = s0.match(/\br(ai)\s*([3579])\s*()(\d{3})()\b/)) || (m = s0.match(/(?<![a-z])r([3579])\s*(ai\s*)?-?\s*(\d{3,4})([a-z]{0,3})\b/))) {
      let ai, tier, mod, suf, pro = false;
      if (m.length === 5 && /^r[3579]/.test(m[0].trim())) { tier = +m[1]; ai = !!m[2]; mod = m[3] || ""; suf = m[4] || ""; }
      else { ai = !!m[1]; tier = +m[2]; pro = !!m[3]; mod = m[4] || ""; suf = m[5] || ""; }
      let era = null;
      if (mod.length === 4) era = { 2: 8.5, 3: 9.5, 4: 10.5, 5: 11, 6: 12, 7: 13, 8: 13.5, 9: 14.5 }[mod[0]] || null;
      else if (mod.length === 3) era = ai ? (mod[0] === "4" ? 16 : 15) : mod[0] === "3" ? 15 : mod[0] === "2" ? 13.5 : null;
      r = { brand: "AMD", line: ai ? "Ryzen AI" : "Ryzen", tier, model: mod, suf: suf.toUpperCase(), era, gen: mod ? (mod.length === 4 ? `${mod[0]}000 series` : `${mod[0]}00 series`) : "", pro };
    } else if ((m = s0.match(/\b(?:snapdragon|sd|qc)\s*-?\s*x\s*(1e|1p|elite|plus|1)?/))) {
      const t = (m[1] || "").replace(/^1$/, ""), tier = /elite|1e/.test(t) ? 7 : /plus|1p/.test(t) ? 5 : 5;
      r = { brand: "Qualcomm", line: "Snapdragon X", tier, model: t ? (/elite|1e/.test(t) ? "Elite" : "Plus") : "", suf: "", era: 15, gen: "" };
    } else if ((m = s0.match(/\b(celeron|pentium|athlon|n100|n200|n150|n97)\b/))) {
      r = { brand: /athlon/.test(m[1]) ? "AMD" : "Intel", line: m[1][0].toUpperCase() + m[1].slice(1), tier: 1, model: "", suf: "", era: null, gen: "" };
    }
    if (!r) return null;
    if (r.era == null && r.line === "Core i" && (m = s0.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s*gen/))) { r.era = +m[1]; r.gen = ORD(+m[1]) + " gen"; }
    if (r.era == null && r.line === "Core Ultra" && (m = s0.match(/series\s*([123])/))) { const ser = +m[1]; r.era = ser === 1 ? 14.5 : ser === 2 ? 15 : 16; r.gen = `Series ${ser}`; }
    r.label = r.line === "Core i" ? `Intel Core i${r.tier}${r.model ? "-" + r.model + r.suf : ""}`
      : r.line === "Core Ultra" ? `Intel Core Ultra ${r.tier}${r.model ? " " + r.model + r.suf : ""}`
      : r.line === "Core" ? `Intel Core ${r.tier} ${r.model}${r.suf}`
      : /Ryzen/.test(r.line) ? `AMD ${r.line} ${r.tier}${r.pro ? " PRO" : ""}${r.model ? " " + r.model + r.suf : ""}`
      : r.line === "Snapdragon X" ? `Qualcomm Snapdragon X${r.model ? " " + r.model : ""}` : `${r.brand} ${r.line}`;
    r.cls = /Ryzen/.test(r.line) ? `${r.line} ${r.tier}` : r.line === "Core i" ? `Core i${r.tier}` : r.line === "Core Ultra" ? `Core Ultra ${r.tier}` : r.line === "Core" ? `Core ${r.tier}` : r.line === "Snapdragon X" ? `Snapdragon X${r.model ? " " + r.model : ""}` : r.line;
    r.low = false; // every laptop chip is a mobile chip — no desktop "T" penalty here
    return r;
  }
  const cpuRank = (c) => (c ? (c.tier || 0) * 10 + ((c.era || 12) - 10) * 2.2 : 0);

  // =====================================================================================
  // 2) Reading the requirement text
  // =====================================================================================
  function norm(t) {
    return String(t || "").replace(/\r/g, "").replace(/[™®©]/g, "").replace(/[“”″]/g, '"').replace(/[‘’′]/g, "'").replace(/[–—−]/g, "-")
      .replace(/ /g, " ").replace(/[ \t]+/g, " ")
      .replace(/\b[lI|](\d)/g, "1$1").replace(/(\d)[oO](?=\d)/g, "$10").replace(/(\d)[lI](?=\d)/g, "$11"); // common OCR slips: l6GB, 5I2, 1O24
  }
  const WN = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
  const toN = (x) => (x == null ? null : /^\d/.test(x) ? parseFloat(String(x).replace(/,/g, "")) : WN[String(x).toLowerCase()] || null);
  const RES = [ // label, w, h, regex
    ["4K UHD", 3840, 2160, /\b(4k|uhd|2160p|3840\s*[x×*]\s*2160)\b/],
    ["3K", 2880, 1800, /\b(3k|2\.8k|2880\s*[x×*]\s*1800)\b/],
    ["WQXGA", 2560, 1600, /\b(wqxga|2\.5k|2560\s*[x×*]\s*1600)\b/],
    ["QHD", 2560, 1440, /\b(qhd|1440p|2560\s*[x×*]\s*1440)\b/],
    ["2.2K", 2240, 1400, /\b(2\.2k|2240\s*[x×*]\s*1400)\b/],
    ["WUXGA", 1920, 1200, /\b(wuxga|2k|1920\s*[x×*]\s*1200)\b/],
    ["FHD", 1920, 1080, /\b(fhd|full\s*hd|1080p|1920\s*[x×*]\s*1080)\b/],
    ["HD+", 1600, 900, /\b(hd\+|1600\s*[x×*]\s*900)\b/],
    ["HD", 1366, 768, /\b(hd(?![a-z+])|720p|1366\s*[x×*]\s*768|1280\s*[x×*]\s*720)\b/],
  ];
  const RESMAP = Object.fromEntries(RES.map(([l, w, h]) => [l, { label: l, w, h }]));

  function parseRequirement(text) {
    const R = { nb: {}, qty: null, budget: null, src: {}, found: false };
    const N = R.nb;
    const T = norm(text);
    const raw = T.split(/\n+/).map((l) => l.replace(/^[|\s]+|[|\s]+$/g, "").replace(/\s*\|\s*/g, " | ").trim()).filter(Boolean);
    const LABEL = /^(item|description|processor|cpu|memory|ram|storage|hard (disk|drive)|hdd|ssd|operating system|os|graphics|video|display|screen|ports?|interfaces?|connectivity|networking?|wireless|camera|webcam|keyboard|battery|weight|security|warranty|software|qty|quantity|abc|approved budget(?: for the contract)?|budget|unit price|price)\s*[:\-]?$/i;
    const lines = [];
    for (let i = 0; i < raw.length; i++) {
      if (LABEL.test(raw[i]) && raw[i + 1] && !LABEL.test(raw[i + 1])) { lines.push(raw[i].replace(/[:\-]\s*$/, "") + ": " + raw[i + 1]); i++; }
      else lines.push(raw[i]);
    }
    const note = (k, line) => { if (!R.src[k]) R.src[k] = line.slice(0, 140); };
    for (const line of lines) {
      const l = " " + line.toLowerCase() + " ";
      let m;
      // ---- quantity & budget ----
      if (R.qty == null && ((m = l.match(/\b(?:qty|quantity|no\.?\s*of\s*units|number of units)\s*[:\-.]?\s*(\d{1,5})\b/)) || (m = l.match(/\b(\d{1,5})\s*(?:units?|pcs\.?|pieces|sets?|lots?|nos\.?)\b/)))) { R.qty = +m[1]; note("qty", line); }
      if ((m = l.match(/\b(abc|approved budget(?: for the contract)?|budget|unit cost|unit price|total cost|amount)\b[^0-9\n]{0,40}?(?:php|₱|p)?\s*([\d,]{4,}(?:\.\d{1,2})?)/))) {
        const amt = toN(m[2]);
        if (amt && amt >= 1000 && !R.budget) { const per = /unit|per/.test(m[1]) ? "unit" : (/abc|approved|total/.test(m[1]) ? "total" : "unit"); R.budget = { amount: amt, per }; note("budget", line); }
      }
      // ---- warranty ----
      if (/warrant/.test(l) || /\b\d\s*[-/]\s*\d\s*[-/]\s*\d\b/.test(l) && /year|warrant|parts|labor|onsite|on-site/.test(l) || /\b(\d|one|two|three|four|five)\s*(?:\(\d\)\s*)?-?\s*years?\b.{0,30}\b(parts|labou?r|on-?\s?site|service|replacement)\b/.test(l)) {
        const W = { years: null, onsite: /on-?\s?site|onsite/.test(l) };
        if ((m = l.match(/\b(\d)\s*[-/]\s*(\d)\s*[-/]\s*(\d)\b/))) { W.years = Math.max(+m[1], +m[2]); W.onsite = +m[3] > 0; W.onsiteYears = +m[3]; }
        else if ((m = l.match(/\b(\d{1,2}|one|two|three|four|five)\s*(?:\(\d\)\s*)?-?\s*years?\b/))) W.years = toN(m[1]);
        if (W.onsite && W.onsiteYears == null && (m = l.match(/\b(\d|one|two|three|four|five)\s*(?:\(\d\)\s*)?-?\s*years?\s*(?:of\s*)?on-?\s?site/))) W.onsiteYears = toN(m[1]);
        if (W.years && !N.warranty) { N.warranty = W; note("warranty", line); }
      }
      // ---- screen ----
      const sizeM = l.match(/\b(1[0-8](?:\.\d{1,2})?)\s*(?:"|''|-?\s*inch(?:es)?\b|\s?in\.?\b(?!\s*(?:the|a|stock))|-in\b)/);
      if (sizeM && !N.size) { N.size = +sizeM[1]; note("size", line); R.found = true; }
      for (const [lab, w, h, re] of RES) {
        if (re.test(l) && !/camera|webcam|video call/.test(l)) { if (!N.res) { N.res = { label: lab, w, h }; note("res", line); } break; }
      }
      if ((m = l.match(/\b(\d{2,3})\s*hz\b/)) && !N.hz && +m[1] >= 60) { N.hz = +m[1]; note("hz", line); }
      if (/\boled\b/.test(l)) N.oled = true;
      else if (/\bips\b/.test(l) && /panel|display|screen|ips/.test(l)) N.ips = true;
      if (/\btouch\s*(screen|enabled|display|panel)?\b/.test(l) && !/non[- ]?touch|touch\s*pad|touchpad|clickpad/.test(l)) N.touch = true;
      if (/\b(2[- ]in[- ]1|two[- ]in[- ]one|convertible|x360|flip|tablet mode|360[- °]?(degree)?\s*hinge)\b/.test(l)) N.flip = true;
      if ((m = l.match(/\b(\d{3,4})\s*nits\b/))) N.nits = N.nits || +m[1];
      // ---- ports / connectivity ----
      const P = N.ports || (N.ports = {});
      if (/\b(usb[- ]?c|type[- ]?c|thunderbolt)\b/.test(l)) P.usbC = true;
      if (/\bhdmi\b/.test(l)) P.hdmi = true;
      if (/\b(rj-?45|gigabit ethernet|10\/100\/1000|gbe\b|ethernet|lan port)/.test(l) && !/wireless lan|wlan/.test(l)) P.lan = true;
      if ((m = l.match(/\b(?:at least|minimum(?: of)?|min\.?)?\s*(\d{1,2}|one|two|three|four|five|six)\s*(?:x\s*)?(?:\(\d+\)\s*)?(?:usb)\b(?!\s*-?\s*c\b)(?!\s*type[- ]?c)/))) { const n = toN(m[1]); if (n && n <= 8 && (!P.usbMin || n > P.usbMin)) { P.usbMin = n; note("usbMin", line); } }
      if (!Object.keys(P).length) delete N.ports;
      // ---- processor ----
      if (!N.cpu && /\b(intel|amd|core|ryzen|ultra|celeron|pentium|athlon|snapdragon|qualcomm|processor|cpu)\b|\bi[3579]\b|\bu[579]-?\d{3}/.test(l)) {
        const info = cpuInfo(line);
        if (info) {
          const both = /intel|core|\bi[3579]\b/.test(l) && /amd|ryzen/.test(l);
          const seg = line.length > 60 ? (line.split(/[,;]| \| /).find((x) => /\b(intel|amd|core|ryzen|ultra|snapdragon|processor|cpu)\b|\bi[3579]\b/i.test(x) && cpuInfo(x)) || line) : line;
          N.cpu = { text: seg.trim().replace(/^[\s•\-*\d.)]+/, "").replace(/^(?:processor type|processor|cpu)\s*[:\-–]?\s*/i, "").slice(0, 160), info, strictBrand: !both && !/equivalent|equiv\.?|or (?:better|higher|similar|its equivalent)|comparable/.test(l) && /\b(intel|amd|qualcomm)\b/.test(l) };
          note("cpu", line); R.found = true;
        }
      }
      if (/\b(processor|cpu|core)\b/.test(l)) {
        if ((m = l.match(/\b(\d{1,2})\s*-?\s*cores?\b/))) { N.cores = N.cores || +m[1]; }
        else if ((m = l.match(/\b(dual|quad|hexa|six|octa|eight)[- ]?core\b/))) N.cores = N.cores || { dual: 2, quad: 4, hexa: 6, six: 6, octa: 8, eight: 8 }[m[1]];
        if ((m = l.match(/\b(\d(?:\.\d{1,2})?)\s*ghz\b/))) N.ghz = N.ghz || +m[1];
      }
      // ---- AI / NPU ----
      if ((m = l.match(/\b(\d{2,3})\s*(?:\+\s*)?(?:npu\s*)?tops\b/))) { N.npu = Math.max(N.npu || 0, +m[1]); note("npu", line); }
      else if (/copilot\s*\+|copilot\s*plus|copilot\+\s*pc/.test(l)) { N.npu = Math.max(N.npu || 0, 40); note("npu", line); }
      else if (!N.npu && /\b(npu|ai pc|ai-ready|neural processing)\b/.test(l)) N.npu = N.npu || 1;
      // ---- memory / storage / graphics memory: classify each "N GB" by the nearest keyword ----
      const re = /(\d{1,4}(?:\.\d+)?)\s*(tb|gb)\b/g; let g; const stoTok = [];
      while ((g = re.exec(l))) {
        const val = +g[1] * (g[2] === "tb" ? 1024 : 1);
        const a = Math.max(0, g.index - 40), win = l.slice(a, g.index + g[0].length + 40), pos = g.index - a;
        const near = (rx) => { let best = 999, mm; rx.lastIndex = 0; while ((mm = rx.exec(win))) best = Math.min(best, Math.abs(mm.index - pos)); return best; };
        const dR = near(/\b(ram|memory|ddr\d|lpddr\d|dimm|sodimm|sdram)/g), dS = near(/\b(ssd|hdd|storage|hard\s*dis[kc]|hard drive|nvme|m\.2|pcie|sata|emmc|drive)/g), dG = near(/\b(vram|graphics?|video|gddr\d|gpu|rtx|gtx|geforce|nvidia|radeon\s*rx)/g);
        let kind = null;
        const mn = Math.min(dR, dS, dG);
        if (mn < 999) kind = mn === dG ? "gfx" : mn === dR ? "ram" : "sto";
        else if (g[2] === "tb" || val >= 120) kind = "sto"; else if (val <= 64) kind = "ram";
        // laptops: memory is 4–64 GB and storage 128 GB and up, so a size settles a close call between keywords
        if (kind === "sto" && val < 100 && !/emmc/.test(win)) kind = "ram";
        else if (kind === "ram" && val >= 128) kind = "sto";
        if (kind === "ram" && !N.ram && val <= 128) { N.ram = { gb: val, type: ((win.match(/(?:lp)?ddr\d/) || [])[0] || "").toUpperCase() }; note("ram", line); R.found = true; }
        if (kind === "sto") stoTok.push(val);
        if (kind === "sto" && (!N.storage || val > N.storage.gb)) { const tp = /ssd|nvme|m\.2|solid|pcie/.test(win) ? "SSD" : /hdd|hard dis|sata hdd|7200|5400|rpm/.test(win) ? "HDD" : ""; N.storage = { gb: val, type: tp }; note("storage", line); R.found = true; }
        else if (kind === "gfx" && !N.vram) { N.vram = val; N.gfx = "discrete"; note("gfx", line); }
      }
      if (!N.ram && stoTok.length >= 2) { const lo = Math.min(...stoTok); if (lo <= 64 && lo < Math.max(...stoTok)) { N.ram = { gb: lo, type: ((l.match(/(?:lp)?ddr\d/) || [])[0] || "").toUpperCase() }; note("ram", line); } }
      // ---- OS ----
      if (!N.os && (m = l.match(/\bwin(?:dows)?\s*(10|11)\s*(pro(?:fessional)?|home|enterprise|education|edu)?/))) { N.os = `Windows ${m[1]} ${m[2] ? (m[2].startsWith("pro") ? "Pro" : m[2][0].toUpperCase() + m[2].slice(1).replace(/^Edu$/, "Education")) : ""}`.trim(); note("os", line); }
      else if (!N.os && /\b(free\s?dos|no\s*os|without\s*(?:an?\s*)?os|linux|ubuntu)\b/.test(l)) { N.os = "No OS / FreeDOS"; note("os", line); }
      else if (!N.os && /\bwin(?:dows)?\s*pro\b/.test(l)) { N.os = "Windows 11 Pro"; note("os", line); }
      // ---- graphics ----
      if (/\b(dedicated|discrete|separate)\s*(graphics|video|gpu)|\b(nvidia|geforce|rtx|gtx|quadro|radeon\s*(rx|pro))\b/.test(l)) { N.gfx = "discrete"; const gm = line.match(/(nvidia|geforce|rtx|gtx|quadro|radeon\s*(?:rx|pro)|dedicated|discrete|separate)[^,;\n]{0,40}/i); N.gfxText = gm ? gm[0].trim() : "Dedicated graphics"; note("gfx", line); }
      else if (!N.gfx && /\b(integrated|onboard|on-board)\s*(graphics|video)/.test(l)) N.gfx = "integrated";
      // ---- wireless ----
      if ((m = l.match(/\bwi-?\s?fi\s*(7|6e|6|5)\b|802\.11\s*(be|ax|ac|n)\b/))) { const v = m[1] || { be: "7", ax: "6", ac: "5", n: "4" }[m[2]]; N.wifi = "Wi-Fi " + v.toUpperCase(); note("wifi", line); }
      else if (!N.wifi && /\b(wi-?\s?fi|wireless lan|wlan|wireless network)\b/.test(l)) N.wifi = "any";
      if (/\bbluetooth\b/.test(l)) { m = l.match(/bluetooth\s*(?:v\.?|version)?\s*(\d(?:\.\d)?)/); N.bt = m ? +m[1] : (N.bt || true); }
      // ---- camera / sign-in / keyboard ----
      if (/\b(web\s?cam|camera)\b/.test(l) && !/\bno\b.{0,10}camera/.test(l)) {
        N.webcam = true;
        if (/\b(1080p|fhd|full hd|2mp|5\s*mp|5mp|1440p|qhd)\b/.test(l)) N.camHd = true;
        if (/\bir\b|infrared|face (recognition|sign|login|unlock)|windows hello face/.test(l)) N.ir = true;
      } else if (/\bir camera\b|infrared camera|face (recognition|sign-?in|login|unlock)/.test(l)) { N.webcam = true; N.ir = true; }
      if (/finger\s*print|fingerprint|fpr\b/.test(l)) N.fpr = true;
      if (/\bbacklit|back-lit|backlight\b/.test(l) && /keyboard|kb|backlit/.test(l)) N.backlit = true;
      // ---- weight / battery ----
      if ((m = l.match(/\b(\d(?:\.\d{1,2})?)\s*(kg|kgs|kilograms?)\b/)) && /weigh|kg|light/.test(l)) { const v = +m[1]; if (v > 0.6 && v < 4) { N.weight = v; note("weight", line); } }
      else if ((m = l.match(/\b(\d(?:\.\d{1,2})?)\s*(lbs?|pounds?)\b/)) && /weigh/.test(l)) { const v = +(+m[1] * 0.4536).toFixed(2); if (v > 0.6 && v < 4) { N.weight = v; note("weight", line); } }
      if ((m = l.match(/\b(\d{2,3})\s*wh(?:r)?\b/))) { N.wh = +m[1]; note("wh", line); }
      // ---- software / security ----
      if (/\b(ms|microsoft)\s*office\b|\boffice\s*(home|20\d\d|365|h&s|home\s*(and|&)\s*student)\b/.test(l)) N.office = true;
      if (/\btpm\b|trusted platform/.test(l)) N.tpm = true;
    }
    return R;
  }

  // =====================================================================================
  // 3) The laptops: what the pricelist (and an attached HP spec sheet) says
  // =====================================================================================
  const RES_TOKENS = [[/3k/i, 2880, 1800, "3K"], [/2\.8k/i, 2880, 1800, "2.8K"], [/wqxga/i, 2560, 1600, "WQXGA"], [/2\.2k/i, 2240, 1400, "2.2K"], [/wuxga/i, 1920, 1200, "WUXGA"], [/\b2k\b/i, 1920, 1200, "2K"], [/fhd/i, 1920, 1080, "FHD"]];
  function attrs(p, mode) {
    if (p._mt) return p._mt;
    const sh = p.specSheet || null;
    const sheet = (k) => { const r = sh && (sh.rows || []).find((x) => x[0] === k); return r ? r[1] : ""; };
    const all = [p.model, p.title, p.cpu, p.ram, p.storage, p.display, p.displayShort, p.graphics, p.os, p.color, p.camera, p.adapter, p.formFactor, p.series,
      (p.otherSpecs || []).join(" "), p.specsRaw, sh ? sh.rows.map((x) => x.join(": ")).join(" | ") : ""].filter(Boolean).join(" | ");
    const num = (re, s) => { const m = re.exec(s || ""); return m ? parseFloat(m[1]) : null; };
    const cpuTxt = String(p.cpu || "");
    const a = { mode, fromSheet: !!sh };
    a.cpu = sheet("Processor") || cpuTxt;
    a.cpuI = cpuInfo(cpuTxt) || cpuInfo(a.cpu);
    a.cores = num(/\((\d{1,2})C\)/i, cpuTxt) || num(/(\d{1,2})\s*cores/i, a.cpu);
    a.ghz = num(/up to\s*(\d(?:\.\d+)?)\s*GHz/i, a.cpu);
    a.npu = num(/(\d{1,3})\s*NPU\s*TOPs?/i, cpuTxt) || num(/\((\d{1,3})\s*NPU\s*TOPS\)/i, sheet("AI engine (NPU)"));
    // memory
    a.ram = num(/(\d{1,3})\s*GB/i, p.ram);
    a.ramType = ((String(p.ram || "").match(/LPDDR\d+X?|DDR\d/i) || [])[0] || "").toUpperCase();
    a.ramText = p.ram || "";
    a.onboard = /on-?board/i.test(p.ram || "");
    const up = API().upgrade ? API().upgrade(p) : null;
    a.upgrade = up;
    a.upgradeable = !!(up && /^Upgradeable/i.test(up.ram || ""));
    a.ramMax = up ? num(/up to\s*(\d{1,3})\s*GB/i, up.ram) : null;
    // storage
    const sto = String(p.storage || ""), tb = num(/(\d(?:\.\d)?)\s*TB/i, sto), gb = num(/(\d{3,4})\s*GB/i, sto);
    a.storageGb = tb ? tb * 1024 : gb;
    a.storageText = sto;
    a.ssd = /pcie|ssd|nvme/i.test(sto) || (mode === "ltb" && !!a.storageGb);
    // display
    const disp = [p.display, p.displayShort].filter(Boolean).join(" ");
    a.size = num(/\b(1[0-8](?:\.\d)?)(?=["″\s]|\s*inch|WUXGA|WQXGA|FHD|OLED|2K|3K|$)/i, disp.replace(/^touch\//i, "")) || num(/\b(1[3-7](?:\.\d)?)["″]?\s*(?:2K|3K|FHD|WUXGA|WQXGA|OLED|TOUCH|IPS)/i, p.specsRaw) || num(/\b(1[3-7]\.\d)\b/, p.specsRaw);
    let rm = disp.match(/(\d{3,4})\s*x\s*(\d{3,4})/);
    if (rm) { a.w = +rm[1]; a.h = +rm[2]; }
    else { const t = RES_TOKENS.find(([re]) => re.test(disp + " " + (p.specsRaw || ""))); if (t) { a.w = t[1]; a.h = t[2]; a.resGuess = true; } }
    a.resLabel = ((disp.match(/\b(FHD|2K|3K|2\.8K|2\.2K|WUXGA|WQXGA|QHD|4K)\b/i) || [])[0] || "").toUpperCase();
    a.dispText = p.display || p.displayShort || "";
    a.touch = /touch/i.test(disp + " " + (p.specsRaw || "")) && !/non-?touch/i.test(disp);
    a.oled = /oled/i.test(disp + " " + (p.specsRaw || ""));
    a.ips = /\bips\b/i.test(disp + " " + (p.specsRaw || ""));
    a.hz = num(/(\d{2,3})\s*Hz/i, disp + " " + (p.specsRaw || ""));
    a.nits = num(/(\d{3,4})\s*nits/i, disp);
    a.flip = /x360|flip|2-in-1|convertible/i.test([p.formFactor, p.series, p.model].join(" "));
    a.ff = a.flip ? "2-in-1 (x360)" : (p.formFactor || (mode === "ltb" ? "" : "Clamshell"));
    // OS
    const osT = [p.os, p.specsRaw, sheet("Operating system")].join(" ");
    a.os = /W11P|Win(?:dows)?\s*11\s*Pro/i.test(osT) ? "Windows 11 Pro" : /W11H|Win(?:dows)?\s*11\s*Home|W11 HOME/i.test(osT) ? "Windows 11 Home" : /\bW11\b|Windows 11/i.test(osT) ? "Windows 11" : "";
    // graphics
    const gfx = [p.graphics, p.specsRaw].join(" ");
    a.gfx = p.graphics || ((String(p.specsRaw || "").match(/\b(A370M\s*\d?GB|RTX\s*\d{4}\w*|ADRENO)\b/i) || [])[0] || "");
    a.discrete = /RTX|GeForce|NVIDIA|Radeon\s*RX|A370M|Arc\s*A\d{3}M|GDDR/i.test(gfx);
    // camera
    const cam = [p.camera, sheet("Camera"), p.specsRaw].join(" ");
    a.camera = p.camera || sheet("Camera") || "";
    a.camHd = /5MP|1080p|FHD camera|1440p/i.test(cam);
    a.ir = /\bIR\b/.test(cam);
    // connectivity / other — only where HP's spec sheet says so
    a.wifi = ((sheet("Wireless").match(/Wi-?Fi\s*\d[E]?/i) || [])[0] || "").replace(/wi-?fi/i, "Wi-Fi");
    a.bt = num(/Bluetooth\S*\s*(\d(?:\.\d)?)/i, sheet("Wireless"));
    const ports = sheet("Ports");
    a.ports = ports ? { usbC: /Type-C|USB-C|Thunderbolt/i.test(ports), hdmi: /HDMI/i.test(ports), lan: /RJ-45/i.test(ports),
      usb: (ports.match(/(\d)\s*USB/gi) || []).reduce((s, x) => s + parseInt(x, 10), 0), text: ports } : null;
    if (!a.ports && /USB-?C|USB C/i.test(p.adapter || "")) a.usbCcharge = true;
    a.fpr = sheet("Fingerprint reader") ? true : null;
    a.backlit = /backlit/i.test(sheet("Keyboard")) ? true : null;
    a.weight = num(/(\d(?:\.\d+)?)\s*kg/i, sheet("Weight"));
    a.wh = num(/(\d{2,3})\s*Wh/i, sheet("Battery"));
    a.tpm = sh ? (sh.security || []).some((x) => /TPM/i.test(x)) : null;
    a.office = /MS Office|Office Home|\bOFFICE\b/i.test([p.os, (p.otherSpecs || []).join(" "), p.specsRaw].join(" "));
    // warranty "2-2-2" / "WARR 1/1/0" = parts / labor / onsite years
    const wm = String(p.warranty || "").match(/(\d)\s*[-/]\s*(\d)\s*[-/]\s*(\d)/);
    a.warranty = wm ? { years: Math.max(+wm[1], +wm[2]), parts: +wm[1], labor: +wm[2], onsite: +wm[3], text: `${wm[1]}/${wm[2]}/${wm[3]} (parts/labor/onsite)` } : null;
    a.carePack = p.carePack || "";
    a.text = all;
    p._mt = a;
    return a;
  }
  function candidates() {
    const out = API().dataset("main").map((p) => ({ p, mode: "main" }));
    if (opt.ltb) API().dataset("ltb").forEach((p) => out.push({ p, mode: "ltb" }));
    return out;
  }
  const opt = { ltb: true, basis: "dp" };
  function priceOf(p) { return API().priceOf(p, opt.basis); }

  // =====================================================================================
  // 4) Comparing one laptop with the requirement
  // =====================================================================================
  const wifiRank = (s) => { const m = String(s || "").match(/wi-?fi\s*(\d)(e)?/i); return m ? +m[1] + (m[2] ? 0.5 : 0) : (s ? 4 : 0); };
  const gbTxt = (gb) => (gb >= 1000 ? (gb / 1024 % 1 ? (gb / 1024).toFixed(1) : gb / 1024) + " TB" : Math.round(gb) + " GB");
  const yn = (v) => (v === true ? "Yes" : v === false ? "No" : "Not listed");

  function evaluate(R, c) {
    const p = c.p, a = attrs(p, c.mode), Q = R.nb, rows = [];
    const add = (o) => rows.push(o);
    let addCost = 0, addNote = "";
    // processor
    if (Q.cpu) {
      const r = Q.cpu.info, o = a.cpuI;
      let st = "unknown", why = "";
      if (r && o && r.tier) {
        const cls = o.tier - r.tier, ek = r.era != null && o.era != null, gd = ek ? o.era - r.era : 0;
        if (cls > 0) { st = ek && gd < -1.5 ? "differs" : "better"; why = `higher class (${o.cls} vs ${r.cls})`; }
        else if (cls < 0) { st = "below"; why = `lower class (${o.cls} vs ${r.cls})`; }
        else { st = !ek || gd > -0.3 ? (gd > 0.4 ? "better" : "ok") : "below"; why = `same class (${o.cls}${r.brand !== o.brand ? " ≈ " + r.cls : ""})`; }
        if (ek) why += gd > 0.4 ? `, newer generation (${o.gen || o.label} vs ${r.gen})` : gd < -0.4 ? `, older generation (${o.gen || o.label} vs ${r.gen})` : ", same generation";
        else if (r.era == null && o.gen) why += `, ${o.gen}`;
        if (r.brand && o.brand && r.brand !== o.brand) {
          why += Q.cpu.strictBrand ? ` — requirement names ${r.brand}, this is ${o.brand}` : ` — ${o.brand} equivalent`;
          if (Q.cpu.strictBrand && (st === "ok" || st === "better")) st = "differs";
        }
      } else if (o) why = "could not read the processor class in the requirement — compare manually";
      if (Q.cores && a.cores != null && a.cores < Q.cores) { st = "below"; why += ` · ${a.cores} cores vs ${Q.cores} required`; }
      if (Q.ghz && a.ghz != null && a.ghz < Q.ghz) { if (st !== "below") st = "differs"; why += ` · up to ${a.ghz} GHz vs ${Q.ghz} GHz`; }
      add({ k: "cpu", label: "Processor", req: Q.cpu.text + (Q.cores ? ` · ${Q.cores}+ cores` : ""), off: a.cpu || "—", st, why, w: 30, ratio: r && o && r.tier ? Math.min(1, cpuRank(o) / Math.max(1, cpuRank(r))) : 0 });
    } else if (Q.cores) {
      add({ k: "cpu", label: "Processor cores", req: `${Q.cores}+ cores`, off: a.cores ? `${a.cores} cores` : "—", st: a.cores == null ? "unknown" : a.cores >= Q.cores ? "ok" : "below", w: 15 });
    }
    if (Q.npu) {
      const need = Q.npu > 1 ? Q.npu : 1;
      const st = a.npu == null ? (a.cpuI && /Ultra|Ryzen AI|Snapdragon/.test(a.cpuI.line) ? "unknown" : "below") : a.npu >= need ? (a.npu >= 40 && need < 40 ? "better" : "ok") : "below";
      add({ k: "npu", label: "AI engine (NPU)", req: Q.npu >= 40 ? `Copilot+ PC (${Q.npu}+ NPU TOPS)` : Q.npu > 1 ? `${Q.npu}+ NPU TOPS` : "NPU / AI PC", off: a.npu ? `${a.npu} NPU TOPS${a.npu >= 40 ? " (Copilot+ class)" : ""}` : "Not listed", st,
        why: st === "below" && a.npu ? `${a.npu} TOPS — below the ${need} TOPS asked` : "", w: Q.npu >= 40 ? 14 : 6, ratio: a.npu ? Math.min(1, a.npu / need) : 0 });
    }
    if (Q.ram) {
      const v = a.ram; let st = v == null ? "unknown" : v > Q.ram.gb ? "better" : v >= Q.ram.gb ? "ok" : "below", why = "";
      if (Q.ram.type && a.ramType && !a.ramType.includes(Q.ram.type.replace(/^LP/, ""))) why = `${a.ramType} (requirement says ${Q.ram.type})`;
      if (st === "below") {
        const addon = API().addon ? API().addon(p) : null, toGb = addon ? parseInt(addon.to, 10) : 0;
        if (addon && toGb >= Q.ram.gb) { st = "fix"; addCost += addon.price; addNote = `${addon.to} upgrade +${peso(addon.price)}`; why = `Iontech ${addon.to} upgrade offer: +${peso(addon.price)} per unit`; }
        else if (a.upgradeable && (!a.ramMax || a.ramMax >= Q.ram.gb)) { st = "fix"; why = `${gbTxt(Q.ram.gb - v)} less, but memory is upgradeable (${a.upgrade.ram}) — quote the extra memory separately`; }
        else why = `${gbTxt(Q.ram.gb - v)} less than required` + (a.onboard ? " — on-board memory, cannot be upgraded" : "");
      }
      add({ k: "ram", label: "Memory", req: `${gbTxt(Q.ram.gb)}${Q.ram.type ? " " + Q.ram.type : ""}`, off: a.ramText || (v ? gbTxt(v) : "—"), st, why, w: 14, ratio: v ? Math.min(1, v / Q.ram.gb) : 0 });
    }
    if (Q.storage && Q.storage.gb) {
      const have = a.storageGb;
      let st = !have ? "unknown" : have > Q.storage.gb * 1.01 ? "better" : have >= Q.storage.gb * 0.97 ? "ok" : "below", why = "";
      if (st === "below") why = `${gbTxt(have)} vs ${gbTxt(Q.storage.gb)} required`;
      if (Q.storage.type === "HDD" && a.ssd) why = (why ? why + " · " : "") + "SSD (faster than the HDD asked for)";
      add({ k: "sto", label: "Storage", req: `${gbTxt(Q.storage.gb)}${Q.storage.type ? " " + Q.storage.type : ""}`, off: a.storageText || "—", st, why, w: 12, ratio: have ? Math.min(1, have / Q.storage.gb) : 0 });
    }
    if (Q.size) {
      const v = a.size; const st = v == null ? "unknown" : Math.abs(v - Q.size) <= 0.5 ? "ok" : v > Q.size ? (v - Q.size <= 2.1 ? "differs" : "differs") : "differs";
      add({ k: "size", label: "Screen size", req: `${Q.size}"`, off: v ? `${v}"` : "—", st, why: v && st === "differs" ? (v > Q.size ? "larger screen (heavier, bigger to carry)" : "smaller screen (lighter, more portable)") : "", w: 10, ratio: v ? Math.max(0, 1 - Math.abs(v - Q.size) / 4) : 0 });
    }
    if (Q.res) {
      const px = a.w && a.h ? a.w * a.h : null, need = Q.res.w * Q.res.h;
      add({ k: "res", label: "Resolution", req: `${Q.res.label} (${Q.res.w} x ${Q.res.h})`, off: a.w ? `${a.resLabel ? a.resLabel + " " : ""}(${a.w} x ${a.h})` : "—", st: px == null ? "unknown" : px > need * 1.02 ? "better" : px >= need * 0.98 ? "ok" : "below", w: 8, ratio: px ? Math.min(1, px / need) : 0 });
    }
    const feat = (k, label, has, w, whyNo) => { if (Q[k]) add({ k, label, req: label, off: has == null ? "Not listed" : has ? "Yes" : "No", st: has == null ? "unknown" : has ? "ok" : "below", why: has === false ? whyNo || "" : "", w: w || 3 }); };
    feat("touch", "Touch screen", a.touch, 8);
    feat("flip", "2-in-1 convertible", a.flip, 10, "clamshell laptop — the screen doesn't fold back into tablet mode");
    if (Q.oled) add({ k: "oled", label: "OLED display", req: "OLED", off: a.oled ? "OLED" : (a.ips ? "IPS" : a.dispText || "—"), st: a.oled ? "ok" : "below", w: 6 });
    else if (Q.ips) add({ k: "ips", label: "Panel", req: "IPS", off: a.oled ? "OLED" : a.ips ? "IPS" : (a.dispText ? a.dispText : "—"), st: a.oled ? "better" : a.ips ? "ok" : (/SVA|TN/i.test(a.dispText) ? "below" : "unknown"), why: a.oled ? "OLED (better contrast than IPS)" : "", w: 3 });
    if (Q.hz) add({ k: "hz", label: "Refresh rate", req: `${Q.hz} Hz`, off: a.hz ? `${a.hz} Hz` : "Not listed", st: a.hz == null ? "unknown" : a.hz >= Q.hz ? "ok" : "below", w: 4 });
    if (Q.nits) add({ k: "nits", label: "Brightness", req: `${Q.nits} nits`, off: a.nits ? `${a.nits} nits` : "Not listed", st: a.nits == null ? "unknown" : a.nits >= Q.nits ? (a.nits > Q.nits ? "better" : "ok") : "below", w: 3 });
    if (Q.os) {
      const o = a.os, rq = Q.os; let st = "unknown", why = "";
      if (o) {
        const oPro = /pro|enterprise|education/i.test(o), rPro = /pro|enterprise|education/i.test(rq);
        if (/no os|freedos/i.test(rq)) { st = "better"; why = "comes with Windows (requirement needs no OS)"; }
        else if (rPro && !oPro) { st = /Home/.test(o) ? "below" : "unknown"; why = /Home/.test(o) ? "Home edition — requirement asks for Pro (a Windows Pro upgrade can be added)" : "edition not stated on the pricelist — confirm"; }
        else { st = "ok"; if (/10/.test(rq) && /11/.test(o)) why = "newer Windows 11 (Windows 10 is end-of-support)"; }
      }
      add({ k: "os", label: "Operating system", req: rq, off: o || "Not listed", st, why, w: 8 });
    }
    if (Q.gfx === "discrete") {
      // last-time-buy descriptions name the graphics only when there is a dedicated GPU (e.g. "A370M4GB")
      const off = a.gfx || (c.mode === "ltb" ? "No dedicated GPU in the description" : "—");
      add({ k: "gfx", label: "Graphics", req: Q.gfxText || (Q.vram ? `Dedicated graphics, ${Q.vram} GB` : "Dedicated graphics"), off, st: a.discrete ? "ok" : (a.gfx || c.mode === "ltb" ? "below" : "unknown"), why: a.discrete ? "" : "integrated graphics", w: 12 });
    }
    if (Q.webcam || Q.camHd) {
      const need = Q.camHd ? "FHD (1080p) camera" : "Webcam";
      const st = !a.camera ? "unknown" : Q.camHd ? (a.camHd ? (/5MP/i.test(a.camera) ? "better" : "ok") : "below") : "ok";
      add({ k: "cam", label: "Camera", req: need + (Q.ir ? " + IR (face sign-in)" : ""), off: a.camera || "Not listed", st: Q.ir && a.camera && !a.ir && st !== "below" ? "below" : st, why: Q.ir && a.camera && !a.ir ? "no IR camera — Windows Hello face sign-in not available" : "", w: 3 });
    } else if (Q.ir) add({ k: "cam", label: "IR camera (face sign-in)", req: "IR camera", off: a.camera || "Not listed", st: !a.camera ? "unknown" : a.ir ? "ok" : "below", w: 3 });
    if (Q.wifi) {
      const need = Q.wifi === "any" ? 4 : wifiRank(Q.wifi), have = wifiRank(a.wifi);
      add({ k: "wifi", label: "Wi-Fi", req: Q.wifi === "any" ? "Wireless LAN" : Q.wifi, off: a.wifi || "Not listed", st: !a.wifi ? (Q.wifi === "any" ? "ok" : "unknown") : have >= need ? (have > need ? "better" : "ok") : "below", why: !a.wifi && Q.wifi === "any" ? "every laptop on the list has Wi-Fi; version not listed" : "", w: 3 });
    }
    if (Q.bt) { const need = Q.bt === true ? 1 : Q.bt; add({ k: "bt", label: "Bluetooth", req: Q.bt === true ? "Bluetooth" : `Bluetooth ${Q.bt}`, off: a.bt ? `Bluetooth ${a.bt}` : "Not listed", st: a.bt ? (a.bt >= need ? "ok" : "below") : "unknown", w: 2 }); }
    if (Q.ports) {
      const P = Q.ports, ap = a.ports;
      const one = (k, label) => { if (P[k]) add({ k: "p_" + k, label, req: label, off: ap ? yn(ap[k]) : (k === "usbC" && a.usbCcharge ? "USB-C charging" : "Not listed"), st: ap ? (ap[k] ? "ok" : "below") : (k === "usbC" && a.usbCcharge ? "ok" : "unknown"), why: !ap && k === "usbC" && a.usbCcharge ? "has USB-C (charges over USB-C)" : ap && !ap[k] && k === "lan" ? "no RJ-45 port — a USB Ethernet adapter can be added" : "", w: 2 }); };
      one("usbC", "USB-C port"); one("hdmi", "HDMI"); one("lan", "Gigabit LAN (RJ-45)");
      if (P.usbMin) add({ k: "p_usb", label: "USB ports", req: `${P.usbMin} or more`, off: ap ? `${ap.usb} USB` : "Not listed", st: !ap ? "unknown" : ap.usb >= P.usbMin ? "ok" : "below", w: 2 });
    }
    feat("fpr", "Fingerprint reader", a.fpr, 2);
    feat("backlit", "Backlit keyboard", a.backlit, 2);
    if (Q.weight) add({ k: "kg", label: "Weight", req: `${Q.weight} kg or lighter`, off: a.weight ? `${a.weight} kg` : "Not listed", st: a.weight == null ? "unknown" : a.weight <= Q.weight ? "ok" : "below", w: 5 });
    if (Q.wh) add({ k: "wh", label: "Battery", req: `${Q.wh} Wh or more`, off: a.wh ? `${a.wh} Wh` : "Not listed", st: a.wh == null ? "unknown" : a.wh >= Q.wh ? "ok" : "below", w: 3 });
    if (Q.tpm) add({ k: "tpm", label: "TPM 2.0", req: "TPM 2.0", off: a.tpm ? "TPM 2.0" : "Not listed", st: a.tpm ? "ok" : "unknown", why: a.tpm ? "" : "Windows 11 PCs ship with TPM 2.0 — confirm on HP's spec sheet", w: 2 });
    if (Q.office) add({ k: "office", label: "MS Office", req: "Microsoft Office", off: a.office ? "Included" : "Not included", st: a.office ? "ok" : "below", why: a.office ? "" : "Office would have to be bought separately", w: 4 });
    // warranty
    if (Q.warranty && Q.warranty.years) {
      const W = Q.warranty, b = a.warranty;
      const reqTxt = `${W.years} year${W.years > 1 ? "s" : ""}${W.onsite ? " onsite" : ""}`;
      let st = "unknown", why = "warranty not on the pricelist — confirm";
      if (b) {
        why = "";
        if (b.years >= W.years && (!W.onsite || b.onsite >= (W.onsiteYears || W.years))) st = b.years > W.years ? "better" : "ok";
        else { st = "below"; why = `${b.years}-year${b.onsite ? `, ${b.onsite}-year onsite` : ""} — an HP Care Pack extension can be quoted (ask your account manager)`; }
      }
      add({ k: "war", label: "Warranty", req: reqTxt, off: b ? b.text + (a.carePack ? ` · ${a.carePack}` : "") : "—", st, why, w: 6 });
    }
    // budget
    const unit = priceOf(p), cost = unit != null ? unit + addCost : null;
    if (R.budget && cost != null) {
      const qty = R.qty || 1, per = R.budget.per === "total" ? R.budget.amount / qty : R.budget.amount;
      const lab = c.mode === "ltb" && opt.basis === "dp" ? "special price" : opt.basis === "dp" ? "DP" : "SRP";
      add({ k: "budget", label: "Budget per unit", req: `${peso(per)}${R.budget.per === "total" ? ` (${peso(R.budget.amount)} ÷ ${qty})` : ""}`, off: `${peso(cost)} ${lab}${addCost ? " incl. upgrade" : ""}`, st: cost <= per ? "ok" : "below", why: cost <= per ? `${peso(per - cost)} under budget at ${lab}` : `${peso(cost - per)} over budget at ${lab}`, w: 8 });
    }
    // score
    const val = (r) => ({ better: 1, ok: 1, fix: 0.85, differs: 0.55, unknown: 0.45, below: 0.6 * (r.ratio || 0), info: 1 }[r.st]);
    const Wt = rows.reduce((s, r) => s + r.w, 0) || 1;
    const score = rows.reduce((s, r) => s + r.w * val(r), 0) / Wt;
    const below = rows.filter((r) => r.st === "below").length;
    const av = API().availability(p);
    return { p, mode: c.mode, a, rows, score, below, unit, addCost, addNote, av, onhand: !!(av && av.level === "ok"), meets: rows.filter((r) => r.st === "ok" || r.st === "better" || r.st === "fix").length };
  }

  function rank(R) {
    const list = candidates().map((c) => evaluate(R, c));
    list.sort((x, y) => (Math.round(y.score * 100) - Math.round(x.score * 100)) || (x.below - y.below) || ((x.onhand ? 0 : 1) - (y.onhand ? 0 : 1)) || ((x.unit || 9e9) - (y.unit || 9e9)));
    // "meets all" = nothing below or different, and none of the main specs left unconfirmed
    const full = list.filter((r) => r.below === 0 && !r.rows.some((x) => x.st === "differs" || (x.st === "unknown" && x.w >= 8)));
    if (list[0]) list[0].badge = full.length && full[0] === list[0] ? "Best match" : "Closest match";
    const cheap = full.filter((r) => r.unit != null).slice().sort((x, y) => (x.unit + x.addCost) - (y.unit + y.addCost))[0];
    if (cheap && cheap !== list[0]) cheap.badge2 = "Lowest price that meets all";
    else if (cheap) list[0].badge2 = "Lowest price that meets all";
    const stock = list.find((r) => r.onhand);
    if (stock && stock !== list[0] && stock.below <= list[0].below + 1) stock.badge3 = "On-hand alternative";
    return list;
  }

  // =====================================================================================
  // 5) Reading files: images (OCR), PDFs (text, or OCR for scans), text files
  // =====================================================================================
  let ocrWorker = null;
  const loadScript = (src) => X().loadScript(src);
  async function getOcr(progress) {
    if (ocrWorker) return ocrWorker;
    progress("Loading text recognition (first time only)…", 0.02);
    await loadScript(VENDOR + "ocr/tesseract.min.js");
    ocrWorker = await window.Tesseract.createWorker("eng", 1, {
      workerPath: abs(VENDOR + "ocr/worker.min.js"), corePath: abs(VENDOR + "ocr/"), langPath: abs(VENDOR + "ocr/"), gzip: true,
      logger: (m) => { if (m && m.status === "recognizing text") progress(OCR_MSG, 0.1 + 0.88 * (m.progress || 0)); },
    });
    // layout mode 4 keeps each table row (label + value) on one line — best for spec sheets and tender tables
    await ocrWorker.setParameters({ tessedit_pageseg_mode: "4", preserve_interword_spaces: "1" });
    return ocrWorker;
  }
  let OCR_MSG = "Reading…";
  function prepCanvas(src) { // upscale small images and convert to grey for better recognition
    const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
    const k = w0 < 1400 ? Math.min(2.5, 1800 / w0) : (w0 > 3500 ? 3500 / w0 : 1);
    const c = document.createElement("canvas"); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const g = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2]; a[i] = a[i + 1] = a[i + 2] = g; }
    x.putImageData(d, 0, 0);
    return c;
  }
  async function ocrImage(src, progress, label) {
    const w = await getOcr(progress);
    OCR_MSG = label || "Reading the picture…";
    progress(OCR_MSG, 0.1);
    const { data } = await w.recognize(prepCanvas(src));
    return data.text || "";
  }
  const fileToImage = (file) => new Promise((res, rej) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("This picture could not be opened.")); im.src = u; });
  async function readPdf(file, progress) {
    progress("Opening the PDF…", 0.03);
    await loadScript(VENDOR + "pdfjs/pdf.min.js");
    const pdfjs = window.pdfjsLib; pdfjs.GlobalWorkerOptions.workerSrc = abs(VENDOR + "pdfjs/pdf.worker.min.js");
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const n = Math.min(doc.numPages, 15), out = [];
    for (let i = 1; i <= n; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const rows = new Map(); // group the text pieces into lines by their vertical position
      tc.items.forEach((it) => { const y = Math.round(it.transform[5] / 3) * 3; if (!rows.has(y)) rows.set(y, []); rows.get(y).push({ x: it.transform[4], s: it.str }); });
      let txt = Array.from(rows.entries()).sort((a, b) => b[0] - a[0]).map(([, r]) => r.sort((a, b) => a.x - b.x).map((t) => t.s).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
      if (txt.replace(/\s/g, "").length < 40) { // scanned page: render and recognise
        const vp = page.getViewport({ scale: 2.2 }), c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        txt = await ocrImage(c, progress, `Reading scanned page ${i} of ${n}…`);
      } else progress(`Reading page ${i} of ${n}…`, i / n);
      out.push(txt);
    }
    return out.join("\n\n") + (doc.numPages > n ? `\n\n[Only the first ${n} of ${doc.numPages} pages were read]` : "");
  }
  async function readFile(file, progress) {
    const name = (file.name || "").toLowerCase(), type = file.type || "";
    if (type === "application/pdf" || name.endsWith(".pdf")) return readPdf(file, progress);
    if (type.startsWith("image/") || /\.(png|jpe?g|webp|bmp|gif)$/.test(name)) return ocrImage(await fileToImage(file), progress, "Reading the picture…");
    if (type.startsWith("text/") || /\.(txt|csv|md)$/.test(name)) return file.text();
    throw new Error("Please use a picture (JPG/PNG), a PDF or a text file.");
  }

  // =====================================================================================
  // 6) The dialog
  // =====================================================================================
  let R = null, lastResults = [], compSel = null;
  const modal = () => $("#mtModal");
  const SEL = {
    os: ["", "Windows 11 Pro", "Windows 11 Home", "No OS / FreeDOS"],
    gfx: ["", "integrated", "discrete"], stoType: ["", "SSD", "HDD"], wifi: ["", "any", "Wi-Fi 5", "Wi-Fi 6", "Wi-Fi 6E", "Wi-Fi 7"],
    res: ["", "HD", "FHD", "WUXGA", "2.2K", "QHD", "WQXGA", "3K", "4K UHD"],
  };

  function ensureChrome() {
    const anchor = $("#downloadOpen");
    if (anchor && !$("#matchOpen")) {
      const b = document.createElement("button");
      b.type = "button"; b.id = "matchOpen"; b.className = "btn btn-match";
      b.setAttribute("aria-haspopup", "dialog"); b.title = "Match a client's requirement (picture, PDF or text) to the closest laptops";
      b.innerHTML = `${ICON.match}<span>Match specs</span>`;
      anchor.insertAdjacentElement("beforebegin", b);
    }
  }
  function buildModal() {
    if (modal()) return;
    const m = document.createElement("div");
    m.className = "modal mt-modal"; m.id = "mtModal"; m.hidden = true;
    m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "mtTitle");
    m.innerHTML = `
      <div class="modal-backdrop" data-mtclose></div>
      <div class="modal-panel mt-panel" role="document">
        <button type="button" class="icon-btn modal-close" data-mtclose aria-label="Close">${ICON.x}</button>
        <div class="mt-body">
          <h2 id="mtTitle">Match a requirement</h2>
          <p class="dl-lead">Drop in the client's requirement — a photo, screenshot, PDF or pasted text. The page reads it, lists what it found, and suggests the closest laptops on the pricelist, with every difference explained. Everything is read on this device; nothing is uploaded.</p>

          <section class="mt-step">
            <h3><span>1</span>Requirement</h3>
            <div class="mt-in">
              <label class="mt-drop" id="mtDrop" tabindex="0">
                <input type="file" id="mtFile" accept="image/*,.pdf,application/pdf,.txt,text/plain" hidden>
                ${ICON.up}<b>Drop a picture or PDF here</b><small>or click to choose · or paste a screenshot (Ctrl+V)</small>
              </label>
              <div class="mt-textbox">
                <label for="mtText">Requirement text <small>read from the file, or type / paste it here — you can correct it</small></label>
                <textarea id="mtText" rows="7" spellcheck="false" placeholder="e.g.&#10;Laptop, qty 20&#10;Processor: Intel Core Ultra 5 or higher&#10;Memory: 16GB · Storage: 512GB SSD&#10;14&quot; FHD display, Windows 11 Pro&#10;3 years warranty"></textarea>
                <div class="mt-row"><button type="button" class="btn btn-primary" id="mtRead">${ICON.match}<span>Read &amp; match</span></button>
                  <button type="button" class="link-btn" id="mtSample">Try an example</button>
                  <button type="button" class="link-btn" id="mtClear">Clear</button></div>
              </div>
            </div>
            <div class="mt-progress" id="mtProg" hidden><div class="mt-bar"><i id="mtBar"></i></div><span id="mtProgTxt"></span></div>
            <p class="mt-status" id="mtStatus" role="status" aria-live="polite"></p>
          </section>

          <section class="mt-step" id="mtReqSec" hidden>
            <h3><span>2</span>What we read <small>check and correct — the results update as you edit; leave a field blank to ignore it</small></h3>
            <div id="mtReq"></div>
          </section>

          <section class="mt-step" id="mtResSec" hidden>
            <h3><span>3</span>Closest laptops</h3>
            <div id="mtRes"></div>
            <p class="mt-foot">Specs from the current pricelist (and HP's spec sheet where one is attached). “Not listed” means the pricelist doesn't state it — confirm with HP's spec sheet. Processor comparisons are an approximate guide by class and generation, not a benchmark. Always confirm the final configuration and stock before quoting.</p>
          </section>
        </div>
      </div>`;
    document.body.appendChild(m);

    const file = $("#mtFile", m), drop = $("#mtDrop", m);
    file.addEventListener("change", () => { if (file.files[0]) handleFile(file.files[0]); file.value = ""; });
    drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => {
      const dt = e.dataTransfer; const f = dt && dt.files && dt.files[0];
      if (f) handleFile(f);
      else if (dt && dt.getData("text")) { $("#mtText").value = dt.getData("text"); runText(dt.getData("text")); }
    });
    m.addEventListener("paste", (e) => {
      if (e.target && e.target.id === "mtText") { const it0 = Array.from((e.clipboardData && e.clipboardData.items) || []).find((x) => x.kind === "file"); if (!it0) { setTimeout(() => runText($("#mtText").value), 0); return; } }
      const it = Array.from((e.clipboardData && e.clipboardData.items) || []).find((x) => x.kind === "file");
      if (it) { e.preventDefault(); const f = it.getAsFile(); if (f) handleFile(f); }
    });
    $("#mtRead", m).addEventListener("click", () => runText($("#mtText").value));
    $("#mtClear", m).addEventListener("click", () => { $("#mtText").value = ""; R = null; $("#mtReqSec").hidden = $("#mtResSec").hidden = true; status(""); $("#mtText").focus(); });
    $("#mtSample", m).addEventListener("click", () => {
      $("#mtText").value = "TECHNICAL SPECIFICATIONS — Laptop Computer (20 units)\nProcessor: Intel Core Ultra 5 or higher, AI-ready with NPU\nMemory: 16GB RAM\nStorage: 512GB SSD\nDisplay: 14 inch, Full HD (1920 x 1080) or higher, IPS\nOperating System: Windows 11 Pro\nWireless: Wi-Fi 6, Bluetooth\nCamera: 1080p FHD webcam\nFingerprint reader, backlit keyboard\nWeight: not more than 1.5 kg\nWarranty: 3 years parts and labor\n\nApproved Budget for the Contract (ABC): PHP 1,500,000.00";
      runText($("#mtText").value);
    });
    m.addEventListener("change", (e) => { const c = e.target.closest("[data-comp]"); if (c) compSel = c.value; });
    $("#mtReq", m).addEventListener("input", onReqEdit);
    $("#mtReq", m).addEventListener("change", onReqEdit);
    m.addEventListener("click", onClick);
  }
  function status(t, err) { const s = $("#mtStatus"); if (s) { s.textContent = t || ""; s.classList.toggle("err", !!err); } }
  function progress(t, f) {
    const p = $("#mtProg"); if (!p) return;
    if (t == null) { p.hidden = true; return; }
    p.hidden = false; $("#mtProgTxt").textContent = t; $("#mtBar").style.width = Math.round(Math.max(0.03, Math.min(1, f || 0)) * 100) + "%";
  }
  let busy = false;
  async function handleFile(f) {
    if (busy) return; busy = true; status("");
    $("#mtDrop").classList.add("busy");
    try {
      const txt = await readFile(f, progress);
      progress("Done", 1);
      $("#mtText").value = txt.trim();
      if (!txt.trim()) { status("No text could be read from this file. Try a sharper picture, or type the requirement.", true); return; }
      await runText(txt, f.name);
    } catch (e) { console.error(e); status((e && e.message) || "Could not read this file.", true); }
    finally { busy = false; $("#mtDrop").classList.remove("busy"); setTimeout(() => progress(null), 600); }
  }
  async function runText(txt, from) {
    if (!String(txt || "").trim()) { status("Add a picture/PDF, or type the requirement first.", true); $("#mtText").focus(); return; }
    R = parseRequirement(txt);
    if (!R.found && !Object.keys(R.nb).length) status("Couldn't find specs such as processor, memory, storage or screen size. Check the text above (or fill in the fields below).", true);
    else status(from ? `Read “${from}”.` : "");
    renderReq(); match();
  }

  // ---------- requirement form ----------
  const F = (k, label, type, o) => ({ k, label, type, opt: o || {} });
  const FIELDS = [
    F("cpu", "Processor", "text", { wide: true, ph: "e.g. Intel Core Ultra 5" }), F("cores", "Min. cores", "num"), F("npu", "Min. NPU TOPS", "num", { ph: "40 = Copilot+" }),
    F("ram", "Memory (GB)", "num"), F("sto", "Storage (GB)", "num", { ph: "1 TB = 1024" }), F("stoType", "Storage type", "sel"),
    F("size", "Screen (in)", "num"), F("res", "Resolution", "sel"), F("os", "Operating system", "sel"), F("gfx", "Graphics", "sel"),
    F("wifi", "Wi-Fi", "sel"), F("weight", "Max. weight (kg)", "num"), F("warY", "Warranty (years)", "num"),
    F("chk", "Also required", "checks", { items: [["touch", "Touch screen"], ["flip", "2-in-1"], ["oled", "OLED"], ["ips", "IPS"], ["webcam", "Webcam"], ["camHd", "FHD camera"], ["ir", "IR face sign-in"], ["fpr", "Fingerprint"], ["backlit", "Backlit keyboard"], ["usbC", "USB-C"], ["hdmi", "HDMI"], ["lan", "RJ-45 LAN"], ["bt", "Bluetooth"], ["office", "MS Office"], ["warOn", "Onsite warranty"]] }),
  ];
  function getV(k) {
    const S = R.nb;
    switch (k) {
      case "cpu": return S.cpu ? S.cpu.text : "";
      case "ram": return S.ram ? S.ram.gb : "";
      case "sto": return S.storage ? S.storage.gb : "";
      case "stoType": return S.storage ? S.storage.type : "";
      case "res": return S.res ? S.res.label : "";
      case "warY": return S.warranty ? S.warranty.years : "";
      case "warOn": return !!(S.warranty && S.warranty.onsite);
      case "usbC": case "hdmi": case "lan": return !!(S.ports && S.ports[k]);
      case "bt": return !!S.bt;
      default: return S[k] == null ? "" : S[k];
    }
  }
  function setV(k, v) {
    const S = R.nb;
    const P = () => S.ports || (S.ports = {});
    switch (k) {
      case "cpu": { const t = String(v).trim(); if (!t) delete S.cpu; else { const both = /intel|core|\bi[3579]\b/i.test(t) && /amd|ryzen/i.test(t); S.cpu = { text: t, info: cpuInfo(t), strictBrand: !both && !/equivalent|or (better|higher)/i.test(t) && /\b(intel|amd|qualcomm)\b/i.test(t) }; } break; }
      case "ram": if (v === "" || !(+v > 0)) delete S.ram; else S.ram = Object.assign(S.ram || {}, { gb: +v }); break;
      case "sto": if (v === "" || !(+v > 0)) delete S.storage; else S.storage = Object.assign(S.storage || { type: "" }, { gb: +v }); break;
      case "stoType": if (S.storage) S.storage.type = v; else if (v) S.storage = { gb: 0, type: v }; break;
      case "res": if (!v) delete S.res; else S.res = RESMAP[v]; break;
      case "warY": if (!(+v > 0)) delete S.warranty; else S.warranty = Object.assign(S.warranty || { onsite: false }, { years: +v }); break;
      case "warOn": if (S.warranty) S.warranty.onsite = !!v; else if (v) S.warranty = { years: 1, onsite: true }; break;
      case "usbC": case "hdmi": case "lan": if (v) P()[k] = true; else if (S.ports) delete S.ports[k]; break;
      default: if (v === "" || v === false || v == null) delete S[k]; else S[k] = typeof v === "boolean" ? v : (/^(cores|npu|size|weight|hz|nits|wh)$/.test(k) ? +v : v);
    }
  }
  function fieldHTML(f) {
    const id = `mt_${f.k}`;
    if (f.type === "checks") return `<div class="mt-f mt-checks"><span>${f.label}</span><div>${f.opt.items.map(([k, l]) => `<label class="mt-chip${getV(k) ? " on" : ""}"><input type="checkbox" data-k="${k}"${getV(k) ? " checked" : ""}>${esc(l)}</label>`).join("")}</div></div>`;
    const v = getV(f.k), has = v !== "" && v != null && v !== 0;
    const src = R.src[f.k === "sto" || f.k === "stoType" ? "storage" : f.k === "warY" ? "warranty" : f.k];
    let input;
    if (f.type === "sel") {
      input = `<select id="${id}" data-k="${f.k}">${SEL[f.k].map((o) => `<option value="${esc(o)}"${String(v) === o ? " selected" : ""}>${o === "" ? "Any" : o === "any" ? "Required (any)" : o === "integrated" ? "Integrated is fine" : o === "discrete" ? "Dedicated graphics" : esc(o)}</option>`).join("")}</select>`;
    } else input = `<input id="${id}" data-k="${f.k}" ${f.type === "num" ? 'type="number" min="0" step="any" inputmode="decimal"' : 'type="text"'} value="${esc(v)}" placeholder="${esc(f.opt.ph || "")}">`;
    return `<label class="mt-f${f.opt.wide ? " wide" : ""}${has ? " got" : ""}" for="${id}" ${src ? `title="Read from: ${esc(src)}"` : ""}><span>${f.label}</span>${input}</label>`;
  }
  function renderReq() {
    const c = R.nb.cpu;
    const cpuNote = c && c.info ? `<p class="mt-cpu">Processor understood as <b>${esc(c.info.cls)}</b>${c.info.gen ? `, <b>${esc(c.info.gen)}</b>` : ""}${c.strictBrand ? ` · ${esc(c.info.brand)} only` : " · other brands accepted as equivalent"}</p>`
      : c ? `<p class="mt-cpu warn">Couldn't tell the processor class from “${esc(c.text)}” — type it as e.g. “Core Ultra 5” or “Ryzen 7”.</p>` : "";
    $("#mtReq").innerHTML = `
      <div class="mt-kinds">
        <label class="mt-f mt-qty"><span>Qty</span><input type="number" min="1" data-g="qty" value="${R.qty || ""}" placeholder="1"></label>
        <label class="mt-f mt-bud"><span>Budget (₱)</span><input type="number" min="0" data-g="budget" value="${R.budget ? Math.round(R.budget.amount) : ""}" placeholder="optional"></label>
        <label class="mt-f mt-per"><span>Budget is</span><select data-g="per"><option value="unit"${!R.budget || R.budget.per === "unit" ? " selected" : ""}>per unit</option><option value="total"${R.budget && R.budget.per === "total" ? " selected" : ""}>total (all units)</option></select></label>
        <label class="mt-f mt-per"><span>Compare budget with</span><select data-g="basis"><option value="dp"${opt.basis === "dp" ? " selected" : ""}>Dealer price (DP)</option><option value="srp"${opt.basis === "srp" ? " selected" : ""}>SRP</option></select></label>
        <label class="mt-chip${opt.ltb ? " on" : ""}"><input type="checkbox" data-g="ltb"${opt.ltb ? " checked" : ""}>Include last-time-buy models</label>
      </div>
      <fieldset class="mt-grp"><legend>Laptop</legend><div class="mt-grid">${FIELDS.map(fieldHTML).join("")}</div>${cpuNote}</fieldset>`;
    $("#mtReqSec").hidden = false;
  }
  let editT = null;
  function onReqEdit(e) {
    const t = e.target; if (!R) return;
    if (t.dataset.g) {
      if (t.dataset.g === "qty") R.qty = +t.value > 0 ? +t.value : null;
      if (t.dataset.g === "budget") { if (+t.value > 0) R.budget = Object.assign(R.budget || { per: "unit" }, { amount: +t.value }); else R.budget = null; }
      if (t.dataset.g === "per" && R.budget) R.budget.per = t.value;
      if (t.dataset.g === "basis") opt.basis = t.value;
      if (t.dataset.g === "ltb") { opt.ltb = t.checked; t.closest(".mt-chip").classList.toggle("on", t.checked); }
    } else if (t.dataset.k) {
      setV(t.dataset.k, t.type === "checkbox" ? t.checked : t.value);
      if (t.type === "checkbox") t.closest(".mt-chip").classList.toggle("on", t.checked);
      const box = t.closest(".mt-f"); if (box && t.type !== "checkbox") box.classList.toggle("got", t.value !== "");
      if (t.dataset.k === "cpu" && e.type === "change") renderReq();
    }
    clearTimeout(editT); editT = setTimeout(match, e.type === "input" && t.type !== "checkbox" ? 350 : 0);
  }

  // ---------- results ----------
  function match() {
    if (!R) return;
    lastResults = rank(R);
    const L = lastResults, box = $("#mtRes");
    const reqCount = L.length ? L[0].rows.length : 0;
    if (!reqCount) { box.innerHTML = `<p class="mt-none">Add at least one requirement above (e.g. processor, memory or screen size) to compare laptops.</p>`; $("#mtResSec").hidden = false; compSel = null; return; }
    if (!L.some((r) => key(r) === compSel)) compSel = key(L[0]);
    const top = L.slice(0, 3);
    [L.find((r) => r.badge2), L.find((r) => r.badge3)].forEach((r) => { if (r && !top.includes(r)) top.push(r); });
    const compBar = `<div class="mt-comp">
        <div class="mt-comp-t"><b>Tender compliance sheet</b><small>Statement of compliance — requirement vs. offered, with remarks and the model's full specs</small></div>
        <label class="mt-f"><span>Laptop offered</span><select data-comp="1">${L.slice(0, 12).map((r, i) => `<option value="${esc(key(r))}"${key(r) === compSel ? " selected" : ""}>${i + 1}. ${esc(short(r.p))} — ${pct(r)}%</option>`).join("")}</select></label>
        <span class="mt-comp-b"><button type="button" class="btn btn-primary" data-compx="xlsx">${ICON.dl}<span>Excel</span></button><button type="button" class="btn btn-outline" data-compx="pdf">${ICON.dl}<span>PDF</span></button></span>
      </div>`;
    box.innerHTML = compBar + `<div class="mt-kind"><h4>Laptops <small>${L.length} models compared · ${reqCount} requirement${reqCount > 1 ? "s" : ""}</small></h4>
        <div class="mt-cards">${top.map((r, i) => cardHTML(r, i)).join("")}</div>
        <details class="mt-all"><summary>All ${L.length} models ranked</summary>${tableHTML(L)}</details></div>`;
    $("#mtResSec").hidden = false;
  }
  const key = (r) => r.mode + ":" + r.p.id;
  const short = (p) => (p.title || p.model).replace(/^HP-NB\s+\S+\s+/, "HP ");
  const pct = (r) => Math.round(r.score * 100);
  function summary(r) {
    const diff = r.rows.filter((x) => x.st === "below" || x.st === "differs" || x.st === "fix" || x.st === "unknown");
    const n = r.rows.length, meets = r.rows.filter((x) => x.st === "ok" || x.st === "better").length;
    if (!diff.length) return `Meets all ${n} requirement${n > 1 ? "s" : ""}.`;
    const words = { below: "below", differs: "different", fix: "needs upgrade", unknown: "not listed — confirm" };
    return `Meets ${meets} of ${n}. Differences: ` + diff.map((x) => `${x.label.toLowerCase()} — ${words[x.st]}${x.why ? ` (${x.why})` : ""}`).join("; ") + ".";
  }
  function priceBlock(r) {
    const p = r.p, A = API(), qty = R.qty || 1;
    let html;
    if (r.mode === "ltb") html = `<span><s>${peso(p.dp)}</s> <b class="promo">${peso(p.sale)}</b> <small>Special price (LTB)</small></span><span><small>SRP</small> <b>${peso(p.srp)}</b></span>`;
    else html = `<span>${A.hasPromoDp(p) ? `<s>${peso(p.dp)}</s> <b class="promo">${peso(p.promoDp)}</b> <small>Promo DP</small>` : `<b>${peso(p.dp)}</b> <small>DP</small>`}</span>` +
      `<span>${A.hasPromoSrp(p) ? `<s>${peso(p.srp)}</s> <b class="promo">${peso(p.promoSrp)}</b> <small>Promo SRP</small>` : `<b>${peso(p.srp)}</b> <small>SRP</small>`}</span>`;
    if (r.addCost) html += `<span>+ ${esc(r.addNote)}</span>`;
    if (qty > 1 && r.unit != null) html += `<span>× ${qty} = <b>${peso((r.unit + r.addCost) * qty)}</b> <small>${opt.basis === "dp" ? (r.mode === "ltb" ? "special price" : "DP") : "SRP"}</small></span>`;
    return html;
  }
  function cardHTML(r, i) {
    const p = r.p, img = p.images && p.images[0] ? p.images[0].thumb : API().placeholder;
    const badges = [r.badge, r.badge2, r.badge3].filter(Boolean);
    const av = r.av;
    return `<article class="mt-card${r.below ? "" : " full"}" data-id="${esc(p.id)}">
      <header>
        <div class="mt-img"><img src="${esc(img)}" alt="" loading="lazy"></div>
        <div class="mt-name">
          ${badges.length ? `<div class="mt-badges">${badges.map((b) => `<em>${esc(b)}</em>`).join("")}</div>` : ""}
          <b>${esc(short(p))}</b><span>${esc(API().typeLabel(p) || p.type || "")}${r.mode === "ltb" ? " · Last-time-buy" : ""}</span>
          <span class="mt-meta">${p.partNo ? `PN <b>${esc(p.partNo)}</b> · ` : ""}SKU <b>${esc(p.sku)}</b>${av ? ` · <span class="mt-av lvl-${esc(av.level)}">${esc(av.label)}</span>` : ""}</span>
        </div>
        <div class="mt-score" style="--p:${pct(r)}"><b>${pct(r)}%</b><small>match</small></div>
      </header>
      <div class="mt-price">${priceBlock(r)}</div>
      <table class="mt-tbl"><thead><tr><th>Requirement</th><th>Asked for</th><th>This model</th><th></th></tr></thead><tbody>
        ${r.rows.map((x) => `<tr class="st-${x.st}"><th>${esc(x.label)}</th><td data-l="Asked for">${esc(x.req)}</td><td data-l="This model">${esc(x.off)}${x.why ? `<small>${esc(x.why)}</small>` : ""}</td><td><span class="mt-st" title="${ST[x.st].t}">${ST[x.st].i}</span></td></tr>`).join("")}
      </tbody></table>
      <p class="mt-sum">${esc(summary(r))}</p>
      <div class="mt-actions">
        <button type="button" class="btn btn-primary" data-mtview="${esc(key(r))}">${ICON.eye}<span>View details</span></button>
        <button type="button" class="btn btn-outline" data-mtcopy="${esc(key(r))}" title="Copy a requirement-vs-offer compliance table to paste into an email or Excel">${ICON.copy}<span>Copy compliance</span></button>
      </div>
    </article>`;
  }
  function tableHTML(L) {
    return `<div class="mt-rank"><table><thead><tr><th>#</th><th>Model</th><th>SKU</th><th>Stock</th><th>${opt.basis === "dp" ? "DP" : "SRP"}</th><th>Match</th><th>Below / different</th><th></th></tr></thead><tbody>
      ${L.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(short(r.p))}${r.mode === "ltb" ? ' <em class="mini-ltb">LTB</em>' : ""}</td><td>${esc(r.p.sku)}</td><td>${esc(r.av ? r.av.label : "—")}</td><td>${peso(r.unit)}</td><td><b>${pct(r)}%</b></td>
        <td>${esc(r.rows.filter((x) => x.st === "below" || x.st === "differs").map((x) => x.label).join(", ") || "—")}</td>
        <td><button type="button" class="link-btn" data-mtview="${esc(key(r))}">View</button></td></tr>`).join("")}
      </tbody></table></div>`;
  }
  const findRes = (k) => lastResults.find((r) => key(r) === k);
  const STMT = { better: "Complied (exceeds)", ok: "Complied", fix: "Complied — with upgrade", differs: "For clarification", unknown: "To be confirmed", below: "Not complied" };
  function complianceText(r) {
    const p = r.p;
    const head = `${short(p)} — ${p.partNo ? "PN " + p.partNo + " · " : ""}SKU ${p.sku}\n${p.model}\n`;
    const lines = r.rows.map((x) => `${x.label}\t${x.req}\t${x.off}${x.why ? " (" + x.why + ")" : ""}\t${STMT[x.st]}`);
    return head + "\nRequirement\tAsked for\tOffered\tCompliance\n" + lines.join("\n") + `\n\n${summary(r)}`;
  }
  async function onClick(e) {
    if (e.target.closest("[data-mtclose]")) { close(); return; }
    const c = e.target.closest("[data-mtcopy]");
    if (c) {
      const r = findRes(c.dataset.mtcopy); if (!r) return;
      const txt = complianceText(r);
      try { await navigator.clipboard.writeText(txt); API().toast("Compliance table copied — paste it into an email or Excel"); }
      catch (err) { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); API().toast("Compliance table copied"); } catch (x) {} ta.remove(); }
      return;
    }
    const cx = e.target.closest("[data-compx]");
    if (cx) { complianceDownload(cx.dataset.compx, cx); return; }
    const v = e.target.closest("[data-mtview]");
    if (v) { const r = findRes(v.dataset.mtview); if (!r) return; close(); API().openProduct(r.p, r.mode); }
  }

  // ---------- tender compliance sheet (Excel / PDF) ----------
  const today = () => new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Manila" }).format(new Date());
  const fileBase = () => ("Iontech Compliance Sheet - " + new Date().toISOString().slice(0, 10)).replace(/[\\/:*?"<>|]+/g, "");
  function specList(r) { // full specs for the annex: HP spec sheet rows, otherwise the pricelist fields
    const p = r.p, sh = p.specSheet;
    if (sh && sh.rows && sh.rows.length) return sh.rows.concat((sh.sure || []).length ? [["HP Wolf Security", sh.sure.map((x) => x.name).join(", ")]] : []);
    return [["Model", p.model], ["Processor", p.cpu], ["Memory", p.ram], ["Storage", p.storage], ["Graphics", p.graphics], ["Display", p.display || p.displayShort], ["Operating system", r.a.os || p.os],
      ["Colour", p.color], ["Camera", p.camera], ["Power adapter", p.adapter], ["Warranty", p.warranty], ["Care Pack", p.carePack], ["Other", (p.otherSpecs || []).join("; ")], ["Pricelist description", p.specsRaw]].filter((x) => x[1]);
  }
  async function complianceDownload(fmt, btn) {
    const r = findRes(compSel) || lastResults[0]; if (!r) return;
    const span = btn.querySelector("span"), old = span.textContent;
    btn.disabled = true; span.textContent = "Preparing…";
    try {
      if (fmt === "xlsx") await complianceXlsx(r); else await compliancePdf(r);
      API().toast("Compliance sheet downloaded");
    } catch (e) { console.error(e); API().toast("Sorry — the compliance sheet could not be created"); }
    finally { btn.disabled = false; span.textContent = old; }
  }
  async function complianceXlsx(r) {
    const H = X(); await H.loadScript(H.VENDOR + "exceljs.min.js");
    const p = r.p, qty = R.qty || 1;
    const wb = new window.ExcelJS.Workbook(); wb.creator = "Iontech — HP Product Pricelist";
    const ws = wb.addWorksheet("Compliance", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
    ws.columns = [{ width: 6 }, { width: 22 }, { width: 42 }, { width: 52 }, { width: 22 }, { width: 46 }];
    const Fn = { name: "Arial", size: 10 }, B = { name: "Arial", size: 10, bold: true };
    const thin = { style: "thin", color: { argb: "FF9AA3B2" } }, box = { top: thin, left: thin, bottom: thin, right: thin };
    let row = ws.addRow(["TECHNICAL SPECIFICATIONS — STATEMENT OF COMPLIANCE"]); row.font = { name: "Arial", size: 14, bold: true }; ws.mergeCells(row.number, 1, row.number, 6);
    [["Client", ""], ["Project", ""], ["Date", today()], ["Prepared by", "Iontech Inc."]].forEach(([k, v]) => { const rr = ws.addRow(["", k, v]); rr.getCell(2).font = B; rr.getCell(3).font = Fn; ws.mergeCells(rr.number, 3, rr.number, 6); });
    ws.addRow([]);
    const h = ws.addRow([`Item 1: Laptop Computer — Qty ${qty}`]); h.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    h.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF024AD8" } }; ws.mergeCells(h.number, 1, h.number, 6);
    let o = ws.addRow(["", "Offered", `${short(p)}${p.partNo ? " — Part no. " + p.partNo : ""} (SKU ${p.sku})`]); o.getCell(2).font = B; o.getCell(3).font = B; ws.mergeCells(o.number, 3, o.number, 6);
    o = ws.addRow(["", "Description", p.model]); o.getCell(2).font = B; o.getCell(3).font = Fn; o.getCell(3).alignment = { wrapText: true }; ws.mergeCells(o.number, 3, o.number, 6);
    const th = ws.addRow(["No.", "Parameter", "Required specification", "Offered specification", "Statement of compliance", "Remarks"]);
    th.eachCell((cl) => { cl.font = B; cl.border = box; cl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FD" } }; cl.alignment = { vertical: "middle", wrapText: true }; });
    r.rows.filter((x) => x.k !== "budget").forEach((x, i) => {
      const rr = ws.addRow([i + 1, x.label, x.req, x.off, STMT[x.st], x.why || ""]);
      rr.eachCell({ includeEmpty: true }, (cl, n) => { cl.font = n === 5 ? Object.assign({}, B, { color: { argb: x.st === "below" ? "FFC8102E" : x.st === "differs" || x.st === "unknown" ? "FFB45309" : "FF157A3C" } }) : Fn; cl.border = box; cl.alignment = { vertical: "top", wrapText: true }; });
    });
    ws.addRow([]);
    const n = ws.addRow(["", "Note", "Offered specifications are from the Iontech HP pricelist and HP's technical specifications where available. Configurations, availability and prices are subject to confirmation upon placement of order."]);
    n.getCell(2).font = B; n.getCell(3).font = { name: "Arial", size: 9, italic: true }; n.getCell(3).alignment = { wrapText: true }; ws.mergeCells(n.number, 3, n.number, 6);
    const sh = wb.addWorksheet(("Specs " + (p.partNo || p.sku)).slice(0, 31));
    sh.columns = [{ width: 30 }, { width: 100 }];
    const t = sh.addRow([`${short(p)} — complete specifications`]); t.font = { name: "Arial", size: 12, bold: true }; sh.mergeCells(t.number, 1, t.number, 2);
    specList(r).forEach(([k, v]) => { const rr = sh.addRow([k, v]); rr.getCell(1).font = B; rr.getCell(2).font = Fn; rr.getCell(2).alignment = { wrapText: true, vertical: "top" }; rr.getCell(1).alignment = { vertical: "top" }; });
    const buf = await wb.xlsx.writeBuffer();
    H.saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileBase() + ".xlsx");
  }
  async function compliancePdf(r) {
    const H = X(); await H.loadScript(H.VENDOR + "jspdf.umd.min.js");
    const doc = await H.newDoc("portrait"), L = await H.logos();
    const W = 210, Hh = 297, M = 14, CW = W - 2 * M, K = H.INK, GREY = H.MUTED;
    const f = (sz, st, col) => H.font(doc, sz, st || "normal", col || K);
    const p = r.p, qty = R.qty || 1;
    doc.setProperties({ title: "Statement of Compliance", subject: "Iontech — technical compliance" });
    const BOTTOM = Hh - 20;
    let y = H.header(doc, L, W, M, "Statement of Compliance", `Technical specifications · ${today()}`) + 4;
    const newPage = () => { doc.addPage(); y = H.header(doc, L, W, M, "Statement of Compliance", `Technical specifications · ${today()}`) + 4; };
    [["CLIENT", ""], ["PROJECT", ""], ["DATE", today()], ["PREPARED BY", "Iontech Inc."]].forEach(([k, v]) => { f(8, "bold"); doc.text(k, M, y); doc.text(":", M + 26, y); f(8.2); doc.text(String(v || "_______________________"), M + 30, y); y += 4.6; });
    y += 3;
    doc.setFillColor.apply(doc, H.BLUE); doc.rect(M, y, CW, 7, "F"); f(9.5, "bold", [255, 255, 255]); doc.text(`Item 1: Laptop Computer — Qty ${qty}`, M + 2, y + 4.8); y += 10;
    f(8.4, "bold"); doc.text(`Offered: ${short(p)}${p.partNo ? " — Part no. " + p.partNo : ""} (SKU ${p.sku})`, M, y); y += 4.2;
    f(7.6, "normal", GREY); const dl = doc.splitTextToSize(p.model, CW); doc.text(dl, M, y); y += dl.length * 3.5 + 2.5;
    const col = [M, M + 8, M + 36, M + 82, M + 132, M + 158, M + CW];
    const heads = ["No.", "Parameter", "Required specification", "Offered specification", "Compliance", "Remarks"];
    const thead = () => { doc.setFillColor(232, 240, 253); doc.rect(M, y, CW, 6.5, "F"); doc.setDrawColor(150, 160, 175); doc.setLineWidth(0.2); doc.rect(M, y, CW, 6.5); f(7.4, "bold"); heads.forEach((t, i) => doc.text(t, col[i] + 1.2, y + 4.3)); for (let i = 1; i < 6; i++) doc.line(col[i], y, col[i], y + 6.5); y += 6.5; };
    thead();
    r.rows.filter((x) => x.k !== "budget").forEach((x, i) => {
      f(7.4);
      const cells = [String(i + 1), x.label, x.req, x.off, STMT[x.st], x.why || ""].map((t, j) => doc.splitTextToSize(String(t), col[j + 1] - col[j] - 2.4));
      const hh = Math.max(...cells.map((c) => c.length)) * 3.3 + 2.6;
      if (y + hh > BOTTOM) { newPage(); thead(); }
      cells.forEach((cl, j) => {
        const color = j === 4 ? (x.st === "below" ? [200, 16, 46] : x.st === "differs" || x.st === "unknown" ? [180, 83, 9] : [21, 122, 60]) : K;
        f(7.4, j === 1 || j === 4 ? "bold" : "normal", color); doc.text(cl, col[j] + 1.2, y + 3.6);
      });
      doc.setDrawColor(150, 160, 175); doc.setLineWidth(0.2); doc.rect(M, y, CW, hh); for (let k = 1; k < 6; k++) doc.line(col[k], y, col[k], y + hh);
      y += hh;
    });
    y += 6;
    if (y + 12 > BOTTOM) newPage();
    f(7.2, "normal", GREY); doc.text(doc.splitTextToSize("Offered specifications are from the Iontech HP pricelist and HP's technical specifications where available. Configurations, availability and prices are subject to confirmation upon placement of order. Complete specifications of the offered model are in the annex.", CW), M, y);
    newPage(); f(10.5, "bold"); doc.text(`Annex — ${short(p)}: complete specifications`, M, y); y += 6;
    specList(r).forEach(([k, v]) => {
      f(7.2); const vl = doc.splitTextToSize(String(v), CW - 48); const hh = vl.length * 3.2 + 1.4;
      if (y + hh > BOTTOM) newPage();
      f(7.2, "bold"); doc.text(doc.splitTextToSize(k, 44), M, y); f(7.2); doc.text(vl, M + 48, y); y += hh;
    });
    H.footers(doc, W, Hh, 10, "Iontech Inc. · Specifications subject to change without notice.");
    H.saveBlob(doc.output("blob"), fileBase() + ".pdf");
  }

  // ---------- open / close ----------
  let lastFocus = null;
  function open() {
    buildModal(); lastFocus = document.activeElement;
    modal().hidden = false; document.body.classList.add("no-scroll");
    setTimeout(() => ($("#mtText").value ? $("#mtRead") : $("#mtDrop")).focus(), 30);
  }
  function close() {
    const m = modal(); if (!m || m.hidden) return;
    m.hidden = true;
    if ($$(".modal").every((x) => x.hidden)) document.body.classList.remove("no-scroll");
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  document.addEventListener("click", (e) => { if (e.target.closest("#matchOpen") || e.target.closest("[data-matchopen]")) { e.preventDefault(); open(); } }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal() && !modal().hidden) { e.stopPropagation(); close(); } }, true);
  // dropping a file anywhere on the page opens the matcher with it
  document.addEventListener("dragover", (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault(); });
  document.addEventListener("drop", (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f || e.target.closest("#mtDrop")) return;
    e.preventDefault(); open(); handleFile(f);
  });
  document.addEventListener("DOMContentLoaded", ensureChrome);
  if (document.readyState !== "loading") ensureChrome();
  window.HPMatch = { open, parse: parseRequirement, cpuInfo, attrs, rank: (req) => rank(req), runText: (t) => { open(); $("#mtText").value = t; return runText(t); }, get: () => R, results: () => lastResults, opt };
})();
