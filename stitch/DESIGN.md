---
name: Culinary Intelligence System
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#424843'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#727972'
  outline-variant: '#c2c8c0'
  surface-tint: '#466550'
  primary: '#163422'
  on-primary: '#ffffff'
  primary-container: '#2d4b37'
  on-primary-container: '#99baa1'
  inverse-primary: '#adcfb4'
  secondary: '#6b5c4c'
  on-secondary: '#ffffff'
  secondary-container: '#f4dfcb'
  on-secondary-container: '#716252'
  tertiary: '#2f2f2a'
  on-tertiary: '#ffffff'
  tertiary-container: '#454540'
  on-tertiary-container: '#b4b2ac'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c8ebd0'
  primary-fixed-dim: '#adcfb4'
  on-primary-fixed: '#022110'
  on-primary-fixed-variant: '#2f4d39'
  secondary-fixed: '#f4dfcb'
  secondary-fixed-dim: '#d7c3b0'
  on-secondary-fixed: '#241a0e'
  on-secondary-fixed-variant: '#524436'
  tertiary-fixed: '#e5e2db'
  tertiary-fixed-dim: '#c9c6c0'
  on-tertiary-fixed: '#1c1c18'
  on-tertiary-fixed-variant: '#474742'
  background: '#fcf9f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  container-padding: 20px
  gutter: 16px
  stack-sm: 4px
  stack-md: 12px
  stack-lg: 24px
  section-gap: 40px
---

## Brand & Style

This design system is built on a foundation of **Organic Minimalism**. It departs from the typical "high-tech" AI aesthetic, instead positioning the technology as a sophisticated, invisible sous-chef. The brand personality is intelligent and organized, yet deeply rooted in the tactile world of fresh ingredients and kitchen craft.

The visual style utilizes a **Modern Corporate** approach refined with **Minimalist** sensibilities. It prioritizes clarity, structural integrity, and generous white space to allow high-quality food photography to serve as the primary visual driver. The UI avoids all trendy "AI-cliché" elements like neon glows or robotic motifs, opting instead for a "Digital Atelier" feel—precise, quiet, and premium.

## Colors

The palette is derived from nature and high-end kitchen materials. 

*   **Primary (Forest Green):** A deep, sophisticated green used for primary actions, active states, and brand-heavy UI moments. It represents freshness and culinary expertise.
*   **Secondary (Warm Oak):** A muted wood tone used for subtle accents, category dividers, or secondary UI elements to provide warmth against the sterile white.
*   **Tertiary (Bone White):** A slightly warm off-white used for card backgrounds and section fills to reduce optical strain compared to pure hex white.
*   **Neutral (Charcoal):** A near-black for maximum legibility in typography.

Avoid any use of gradients. All color applications must be solid fills to maintain the clean, architectural integrity of the interface.

## Typography

The system utilizes **Hanken Grotesk** for all primary communication. Its sharp, contemporary geometry provides a professional and highly legible experience across mobile screens. 

To emphasize the "AI-powered" and "organized" nature of the product without using icons, **JetBrains Mono** is used sparingly for labels, metadata (e.g., prep time, calorie counts), and technical data points. This monospaced font introduces a subtle "data-driven" aesthetic that feels clinical and precise.

For mobile-specific adjustments, headlines exceeding 24px should wrap gracefully with a maximum of three lines to ensure clarity.

## Layout & Spacing

This design system uses a **Fluid Grid** with fixed horizontal margins of 20px on mobile devices. The rhythm is based on an 8px baseline grid to ensure vertical alignment and mathematical harmony.

*   **Verticality:** High emphasis on "stacked" layouts. Use `stack-lg` (24px) to separate distinct card groups and `stack-md` (12px) for content within those groups.
*   **Whitespace:** Generous padding is required within cards (minimum 16px) to maintain the high-end, uncluttered feel. 
*   **Safe Areas:** Ensure all bottom-fixed elements (like "Start Cooking" buttons) account for device home indicators with an additional 16px of clearance.

## Elevation & Depth

To maintain a minimalist and clean aesthetic, this system avoids traditional ambient shadows. Instead, it relies on **Low-Contrast Outlines** and **Tonal Layers** to create hierarchy.

1.  **Level 0 (Base):** Pure white background (`#FFFFFF`).
2.  **Level 1 (Cards):** Tertiary color (`#F4F1EA`) with a subtle 1px border of `#E5E0D5`. No shadow.
3.  **Level 2 (Modals/Overlays):** White background with a very soft, high-diffusion shadow (8% opacity, 20px blur) to provide just enough separation from the base layer.

Depth is communicated through color blocking rather than physical simulation.

## Shapes

The shape language is **Soft (Level 1)**. 

While the system is professional and organized, slightly rounded corners prevent the UI from feeling too sharp or aggressive. 
*   **Standard Elements (Inputs/Small Buttons):** 4px radius.
*   **Large Elements (Recipe Cards/Action Sheets):** 8px or 12px radius.

This creates a subtle "architectural" curve that mirrors modern kitchen cabinetry and appliance design.

## Components

### Buttons
*   **Primary:** Solid Forest Green (`#2D4B37`) with white text. High-contrast, no shadow.
*   **Secondary:** Ghost style. Forest Green outline (1.5px) with transparent background.
*   **Text:** JetBrains Mono for button labels to emphasize the "action/command" nature of the button.

### Cards
*   **Recipe Cards:** Use a full-bleed image at the top with a 3:2 aspect ratio. Content below is housed in the Bone White tertiary color. Use crisp 1px borders to define the card's edge.

### Inputs & Selection
*   **Text Fields:** Minimalist design with a bottom border (2px) that turns Forest Green when active. Label sits above the field in JetBrains Mono.
*   **Checkboxes:** Square with a 2px radius. When checked, they fill with Forest Green and a white tick.

### Lists & Steps
*   **Recipe Steps:** Use large, low-opacity numbers (Hanken Grotesk, 40px) to the left of the instruction text to create a clear, easy-to-follow chronological flow.
*   **Ingredient Chips:** Small, Bone White capsules with a 1px border to denote individual items in the AI-generated list.

### Specialty Components
*   **AI Analysis Badge:** A small, monospaced label in a "Warm Oak" box used to highlight specific AI-driven insights (e.g., "MATCHES YOUR MACROS" or "SENSORY PAIRING").
