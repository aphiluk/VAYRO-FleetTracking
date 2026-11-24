---
version: "alpha"
name: "Neumorphic Tech Schematic"
description: "Neumorphic landing page, soft ui, tech schematic, light background, soft shadows, clean layout, hub and spoke design. Ideal for landing pages, modern websites. AI-ready template."
colors:
  primary: "#F4F6F8"
  secondary: "#2C2C2C"
  tertiary: "#EB5757"
  neutral: "#FFFFFF"
  surface: "#D1D9E6"
  accent: "#EB5757"
typography:
  h1:
    fontFamily: Roboto
    fontSize: 2.5rem
    fontWeight: 700
  body-md:
    fontFamily: Roboto
    fontSize: 1rem
    fontWeight: 400
rounded:
  sm: 20px
  md: 40px
  lg: 60px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.sm}"
    padding: 12px
---

## Overview

Neumorphic landing page, soft ui, tech schematic, light background, soft shadows, clean layout, hub and spoke design. Ideal for landing pages, modern websites. AI-ready template. Neumorphism arrived around 2019-2020 as a rebellion against flat design's sterility — designers wanted depth back, but not the cartoonish skeuomorphism of 2010. Soft inner and outer shadows created this pillowy, extruded-plastic look. Beautiful in dribbble shots. Questionable in production. But something interesting happened when people started applying it to technical interfaces: the softness got disciplined.

The schematic layer changed everything. Precision lines, grid overlays, monospaced type, circuit-board patterns — suddenly neumorphism had structure. It stopped being decorative and started feeling engineered. Think Nest thermostat UI meets blueprint aesthetics. The smart home control panel became the canonical use case: dials that look touchable, toggles with satisfying depth, status indicators that glow subtly against matte surfaces.

This fusion works because both languages share a commitment to physicality. Neumorphism simulates material. Schematics simulate systems. Together they create interfaces that feel like you're operating actual hardware — not tapping glass.

- Density: 5/10 — Balanced
- Variance: 4/10 — Moderate
- Motion: 4/10 — Subtle

- **Style:** Professional, Informative, Sleek
- **Keywords:** neumorphic, schematic, tech, soft, shadows, gradient, flow, hub, spoke
- **Era:** Modern Tech
- **Light/Dark:** ✓ Full / ◐ Part

## Colors

- **Background** (#F4F6F8) — Primary background surface
- **Text** (#2C2C2C) — Primary text color
- **Accent** (#EB5757) — Primary accent, CTAs and interactive elements
- **Shadow Light** (#FFFFFF) — Extended palette, decorative use
- **Shadow Dark** (#D1D9E6) — Deep contrast surface
- **Flow Line** (#EB5757) — Extended palette, decorative use


## Typography

- **Display / Hero:** Roboto — Weight 700, tight tracking, used for headline impact
- **Body:** Roboto — Weight 400, 16px/1.6 line-height, max 72ch per line
- **UI Labels / Captions:** Roboto — 0.875rem, weight 500, slight letter-spacing
- **Monospace:** JetBrains Mono — Used for code, metadata, and technical values

Scale:
- Hero: clamp(2.5rem, 5vw, 4rem)
- H1: 2.25rem
- H2: 1.5rem
- Body: 1rem / 1.6
- Small: 0.875rem


## Layout

- **Grid:** CSS Grid primary. Max-width containment: 1280px centered with 1.5rem side padding.
- **Spacing rhythm:** Balanced. Base unit: 0.5rem (8px).
- **Section vertical gaps:** clamp(4rem, 8vw, 8rem).
- **Hero layout:** Split-screen (text left, visual right).
- **Feature sections:** Zig-zag alternating text+image rows. No 3-equal-columns.
- **Mobile collapse:** All multi-column layouts collapse below 768px. No horizontal overflow.
- **z-index contract:** base (0) / sticky-nav (100) / overlay (200) / modal (300) / toast (500).


## Elevation & Depth

Soft circular containers, smooth matte digital surface, soft diffuse ambient lighting, gentle drop shadows (neumorphic effect).

- **Physics:** Ease-out curves, 200-300ms duration. Smooth and predictable.
- **Entry animations:** Fade + translate-Y (16px → 0) over 420ms ease-out. Staggered cascades for lists: 80ms between items.
- **Hover states:** Subtle color shift + shadow adjustment over 200ms.
- **Page transitions:** Fade only (200ms).
- **Performance:** Only transform and opacity animated. No layout-triggering properties.


## Shapes

Base corner radius: 20px. See rounded tokens in front matter for the full scale.


## Components

- **Primary Button:** Rounded (20px) shape. Accent color fill. Hover: 8% darken + subtle lift shadow. Active: -1px translate tactile press. Font weight 600. No outer glows.
- **Secondary / Ghost Button:** Outline variant. 1.5px border in muted color. Text in primary color. Hover: subtle background fill.
- **Cards:** Rounded (20px) corners. Surface background. Subtle shadow (0 2px 12px rgba(0,0,0,0.06)). 1px border stroke.
- **Inputs:** Label above input. 1px border stroke. Focus ring: 2px accent color offset 2px. Error text below in semantic red. No floating labels.
- **Navigation:** Primary surface background. Active item: accent color indicator. Font weight 500 when active.
- **Skeletons:** Shimmer animation matching component dimensions. No circular spinners.
- **Empty States:** Icon-based composition with descriptive text and action button.


## Do's and Don'ts

- No emojis in UI — use icon system only (Lucide, Heroicons)
- No pure black (#000000) — use off-black or charcoal variants
- No oversaturated accent colors (saturation cap: 80%)
- No 3-column equal-width feature layouts — use zig-zag or asymmetric grid
- No `h-screen` — use `min-h-[100dvh]`
- No AI copywriting clichés: "Elevate", "Seamless", "Unleash", "Next-Gen"
- No broken external image links — use picsum.photos or inline SVG
- No generic lorem ipsum in demos

- Do Neumorphic shadows (light/dark interact)
- Do Soft rounded corners
- Do Central hub layout
- Do Gradient flow lines
- Do Minimalist icons


## Use Case

Landing pages, Modern websites

<!-- Source: https://designmd.app/library/neumorphic-tech-schematic · designmd.app -->
