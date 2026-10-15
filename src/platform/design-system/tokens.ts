export const designTokens = {
  color: {
    brand: '#1D9E75',
    brandHover: '#15795A',
    brandStrong: '#04342C',
    canvas: '#F1EFE8',
    surface: '#FFFFFF',
    surfaceSoft: '#F7F8F5',
    text: '#2C2C2A',
    textSecondary: '#56615D',
    muted: '#76817D',
    border: '#DDE3DE',
    borderStrong: '#C8D2CC',
    danger: '#B5474A',
    warning: '#8A5B09',
  },
  spacing: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 },
  radius: { sm: 8, md: 10, lg: 14, xl: 18, pill: 999 },
  control: { sm: 34, md: 40, lg: 46 },
  typography: { xs: 11, sm: 12, md: 13, lg: 15, xl: 18, page: 22 },
  motion: { fast: 120, standard: 180 },
} as const

export type DesignTokenCatalog = typeof designTokens
