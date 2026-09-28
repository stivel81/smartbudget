import { COLORS, RADIUS, SPACING, FONT_FAMILY } from '../../lib/theme';
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

  describe('No hardcoded hex colors in screen files', () => {
    const screensDir = path.join(__dirname, '../../screens');
    const hexColorRegex = /#[0-9a-fA-F]{3,8}\b/;

    const screenFiles = [
      'DashboardScreen.tsx',
      'ScanScreen.tsx',
      'BudgetScreen.tsx',
      'ProfileScreen.tsx',
    ];

    screenFiles.forEach((filename) => {
      it(`${filename} should not contain hardcoded hex color literals`, () => {
        const filePath = path.join(screensDir, filename);
        const content = fs.readFileSync(filePath, 'utf-8');

        // Ignore colors that are actually theme references (like COLORS.*)
        // by only finding hex literals not preceded by 'COLORS.'
        const lines = content.split('\n');
        const hexMatches: string[] = [];

        lines.forEach((line, lineNum) => {
          // Skip comments and COLORS.* references
          if (line.trim().startsWith('//')) return;

          // Find hex colors not part of theme references
          const matches = line.matchAll(/#[0-9a-fA-F]{3,8}\b/g);
          for (const match of matches) {
            const idx = match.index!;
            // Check if preceded by 'COLORS.'
            if (idx > 6 && line.substring(idx - 7, idx + 1) === 'COLORS.') {
              continue; // This is a theme reference, skip
            }
            hexMatches.push(`Line ${lineNum + 1}: ${line.trim()}`);
          }
        });

        if (hexMatches.length > 0) {
          const detailedMessage = `Found hardcoded hex colors in ${filename}:\n${hexMatches.join('\n')}`;
          throw new Error(detailedMessage);
        }
      });
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
});
