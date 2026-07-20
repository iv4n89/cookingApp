// Fuente de verdad: stitch/DESIGN.md (Culinary Intelligence System).

export const colors = {
  surface: "#fcf9f8",
  "surface-dim": "#dcd9d9",
  "surface-bright": "#fcf9f8",
  "surface-container-lowest": "#ffffff",
  "surface-container-low": "#f6f3f2",
  "surface-container": "#f0eded",
  "surface-container-high": "#eae7e7",
  "surface-container-highest": "#e5e2e1",
  "on-surface": "#1c1b1b",
  "on-surface-variant": "#424843",
  "inverse-surface": "#313030",
  "inverse-on-surface": "#f3f0ef",
  outline: "#727972",
  "outline-variant": "#c2c8c0",
  "surface-tint": "#466550",
  primary: "#163422",
  "on-primary": "#ffffff",
  "primary-container": "#2d4b37",
  "on-primary-container": "#99baa1",
  "inverse-primary": "#adcfb4",
  secondary: "#6b5c4c",
  "on-secondary": "#ffffff",
  "secondary-container": "#f4dfcb",
  "on-secondary-container": "#716252",
  tertiary: "#2f2f2a",
  "on-tertiary": "#ffffff",
  "tertiary-container": "#454540",
  "on-tertiary-container": "#b4b2ac",
  error: "#ba1a1a",
  "on-error": "#ffffff",
  "error-container": "#ffdad6",
  "on-error-container": "#93000a",
  "primary-fixed": "#c8ebd0",
  "primary-fixed-dim": "#adcfb4",
  "on-primary-fixed": "#022110",
  "on-primary-fixed-variant": "#2f4d39",
  "secondary-fixed": "#f4dfcb",
  "secondary-fixed-dim": "#d7c3b0",
  "on-secondary-fixed": "#241a0e",
  "on-secondary-fixed-variant": "#524436",
  "tertiary-fixed": "#e5e2db",
  "tertiary-fixed-dim": "#c9c6c0",
  "on-tertiary-fixed": "#1c1c18",
  "on-tertiary-fixed-variant": "#474742",
  background: "#fcf9f8",
  "on-background": "#1c1b1b",
  "surface-variant": "#e5e2e1",
  // Elevación nivel 1 (DESIGN.md): fondo de card + su borde.
  card: "#f4f1ea",
  "card-border": "#e5e0d5",
} as const;

// En React Native cada peso es una familia propia (no se sintetiza el bold).
// Cada clave apunta a la familia exacta cargada con expo-font.
export const fontFamily = {
  sans: ["HankenGrotesk_400Regular"],
  "sans-medium": ["HankenGrotesk_500Medium"],
  "sans-semibold": ["HankenGrotesk_600SemiBold"],
  "sans-bold": ["HankenGrotesk_700Bold"],
  mono: ["JetBrainsMono_400Regular"],
  "mono-medium": ["JetBrainsMono_500Medium"],
} as const;

// El peso se aplica vía font-family; aquí solo tamaño/interlineado/tracking.
export const fontSize = {
  "display-lg": ["32px", { lineHeight: "40px", letterSpacing: "-0.02em" }],
  "headline-md": ["24px", { lineHeight: "32px", letterSpacing: "-0.01em" }],
  "headline-sm": ["20px", { lineHeight: "28px" }],
  "body-lg": ["18px", { lineHeight: "28px" }],
  "body-md": ["16px", { lineHeight: "24px" }],
  "label-md": ["14px", { lineHeight: "20px", letterSpacing: "0.02em" }],
  "label-sm": ["12px", { lineHeight: "16px", letterSpacing: "0.05em" }],
} as const;

export const borderRadius = {
  sm: "0.125rem",
  DEFAULT: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  full: "9999px",
} as const;

export const spacing = {
  base: "8px",
  "container-padding": "20px",
  gutter: "16px",
  "stack-sm": "4px",
  "stack-md": "12px",
  "stack-lg": "24px",
  "section-gap": "40px",
} as const;
