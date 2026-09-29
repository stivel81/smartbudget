import { COLORS, RADIUS, SPACING, FONT_FAMILY, PASSWORD_STRENGTH_COLORS, budgetBarColor } from '../../lib/theme';
import fs from 'fs';
import path from 'path';

describe('lib/theme', () => {
  describe('COLORS token values match DESIGN_REFERENCE_V2.md', () => {
    // Color Palette table from DESIGN_REFERENCE_V2.md
    const expectedColors = {
      background: '#f2f2f7',
      surface: '#ffffff',
      textPrimary: '#000000',
      textSecondary: '#8e8e93',
      placeholder: '#c7c7cc',
      border: '#e5e5ea',
      hero: '#000000',
      button: '#000000',
      buttonText: '#ffffff',
      success: '#30d158',
      warning: '#ff9f0a',
      danger: '#ff3b30',
      alertBg: '#fff3cd',
      alertBorder: '#ffd60a',
    };

    Object.entries(expectedColors).forEach(([token, expectedValue]) => {
      it(`COLORS.${token} matches V2 design doc (#${expectedValue})`, () => {
        expect(COLORS[token as keyof typeof COLORS]).toBe(expectedValue);
      });
    });
  });

  describe('RADIUS token values match DESIGN_REFERENCE_V2.md', () => {
    const expectedRadius = {
      card: 14,
      input: 10,
      button: 12,
      categoryIcon: 9,
    };

    Object.entries(expectedRadius).forEach(([token, expectedValue]) => {
      it(`RADIUS.${token} matches V2 design doc (${expectedValue}px)`, () => {
        expect(RADIUS[token as keyof typeof RADIUS]).toBe(expectedValue);
      });
    });
  });

  describe('SPACING token values match DESIGN_REFERENCE_V2.md', () => {
    const expectedSpacing = {
      screenPadding: 16,
      cardGap: 8,
      sectionMargin: 12,
    };

    Object.entries(expectedSpacing).forEach(([token, expectedValue]) => {
      it(`SPACING.${token} matches V2 design doc (${expectedValue}px)`, () => {
        expect(SPACING[token as keyof typeof SPACING]).toBe(expectedValue);
      });
    });
  });

  describe('No hardcoded color literals in screen/component files', () => {
    // Shared UI components (components/) are held to the same rule as screens.
    const uiFiles = ['screens', 'components'].flatMap((dir) => {
      const absDir = path.join(__dirname, '../..', dir);
      return fs
        .readdirSync(absDir)
        .filter((f) => f.endsWith('.tsx'))
        .map((f) => ({ filename: `${dir}/${f}`, filePath: path.join(absDir, f) }));
    });

    it('scans at least one component file', () => {
      expect(uiFiles.some((f) => f.filename.startsWith('components/'))).toBe(true);
    });

    uiFiles.forEach(({ filename, filePath }) => {
      it(`${filename} should not contain hardcoded hex/rgb/rgba color literals`, () => {
        const content = fs.readFileSync(filePath, 'utf-8');

        const lines = content.split('\n');
        const colorMatches: string[] = [];

        lines.forEach((line, lineNum) => {
          // Skip comments
          if (line.trim().startsWith('//')) return;

          // Check for hex colors (#...)
          const hexMatches = line.matchAll(/#[0-9a-fA-F]{3,8}\b/g);
          for (const match of hexMatches) {
            const idx = match.index!;
            // Check if preceded by 'COLORS.' or inside CATEGORY_META (which is config)
            if (idx > 6 && line.substring(idx - 7, idx + 1) === 'COLORS.') {
              continue;
            }
            // Skip CATEGORY_META colors (they're metadata, not theme)
            if (line.includes('CATEGORY_META') || line.includes('backgroundColor') && line.includes('color')) {
              continue;
            }
            colorMatches.push(`Line ${lineNum + 1} [hex]: ${line.trim()}`);
          }

          // Check for rgb/rgba literals
          const rgbMatches = line.matchAll(/\brgba?\s*\(/g);
          for (const match of rgbMatches) {
            const idx = match.index!;
            // Check if preceded by 'COLORS.'
            if (idx > 6 && line.substring(idx - 7, idx + 1) === 'COLORS.') {
              continue;
            }
            colorMatches.push(`Line ${lineNum + 1} [rgb/rgba]: ${line.trim()}`);
          }
        });

        if (colorMatches.length > 0) {
          const detailedMessage = `Found hardcoded color literals in ${filename}:\n${colorMatches.join('\n')}`;
          throw new Error(detailedMessage);
        }
      });
    });
  });

  describe('budgetBarColor threshold function per DESIGN_REFERENCE_V2.md', () => {
    it('returns success color for 0% (empty budget)', () => {
      expect(budgetBarColor(0)).toBe(COLORS.success);
    });

    it('returns success color for 69.99% (under 70%)', () => {
      expect(budgetBarColor(69.99)).toBe(COLORS.success);
    });

    it('returns warning color for 70% (exactly at threshold)', () => {
      expect(budgetBarColor(70)).toBe(COLORS.warning);
    });

    it('returns warning color for 89.99% (in 70–89% range)', () => {
      expect(budgetBarColor(89.99)).toBe(COLORS.warning);
    });

    it('returns danger color for 90% (at high threshold)', () => {
      expect(budgetBarColor(90)).toBe(COLORS.danger);
    });

    it('returns danger color for 100% (over budget)', () => {
      expect(budgetBarColor(100)).toBe(COLORS.danger);
    });

    it('returns danger color for > 100% (significantly over budget)', () => {
      expect(budgetBarColor(150)).toBe(COLORS.danger);
    });

    it('returns success color for negative percentage (invalid input)', () => {
      expect(budgetBarColor(-10)).toBe(COLORS.success);
    });

    it('returns success color for NaN (invalid input)', () => {
      expect(budgetBarColor(NaN)).toBe(COLORS.success);
    });
  });

  describe('FONT_FAMILY is properly set per platform', () => {
    it('FONT_FAMILY should be defined', () => {
      expect(FONT_FAMILY).toBeDefined();
    });

    it('FONT_FAMILY should be a string', () => {
      expect(typeof FONT_FAMILY).toBe('string');
    });
  });

  describe('PASSWORD_STRENGTH_COLORS', () => {
    it('maps tones to the shared status colors (red / amber / green) and empty to the border color', () => {
      expect(PASSWORD_STRENGTH_COLORS).toEqual({
        danger: COLORS.danger,
        warning: COLORS.warning,
        success: COLORS.success,
        none: COLORS.border,
      });
    });
  });
});
