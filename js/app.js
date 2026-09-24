/* HP Product Pricelist — Iontech
   Renders everything from data/products.json, data/types.json and data/sites.json.
   No build step and no server code: works on GitHub Pages as plain static files. */
(function () {
  "use strict";

  // ---------- Constants ----------
  const PRICE_START = 40000;
  const PRICE_STEP = 10000;
  const PRICE_TOP = 100000;
  const PAGE_SIZE_ALL = Infinity;

  const pesoWhole = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const pesoCents = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPrice = (v) => (typeof v === "number"
    ? (Number.isInteger(v) ? pesoWhole : pesoCents).format(v).replace("PHP", "₱").replace(/\s/g, "")
    : "—");
  const fmtNum = (v) => new Intl.NumberFormat("en-PH").format(v);

  const ICONS = {
    cpu: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx=".5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></svg>',
    ram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 17v2M11 17v2M15 17v2M7 10v4M11 10v4M15 10v4"/></svg>',
    storage: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="17" cy="12" r="1"/><path d="M6 12h6"/></svg>',
    display: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M2 19h20"/></svg>',
    image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/></svg>',
    photos: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
    right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5M11 8v6M8 11h6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    external: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    catalog: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 15h7M14 18h5M14 21h6"/></svg>',
    service: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.3-.4-.4-2.3z"/><path d="M17 17l3 3"/></svg>',
    warranty: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M12 8H8.5a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8zM12 8h3.5a2.5 2.5 0 1 0 0-5C13 3 12 8 12 8z"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
    tag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></svg>',
  };

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  // ---------- State ----------
  const state = {
    products: [],
    types: [],          // [{code,label,description}]
    typeMap: {},
    sites: [],
    query: "",
    fTypes: new Set(),
    fCpu: new Set(),
    fPrice: new Set(),
    sort: "default",
    view: store.get("hpPricelist.view") === "list" ? "list" : "grid",
    meta: null,
    mode: "main",        // "main" = pricelist, "ltb" = last-time-buy catalog
    ds: {},              // datasets: { main: {products, types, typeMap}, ltb: {...} }
    saved: {},           // filter selections remembered per dataset
    promos: [],
    freebie: null,
    rewards: {},         // SKU (upper case) -> { amount, label, promoId }
  };

  const PLACEHOLDER = "assets/images/laptop-placeholder.svg";
  const priceKey = (p) => (p.sale != null ? p.sale : p.srp);
  const skuKey = (s) => String(s || "").toUpperCase();

  function setMode(m) {
    if (!state.ds[m]) m = "main";
    if (state.mode === m && state.products === state.ds[m].products) return;
    state.saved[state.mode] = { t: new Set(state.fTypes), c: new Set(state.fCpu), p: new Set(state.fPrice) };
    state.mode = m;
    const d = state.ds[m];
    state.products = d.products; state.types = d.types; state.typeMap = d.typeMap;
    const sv = state.saved[m] || { t: new Set(), c: new Set(), p: new Set() };
    state.fTypes = sv.t; state.fCpu = sv.c; state.fPrice = sv.p;
    searchMode = { q: null, phrase: true };
    document.body.classList.toggle("mode-ltb", m === "ltb");
  }

  // ---------- Price bands (based on SRP) ----------
  function buildBands() {
    const bands = [{ id: "lt" + PRICE_START, label: "Below " + fmtPrice(PRICE_START), min: -Infinity, max: PRICE_START - 0.01 }];
    for (let lo = PRICE_START; lo < PRICE_TOP; lo += PRICE_STEP) {
      bands.push({ id: String(lo), label: fmtPrice(lo) + "–" + fmtPrice(lo + PRICE_STEP - 1), min: lo, max: lo + PRICE_STEP - 0.01 });
    }
    bands.push({ id: PRICE_TOP + "plus", label: fmtPrice(PRICE_TOP) + "+", min: PRICE_TOP, max: Infinity });
    return bands;
  }
  const BANDS = buildBands();
  const bandOf = (srp) => (typeof srp === "number" ? (BANDS.find((b) => srp >= b.min && srp <= b.max) || {}).id : null);

  // ---------- Search ----------
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const compact = (s) => norm(s).replace(/[^a-z0-9]/g, "");

  function indexProduct(p) {
    const t = state.typeMap[p.type];
    const fields = [p.model, p.sku, p.type, t && t.label, p.platform, p.cpu, p.cpuBrand, p.ram, p.storage, p.graphics,
      p.display, p.displayShort, p.os, p.color, p.camera, p.formFactor, p.series, p.specsRaw,
      p.extra && Object.values(p.extra).join(" "), p.tagging, p.matNo, p.segment, p.otherSpecs && p.otherSpecs.join(" ")];
    p._hay = norm(fields.filter(Boolean).join(" | "));
    p._hayC = compact(p._hay);
    p._band = bandOf(priceKey(p));
  }

  // Phrase matching first ("Ultra 7", "14-kb0105", "OmniBook 5 Flip"). Only when no product contains the
  // whole phrase do we fall back to "every word must appear" so loose word matches never dilute exact hits.
  const phraseHit = (p, nq, cq) => p._hay.includes(nq) || (cq.length >= 3 && p._hayC.includes(cq));
  let searchMode = { q: null, phrase: true };
  function prepareQuery() {
    const nq = norm(state.query), cq = compact(state.query);
    searchMode = { q: state.query, nq, cq, words: nq.split(" ").filter(Boolean),
      phrase: !nq || state.products.some((p) => phraseHit(p, nq, cq)) };
  }
  function matchesQuery(p) {
    if (!state.query) return true;
    if (searchMode.q !== state.query) prepareQuery();
    if (searchMode.phrase) return phraseHit(p, searchMode.nq, searchMode.cq);
    return searchMode.words.length > 1 && searchMode.words.every((w) => p._hay.includes(w));
  }

  // ---------- Filtering ----------
  function passes(p, skip) {
    if (!matchesQuery(p)) return false;
    if (skip !== "type" && state.fTypes.size && !state.fTypes.has(p.type)) return false;
    if (skip !== "cpu" && state.fCpu.size && !state.fCpu.has(p.cpuBrand || "Other")) return false;
    if (skip !== "price" && state.fPrice.size && !state.fPrice.has(p._band)) return false;
    return true;
  }

  function sorted(list) {
    const l = list.slice();
    if (state.sort === "srp-asc") l.sort((a, b) => (priceKey(a) ?? Infinity) - (priceKey(b) ?? Infinity));
    else if (state.sort === "srp-desc") l.sort((a, b) => (priceKey(b) ?? -Infinity) - (priceKey(a) ?? -Infinity));
    else if (state.sort === "model-asc") l.sort((a, b) => a.model.localeCompare(b.model));
    else l.sort((a, b) => a.row - b.row);
    return l;
  }

  // ---------- Rendering: filters ----------
  function checkHTML(group, value, label, count, checked) {
    return `<label class="check${count === 0 && !checked ? " is-empty" : ""}">
      <input type="checkbox" data-group="${group}" value="${esc(value)}"${checked ? " checked" : ""}>
      <span class="box">${ICONS.check}</span>
      <span class="label">${esc(label)}</span>
      <span class="n">${count}</span>
    </label>`;
  }

  function renderFilters() {
    const countBy = (skip, keyFn) => {
      const m = {};
      state.products.forEach((p) => { if (passes(p, skip)) { const k = keyFn(p); m[k] = (m[k] || 0) + 1; } });
      return m;
    };
    const tc = countBy("type", (p) => p.type);
    $("#fType").innerHTML = state.types.map((t) => checkHTML("type", t.code, t.label, tc[t.code] || 0, state.fTypes.has(t.code))).join("");

    const cc = countBy("cpu", (p) => p.cpuBrand || "Other");
    const brands = Array.from(new Set(state.products.map((p) => p.cpuBrand || "Other")));
    const order = ["Intel", "AMD", "Qualcomm", "Other"];
    brands.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    $("#fCpu").innerHTML = brands.map((b) => checkHTML("cpu", b, b, cc[b] || 0, state.fCpu.has(b))).join("");

    const pc = countBy("price", (p) => p._band);
    $("#fPrice").innerHTML = BANDS.map((b) => checkHTML("price", b.id, b.label, pc[b.id] || 0, state.fPrice.has(b.id))).join("");
  }

  function renderChips() {
    const chips = [];
    if (state.query) chips.push({ g: "q", v: "", label: `“${state.query}”` });
    state.fTypes.forEach((v) => chips.push({ g: "type", v, label: (state.typeMap[v] || {}).label || v }));
    state.fCpu.forEach((v) => chips.push({ g: "cpu", v, label: v }));
    state.fPrice.forEach((v) => chips.push({ g: "price", v, label: (BANDS.find((b) => b.id === v) || {}).label || v }));
    $("#activeChips").innerHTML = chips.map((c) =>
      `<button type="button" class="chip" data-g="${c.g}" data-v="${esc(c.v)}" aria-label="Remove filter ${esc(c.label)}">${esc(c.label)}${ICONS.x}</button>`).join("");
    const n = state.fTypes.size + state.fCpu.size + state.fPrice.size;
    const badge = $("#filterBadge");
    badge.textContent = n;
    badge.hidden = n === 0;
  }

  // ---------- Rendering: products ----------
  function heroImg(p, cls, sizes) {
    const img = p.images && p.images[0];
    if (!img) {
      return `<img class="ph" src="${PLACEHOLDER}" alt="${esc(p.model)} — image coming soon" loading="lazy" decoding="async" width="400" height="300">`;
    }
    return `<img src="${esc(img.thumb)}" srcset="${esc(img.thumb)} 360w, ${esc(img.src)} 1200w" sizes="${sizes}" alt="${esc(p.model)} — ${esc(img.angle)}" loading="lazy" decoding="async" width="360" height="${Math.round(360 * img.height / img.width)}"${cls ? ` class="${cls}"` : ""}>`;
  }

  function skuTitle(p) {
    const name = p.sku && p.model.endsWith(p.sku) ? p.model.slice(0, -p.sku.length).trim() : p.model;
    return p.sku && p.model.endsWith(p.sku)
      ? `${esc(name)} <span class="sku"><b>${esc(p.sku)}</b></span>`
      : esc(p.model);
  }

  function keySpecs(p) {
    return [
      p.cpu && { k: "cpu", label: "Processor", v: p.cpu },
      p.ram && { k: "ram", label: "Memory", v: p.ram },
      p.storage && { k: "storage", label: "Storage", v: p.storage },
      (p.displayShort || p.display) && { k: "display", label: "Display", v: p.displayShort || p.display },
    ].filter(Boolean);
  }

  function priceHTML(p) {
    const out = [];
    if (p.srp != null) out.push(`<div class="price srp"><span class="lbl">SRP</span><span class="val">${fmtPrice(p.srp)}</span></div>`);
    if (p.dp != null) out.push(`<div class="price dp"><span class="lbl">DP</span><span class="val">${fmtPrice(p.dp)}</span></div>`);
    return out.join("");
  }

  function typeLabel(p) { return (state.typeMap[p.type] || {}).label || p.type; }

  function rewardBadge(p) {
    const r = state.rewards[skuKey(p.sku)];
    return r ? `<span class="promo-badge" title="${esc(r.title)}">${ICONS.gift}${fmtPrice(r.amount)} ${esc(r.label)}</span>` : "";
  }

  function freebieHTML() {
    const f = state.freebie;
    if (!f) return "";
    return `<div class="freebie-line" title="${esc(f.caption || "")}">
      <img src="${esc(f.thumb || f.image)}" alt="" width="40" height="32" loading="lazy" decoding="async">
      <span><b>${esc(f.label || "FREE")}</b> ${esc(f.shortName || f.name)}</span>
    </div>`;
  }

  function stockHTML(p) {
    if (typeof p.qty !== "number") return "";
    const low = p.qty <= 10;
    return `<span class="stock${low ? " low" : ""}"><i></i>${low ? `Only ${fmtNum(p.qty)} unit${p.qty === 1 ? "" : "s"} left` : `${fmtNum(p.qty)} units available`}</span>`;
  }

  function salePriceHTML(p, big) {
    const save = p.dp != null && p.sale != null && p.dp > p.sale ? p.dp - p.sale : null;
    return `<div class="sale-box${big ? " big" : ""}">
        <span class="lbl">SALE PRICE</span>
        <span class="val">${fmtPrice(p.sale)}</span>
      </div>
      <div class="was">
        ${p.dp != null ? `<span>Regular DP <s>${fmtPrice(p.dp)}</s></span>` : ""}
        ${p.srp != null ? `<span>SRP ${fmtPrice(p.srp)}</span>` : ""}
        ${save ? `<span class="save">Save ${fmtPrice(save)} vs DP</span>` : ""}
      </div>`;
  }

  function ltbCardHTML(p) {
    const imgs = (p.images || []).length;
    return `<article class="card ltb-card" data-id="${esc(p.id)}">
      <button type="button" class="card-media" data-open="${esc(p.id)}" aria-label="View details for ${esc(p.model)}">
        ${heroImg(p, "", "(max-width: 720px) 50vw, 300px")}
        <span class="ltb-badge">${ICONS.clock}Last time to buy</span>
        ${rewardBadge(p)}
        ${imgs > 1 ? `<span class="img-count">${ICONS.photos}${imgs}</span>` : ""}
      </button>
      <div class="card-body">
        <span class="type-tag">${esc(typeLabel(p))}</span>
        <h3 class="card-title">${skuTitle(p)}</h3>
        ${salePriceHTML(p)}
        <ul class="spec-list">${keySpecs(p).map((s) => `<li title="${esc(s.label)}">${ICONS[s.k]}<span>${esc(s.v)}</span></li>`).join("")}</ul>
        ${stockHTML(p)}
        ${freebieHTML()}
        <button type="button" class="btn btn-outline" data-open="${esc(p.id)}">View Details</button>
      </div>
    </article>`;
  }

  function ltbRowHTML(p) {
    return `<article class="row ltb-row" data-id="${esc(p.id)}">
      <button type="button" class="row-media" data-open="${esc(p.id)}" aria-label="View details for ${esc(p.model)}">${heroImg(p, "", "112px")}</button>
      <div class="row-main">
        <span class="ltb-badge inline">${ICONS.clock}Last time to buy</span>
        <h3 class="card-title">${skuTitle(p)}</h3>
        <span class="row-meta">${esc(typeLabel(p))}${p.qty != null ? " · " : ""}${stockHTML(p)}</span>
      </div>
      <div class="row-specs">${keySpecs(p).map((s) => `<span title="${esc(s.label + ": " + s.v)}"><b>${esc(s.label)}</b>${esc(s.v)}</span>`).join("")}</div>
      <div class="row-side ltb-side">
        ${salePriceHTML(p)}
        <button type="button" class="btn btn-outline" data-open="${esc(p.id)}">View Details</button>
      </div>
    </article>`;
  }

  function cardHTML(p) {
    if (state.mode === "ltb") return ltbCardHTML(p);
    const imgs = (p.images || []).length;
    return `<article class="card" data-id="${esc(p.id)}">
      <button type="button" class="card-media" data-open="${esc(p.id)}" aria-label="View details for ${esc(p.model)}">
        ${heroImg(p, "", "(max-width: 720px) 50vw, 300px")}
        ${rewardBadge(p)}
        ${imgs > 1 ? `<span class="img-count">${ICONS.photos}${imgs}</span>` : ""}
      </button>
      <div class="card-body">
        <span class="type-tag">${esc(typeLabel(p))}</span>
        <h3 class="card-title">${skuTitle(p)}</h3>
        <ul class="spec-list">${keySpecs(p).map((s) => `<li title="${esc(s.label)}">${ICONS[s.k]}<span>${esc(s.v)}</span></li>`).join("")}</ul>
        ${freebieHTML()}
        <div class="prices">${priceHTML(p)}</div>
        <button type="button" class="btn btn-outline" data-open="${esc(p.id)}">View Details</button>
      </div>
    </article>`;
  }

  function rowHTML(p) {
    if (state.mode === "ltb") return ltbRowHTML(p);
    const rw = rewardBadge(p);
    return `<article class="row" data-id="${esc(p.id)}">
      <button type="button" class="row-media" data-open="${esc(p.id)}" aria-label="View details for ${esc(p.model)}">${heroImg(p, "", "112px")}</button>
      <div class="row-main">
        <span class="type-tag">${esc(typeLabel(p))}</span>
        <h3 class="card-title">${skuTitle(p)}</h3>
        <div class="row-extras">${rw}${freebieHTML()}</div>
      </div>
      <div class="row-specs">${keySpecs(p).map((s) => `<span title="${esc(s.label + ": " + s.v)}"><b>${esc(s.label)}</b>${esc(s.v)}</span>`).join("")}</div>
      <div class="row-side">
        ${priceHTML(p)}
        <button type="button" class="btn btn-outline" data-open="${esc(p.id)}">View Details</button>
      </div>
    </article>`;
  }

  function renderProducts() {
    const list = sorted(state.products.filter((p) => passes(p)));
    const box = $("#products");
    box.className = "products " + state.view;
    box.innerHTML = list.slice(0, PAGE_SIZE_ALL).map(state.view === "list" ? rowHTML : cardHTML).join("");
    $("#emptyState").hidden = list.length !== 0;
    box.hidden = list.length === 0;
    const total = state.products.length;
    $("#resultCount").innerHTML = list.length === total
      ? `<strong>${list.length}</strong> product${list.length === 1 ? "" : "s"}`
      : `<strong>${list.length}</strong> of ${total} products match`;
    $("#filtersApply").textContent = `Show ${list.length} result${list.length === 1 ? "" : "s"}`;
  }

  function renderHeader() {
    const one = state.fTypes.size === 1 ? state.typeMap[Array.from(state.fTypes)[0]] : null;
    $("#priceLegend").textContent = state.mode === "ltb" ? "(Sale price)" : "(SRP)";
    $("#sort").options[1].textContent = state.mode === "ltb" ? "Sale price: Low to high" : "SRP: Low to high";
    $("#sort").options[2].textContent = state.mode === "ltb" ? "Sale price: High to low" : "SRP: High to low";
    $("#ltbNotice").hidden = state.mode !== "ltb";
    if (state.mode === "ltb") {
      $("#catEyebrow").textContent = "Last time to buy";
      $("#catTitle").textContent = "Last-time-buy models";
      $("#catDesc").textContent = "Secure your stock while available. These models are on their final purchase cycle — once current stocks are sold, they will no longer be offered.";
    } else if (one) {
      $("#catEyebrow").textContent = "HP Notebooks · " + one.code;
      $("#catTitle").textContent = one.label;
      $("#catDesc").textContent = one.description;
    } else if (state.fTypes.size > 1) {
      $("#catEyebrow").textContent = "HP Notebooks";
      $("#catTitle").textContent = Array.from(state.fTypes).map((c) => (state.typeMap[c] || {}).label || c).join(" + ");
      $("#catDesc").textContent = "Showing products from the selected types.";
    } else {
      $("#catEyebrow").textContent = "HP Notebooks";
      $("#catTitle").textContent = "All Products";
      $("#catDesc").textContent = "Browse every model on the current pricelist. Search, filter and compare SRP and DP at a glance.";
    }
    // nav active state
    const route = currentRoute();
    $$(".nav-link").forEach((a) => {
      const k = a.dataset.nav;
      let on = false;
      if (route.view === "sites" || route.view === "promos" || route.view === "ltb") on = k === route.view;
      else if (k === "all") on = state.fTypes.size === 0;
      else if (!["sites", "promos", "ltb"].includes(k)) on = state.fTypes.size === 1 && state.fTypes.has(k);
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  function render() {
    renderFilters();
    renderChips();
    renderProducts();
    renderHeader();
  }

  function renderNav() {
    const counts = {};
    const main = state.ds.main;
    main.products.forEach((p) => { counts[p.type] = (counts[p.type] || 0) + 1; });
    const ltbN = state.ds.ltb ? state.ds.ltb.products.length : 0;
    $("#navLtbCount").textContent = ltbN || "";
    $("#navPromoCount").textContent = state.promos.length || "";
    $("#navList").innerHTML =
      `<li><a class="nav-link" href="#/" data-nav="all">All Products <span class="count">${main.products.length}</span></a></li>` +
      main.types.map((t) => `<li><a class="nav-link" href="#/type/${encodeURIComponent(t.code)}" data-nav="${esc(t.code)}">${esc(t.label)} <span class="count">${counts[t.code] || 0}</span></a></li>`).join("");
  }

  function renderSites() {
    $("#sitesGrid").innerHTML = state.sites.map((s) => {
      let host = "";
      try { host = new URL(s.url).host; } catch (e) { host = s.url; }
      return `<article class="site-card">
        <span class="site-icon">${ICONS[s.icon] || ICONS.link}</span>
        <img class="site-hp" src="assets/logos/hp-logo.png" alt="" width="26" height="26" aria-hidden="true">
        <h2>${esc(s.name)}</h2>
        <p>${esc(s.description)}</p>
        <span class="site-url">${esc(host)}</span>
        <a class="btn btn-primary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Open Site ${ICONS.external}<span class="visually-hidden"> (opens in a new tab)</span></a>
      </article>`;
    }).join("");
  }

  // ---------- Promos ----------
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function parseDate(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; }
  function fmtRange(a, b) {
    const s = parseDate(a), e = parseDate(b);
    if (!s || !e) return [a, b].filter(Boolean).join(" – ");
    if (s.y === e.y && s.m === e.m) return `${MONTHS[s.m]} ${s.d}–${e.d}, ${s.y}`;
    if (s.y === e.y) return `${MONTHS[s.m]} ${s.d} – ${MONTHS[e.m]} ${e.d}, ${s.y}`;
    return `${MONTHS[s.m]} ${s.d}, ${s.y} – ${MONTHS[e.m]} ${e.d}, ${e.y}`;
  }
  function fmtDate(a) { const s = parseDate(a); return s ? `${MONTHS[s.m]} ${s.d}, ${s.y}` : a; }
  function todayISO() { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }

  function productLink(p, mode) {
    return (mode === "ltb" ? "#/ltb/product/" : "#/product/") + encodeURIComponent(p.id);
  }

  function renderPromos() {
    const f = state.freebie;
    const today = todayISO();
    const cards = state.promos.map((pr) => {
      const upcoming = pr.start && pr.start > today;
      // models on our lists that are in the official eligible products table
      const onList = [];
      (pr.eligible || []).forEach((el) => {
        if (!el.sku) return;
        ["main", "ltb"].forEach((m) => {
          const ds = state.ds[m]; if (!ds) return;
          ds.products.filter((p) => skuKey(p.sku) === el.sku).forEach((p) => onList.push({ p, m, reward: el.reward }));
        });
      });
      onList.sort((a, b) => b.reward - a.reward);
      const href = pr.url || "";
      return `<article class="promo-card${href ? " clickable" : ""}" ${href ? `data-href="${esc(href)}"` : ""} id="promo-${esc(pr.id)}">
        <div class="promo-media">
          ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true">` : `<button type="button" class="promo-zoom" data-flyer="${esc(pr.id)}" aria-label="Enlarge ${esc(pr.name)} promo image">`}
            <img src="${esc(pr.image)}" alt="${esc(pr.imageAlt || pr.name)}" loading="lazy" decoding="async">
          ${href ? "</a>" : `<span class="enlarge-hint">${ICONS.zoom}Enlarge</span></button>`}
        </div>
        <div class="promo-body">
          <span class="promo-name">${esc(pr.name)}${upcoming ? ' <em class="soon">Starts soon</em>' : ""}</span>
          <h2>${esc(pr.title || pr.name)}</h2>
          <div class="promo-period"><span class="lbl">Promo period</span><span class="val">${esc(fmtRange(pr.start, pr.end))}</span></div>
          <p class="promo-caption">${esc(pr.caption || "")}</p>
          ${(pr.highlights || []).length ? `<ul class="promo-points">${pr.highlights.map((h) => `<li>${ICONS.check}<span>${esc(h)}</span></li>`).join("")}</ul>` : ""}
          ${onList.length ? `<details class="eligible"><summary>${onList.length} eligible model${onList.length === 1 ? "" : "s"} on our lists</summary>
            <ul>${onList.map((o) => `<li><a href="${productLink(o.p, o.m)}"><span>${esc(o.p.model)}${o.m === "ltb" ? ' <em class="mini-ltb">LTB</em>' : ""}</span><b>${fmtPrice(o.reward)}</b></a></li>`).join("")}</ul>
          </details>` : ""}
          <div class="promo-actions">
            ${href ? `<a class="btn btn-primary" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(pr.cta || "View Promo Details")} ${ICONS.external}<span class="visually-hidden"> (opens in a new tab)</span></a>`
                   : `<button type="button" class="btn btn-outline" data-flyer="${esc(pr.id)}">${ICONS.zoom} View promo flyer</button>`}
          </div>
          ${pr.permit ? `<p class="promo-fine">${esc(pr.permit)}</p>` : ""}
        </div>
      </article>`;
    }).join("");
    $("#promosGrid").innerHTML = (f ? `<aside class="freebie-banner">
        <img src="${esc(f.image)}" alt="${esc(f.name)}" width="160" height="128" loading="lazy">
        <div><span class="freebie-tag">${esc(f.label || "FREE")} with every laptop</span>
        <h2>${esc(f.name)}${f.sku ? ` <small>${esc(f.sku)}</small>` : ""}</h2>
        <p>${esc(f.caption || "")}</p></div>
      </aside>` : "") + (cards || '<p class="empty-note">No active promotions right now.</p>');
  }

  // ---------- Details modal + gallery ----------
  let current = null; // { p, idx }
  let lastFocus = null;

  function inclusionsHTML(p) {
    const r = state.rewards[skuKey(p.sku)];
    const f = state.freebie;
    if (!r && !f) return "";
    return `<div class="inclusions">
      <h3 class="detail-h">Promos &amp; inclusions</h3>
      ${f ? `<div class="incl freebie"><img src="${esc(f.thumb || f.image)}" alt="" width="56" height="45"><div><b>${esc(f.label || "FREE")}: ${esc(f.name)}${f.sku ? ` (${esc(f.sku)})` : ""}</b><span>${esc(f.caption || "")}</span></div></div>` : ""}
      ${r ? `<a class="incl reward" href="#/promos">${ICONS.gift}<div><b>${fmtPrice(r.amount)} ${esc(r.label)} reward</b><span>${esc(r.title)} · ${esc(r.period)}</span></div></a>` : ""}
    </div>`;
  }

  function specRows(p) {
    const rows = [
      ["Model", p.model],
      ["SKU", p.sku],
      ["Material no.", p.matNo],
      ["Tagging", p.tagging],
      ["Type", p.type ? `${typeLabel(p)}${typeLabel(p) !== p.type ? " (" + p.type + ")" : ""}` : null],
      ["Platform", p.platform],
      ["Series / form factor", p.series],
      ["Processor", p.cpu],
      ["Processor brand", p.cpuBrand],
      ["Memory", p.ram],
      ["Storage", p.storage],
      ["Graphics", p.graphics],
      ["Display", p.display],
      ["Operating system / software", p.os],
      ["Color", p.color],
      ["Camera", p.camera],
      ["Power adapter", p.adapter],
      ["Warranty", p.warranty],
      ["Care Pack / service", p.carePack],
      ["Stock", typeof p.qty === "number" ? fmtNum(p.qty) + " units" : null],
    ];
    (p.otherSpecs || []).forEach((o) => rows.push(["Other", o]));
    if (p.extra) Object.entries(p.extra).forEach(([k, v]) => rows.push([k, v]));
    return rows.filter((r) => r[1] != null && r[1] !== "");
  }

  function galleryHTML(p, idx) {
    const imgs = p.images || [];
    if (!imgs.length) return `<div class="gallery-main"><img class="ph" src="${PLACEHOLDER}" alt="${esc(p.model)} — image coming soon"></div>`;
    const img = imgs[idx];
    return `<div class="gallery-main" id="gMain">
        <button type="button" class="zoom" id="gZoom" aria-label="Enlarge image: ${esc(img.angle)}">
          <img src="${esc(img.src)}" alt="${esc(p.model)} — ${esc(img.angle)}" width="${img.width}" height="${img.height}">
        </button>
        <span class="angle">${esc(img.angle)} · ${idx + 1}/${imgs.length}</span>
        <span class="enlarge-hint">${ICONS.zoom}Enlarge</span>
        ${imgs.length > 1 ? `<button type="button" class="g-nav g-prev" data-step="-1" aria-label="Previous image">${ICONS.left}</button>
        <button type="button" class="g-nav g-next" data-step="1" aria-label="Next image">${ICONS.right}</button>` : ""}
      </div>
      ${imgs.length > 1 ? `<div class="thumbs" role="list">${imgs.map((im, i) => `<button type="button" class="thumb" role="listitem" data-idx="${i}" aria-label="Show ${esc(im.angle)} image" aria-current="${i === idx}"><img src="${esc(im.thumb)}" alt="" loading="lazy" decoding="async"></button>`).join("")}</div>` : ""}`;
  }

  function openDetail(id, push = true) {
    const p = state.products.find((x) => x.id === id);
    if (!p) return;
    if (!current) lastFocus = document.activeElement;
    current = { p, idx: 0 };
    const rows = specRows(p);
    $("#detailBody").innerHTML = `
      <div class="detail-gallery" id="gallery">${galleryHTML(p, 0)}</div>
      <div class="detail-info">
        <div>
          <span class="type-tag">${esc(typeLabel(p))}</span>
          <h2 id="dmTitle">${p.sku && p.model.endsWith(p.sku) ? esc(p.model.slice(0, -p.sku.length)) + `<span class="nowrap">${esc(p.sku)}</span>` : esc(p.model)}</h2>
        </div>
        <div class="detail-sku">SKU <b>${esc(p.sku)}</b>
          <button type="button" class="copy-btn" id="copyModel" data-copy="${esc(p.model)}">${ICONS.copy}<span>Copy model</span></button>
        </div>
        ${p.sale != null ? `<div class="ltb-detail">
            <span class="ltb-badge inline">${ICONS.clock}Last time to buy</span>
            <p>Last chance to order this model. Once existing stocks are sold, it will no longer be available.</p>
            ${salePriceHTML(p, true)}
            ${stockHTML(p)}
          </div>` : `<div class="price-panel">
          ${p.srp != null ? `<div class="price-box srp"><span class="lbl">SRP <span class="sub">Suggested retail price</span></span><span class="val">${fmtPrice(p.srp)}</span></div>` : ""}
          ${p.dp != null ? `<div class="price-box dp"><span class="lbl">DP <span class="sub">Dealer price</span></span><span class="val">${fmtPrice(p.dp)}</span></div>` : ""}
        </div>`}
        ${inclusionsHTML(p)}
        <h3 class="detail-h">Specifications</h3>
        <table class="spec-table"><tbody>
          ${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}
        </tbody></table>
        ${p.specsRaw ? `<details class="raw"><summary>Full specification text (from pricelist)</summary><p>${esc(p.specsRaw)}</p></details>` : ""}
      </div>`;
    const modal = $("#detailModal");
    modal.hidden = false;
    document.body.classList.add("no-scroll");
    $(".modal-panel", modal).scrollTop = 0;
    $(".modal-close", modal).focus({ preventScroll: true });
    if (push) {
      const r = currentRoute();
      const base = r.view === "type" ? "#/type/" + encodeURIComponent(r.type) : r.view === "ltb" ? "#/ltb/" : r.view === "promos" ? "#/promos/" : "#/";
      history.pushState({ product: id }, "", base + (base.endsWith("/") ? "" : "/") + "product/" + encodeURIComponent(id));
    }
  }

  function setImage(idx) {
    if (!current) return;
    const n = (current.p.images || []).length;
    if (!n) return;
    current.idx = (idx + n) % n;
    $("#gallery").innerHTML = galleryHTML(current.p, current.idx);
  }

  function closeDetail(fromHistory) {
    if ($("#detailModal").hidden) return;
    $("#detailModal").hidden = true;
    document.body.classList.remove("no-scroll");
    current = null;
    if (!fromHistory && /\/product\//.test(location.hash)) {
      history.pushState({}, "", location.hash.replace(/\/?product\/[^/]*$/, "") || "#/");
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // lightbox
  let lbPromo = null; // { src, alt, caption } when showing a promo image
  function openLightbox() {
    if (!current || !(current.p.images || []).length) return;
    lbPromo = null;
    updateLightbox();
    $("#lightbox").hidden = false;
    $("#lbClose").focus();
  }
  function openPromoLightbox(pr) {
    lbFocus = document.activeElement;
    lbPromo = { src: pr.image, alt: pr.imageAlt || pr.name, caption: pr.name + " · " + fmtRange(pr.start, pr.end) };
    const lb = $("#lbImg");
    lb.src = lbPromo.src; lb.alt = lbPromo.alt;
    $("#lbCaption").textContent = lbPromo.caption;
    $("#lbPrev").hidden = true; $("#lbNext").hidden = true;
    $("#lightbox").hidden = false;
    $("#lbClose").focus();
  }
  let lbFocus = null;
  function updateLightbox() {
    const img = current.p.images[current.idx];
    const lb = $("#lbImg");
    lb.src = img.src;
    lb.alt = `${current.p.model} — ${img.angle}`;
    $("#lbCaption").textContent = `${img.angle} · ${current.idx + 1} of ${current.p.images.length}`;
    const multi = current.p.images.length > 1;
    $("#lbPrev").hidden = !multi;
    $("#lbNext").hidden = !multi;
  }
  function lbStep(d) { if (lbPromo || !current) return; setImage(current.idx + d); updateLightbox(); }
  function closeLightbox() {
    $("#lightbox").hidden = true;
    if (lbPromo) { lbPromo = null; if (lbFocus && lbFocus.focus) lbFocus.focus(); return; }
    const z = $("#gZoom"); if (z) z.focus();
  }

  // swipe helper
  function swipe(el, onLeft, onRight) {
    let x0 = null, y0 = null;
    el.addEventListener("touchstart", (e) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0, dy = t.clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) (dx < 0 ? onLeft : onRight)();
    }, { passive: true });
  }

  // ---------- Routing ----------
  function currentRoute() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const parts = h.split("/").filter(Boolean);
    const r = { view: "all", type: null, product: null };
    if (parts[0] === "sites") r.view = "sites";
    else if (parts[0] === "promos") r.view = "promos";
    else if (parts[0] === "ltb") r.view = "ltb";
    else if (parts[0] === "type" && parts[1]) { r.view = "type"; r.type = parts[1]; }
    const pi = parts.indexOf("product");
    if (pi >= 0 && parts[pi + 1]) r.product = parts[pi + 1];
    return r;
  }

  let lastRouteKey = null;
  function applyRoute() {
    const r = currentRoute();
    const sites = r.view === "sites" || r.view === "promos";
    $("#catalogView").hidden = sites;
    $("#sitesView").hidden = r.view !== "sites";
    $("#promosView").hidden = r.view !== "promos";
    if (!sites) setMode(r.view === "ltb" ? "ltb" : "main");
    document.body.classList.toggle("mode-ltb", !sites && state.mode === "ltb");
    const key = r.view + ":" + (r.type || "");
    if (!sites && key !== lastRouteKey && r.view !== "ltb") {
      // only reset the type selection when the page (All / a Type tab) actually changes,
      // so opening and closing product details never loses the user's filters
      state.fTypes.clear();
      if (r.view === "type" && state.typeMap[r.type]) state.fTypes.add(r.type);
    }
    if (sites && key !== lastRouteKey) window.scrollTo(0, 0);
    lastRouteKey = key;
    render();
    if (r.product) {
      if (!state.products.some((p) => p.id === r.product)) setMode(r.product.startsWith("ltb-") ? "ltb" : "main");
      openDetail(r.product, false);
    } else closeDetail(true);
    closeMenu();
  }

  function setTypesFromFilters() {
    // keep the URL in sync when a single type is chosen from the filter panel
    const r = currentRoute();
    if (r.view === "sites" || r.view === "promos" || r.view === "ltb") return;
    const target = state.fTypes.size === 1 ? "#/type/" + encodeURIComponent(Array.from(state.fTypes)[0]) : "#/";
    if (location.hash !== target && !(target === "#/" && (location.hash === "" || location.hash === "#"))) {
      history.replaceState({}, "", target);
    }
    lastRouteKey = (state.fTypes.size === 1 ? "type:" + Array.from(state.fTypes)[0] : "all:");
  }

  // ---------- Menu & filter drawer (mobile) ----------
  function closeMenu() {
    $("#primaryNav").classList.remove("open");
    $("#menuToggle").setAttribute("aria-expanded", "false");
    $("#menuToggle").setAttribute("aria-label", "Open menu");
  }
  function openFilters() {
    $("#filters").classList.add("open");
    $("#filtersBackdrop").hidden = false;
    $("#filtersToggle").setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
  }
  function closeFilters() {
    $("#filters").classList.remove("open");
    $("#filtersBackdrop").hidden = true;
    $("#filtersToggle").setAttribute("aria-expanded", "false");
    if ($("#detailModal").hidden) document.body.classList.remove("no-scroll");
  }

  function setView(v) {
    state.view = v;
    store.set("hpPricelist.view", v);
    $$(".vt-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
    renderProducts();
  }

  function clearAll() {
    state.query = "";
    $("#search").value = "";
    $("#searchClear").hidden = true;
    state.fTypes.clear(); state.fCpu.clear(); state.fPrice.clear();
    setTypesFromFilters();
    render();
  }

  // ---------- Events ----------
  function bind() {
    let t = null;
    $("#search").addEventListener("input", (e) => {
      const v = e.target.value;
      $("#searchClear").hidden = !v;
      clearTimeout(t);
      t = setTimeout(() => {
        state.query = v.trim();
        const v0 = currentRoute().view;
        if ((v0 === "sites" || v0 === "promos") && state.query) { history.pushState({}, "", "#/"); applyRoute(); return; }
        render();
      }, 80);
    });
    $("#search").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.target.value = ""; e.target.dispatchEvent(new Event("input")); } });
    $("#searchClear").addEventListener("click", () => { const s = $("#search"); s.value = ""; s.dispatchEvent(new Event("input")); s.focus(); });

    $("#filters").addEventListener("change", (e) => {
      const i = e.target;
      if (!i.matches("input[type=checkbox]")) return;
      const set = { type: state.fTypes, cpu: state.fCpu, price: state.fPrice }[i.dataset.group];
      if (i.checked) set.add(i.value); else set.delete(i.value);
      if (i.dataset.group === "type") setTypesFromFilters();
      render();
    });
    $("#clearFilters").addEventListener("click", () => { state.fTypes.clear(); state.fCpu.clear(); state.fPrice.clear(); setTypesFromFilters(); render(); });
    $("#emptyReset").addEventListener("click", clearAll);
    $("#activeChips").addEventListener("click", (e) => {
      const c = e.target.closest(".chip");
      if (!c) return;
      const g = c.dataset.g, v = c.dataset.v;
      if (g === "q") { $("#search").value = ""; $("#searchClear").hidden = true; state.query = ""; }
      else ({ type: state.fTypes, cpu: state.fCpu, price: state.fPrice })[g].delete(v);
      if (g === "type") setTypesFromFilters();
      render();
    });

    $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderProducts(); });
    $$(".vt-btn").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

    $("#products").addEventListener("click", (e) => {
      const b = e.target.closest("[data-open]");
      if (b) openDetail(b.dataset.open);
    });

    // modal
    $("#detailModal").addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) return closeDetail();
      const th = e.target.closest(".thumb");
      if (th) return setImage(Number(th.dataset.idx));
      const nav = e.target.closest(".g-nav");
      if (nav) return setImage(current.idx + Number(nav.dataset.step));
      if (e.target.closest("#gZoom")) return openLightbox();
      const cp = e.target.closest("#copyModel");
      if (cp) {
        const text = cp.dataset.copy;
        const done = () => { cp.querySelector("span").textContent = "Copied"; setTimeout(() => { cp.querySelector("span").textContent = "Copy model"; }, 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {});
      }
    });
    swipe($("#detailModal"), () => { if (current && e_inGallery) setImage(current.idx + 1); }, () => { if (current && e_inGallery) setImage(current.idx - 1); });

    // lightbox
    $("#lbClose").addEventListener("click", closeLightbox);
    $("#lbPrev").addEventListener("click", () => lbStep(-1));
    $("#lbNext").addEventListener("click", () => lbStep(1));
    $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox" || e.target.classList.contains("lb-figure")) closeLightbox(); });
    swipe($("#lightbox"), () => lbStep(1), () => lbStep(-1));

    document.addEventListener("keydown", (e) => {
      if (!$("#lightbox").hidden) {
        if (e.key === "Escape") closeLightbox();
        else if (e.key === "ArrowLeft") lbStep(-1);
        else if (e.key === "ArrowRight") lbStep(1);
        return;
      }
      if (!$("#detailModal").hidden) {
        if (e.key === "Escape") closeDetail();
        else if (e.key === "ArrowLeft") setImage(current.idx - 1);
        else if (e.key === "ArrowRight") setImage(current.idx + 1);
        else if (e.key === "Tab") trapFocus(e, $("#detailModal .modal-panel"));
        return;
      }
      if ($("#filters").classList.contains("open") && e.key === "Escape") closeFilters();
      if (e.key === "/" && document.activeElement !== $("#search") && !/input|select|textarea/i.test(document.activeElement.tagName)) {
        e.preventDefault(); $("#search").focus();
      }
    });

    // menu & drawer
    $("#menuToggle").addEventListener("click", () => {
      const open = !$("#primaryNav").classList.contains("open");
      $("#primaryNav").classList.toggle("open", open);
      $("#menuToggle").setAttribute("aria-expanded", String(open));
      $("#menuToggle").setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    $("#filtersToggle").addEventListener("click", openFilters);
    $("#filtersClose").addEventListener("click", closeFilters);
    $("#filtersApply").addEventListener("click", closeFilters);
    $("#filtersBackdrop").addEventListener("click", closeFilters);

    $("#promosGrid").addEventListener("click", (e) => {
      const flyer = e.target.closest("[data-flyer]");
      if (flyer) { const pr = state.promos.find((x) => x.id === flyer.dataset.flyer); if (pr) openPromoLightbox(pr); return; }
      if (e.target.closest("a, button")) return;
      const card = e.target.closest(".promo-card[data-href]");
      if (card) window.open(card.dataset.href, "_blank", "noopener");
    });

    window.addEventListener("hashchange", applyRoute);
    window.addEventListener("popstate", applyRoute);
  }

  // only swipe the gallery when the touch started on the gallery image
  let e_inGallery = false;
  document.addEventListener("touchstart", (e) => { e_inGallery = !!e.target.closest(".gallery-main"); }, { passive: true, capture: true });

  function trapFocus(e, root) {
    const f = $$('button, [href], input, select, summary, [tabindex]:not([tabindex="-1"])', root).filter((el) => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function showSkeleton() {
    $("#products").innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"><div class="sk-img"></div><div class="sk-line"></div><div class="sk-line short"></div></div>').join("");
  }

  // ---------- Boot ----------
  async function loadJSON(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(url + " → HTTP " + res.status);
    return res.json();
  }

  async function init() {
    showSkeleton();
    $$(".vt-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view)));
    bind();
    try {
      const [data, types, sites, ltb, promos] = await Promise.all([
        loadJSON("data/products.json"),
        loadJSON("data/types.json").catch(() => []),
        loadJSON("data/sites.json").catch(() => []),
        loadJSON("data/ltb.json").catch(() => null),
        loadJSON("data/promos.json").catch(() => null),
      ]);
      state.meta = data;
      state.products = data.products || [];
      // types: keep Excel order, fall back to neutral text for any code missing from types.json
      const known = {};
      types.forEach((t) => { known[t.code] = t; });
      const codes = [];
      state.products.forEach((p) => { if (!codes.includes(p.type)) codes.push(p.type); });
      state.types = codes.map((c) => known[c] || { code: c, label: c, description: `HP ${c} models currently on the pricelist.` });
      state.types.forEach((t) => { state.typeMap[t.code] = t; });
      state.sites = sites;
      state.products.forEach(indexProduct);
      state.ds.main = { products: state.products, types: state.types, typeMap: state.typeMap };

      // Last-time-buy dataset (own Excel)
      if (ltb && ltb.products && ltb.products.length) {
        const lt = { products: ltb.products, types: [], typeMap: {} };
        ltb.products.forEach((p) => { if (!lt.typeMap[p.type]) { const t = { code: p.type, label: p.type, description: "" }; lt.typeMap[p.type] = t; lt.types.push(t); } });
        state.ds.ltb = lt;
        const keep = { products: state.products, typeMap: state.typeMap };
        state.typeMap = lt.typeMap; lt.products.forEach(indexProduct); state.typeMap = keep.typeMap;
      } else {
        $$('[data-nav="ltb"]').forEach((a) => { a.parentElement && a.parentElement.tagName === "LI" ? a.parentElement.remove() : a.remove(); });
      }

      // Promotions (hidden automatically after their end date) + standard freebie
      const today = todayISO();
      state.freebie = promos && promos.freebie ? promos.freebie : null;
      state.promos = ((promos && promos.promos) || []).filter((pr) => !pr.end || pr.end >= today);
      state.promos.forEach((pr) => (pr.eligible || []).forEach((el) => {
        if (!el.sku) return;
        const k = skuKey(el.sku), cur = state.rewards[k];
        if (!cur || el.reward > cur.amount) state.rewards[k] = { amount: el.reward, label: pr.rewardLabel || pr.name, title: pr.title || pr.name, period: fmtRange(pr.start, pr.end), promoId: pr.id };
      }));
      renderPromos();

      renderNav();
      renderSites();
      const d = data.generatedAt ? new Date(data.generatedAt) : null;
      $("#footerMeta").textContent = `Data source: ${data.sourceFile || "pricelist"} · ${state.products.length} products` +
        (ltb ? ` · ${ltb.sourceFile} · ${ltb.count} last-time-buy models` : "") +
        (d && !isNaN(d) ? ` · updated ${d.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}` : "");
      applyRoute();
    } catch (err) {
      console.error(err);
      $("#products").innerHTML = "";
      $("#resultCount").textContent = "";
      const empty = $("#emptyState");
      empty.hidden = false;
      $("h3", empty).textContent = "Could not load the product data";
      $("p", empty).innerHTML = location.protocol === "file:"
        ? "Browsers block data files when a page is opened directly from disk. Open it through GitHub Pages or a local web server (see README)."
        : "Please refresh the page. If it keeps happening, check that <code>data/products.json</code> was uploaded.";
      $("#emptyReset").hidden = true;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
