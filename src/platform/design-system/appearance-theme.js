export const APPEARANCE_PRESETS = [
    { id: 'minimal', label: 'Minimal', description: 'Claro, neutro e com destaque azul discreto.', accentColor: '#2F59DB', topbarColor: '#FFFFFF', sidebarColor: '#FFFFFF', canvasColor: '#F5F6F4', surfaceColor: '#FFFFFF' },
    { id: 'realtalent', label: 'RealTalent', description: 'Identidade oficial azul com navegação profunda e superfícies claras.', accentColor: '#315BD8', topbarColor: '#17264A', sidebarColor: '#FFFFFF', canvasColor: '#F4F6FA', surfaceColor: '#FFFFFF' },
    { id: 'graphite', label: 'Grafite', description: 'Navegação escura e conteúdo claro.', accentColor: '#52606D', topbarColor: '#20252B', sidebarColor: '#252B31', canvasColor: '#EFF1F2', surfaceColor: '#FFFFFF' },
    { id: 'blue', label: 'Azul', description: 'Topbar azul profunda com superfícies claras.', accentColor: '#2F59DB', topbarColor: '#17264A', sidebarColor: '#FFFFFF', canvasColor: '#F4F6FA', surfaceColor: '#FFFFFF' },
    { id: 'green', label: 'Verde', description: 'Preset verde completo, agora opcional.', accentColor: '#1D9E75', topbarColor: '#04342C', sidebarColor: '#FFFFFF', canvasColor: '#F1EFE8', surfaceColor: '#FFFFFF' },
    { id: 'sand', label: 'Areia', description: 'Tons quentes e baixo contraste visual.', accentColor: '#A86E2D', topbarColor: '#FAF7F0', sidebarColor: '#FFFDF9', canvasColor: '#F3EEE3', surfaceColor: '#FFFFFF' },
];
export const DEFAULT_APPEARANCE_PRESET = 'minimal';
export const getAppearancePreset = (preset) => APPEARANCE_PRESETS.find((item) => item.id === preset) ?? APPEARANCE_PRESETS[0];
const normalizeHex = (value) => value.trim().toUpperCase();
export const isHexColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
const toRgb = (hex) => {
    const normalized = normalizeHex(hex).slice(1);
    return {
        r: Number.parseInt(normalized.slice(0, 2), 16),
        g: Number.parseInt(normalized.slice(2, 4), 16),
        b: Number.parseInt(normalized.slice(4, 6), 16),
    };
};
const channelLuminance = (channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
export const relativeLuminance = (hex) => {
    const { r, g, b } = toRgb(hex);
    return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
};
export const contrastTextColor = (background) => relativeLuminance(background) > 0.42 ? '#2C2C2A' : '#FFFFFF';
export const mixHex = (base, overlay, amount) => {
    const a = toRgb(base);
    const b = toRgb(overlay);
    const ratio = Math.max(0, Math.min(1, amount));
    const channel = (left, right) => Math.round(left * (1 - ratio) + right * ratio).toString(16).padStart(2, '0');
    return `#${channel(a.r, b.r)}${channel(a.g, b.g)}${channel(a.b, b.b)}`.toUpperCase();
};
export const rgbaFromHex = (hex, alpha) => {
    const { r, g, b } = toRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
};
export const appearanceColorsForPreset = (preset, current) => {
    if (preset === 'custom' && current)
        return current;
    const definition = getAppearancePreset(preset);
    return {
        accentColor: definition.accentColor,
        topbarColor: definition.topbarColor,
        sidebarColor: definition.sidebarColor,
        canvasColor: definition.canvasColor,
        surfaceColor: definition.surfaceColor,
    };
};
const darkSurface = (value, fallback) => relativeLuminance(value) > 0.35 ? mixHex(value, fallback, 0.78) : value;
export const resolveAppearanceTheme = (colors, effectiveTheme) => {
    const accentColor = colors.accentColor;
    const topbarColor = effectiveTheme === 'dark' ? darkSurface(colors.topbarColor, '#101815') : colors.topbarColor;
    const sidebarColor = effectiveTheme === 'dark' ? darkSurface(colors.sidebarColor, '#141E1A') : colors.sidebarColor;
    const canvasColor = effectiveTheme === 'dark' ? '#101815' : colors.canvasColor;
    const surfaceColor = effectiveTheme === 'dark' ? '#17211D' : colors.surfaceColor;
    const topbarTextColor = contrastTextColor(topbarColor);
    const sidebarTextColor = contrastTextColor(sidebarColor);
    return {
        accentColor,
        topbarColor,
        sidebarColor,
        canvasColor,
        surfaceColor,
        topbarTextColor,
        topbarMutedColor: mixHex(topbarTextColor, topbarColor, 0.34),
        topbarControlColor: mixHex(topbarColor, topbarTextColor, topbarTextColor === '#FFFFFF' ? 0.08 : 0.045),
        topbarBorderColor: mixHex(topbarColor, topbarTextColor, topbarTextColor === '#FFFFFF' ? 0.16 : 0.10),
        sidebarTextColor,
        sidebarMutedColor: mixHex(sidebarTextColor, sidebarColor, 0.42),
        sidebarBorderColor: mixHex(sidebarColor, sidebarTextColor, sidebarTextColor === '#FFFFFF' ? 0.16 : 0.10),
        activeSurfaceColor: mixHex(sidebarColor, accentColor, sidebarTextColor === '#FFFFFF' ? 0.23 : 0.12),
        activeTextColor: sidebarTextColor === '#FFFFFF' ? '#FFFFFF' : mixHex('#2C2C2A', accentColor, 0.30),
        accentSoftColor: effectiveTheme === 'dark' ? rgbaFromHex(accentColor, 0.18) : mixHex('#FFFFFF', accentColor, 0.11),
        contentTextColor: contrastTextColor(surfaceColor),
        contentMutedColor: mixHex(contrastTextColor(surfaceColor), surfaceColor, 0.42),
        borderColor: mixHex(surfaceColor, contrastTextColor(surfaceColor), effectiveTheme === 'dark' ? 0.18 : 0.11),
        surfaceSoftColor: mixHex(surfaceColor, canvasColor, 0.46),
        surfaceSubtleColor: mixHex(surfaceColor, canvasColor, 0.24),
    };
};
