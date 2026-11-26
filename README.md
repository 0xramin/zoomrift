# Zoomrift

[English](#english) | [فارسی](#فارسی)

Live Demo: **https://0xramin.github.io/zoomrift/**

---

<a id="english"></a>

## English

**Zoomrift** is a zero-build, pure static HTML/CSS/JS + WebGL infinite zoom viewer ready for **GitHub Pages**.

### Features
- **6 Seamless Infinite Zoom Artworks**: `The Zoomquilt`, `Zoomquilt 2`, `Arkadia`, `Infinite Flowers`, `Hydromeda`, and `Organic City`.
- **On-Demand WebP Streaming & LRU Cache**: Loads active layers first and prefetches upcoming frames in the zoom direction without loading all 376 WebP tiles into VRAM at once.
- **2-Pass WebGL Post-Processing**: Offscreen framebuffer pipeline with 6 real-time shader effects (`Original`, `Hue`, `Fade`, `Prism`, `Swirl`, `Acid`), plus `Brightness`, `Contrast`, `Saturation`, and `Random Center Offset`.
- **Bilingual & Responsive UI**: Instant switch between **English (LTR)** and **Persian (RTL)** with bundled `Vazirmatn` font, mobile-first touch targets, and grab-to-scroll horizontal strips.
- **Interactive Controls**:
  - Drag vertically on the canvas to dynamically zoom in/out; release to return smoothly to slider speed.
  - Mouse wheel over the canvas scrubs layers; wheel or mouse-drag on the bottom strips scrolls horizontally.
  - Tap/click canvas (or press `H`) to hide/show controls.
  - Keyboard shortcuts: `Space` (play/pause), `L` (language), `←` / `→` (switch artwork), `↑` / `↓` (adjust speed), `R` (randomize), `F` (fullscreen).
  - URL parameters: e.g. `?quilt=zq2&fx=prism&speed=1.5&lang=fa`.

### Run Locally
Serve the root directory with any static HTTP server:
```bash
python -m http.server 8080
```
Then open `http://localhost:8080`.

### Artwork Credits
- **The Zoomquilt (2004)** — Nikolaus Baumgarten & Contributors
- **Zoomquilt 2 (2007)** — Nikolaus Baumgarten & Contributors
- **Arkadia (2015)** — Sophia Schomberg & Nikolaus Baumgarten
- **Infinite Flowers** — Nikolaus Baumgarten
- **Hydromeda** — Sophia Schomberg
- **Organic City (2026)** — Sophia Schomberg & Nikolaus Baumgarten

---

<a id="فارسی"></a>

<div dir="rtl">

## فارسی

**زوم‌ریفت (Zoomrift)** یک نمایشگر زوم بی‌نهایت کاملاً استاتیک (HTML/CSS/JS خالص + WebGL) است که بدون نیاز به هیچ ابزار بیلد یا بک‌اند، آماده‌ی اجرا روی **GitHub Pages** است.

### امکانات
- **۶ اثر هنری زوم بی‌نهایت**: `زوم‌کوئیلت ۱`، `زوم‌کوئیلت ۲`، `آرکادیا`، `گل‌های بی‌پایان`، `هیدرومدا` و `شهر ارگانیک`.
- **بارگذاری جریانی WebP و کش هوشمند (LRU)**: ابتدا لایه‌های قابل‌مشاهده را لود کرده و فریم‌های بعدی را در جهت حرکت زوم پیش‌بارگذاری می‌کند تا حافظه‌ی گرافیکی (VRAM) اشغال نشود.
- **پردازش دو مرحله‌ای با شیدرهای WebGL**: اجرای ۶ افکت بلادرنگ (`اصلی`، `چرخش رنگ`، `محو رنگی`، `منشوری`، `گرداب` و `اسیدی`) همراه با تنظیم `روشنایی`، `کنتراست`، `اشباع رنگ` و `مرکز تصادفی`.
- **رابط کاربری دوزبانه و ریسپانسیو**: تغییر آنی بین **فارسی (RTL)** با فونت لوکال `وزیرمتن (Vazirmatn)` و **انگلیسی (LTR)**، بهینه‌شده برای موبایل، تبلت و دسکتاپ همراه با اسکرول کشیدنی (Grab & Drag) روی نوارهای پایین.
- **کنترل‌های تعاملی**:
  - کشیدن عمودی روی صفحه برای کنترل مستقیم سرعت و جهت زوم (با رها کردن، به سرعت اسلایدر برمی‌گردد).
  - اسکرول ماوس روی کانواس برای جابه‌جایی بین لایه‌ها و روی نوارهای پایین برای اسکرول افقی.
  - لمس/کلیک روی صفحه (یا کلید `H`) برای مخفی یا ظاهر کردن منو.
  - کلیدهای میانبر: `Space` (توقف/پخش)، `L` (تغییر زبان)، `←` / `→` (تغییر اثر)، `↑` / `↓` (تغییر سرعت)، `R` (تصادفی) و `F` (تمام‌صفحه).
  - پشتیبانی از پارامترهای آدرس: مثلاً `?quilt=zq2&fx=prism&speed=1.5&lang=fa`.

### اجرای محلی
کافی است پوشه‌ی پروژه را با یک سرور استاتیک ساده اجرا کنید:

</div>

```bash
python -m http.server 8080
```

<div dir="rtl">

سپس آدرس `http://localhost:8080` را در مرورگر باز کنید.

### پدیدآورندگان آثار
- **زوم‌کوئیلت ۱ (۲۰۰۴)** — نیکولاوس باومگارتن و همکاران
- **زوم‌کوئیلت ۲ (۲۰۰۷)** — نیکولاوس باومگارتن و همکاران
- **آرکادیا (۲۰۱۵)** — سوفیا شومبرگ و نیکولاوس باومگارتن
- **گل‌های بی‌پایان** — نیکولاوس باومگارتن
- **هیدرومدا** — سوفیا شومبرگ
- **شهر ارگانیک (۲۰۲۶)** — سوفیا شومبرگ و نیکولاوس باومگارتن

</div>
