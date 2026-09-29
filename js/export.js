/* HP Product Pricelist — downloads (PDF price list, PDF catalog, Excel, Excel with photos).
   Everything is generated in the browser from what the site already shows; nothing is uploaded.
   Libraries (jsPDF, ExcelJS) and the Inter font are self-hosted in assets/vendor and only
   loaded the first time someone downloads a file. */
(function () {
  "use strict";

  const VENDOR = "assets/vendor/";
  const BLUE = [2, 74, 216], INK = [26, 26, 26], MUTED = [107, 111, 118], LINE = [228, 230, 234];
  const ORANGE = [232, 93, 4], RED = [200, 16, 46], GREEN = [10, 122, 61], AMBER = [161, 92, 0];
  const AV_COLOR = { ok: GREEN, warn: AMBER, low: RED, info: BLUE, out: MUTED, neutral: MUTED };
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const $ = (s, r = document) => r.querySelector(s);
  const API = () => window.HPPL;
  const peso = (v) => (typeof v === "number" ? "₱" + Math.round(v).toLocaleString("en-PH") : "");
  const round = (v) => (typeof v === "number" ? Math.round(v) : null);
  const today = () => { const d = new Date(); return { iso: d.toISOString().slice(0, 10), text: `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` }; };

  // ---------- lazy loading ----------
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  async function fetchBase64(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    let bin = ""; const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // Images are redrawn on a canvas as JPEG/PNG (PDF and Excel can't embed WebP/SVG)
  // and keep their real width/height so they are always placed in proportion.
  const imgCache = {};
  // Photos have transparent backgrounds, so the JPEG is flattened onto the colour it will sit on.
  function loadImage(url, { png = false, max = 480, bg = "#ffffff" } = {}) {
    const key = url + "|" + png + "|" + max + "|" + bg;
    if (!imgCache[key]) imgCache[key] = new Promise((res) => {
      const im = new Image();
      im.onload = () => {
        const w0 = im.naturalWidth || 400, h0 = im.naturalHeight || 300;
        const k = Math.min(1, max / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const g = c.getContext("2d");
        if (!png) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
        g.drawImage(im, 0, 0, w, h);
        const data = c.toDataURL(png ? "image/png" : "image/jpeg", 0.86);
        res({ data, w, h, type: png ? "PNG" : "JPEG" });
      };
      im.onerror = () => res(null);
      im.src = url;
    });
    return imgCache[key];
  }
  const photoUrl = (p) => (p.images && p.images[0] ? p.images[0].thumb : API().placeholder);
  const fit = (iw, ih, bw, bh) => { const k = Math.min(bw / iw, bh / ih); return { w: iw * k, h: ih * k }; };

  // ---------- the rows every format shares ----------
  function rowsFor(list, mode) {
    const a = API();
    const order = [];
    list.forEach((p) => { if (!order.includes(p.type)) order.push(p.type); });
    list = order.flatMap((t) => list.filter((p) => p.type === t));
    return list.map((p) => {
      const av = a.availability(p);
      const r = a.reward(p);
      const promoDp = a.hasPromoDp(p) ? p.promoDp : null;
      return {
        p, mode,
        type: a.typeLabel(p) || p.type || "",
        tagging: p.tagging || "",
        partNo: p.partNo || "", matNo: p.matNo || "",
        model: p.model || "", sku: p.sku || "",
        name: p.sku && p.model.endsWith(p.sku) ? p.model.slice(0, -p.sku.length).trim() : p.model,
        cpu: p.cpu || "", ram: p.ram || "", storage: p.storage || "",
        display: p.displayShort || p.display || "", displayFull: p.display || p.displayShort || "",
        graphics: p.graphics || "", os: p.os || "", color: p.color || "", warranty: p.warranty || "",
        other: (p.otherSpecs || []).join("; "),
        srp: round(p.srp), dp: round(p.dp), promoDp: round(promoDp), sale: round(p.sale),
        save: p.sale != null && p.dp != null && p.dp > p.sale ? round(p.dp - p.sale) : null,
        avail: av ? av.label : "", availLevel: av ? av.level : "neutral",
        freebie: a.hasFreebie(p) && a.context().freebie ? (a.context().freebie.shortName || a.context().freebie.name) : "",
        promo: r ? `${peso(r.amount)} ${r.label} (${r.period})` : "",
      };
    });
  }
  const specLines = (r) => [r.cpu, r.ram, r.storage, r.display].filter(Boolean);

  // ---------- dialog ----------
  let opts = { scope: "screen", prices: "dealer" };
  function openDialog() {
    const a = API(); if (!a) return;
    const c = a.context();
    const noun = c.mode === "ltb" ? "last-time-buy models" : "products";
    const scope = $("#dlScope");
    const nScreen = c.onScreen.length, nAll = c.all.length;
    const screenLabel = c.filtered ? `What you see now — ${c.scopeLabel}${c.query ? ` · search “${c.query}”` : ""}` : `What you see now — ${c.scopeLabel}`;
    const same = !c.filtered && nScreen === nAll;
    scope.innerHTML = same
      ? `<label class="dl-opt"><input type="radio" name="dlScope" value="all" checked><span><b>${c.mode === "ltb" ? "Whole last-time-buy list" : "Whole pricelist"}</b><small>All ${nAll} ${noun} — pick a tab, filter or search first to download only some</small></span></label>`
      : `<label class="dl-opt"><input type="radio" name="dlScope" value="screen"${nScreen ? " checked" : " disabled"}><span><b>${escapeHTML(screenLabel)}</b><small>${nScreen} ${nScreen === 1 ? "model" : "models"} (current tab, filters and search)</small></span></label>` +
      `<label class="dl-opt"><input type="radio" name="dlScope" value="all"${nScreen ? "" : " checked"}><span><b>${c.mode === "ltb" ? "Whole last-time-buy list" : "Whole pricelist"}</b><small>All ${nAll} ${noun}</small></span></label>`;
    $("#dlDealerNote").textContent = c.mode === "ltb" ? "Sale price, regular DP and SRP" : "SRP, DP and Promo DP";
    $("#dlLead").textContent = c.mode === "ltb"
      ? "Save the last-time-buy list as a PDF or Excel file to share or print."
      : "Save the pricelist as a PDF or Excel file to share or print.";
    const pr = document.querySelector(`input[name="dlPrices"][value="${opts.prices}"]`); if (pr) pr.checked = true;
    setStatus("");
    const m = $("#dlModal"); m.hidden = false; document.body.classList.add("no-scroll");
    lastFocus = document.activeElement;
    $(".dl-format", m).focus({ preventScroll: true });
  }
  let lastFocus = null;
  function closeDialog() {
    const m = $("#dlModal"); if (m.hidden) return;
    m.hidden = true;
    if ($("#detailModal").hidden) document.body.classList.remove("no-scroll");
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function setStatus(t, busy) {
    const s = $("#dlStatus"); s.textContent = t; s.classList.toggle("busy", !!busy);
  }
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function selection() {
    const a = API(), c = a.context();
    const scope = (document.querySelector('input[name="dlScope"]:checked') || {}).value || "screen";
    const prices = (document.querySelector('input[name="dlPrices"]:checked') || {}).value || "dealer";
    opts = { scope, prices };
    const list = scope === "all" ? c.all : c.onScreen;
    const label = scope === "all" ? (c.mode === "ltb" ? "Last-time-buy" : "All products") : (c.mode === "ltb" ? "Last-time-buy" : c.scopeLabel) + (c.filtered && scope === "screen" && c.query ? " (search)" : "");
    return { mode: c.mode, list, dealer: prices === "dealer", label, copy: prices === "dealer" ? "Dealer copy" : "Customer copy" };
  }
  function fileName(sel, ext) {
    const clean = (s) => s.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim();
    return clean(`HP Pricelist - ${sel.label} - ${sel.dealer ? "Dealer" : "Customer"} - ${today().iso}`) + "." + ext;
  }
  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function run(format, btn) {
    const sel = selection();
    if (!sel.list.length) { setStatus("There are no products to download — change the tab, filters or search."); return; }
    const buttons = document.querySelectorAll(".dl-format");
    buttons.forEach((b) => (b.disabled = true)); btn.classList.add("working");
    try {
      setStatus(`Preparing ${sel.list.length} ${sel.list.length === 1 ? "model" : "models"}…`, true);
      let blob, name;
      if (format === "pdf-list" || format === "pdf-catalog") {
        await loadScript(VENDOR + "jspdf.umd.min.js");
        blob = format === "pdf-list" ? await pdfList(sel) : await pdfCatalog(sel);
        name = fileName(Object.assign({}, sel, { label: sel.label + (format === "pdf-catalog" ? " catalog" : "") }), "pdf");
      } else {
        await loadScript(VENDOR + "exceljs.min.js");
        blob = await excel(sel, format === "xlsx-photos");
        name = fileName(Object.assign({}, sel, { label: sel.label + (format === "xlsx-photos" ? " with photos" : "") }), "xlsx");
      }
      saveBlob(blob, name);
      setStatus(`Downloaded “${name}”.`);
      window.__lastExport = { name, size: blob.size, format };
    } catch (e) {
      console.error(e);
      setStatus("Sorry, the file could not be created. Check your internet connection and try again.");
    } finally {
      buttons.forEach((b) => (b.disabled = false)); btn.classList.remove("working");
    }
  }

  // ---------- PDF helpers ----------
  let fontsReady = null;
  async function newDoc(orientation) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
    if (!fontsReady) fontsReady = Promise.all([fetchBase64(VENDOR + "Inter-Regular.ttf"), fetchBase64(VENDOR + "Inter-Bold.ttf")]);
    const [reg, bold] = await fontsReady;
    doc.addFileToVFS("Inter-Regular.ttf", reg); doc.addFont("Inter-Regular.ttf", "Inter", "normal");
    doc.addFileToVFS("Inter-Bold.ttf", bold); doc.addFont("Inter-Bold.ttf", "Inter", "bold");
    doc.setFont("Inter", "normal");
    doc.setProperties({ title: "HP Product Pricelist", author: "Iontech", subject: "HP notebook pricelist", creator: "HP Product Pricelist (Iontech)" });
    return doc;
  }
  const font = (doc, size, style = "normal", color = INK) => { doc.setFont("Inter", style); doc.setFontSize(size); doc.setTextColor.apply(doc, color); };
  function clampLines(doc, text, width, max) {
    let lines = doc.splitTextToSize(String(text || ""), width);
    if (lines.length > max) {
      lines = lines.slice(0, max);
      let last = lines[max - 1];
      while (last.length > 1 && doc.getTextWidth(last + "…") > width) last = last.slice(0, -1);
      lines[max - 1] = last.replace(/\s+$/, "") + "…";
    }
    return lines;
  }
  async function logos() {
    const [hp, ion] = await Promise.all([loadImage("assets/logos/hp-logo.png", { png: true, max: 256 }), loadImage("assets/logos/iontech-logo.png", { png: true, max: 600 })]);
    return { hp, ion };
  }
  function header(doc, L, W, M, title, sub) {
    const y = M;
    const hpH = 11;
    if (L.hp) doc.addImage(L.hp.data, "PNG", M, y, hpH, hpH);
    // Iontech wordmark sized to match the "p" of the HP logo (about 38% of the logo height)
    if (L.ion) { const ih = hpH * 0.38, iw = ih * L.ion.w / L.ion.h; doc.addImage(L.ion.data, "PNG", M + hpH + 3, y + (hpH - ih) / 2, iw, ih); }
    const tx = M + hpH + 3 + (L.ion ? hpH * 0.38 * L.ion.w / L.ion.h : 0) + 5;
    doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.3); doc.line(tx - 2.5, y + 1.5, tx - 2.5, y + hpH - 1.5);
    font(doc, 13, "bold"); doc.text(title, tx, y + 5.2);
    font(doc, 7.5, "normal", MUTED); doc.text(sub, tx, y + 9.6);
    doc.setDrawColor.apply(doc, BLUE); doc.setLineWidth(0.6); doc.line(M, y + hpH + 3, W - M, y + hpH + 3);
    return y + hpH + 6;
  }
  function footers(doc, W, H, M, note) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.line(M, H - M + 1, W - M, H - M + 1);
      font(doc, 6.3, "normal", MUTED);
      doc.text(note, M, H - M + 4.2, { maxWidth: W - 2 * M - 22 });
      doc.text(`Page ${i} of ${n}`, W - M, H - M + 4.2, { align: "right" });
    }
  }
  const NOTE_DEALER = "Prices in Philippine Peso, rounded to the whole peso. SRP = suggested retail price; DP = dealer price. For Iontech dealers only. Prices, specifications and availability are subject to change; confirm stock with your account manager.";
  const NOTE_CUSTOMER = "Prices in Philippine Peso (SRP = suggested retail price), rounded to the whole peso. Prices, specifications and availability are subject to change without notice.";

  // ---------- PDF: compact price list (A4 landscape) ----------
  async function pdfList(sel) {
    const doc = await newDoc("landscape");
    const W = 297, H = 210, M = 10, CW = W - 2 * M;
    const L = await logos();
    const rows = rowsFor(sel.list, sel.mode);
    setStatus("Adding product photos…", true);
    const photos = await Promise.all(rows.map((r, i) => loadImage(photoUrl(r.p), { max: 240, bg: i % 2 ? "#fafbfc" : "#ffffff" })));
    const ltb = sel.mode === "ltb";

    // column plan: widths are proportional weights, scaled to the page width
    const cols = [
      { k: "photo", t: "", w: 7 },
      { k: "model", t: "Model", w: 26 },
      { k: "specs", t: "Key specifications", w: 30 },
      { k: "avail", t: "Availability", w: 9 },
      { k: "incl", t: "Inclusions", w: 15 },
      { k: "srp", t: "SRP", w: 9, num: true },
    ];
    if (sel.dealer) {
      if (ltb) cols.push({ k: "dp", t: "Regular DP", w: 9, num: true }, { k: "sale", t: "Sale price", w: 10, num: true });
      else cols.push({ k: "dp", t: "DP", w: 9, num: true }, { k: "promo", t: "Promo DP", w: 10, num: true });
    }
    const tw = cols.reduce((s, c) => s + c.w, 0);
    let x = M; cols.forEach((c) => { c.x = x; c.w = (c.w / tw) * CW; x += c.w; });

    const title = ltb ? "HP Notebooks — Last-time-buy list" : "HP Notebook Pricelist";
    const sub = `${sel.label} · ${sel.copy} · ${rows.length} ${rows.length === 1 ? "model" : "models"} · ${today().text}`;
    const ROW = 17.5, TH = 7, GH = 6.5, PAD = 1.8;
    let y;
    const tableHead = () => {
      doc.setFillColor(243, 246, 252); doc.rect(M, y, CW, TH, "F");
      font(doc, 6.8, "bold", MUTED);
      cols.forEach((c) => c.t && doc.text(c.t.toUpperCase(), c.num ? c.x + c.w - PAD : c.x + PAD, y + 4.6, { align: c.num ? "right" : "left", charSpace: 0.15 }));
      y += TH;
    };
    const newPage = (first) => { if (!first) doc.addPage(); y = header(doc, L, W, M, title, sub); tableHead(); };
    newPage(true);
    const bottom = H - M - 4;
    let lastType = null;
    rows.forEach((r, i) => {
      const group = r.type;
      const needGroup = group !== lastType;
      if (y + ROW + (needGroup ? GH : 0) > bottom) { newPage(false); lastType = null; }
      if (group !== lastType) {
        doc.setFillColor(...(ltb ? [253, 236, 239] : [233, 240, 254])); doc.rect(M, y, CW, GH, "F");
        font(doc, 7.6, "bold", ltb ? RED : BLUE); doc.text(group.toUpperCase(), M + PAD, y + 4.4, { charSpace: 0.2 });
        y += GH; lastType = group;
      }
      if (i % 2) { doc.setFillColor(250, 251, 252); doc.rect(M, y, CW, ROW, "F"); }
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.15); doc.line(M, y + ROW, M + CW, y + ROW);
      const ph = photos[i];
      cols.forEach((c) => {
        const cx = c.x + PAD, cw = c.w - 2 * PAD;
        if (c.k === "photo" && ph) {
          const f = fit(ph.w, ph.h, c.w - 2, ROW - 2.5);
          doc.addImage(ph.data, ph.type, c.x + (c.w - f.w) / 2, y + (ROW - f.h) / 2, f.w, f.h);
        } else if (c.k === "model") {
          font(doc, 7.6, "bold"); const nl = clampLines(doc, r.name, cw, 2);
          doc.text(nl, cx, y + 4.4, { lineHeightFactor: 1.15 });
          let yy = y + 4.4 + nl.length * 3.1;
          font(doc, 7.2, "bold", BLUE); doc.text(r.sku, cx, yy); yy += 3.2;
          font(doc, 6.2, "normal", MUTED); doc.text([r.partNo && "PN " + r.partNo, sel.dealer && r.matNo && "Mat " + r.matNo].filter(Boolean).join("  ·  "), cx, yy);
        } else if (c.k === "specs") {
          font(doc, 6.7, "normal", INK);
          specLines(r).slice(0, 4).forEach((s, k) => doc.text(clampLines(doc, s, cw, 1), cx, y + 4 + k * 3.35));
        } else if (c.k === "avail" && r.avail) {
          font(doc, 7, "bold", AV_COLOR[r.availLevel] || MUTED); doc.text(clampLines(doc, r.avail, cw, 2), cx, y + ROW / 2 + 1);
        } else if (c.k === "incl") {
          font(doc, 6.3, "normal", INK);
          const parts = [];
          if (r.freebie) parts.push("FREE " + r.freebie);
          if (r.promo) parts.push(r.promo);
          let yy = y + 4.2;
          parts.forEach((t) => { const ls = clampLines(doc, t, cw, 2); doc.text(ls, cx, yy, { lineHeightFactor: 1.1 }); yy += ls.length * 2.6 + 0.9; });
        } else if (c.num) {
          const rx = c.x + c.w - PAD, my = y + ROW / 2 + 1.2;
          if (c.k === "srp") { font(doc, 8.4, "bold", INK); doc.text(peso(r.srp), rx, my, { align: "right" }); }
          if (c.k === "dp") {
            const struck = ltb || r.promoDp != null;
            font(doc, struck ? 7.2 : 8.4, "bold", struck ? MUTED : BLUE); doc.text(peso(r.dp), rx, my, { align: "right" });
            if (struck) { const tw2 = doc.getTextWidth(peso(r.dp)); doc.setDrawColor.apply(doc, MUTED); doc.setLineWidth(0.25); doc.line(rx - tw2, my - 1, rx, my - 1); }
            if (ltb && r.dp != null) { const tw2 = doc.getTextWidth(peso(r.dp)); doc.setDrawColor.apply(doc, MUTED); doc.setLineWidth(0.25); doc.line(rx - tw2, my - 1.1, rx, my - 1.1); }
          }
          if (c.k === "promo") {
            if (r.promoDp != null) {
              font(doc, 8.8, "bold", ORANGE); doc.text(peso(r.promoDp), rx, my - 0.6, { align: "right" });
              font(doc, 5.8, "bold", GREEN); doc.text("Save " + peso(r.dp - r.promoDp), rx, my + 2.6, { align: "right" });
            } else { font(doc, 8, "normal", [190, 194, 200]); doc.text("—", rx, my, { align: "right" }); }
          }
          if (c.k === "sale" && r.sale != null) {
            font(doc, 9, "bold", RED); doc.text(peso(r.sale), rx, my - 0.6, { align: "right" });
            if (r.save) { font(doc, 5.8, "bold", GREEN); doc.text("Save " + peso(r.save), rx, my + 2.6, { align: "right" }); }
          }
        }
      });
      y += ROW;
    });
    footers(doc, W, H, M, sel.dealer ? NOTE_DEALER : NOTE_CUSTOMER);
    return doc.output("blob");
  }

  // ---------- PDF: product catalog (A4 portrait, 2 x 3 cards) ----------
  async function pdfCatalog(sel) {
    const doc = await newDoc("portrait");
    const W = 210, H = 297, M = 10;
    const L = await logos();
    const rows = rowsFor(sel.list, sel.mode);
    setStatus("Adding product photos…", true);
    const photos = await Promise.all(rows.map((r) => loadImage(photoUrl(r.p), { max: 560, bg: "#f5f6f8" })));
    const ltb = sel.mode === "ltb";
    const title = ltb ? "HP Notebooks — Last-time-buy catalog" : "HP Notebook Catalog";
    const sub = `${sel.label} · ${sel.copy} · ${rows.length} ${rows.length === 1 ? "model" : "models"} · ${today().text}`;
    const COLS = 2, ROWS = 3, GAP = 5;
    const top0 = M + 11 + 6;
    const cw = (W - 2 * M - GAP * (COLS - 1)) / COLS;
    const ch = (H - top0 - M - 6 - GAP * (ROWS - 1)) / ROWS;
    const IMGH = ch * 0.33;
    rows.forEach((r, i) => {
      const slot = i % (COLS * ROWS);
      if (slot === 0) { if (i) doc.addPage(); header(doc, L, W, M, title, sub); }
      const cx = M + (slot % COLS) * (cw + GAP), cy = top0 + Math.floor(slot / COLS) * (ch + GAP);
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.3); doc.roundedRect(cx, cy, cw, ch, 3, 3, "S");
      doc.setFillColor(245, 246, 248); doc.roundedRect(cx + 0.3, cy + 0.3, cw - 0.6, IMGH, 2.7, 2.7, "F");
      const ph = photos[i];
      if (ph) { const f = fit(ph.w, ph.h, cw - 12, IMGH - 6); doc.addImage(ph.data, ph.type, cx + (cw - f.w) / 2, cy + (IMGH - f.h) / 2 + 0.3, f.w, f.h); }
      if (ltb) { doc.setFillColor(...RED); doc.roundedRect(cx + 3, cy + 3, 27, 5, 1.2, 1.2, "F"); font(doc, 5.8, "bold", [255, 255, 255]); doc.text("LAST TIME TO BUY", cx + 16.5, cy + 6.4, { align: "center" }); }
      else if (r.promoDp != null && sel.dealer) { doc.setFillColor(...ORANGE); doc.roundedRect(cx + 3, cy + 3, 18, 5, 1.2, 1.2, "F"); font(doc, 5.8, "bold", [255, 255, 255]); doc.text("PROMO DP", cx + 12, cy + 6.4, { align: "center" }); }
      const px = cx + 4, pw = cw - 8;
      let y = cy + IMGH + 5;
      font(doc, 6.3, "bold", MUTED); doc.text(r.type.toUpperCase(), px, y, { charSpace: 0.2 });
      if (r.avail) { font(doc, 6.3, "bold", AV_COLOR[r.availLevel] || MUTED); doc.text(r.avail, cx + cw - 4, y, { align: "right" }); }
      y += 4.3;
      font(doc, 9, "bold"); const nl = clampLines(doc, r.name, pw, 2); doc.text(nl, px, y, { lineHeightFactor: 1.15 }); y += nl.length * 3.7;
      font(doc, 8, "bold", BLUE); doc.text(r.sku, px, y); y += 3.6;
      font(doc, 6.3, "normal", MUTED); doc.text([r.partNo && "PN " + r.partNo, sel.dealer && r.matNo && "Mat " + r.matNo].filter(Boolean).join("  ·  "), px, y); y += 4.2;
      // prices pinned to the bottom of the card so every card lines up; specs and extras fill the space above
      const by = cy + ch - 4;
      const extras = [r.freebie && "FREE " + r.freebie, r.promo].filter(Boolean).slice(0, 2);
      const extraTop = by - 11 - extras.length * 2.9;
      const specs = specLines(r);
      const room = Math.max(1, Math.floor((extraTop - y + 0.6) / 3.3));
      font(doc, 6.9, "normal", INK);
      specs.slice(0, Math.min(4, room)).forEach((s) => { doc.text(clampLines(doc, s, pw, 1), px, y); y += 3.3; });
      font(doc, 5.9, "normal", MUTED);
      extras.forEach((t, k) => doc.text(clampLines(doc, t, pw, 1), px, extraTop + 2.2 + k * 2.9));
      doc.setDrawColor.apply(doc, LINE); doc.setLineWidth(0.2); doc.line(px, by - 9.5, px + pw, by - 9.5);
      const cells = [];
      cells.push({ l: "SRP", v: peso(r.srp), c: INK });
      if (sel.dealer) {
        if (ltb) { cells.push({ l: "Regular DP", v: peso(r.dp), c: MUTED, strike: true }); cells.push({ l: "Sale price", v: peso(r.sale), c: RED }); }
        else if (r.promoDp != null) { cells.push({ l: "DP", v: peso(r.dp), c: MUTED, strike: true }); cells.push({ l: "Promo DP", v: peso(r.promoDp), c: ORANGE }); }
        else cells.push({ l: "DP", v: peso(r.dp), c: BLUE });
      }
      const cwid = pw / cells.length;
      cells.forEach((c, k) => {
        const x0 = px + k * cwid;
        font(doc, 5.8, "bold", MUTED); doc.text(c.l.toUpperCase(), x0, by - 5.6, { charSpace: 0.15 });
        font(doc, c.strike ? 8 : 10, "bold", c.c); doc.text(c.v, x0, by - 0.8);
        if (c.strike) { const tw = doc.getTextWidth(c.v); doc.setDrawColor.apply(doc, c.c); doc.setLineWidth(0.25); doc.line(x0, by - 1.9, x0 + tw, by - 1.9); }
      });
    });
    footers(doc, W, H, M, sel.dealer ? NOTE_DEALER : NOTE_CUSTOMER);
    return doc.output("blob");
  }

  // ---------- Excel ----------
  async function excel(sel, withPhotos) {
    const ltb = sel.mode === "ltb";
    const rows = rowsFor(sel.list, sel.mode);
    const wb = new window.ExcelJS.Workbook();
    wb.creator = "HP Product Pricelist (Iontech)"; wb.created = new Date();
    const ws = wb.addWorksheet(ltb ? "Last-time-buy" : "Pricelist", { views: [{ state: "frozen", ySplit: 5, xSplit: withPhotos ? 3 : 2 }] });
    // columns: widths are in Excel characters and sized to their content
    const C = [];
    if (withPhotos) C.push({ k: "photo", h: "Photo", w: 16 });
    C.push({ k: "type", h: "Type", w: 16 });
    C.push({ k: "model", h: "Model", w: 40 }, { k: "sku", h: "SKU", w: 14 }, { k: "partNo", h: "Part No.", w: 11 });
    if (sel.dealer) C.push({ k: "matNo", h: "Material No.", w: 15 });
    C.push({ k: "cpu", h: "Processor", w: 30 }, { k: "ram", h: "Memory", w: 24 }, { k: "storage", h: "Storage", w: 20 }, { k: "displayFull", h: "Display", w: 32 });
    if (!ltb) C.push({ k: "graphics", h: "Graphics", w: 20 }, { k: "os", h: "OS / Software", w: 22 }, { k: "color", h: "Color", w: 20 }, { k: "warranty", h: "Warranty", w: 12 });
    else C.push({ k: "other", h: "Other specs", w: 24 });
    C.push({ k: "avail", h: "Availability", w: 13 });
    C.push({ k: "srp", h: "SRP", w: 12, money: true });
    if (sel.dealer) {
      if (ltb) C.push({ k: "dp", h: "Regular DP", w: 12, money: true }, { k: "sale", h: "Sale price", w: 12, money: true }, { k: "save", h: "Save vs DP", w: 11, money: true });
      else C.push({ k: "dp", h: "DP", w: 12, money: true }, { k: "promoDp", h: "Promo DP", w: 12, money: true });
    }
    C.push({ k: "freebie", h: "Freebie", w: 30 }, { k: "promo", h: "Promo", w: 40 });
    ws.columns = C.map((c) => ({ key: c.k, width: c.w }));
    const last = C.length;

    // title block
    const hex = (a) => "FF" + a.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase();
    ws.mergeCells(1, 1, 1, last); ws.mergeCells(2, 1, 2, last); ws.mergeCells(3, 1, 3, last);
    ws.getCell(1, 1).value = ltb ? "HP Notebooks — Last-time-buy list" : "HP Notebook Pricelist";
    ws.getCell(1, 1).font = { name: "Arial", size: 16, bold: true, color: { argb: hex(BLUE) } };
    ws.getRow(1).height = 26;
    ws.getCell(2, 1).value = `Iontech · ${sel.label} · ${sel.copy} · ${rows.length} ${rows.length === 1 ? "model" : "models"} · ${today().text}`;
    ws.getCell(2, 1).font = { name: "Arial", size: 10, color: { argb: "FF555B66" } };
    ws.getCell(3, 1).value = sel.dealer ? NOTE_DEALER : NOTE_CUSTOMER;
    ws.getCell(3, 1).font = { name: "Arial", size: 8.5, italic: true, color: { argb: "FF6B6F76" } };
    ws.getCell(3, 1).alignment = { wrapText: true, vertical: "top" };
    ws.getRow(3).height = 24;

    const HR = 5;
    const head = ws.getRow(HR);
    C.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.h;
      cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ltb ? hex(RED) : hex(BLUE) } };
      cell.alignment = { vertical: "middle", horizontal: c.money ? "right" : "left", wrapText: true };
    });
    head.height = 22;
    ws.autoFilter = { from: { row: HR, column: 1 }, to: { row: HR, column: last } };

    const PHOTO_ROW_PT = 66;           // row height (points) when photos are included
    const border = { style: "thin", color: { argb: "FFE4E6EA" } };
    rows.forEach((r, i) => {
      const rowNo = HR + 1 + i;
      const row = ws.getRow(rowNo);
      C.forEach((c, j) => {
        const cell = row.getCell(j + 1);
        let v = c.k === "photo" ? "" : r[c.k];
        if (c.money) v = v == null ? null : v;
        cell.value = v === "" ? null : v;
        cell.font = { name: "Arial", size: 10, color: { argb: "FF1A1A1A" } };
        cell.alignment = { vertical: "middle", horizontal: c.money ? "right" : "left", wrapText: !c.money && c.k !== "sku" && c.k !== "partNo" && c.k !== "matNo" };
        cell.border = { top: border, left: border, bottom: border, right: border };
        if (i % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F9FC" } };
        if (c.money) cell.numFmt = '"₱"#,##0';
        if (c.k === "model" || c.k === "sku") cell.font = Object.assign({}, cell.font, { bold: true });
        if (c.k === "avail" && r.avail) cell.font = Object.assign({}, cell.font, { bold: true, color: { argb: hex(AV_COLOR[r.availLevel] || MUTED) } });
        if (c.k === "promoDp" && r.promoDp != null) cell.font = Object.assign({}, cell.font, { bold: true, color: { argb: hex(ORANGE) } });
        if (c.k === "sale") cell.font = Object.assign({}, cell.font, { bold: true, color: { argb: hex(RED) } });
        if (c.k === "dp" && ((!ltb && r.promoDp != null) || ltb)) cell.font = Object.assign({}, cell.font, { strike: true, color: { argb: "FF6B6F76" } });
        if (c.k === "dp" && !ltb && r.promoDp == null) cell.font = Object.assign({}, cell.font, { bold: true, color: { argb: hex(BLUE) } });
        if (c.k === "srp") cell.font = Object.assign({}, cell.font, { bold: true });
      });
      row.height = withPhotos ? PHOTO_ROW_PT : 32;
    });

    if (withPhotos) {
      setStatus("Adding product photos…", true);
      const photos = await Promise.all(rows.map((r, i) => loadImage(photoUrl(r.p), { max: 320, bg: i % 2 ? "#f7f9fc" : "#ffffff" })));
      // cell box in pixels: column width (chars) ≈ 7px each + padding; row height pt → px
      const boxW = Math.floor(C[0].w * 7 + 5) - 10, boxH = Math.floor(PHOTO_ROW_PT * 96 / 72) - 10;
      photos.forEach((ph, i) => {
        if (!ph) return;
        const f = fit(ph.w, ph.h, boxW, boxH);
        const id = wb.addImage({ base64: ph.data, extension: "jpeg" });
        const colOff = ((boxW + 10 - f.w) / 2) / (C[0].w * 7 + 5);
        const rowOff = ((boxH + 10 - f.h) / 2) / (PHOTO_ROW_PT * 96 / 72);
        ws.addImage(id, { tl: { col: 0 + colOff, row: HR + i + rowOff }, ext: { width: Math.round(f.w), height: Math.round(f.h) }, editAs: "oneCell" });
      });
    }
    ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${HR}:${HR}`, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } };
    ws.headerFooter = { oddFooter: "&L&8HP Notebook Pricelist · Iontech&R&8Page &P of &N" };
    const buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  // ---------- wiring ----------
  document.addEventListener("click", (e) => {
    if (e.target.closest("#downloadOpen")) { e.preventDefault(); openDialog(); return; }
    if (e.target.closest("[data-dlclose]")) { closeDialog(); return; }
    const f = e.target.closest(".dl-format");
    if (f && !f.disabled) run(f.dataset.format, f);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#dlModal").hidden) { e.stopPropagation(); closeDialog(); } }, true);
})();
