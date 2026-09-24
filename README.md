# HP Product Pricelist (Iontech)

A static, responsive product catalog and pricelist for HP notebooks, built for Iontech sales teams and dealers.
It is plain HTML, CSS and JavaScript with no backend, database or build server, so it runs directly on **GitHub Pages**.

- **Source of truth:** `source/Current Pricelist - HPNB.xlsx` and `source/Last-time-buy models.xlsx`
- **Generated data:** `data/products.json` (models, specs, SRP, DP, images) and `data/types.json` (type labels and descriptions)
- **Product photos:** `assets/images/products/` (WebP, generated from the *Image assets* folder)

---

## 1. Deploy to GitHub Pages

### Option A: GitHub website (no software needed)

1. Sign in at <https://github.com> and click **New repository**.
2. Name it, for example `hp-pricelist`. Choose **Private** or **Public** (see the note on privacy below), then click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Open this project folder on your computer, select **everything inside it** (`index.html`, `assets`, `css`, `data`, `js`, `source`, `tools`, `README.md`, `.nojekyll`) and drag it into the browser window.
   - GitHub's web uploader takes up to **100 files at a time**. This project has more than that because of the product photos. If GitHub complains, upload the `assets` folder in a second round with **Add file → Upload files**.
   - `.nojekyll` is a hidden file. If you can't see it, turn on *View → Show → Hidden items* in Windows Explorer. It is optional, but it makes Pages publish the files exactly as they are.
5. Click **Commit changes**.
6. Go to **Settings → Pages**.
7. Under **Build and deployment → Source**, choose **Deploy from a branch**. Set **Branch** to `main` and folder to `/ (root)`, then click **Save**.
8. Wait about 1–2 minutes and refresh the page. Your site address appears at the top, for example:
   `https://<your-username>.github.io/hp-pricelist/`

### Option B: GitHub Desktop or Git (recommended for regular updates)

```bash
git init
git add .
git commit -m "HP product pricelist site"
git branch -M main
git remote add origin https://github.com/<your-username>/hp-pricelist.git
git push -u origin main
```

Then turn on Pages as described in steps 6–8 above.

> **Privacy:** A GitHub Pages site can be opened by **anyone who has the link**, even if the repository is private (only GitHub Enterprise Cloud can restrict Pages to signed-in members). This site shows **dealer prices (DP)**, so only share the link with people who should see them. The page includes `noindex` so search engines are asked not to list it.

---

## 2. Update prices or products

The site never hard-codes products. Everything comes from the Excel file through one script.

1. Replace `source/Current Pricelist - HPNB.xlsx` with the new pricelist. Keep the same column headers: **Platform, Type, Model, Specs, SRP, DP** (Qty is ignored).
2. Put the product photos in a folder, named **`<exact Model from Excel> - <Angle>.png`**, for example:
   `HP OmniBook 5 AI PC 14-kf0002TU - Front.png`
   Supported angles are shown in this order: Front, Front Right, Front Left, Rear Left, Rear Right, Left Profile, Right Profile, Open. Any other angle name also works.
3. Run the script (requires Python 3):

   ```bash
   pip install openpyxl pillow
   python tools/build_data.py --excel "source/Current Pricelist - HPNB.xlsx" --images "C:/path/to/Image assets"
   ```

   - If only prices or specs changed, you can leave out `--images`. The existing photos are kept.
   - The script prints any product without photos, and any photo it could not match to a model. Photos are only attached when the file name starts with the model's exact name, so a photo can never land on the wrong SKU.
4. Upload or commit the changed files (`data/`, `assets/images/products/`, `source/`). GitHub Pages republishes automatically within a minute or two.

### Type names and descriptions

Navigation tabs are created automatically from the Excel **Type** column. A new Type code gets a neutral description the first time the script runs. To change the display name or description, edit `data/types.json`:

```json
{ "code": "OB3", "label": "OmniBook 3", "description": "Designed for everyday productivity…" }
```

`code` must match the Type value in Excel exactly. Your edits are kept the next time the script runs.

### Promos

Edit `data/promos.json`. Each promo has an `id`, `title`, `start` and `end` (`YYYY-MM-DD`), `caption`, `highlights`, `image` (put the file in `assets/images/promos/`) and `url`.

- Set `url` to `null` when there is no official page (like Home Credit). The card then only opens the flyer.
- A promo hides itself automatically after its `end` date. To run a new promo, add a new entry.
- `eligible` (GCash) is the official list of qualifying models and rewards. Models on our pricelist that match a SKU get a small reward badge.
- `freebie` is the standard freebie shown beside every laptop (currently the HP Everyday 16-inch Laptop Briefcase, A08JTAA). Remove the `freebie` block to hide it everywhere.

### Last-time-buy

1. Replace `source/Last-time-buy models.xlsx` and keep the same column headers.
2. Run:

   ```bash
   python tools/build_data.py --only-ltb --ltb-images "C:/path/to/LTB photos"
   ```

   Photos use the same naming as above: `<exact Model from Excel> - <Angle>.png`. Leave out `--ltb-images` to keep the existing photos.
3. Commit `data/ltb.json`, `assets/images/ltb/` and `source/`.

SALE PRICE is shown as the main price, with SRP struck through. Stock is shown from the **Qty** column (a low-stock warning appears at 10 units or fewer). Models without a photo show a grey laptop silhouette. At the moment that applies to 16-H1015TX, 14-FP0061TU, 14-FP0060TU and 14-FE0028QU.

### HP Related Sites

Edit `data/sites.json` to add or change links. The available `icon` values are `catalog`, `service`, `warranty` and `link`.

---

## 3. Preview on your own computer

Browsers block the data files when `index.html` is opened by double-clicking. To preview locally, start a small web server in the project folder:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000/>.

---

## 4. Features

- **Search** as you type: model, SKU (e.g. `14-kb0105TU` or `kb0105`), processor (`Ultra 7`, `Ryzen 5`), type, color, display and more
- **Filters** that combine: Type, Processor (Intel/AMD, detected from the CPU text) and SRP price bands (below ₱40,000, then ₱10,000 steps up to ₱100,000+). Each filter shows how many products match, and there's a **Clear all** button.
- **Grid view and List view**: your choice is remembered for the browser session, and switching keeps your search and filters
- **Sorting**: pricelist order, SRP low→high or high→low, or model name
- **Product details**: every spec from the Excel, SRP and DP shown prominently, and a gallery with thumbnails, swipe on touch screens, an enlarge (lightbox) view, and keyboard ← → / Esc
- **Shareable links**: for example `#/type/OBX` for a category or `#/type/OBX/product/14-kb0105tu` for one product
- **Promos tab**: active promos with validity dates, flyer view, a link to the official mechanics (when there is one), and the list of eligible models
- **Last-time-buy tab**: its own filters (Type, Processor, Sale price), with the sale price shown most prominently, the original price struck through, and stock from the Excel
- **Standard freebie**: shown on every laptop card and in the product details
- **Mobile layout**: hamburger menu, full-width search, filters in a bottom drawer, two-column cards, and large touch targets

## 5. Project structure

```text
/
├── index.html
├── .nojekyll
├── assets/
│   ├── images/products/   # optimized WebP photos + thumbnails (generated)
│   ├── images/ltb/        # Last-time-buy photos (generated)
│   ├── images/promos/     # promo flyers
│   ├── logos/             # HP and Iontech logos (supplied)
│   └── fonts/             # Inter variable font (SIL Open Font License)
├── css/styles.css
├── js/app.js
├── data/
│   ├── products.json      # generated from the Excel file
│   ├── types.json         # Type labels + descriptions
│   ├── ltb.json           # generated from Last-time-buy models.xlsx
│   ├── promos.json        # promos + standard freebie (edit by hand)
│   └── sites.json         # HP Related Sites
├── source/                # the Excel pricelist (source of truth)
└── tools/
    ├── build_data.py      # Excel + photos → products.json + WebP images
    └── test_site.py       # automated checks (optional)
```

## 6. Notes

- **Font:** Forma DJR is a commercial typeface, and no web licence was available for this project. The site uses **Inter** (free, SIL Open Font License), which is included in the project so it loads fast and needs no third-party requests. If you buy a Forma DJR web licence, add the `.woff2` files to `assets/fonts/` and an `@font-face` rule named `"Forma DJR"` at the top of `css/styles.css`. The site will use it automatically.
- **Prices:** SRP and DP are shown exactly as they appear in the Excel file, formatted in Philippine pesos (₱).
- **Stand-in photos:** a few photos were the closest match available on the HP DAM (see `tools/build_data.py` output and the product's `sourceFile` in `products.json`):
  - The *OmniBook 5 Flip 14-fp0162TU* photos show the OLED/AI version of the same Powder Pink chassis.
  - The *OmniBook X Flip 14-kc0079AU / kc0039AU / kc0078AU* use Intel-version photos for the Front and Front Right angles.
- **Optional automated tests:** `pip install playwright openpyxl && playwright install chromium`, start the local server, then run `python tools/test_site.py http://localhost:8000/`.
