/**
 * Style Tools - Apply design tokens to elements
 *
 * Generates tools based on the user's approved design tokens,
 * ensuring consistent styling across all modifications.
 */

import type {
  ToolDefinition,
  DesignToken,
  TokenPalette,
} from '@/types/toolSchema';

/**
 * Group tokens by category
 */
function groupTokensByCategory(tokens: DesignToken[]): TokenPalette {
  const palette: TokenPalette = {
    colors: [],
    fonts: [],
    spacing: [],
    radius: [],
    shadows: [],
    borders: [],
    animations: [],
  };

  for (const token of tokens) {
    switch (token.category) {
      case 'color':
        palette.colors.push(token);
        break;
      case 'font':
        palette.fonts.push(token);
        break;
      case 'spacing':
        palette.spacing.push(token);
        break;
      case 'radius':
        palette.radius.push(token);
        break;
      case 'shadow':
        palette.shadows.push(token);
        break;
      case 'border':
        palette.borders.push(token);
        break;
      case 'animation':
        palette.animations.push(token);
        break;
    }
  }

  return palette;
}

/**
 * Generate the main apply_style tool with token-based enum values
 */
function generateApplyStyleTool(palette: TokenPalette): ToolDefinition {
  const colorNames = palette.colors.map(t => t.name);
  const fontNames = palette.fonts.map(t => t.name);
  const spacingNames = palette.spacing.map(t => t.name);
  const radiusNames = palette.radius.map(t => t.name);
  const shadowNames = palette.shadows.map(t => t.name);
  const borderNames = palette.borders.map(t => t.name);

  return {
    type: 'function',
    function: {
      name: 'apply_style',
      description: 'Apply design token styles to an element. Use token names from the design system for consistent styling.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          backgroundColor: colorNames.length > 0
            ? {
                type: 'string',
                enum: [...colorNames, null],
                description: 'Background color token',
              }
            : {
                type: 'string',
                description: 'Background color value',
              },
          textColor: colorNames.length > 0
            ? {
                type: 'string',
                enum: [...colorNames, null],
                description: 'Text color token',
              }
            : {
                type: 'string',
                description: 'Text color value',
              },
          borderColor: colorNames.length > 0
            ? {
                type: 'string',
                enum: [...colorNames, null],
                description: 'Border color token',
              }
            : {
                type: 'string',
                description: 'Border color value',
              },
          fontFamily: fontNames.length > 0
            ? {
                type: 'string',
                enum: [...fontNames, null],
                description: 'Font family token',
              }
            : {
                type: 'string',
                description: 'Font family value',
              },
          fontSize: fontNames.length > 0
            ? {
                type: 'string',
                enum: [...fontNames, null],
                description: 'Font size token',
              }
            : {
                type: 'string',
                description: 'Font size value (e.g., "16px", "1rem")',
              },
          padding: spacingNames.length > 0
            ? {
                type: 'string',
                enum: [...spacingNames, null],
                description: 'Padding spacing token',
              }
            : {
                type: 'string',
                description: 'Padding value (e.g., "16px", "1rem 2rem")',
              },
          margin: spacingNames.length > 0
            ? {
                type: 'string',
                enum: [...spacingNames, null],
                description: 'Margin spacing token',
              }
            : {
                type: 'string',
                description: 'Margin value',
              },
          gap: spacingNames.length > 0
            ? {
                type: 'string',
                enum: [...spacingNames, null],
                description: 'Gap spacing token (for flex/grid)',
              }
            : {
                type: 'string',
                description: 'Gap value',
              },
          borderRadius: radiusNames.length > 0
            ? {
                type: 'string',
                enum: [...radiusNames, null],
                description: 'Border radius token',
              }
            : {
                type: 'string',
                description: 'Border radius value',
              },
          boxShadow: shadowNames.length > 0
            ? {
                type: 'string',
                enum: [...shadowNames, null],
                description: 'Box shadow token',
              }
            : {
                type: 'string',
                description: 'Box shadow value',
              },
          border: borderNames.length > 0
            ? {
                type: 'string',
                enum: [...borderNames, null],
                description: 'Border token',
              }
            : {
                type: 'string',
                description: 'Border value (e.g., "1px solid #ccc")',
              },
        },
        required: ['selector'],
      },
    },
    _meta: { category: 'style' },
  };
}

/**
 * Generate specialized color tools
 */
function generateColorTools(colors: DesignToken[]): ToolDefinition[] {
  if (colors.length === 0) return [];

  const colorNames = colors.map(t => t.name);

  return [
    {
      type: 'function',
      function: {
        name: 'apply_text_color',
        description: 'Apply a text color from the design system to an element.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the target element',
            },
            color: {
              type: 'string',
              enum: colorNames,
              description: 'Color token name from design system',
            },
          },
          required: ['selector', 'color'],
        },
      },
      _meta: { category: 'style', tokenCategory: 'color' },
    },
    {
      type: 'function',
      function: {
        name: 'apply_background_color',
        description: 'Apply a background color from the design system to an element.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the target element',
            },
            color: {
              type: 'string',
              enum: colorNames,
              description: 'Color token name from design system',
            },
          },
          required: ['selector', 'color'],
        },
      },
      _meta: { category: 'style', tokenCategory: 'color' },
    },
  ];
}

/**
 * Generate typography tools
 */
function generateTypographyTools(fonts: DesignToken[]): ToolDefinition[] {
  const tools: ToolDefinition[] = [];

  // Font family tool
  const fontFamilies = fonts.filter(f => f.name.includes('family') || f.name.includes('font'));
  if (fontFamilies.length > 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'apply_font_family',
        description: 'Apply a font family from the design system.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the target element',
            },
            font: {
              type: 'string',
              enum: fontFamilies.map(f => f.name),
              description: 'Font family token',
            },
          },
          required: ['selector', 'font'],
        },
      },
      _meta: { category: 'style', tokenCategory: 'font' },
    });
  }

  // Font size tool
  const fontSizes = fonts.filter(f => f.name.includes('size') || /^(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl)$/.test(f.name));
  if (fontSizes.length > 0) {
    tools.push({
      type: 'function',
      function: {
        name: 'apply_font_size',
        description: 'Apply a font size from the design system.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the target element',
            },
            size: {
              type: 'string',
              enum: fontSizes.map(f => f.name),
              description: 'Font size token',
            },
          },
          required: ['selector', 'size'],
        },
      },
      _meta: { category: 'style', tokenCategory: 'font' },
    });
  }

  return tools;
}

/**
 * Generate spacing tools
 */
function generateSpacingTools(spacing: DesignToken[]): ToolDefinition[] {
  if (spacing.length === 0) return [];

  const spacingNames = spacing.map(s => s.name);

  return [
    {
      type: 'function',
      function: {
        name: 'apply_padding',
        description: 'Apply padding from the design system spacing tokens.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the target element',
            },
            all: {
              type: 'string',
              enum: spacingNames,
              description: 'Padding on all sides',
            },
            top: {
              type: 'string',
              enum: spacingNames,
              description: 'Top padding',
            },
            right: {
              type: 'string',
              enum: spacingNames,
              description: 'Right padding',
            },
            bottom: {
              type: 'string',
              enum: spacingNames,
              description: 'Bottom padding',
            },
            left: {
              type: 'string',
              enum: spacingNames,
              description: 'Left padding',
            },
            x: {
              type: 'string',
              enum: spacingNames,
              description: 'Horizontal padding (left + right)',
            },
            y: {
              type: 'string',
              enum: spacingNames,
              description: 'Vertical padding (top + bottom)',
            },
          },
          required: ['selector'],
        },
      },
      _meta: { category: 'style', tokenCategory: 'spacing' },
    },
    {
      type: 'function',
      function: {
        name: 'apply_margin',
        description: 'Apply margin from the design system spacing tokens.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the target element',
            },
            all: {
              type: 'string',
              enum: spacingNames,
              description: 'Margin on all sides',
            },
            top: {
              type: 'string',
              enum: spacingNames,
              description: 'Top margin',
            },
            right: {
              type: 'string',
              enum: spacingNames,
              description: 'Right margin',
            },
            bottom: {
              type: 'string',
              enum: spacingNames,
              description: 'Bottom margin',
            },
            left: {
              type: 'string',
              enum: spacingNames,
              description: 'Left margin',
            },
            x: {
              type: 'string',
              enum: spacingNames,
              description: 'Horizontal margin (left + right)',
            },
            y: {
              type: 'string',
              enum: spacingNames,
              description: 'Vertical margin (top + bottom)',
            },
          },
          required: ['selector'],
        },
      },
      _meta: { category: 'style', tokenCategory: 'spacing' },
    },
    {
      type: 'function',
      function: {
        name: 'apply_gap',
        description: 'Apply gap spacing for flex/grid containers.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the flex/grid container',
            },
            gap: {
              type: 'string',
              enum: spacingNames,
              description: 'Gap spacing token',
            },
          },
          required: ['selector', 'gap'],
        },
      },
      _meta: { category: 'style', tokenCategory: 'spacing' },
    },
  ];
}

/**
 * Base style tools (always available, regardless of tokens)
 */
export const BASE_STYLE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'apply_layout',
      description: 'Apply layout styles (display, flex, grid) to an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          display: {
            type: 'string',
            enum: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'none'],
            description: 'Display type',
          },
          flexDirection: {
            type: 'string',
            enum: ['row', 'row-reverse', 'column', 'column-reverse'],
            description: 'Flex direction (for flex containers)',
          },
          justifyContent: {
            type: 'string',
            enum: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
            description: 'Main axis alignment',
          },
          alignItems: {
            type: 'string',
            enum: ['flex-start', 'flex-end', 'center', 'baseline', 'stretch'],
            description: 'Cross axis alignment',
          },
          flexWrap: {
            type: 'string',
            enum: ['nowrap', 'wrap', 'wrap-reverse'],
            description: 'Flex wrap behavior',
          },
          gridTemplateColumns: {
            type: 'string',
            description: 'Grid columns template (e.g., "1fr 1fr 1fr", "repeat(3, 1fr)")',
          },
          gridTemplateRows: {
            type: 'string',
            description: 'Grid rows template',
          },
        },
        required: ['selector'],
      },
    },
    _meta: { category: 'style' },
  },
  {
    type: 'function',
    function: {
      name: 'apply_size',
      description: 'Apply width/height sizing to an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          width: {
            type: 'string',
            description: 'Width value (e.g., "100%", "200px", "auto")',
          },
          height: {
            type: 'string',
            description: 'Height value',
          },
          minWidth: {
            type: 'string',
            description: 'Minimum width',
          },
          maxWidth: {
            type: 'string',
            description: 'Maximum width',
          },
          minHeight: {
            type: 'string',
            description: 'Minimum height',
          },
          maxHeight: {
            type: 'string',
            description: 'Maximum height',
          },
        },
        required: ['selector'],
      },
    },
    _meta: { category: 'style' },
  },
  {
    type: 'function',
    function: {
      name: 'apply_position',
      description: 'Apply positioning styles to an element.',
      parameters: {
        type: 'object',
        properties: {
          selector: {
            type: 'string',
            description: 'CSS selector for the target element',
          },
          position: {
            type: 'string',
            enum: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
            description: 'Position type',
          },
          top: {
            type: 'string',
            description: 'Top offset',
          },
          right: {
            type: 'string',
            description: 'Right offset',
          },
          bottom: {
            type: 'string',
            description: 'Bottom offset',
          },
          left: {
            type: 'string',
            description: 'Left offset',
          },
          zIndex: {
            type: 'number',
            description: 'Stack order',
          },
        },
        required: ['selector'],
      },
    },
    _meta: { category: 'style' },
  },
];

/**
 * Generate all style tools from design tokens
 */
export function generateStyleTools(tokens: DesignToken[]): ToolDefinition[] {
  const palette = groupTokensByCategory(tokens);

  return [
    // Main apply_style tool with token enums
    generateApplyStyleTool(palette),
    // Specialized color tools
    ...generateColorTools(palette.colors),
    // Typography tools
    ...generateTypographyTools(palette.fonts),
    // Spacing tools
    ...generateSpacingTools(palette.spacing),
    // Base layout/positioning tools (always available)
    ...BASE_STYLE_TOOLS,
  ];
}

/**
 * Get base style tools (for accounts without tokens)
 */
export function getBaseStyleTools(): ToolDefinition[] {
  return [
    generateApplyStyleTool({
      colors: [],
      fonts: [],
      spacing: [],
      radius: [],
      shadows: [],
      borders: [],
      animations: [],
    }),
    ...BASE_STYLE_TOOLS,
  ];
}

/**
 * Create token palette from array
 */
export function createTokenPalette(tokens: DesignToken[]): TokenPalette {
  return groupTokensByCategory(tokens);
}
