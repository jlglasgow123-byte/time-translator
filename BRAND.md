# Time Translator — Brand Guideline

> Reconstructed from the app logo (the original brand document was lost). This captures the colours, typography, and vibe the logo already expresses, so all future assets stay consistent. If the original is ever found and differs, that one wins — reconcile and note it here.

**Owner:** Jasmine Glasgow
**Created:** 2026-08-03
**Source:** the Time Translator app icon (dark-teal squircle, aqua→mint gradient clock with a speech-bubble tail, split light/dark ground, rounded wordmark).

---

## 1. The vibe in one line

Calm, trustworthy, and modern — **a clock that talks**. The logo pairs a precise clock with a speech-bubble tail: *time, translated into something you can read.* The tone is friendly-professional, not corporate-cold and not startup-loud. Rounded geometry and a soft aqua glow keep it approachable; the deep teal keeps it credible.

Design should feel: **clear, unhurried, quietly premium.** Lots of breathing room, soft rounded corners, one confident accent colour, never busy.

---

## 2. Colour palette

Pulled directly from the logo.

### Core

| Token | Hex | Use |
|---|---|---|
| **Ink (deep teal)** | `#12303A` | Primary dark ground, headings on light, dark sections |
| **Ink Deep** | `#0C2027` | Deepest shade — backgrounds, footers, shadows |
| **Aqua (brand primary)** | `#3FD0C9` | Primary accent — the clock's bright side, key highlights, links |
| **Mint** | `#B8E9DC` | Secondary accent — the clock's light side, soft fills, gradient end |
| **Aqua→Mint gradient** | `linear-gradient(135deg, #3FD0C9 0%, #B8E9DC 100%)` | Hero elements, the clock, feature accents |

### Neutrals

| Token | Hex | Use |
|---|---|---|
| **Paper** | `#F4F7F6` | Light background (the logo's off-white panel) |
| **White** | `#FFFFFF` | Cards, surfaces on Paper |
| **Slate** | `#5A6B70` | Secondary text on light |
| **Mist** | `#DDE6E5` | Borders, dividers, subtle fills |

### Semantic (harmonised to the palette)

| Token | Hex | Use |
|---|---|---|
| **Success** | `#2FA98B` | Done / verified / positive |
| **Warning** | `#E0A43B` | Attention / at-risk |
| **Danger** | `#D5675A` | Blocker / failure |

**Contrast rules:** Ink text on Paper/White always. On Ink backgrounds use Paper/White or Aqua for emphasis. Aqua is an *accent*, not a body-text colour — it fails contrast as small text on light. Never put Mint text on White.

---

## 3. Typography

The wordmark is a **soft, rounded, geometric sans-serif** (rounded terminals, generous curves). We don't have the exact font file, so the system stack below matches the feel and stays dependency-free (important: brand assets must be self-contained, no external font CDNs).

- **Primary stack:** `"Poppins", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif`
  *(Poppins/Nunito are the closest rounded-geometric matches if ever embedded; otherwise the system fallback keeps the rounded, friendly feel.)*
- **Headings:** semibold (600), slightly tightened letter-spacing on large sizes.
- **Body:** regular (400), generous line-height (~1.6) for the unhurried feel.
- **Wordmark treatment:** "Time" in Aqua, "Translator" shifting Aqua→Ink — mirror the logo when rendering the name as styled text.

---

## 4. Shape & layout language

- **Corners:** rounded throughout. Cards ~16px radius; buttons ~10px; the "squircle" (superellipse) look for anything logo-adjacent.
- **Space:** generous padding, clear section breaks. Let things breathe — crowding breaks the calm.
- **Split composition:** the logo's light/dark diagonal split is a signature. Use sparingly for hero/section dividers, not everywhere.
- **Accent glow:** a soft aqua shadow/glow on key elements echoes the clock's luminance. Keep it subtle.
- **Elevation:** soft, low-contrast shadows (never hard drop-shadows).

---

## 5. Do / Don't

**Do**
- Lead with Ink + one Aqua accent; let white space carry the design.
- Use the aqua→mint gradient for the single most important element on a view.
- Keep corners rounded and shadows soft.

**Don't**
- Don't use more than one loud accent per view.
- Don't render body text in Aqua or Mint (contrast).
- Don't add competing bright colours — the palette is deliberately narrow.
- Don't use sharp corners or hard shadows — it breaks the friendly, premium feel.

---

## 6. Quick reference (copy-paste tokens)

```css
:root {
  --tt-ink: #12303A;
  --tt-ink-deep: #0C2027;
  --tt-aqua: #3FD0C9;
  --tt-mint: #B8E9DC;
  --tt-gradient: linear-gradient(135deg, #3FD0C9 0%, #B8E9DC 100%);
  --tt-paper: #F4F7F6;
  --tt-white: #FFFFFF;
  --tt-slate: #5A6B70;
  --tt-mist: #DDE6E5;
  --tt-success: #2FA98B;
  --tt-warning: #E0A43B;
  --tt-danger: #D5675A;
  --tt-font: "Poppins", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif;
}
```
