import { describe, expect, it } from 'vitest';
import { appearanceColorsForPreset, contrastTextColor, resolveAppearanceTheme } from './appearance-theme';
describe('Workspace Appearance H4', () => {
    it('usa Minimal como preset claro neutro', () => {
        const colors = appearanceColorsForPreset('minimal');
        expect(colors.topbarColor).toBe('#FFFFFF');
        expect(colors.sidebarColor).toBe('#FFFFFF');
        expect(colors.accentColor).toBe('#2F59DB');
    });
    it('escolhe texto escuro em superfícies claras e branco em superfícies escuras', () => {
        expect(contrastTextColor('#FFFFFF')).toBe('#2C2C2A');
        expect(contrastTextColor('#04342C')).toBe('#FFFFFF');
    });
    it('mantém o accent e deriva canvas escuro no tema dark', () => {
        const colors = appearanceColorsForPreset('green');
        const resolved = resolveAppearanceTheme(colors, 'dark');
        expect(resolved.accentColor).toBe('#1D9E75');
        expect(resolved.canvasColor).toBe('#101815');
        expect(resolved.surfaceColor).toBe('#17211D');
    });
    it('usa a identidade oficial azul RealTalent no tema light', () => {
        const colors = appearanceColorsForPreset('realtalent');
        const resolved = resolveAppearanceTheme(colors, 'light');
        expect(resolved.topbarColor).toBe('#17264A');
        expect(resolved.topbarTextColor).toBe('#FFFFFF');
    });
});
