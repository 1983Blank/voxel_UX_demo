// Supabase Edge Function for generating prototypes using tool-based modifications
// Uses the Dynamic Tools Architecture for surgical DOM modifications
// Deploy with: supabase functions deploy generate-prototype-v2

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =============================================================================
// Type Definitions (matching src/types/toolSchema.ts)
// =============================================================================

interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required: string[]
    }
  }
}

interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

interface Modification {
  tool: string
  selector?: string
  position?: 'before' | 'after' | 'prepend' | 'append' | 'replace'
  params: Record<string, unknown>
}

interface ScreenModification {
  screenId: string
  sourceScreenId?: string
  title?: string
  modifications: Modification[]
}

interface ModificationSpec {
  screens: ScreenModification[]
  navigation?: {
    routes: Array<{ path: string; screenId: string; params?: string[] }>
    defaultScreen: string
    defaultTransition?: string
  }
  metadata?: Record<string, unknown>
}

interface ExtractedComponent {
  id: string
  name: string
  category: string
  description: string
  html: string
  css?: string
  props: Array<{ name: string; type: string; required?: boolean }>
  variants: Array<{ name: string; description?: string; styles?: string }>
  approved: boolean
}

interface DesignToken {
  name: string
  category: string
  value: string
  cssVariable?: string
}

interface GenerateRequest {
  sessionId: string
  variantIndex: number
  prompt: string
  sourceScreenId: string
  sourceHtml: string
  components?: ExtractedComponent[]
  tokens?: DesignToken[]
  includeScreenTools?: boolean
  includeInteractionTools?: boolean
  provider?: 'anthropic' | 'openai'
  model?: string
}

// =============================================================================
// Tool Definitions
// =============================================================================

// Core DOM modification tools
const DOM_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'update_text',
      description: 'Update the text content of an element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the target element' },
          text: { type: 'string', description: 'New text content' },
        },
        required: ['selector', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_html',
      description: 'Update the inner HTML of an element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for the target element' },
          html: { type: 'string', description: 'New HTML content' },
        },
        required: ['selector', 'html'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_attribute',
      description: 'Update an attribute on an element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
          attribute: { type: 'string', description: 'Attribute name' },
          value: { type: 'string', description: 'New value' },
        },
        required: ['selector', 'attribute', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_class',
      description: 'Add CSS classes to an element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
          classes: { type: 'string', description: 'Space-separated class names' },
        },
        required: ['selector', 'classes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_class',
      description: 'Remove CSS classes from an element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
          classes: { type: 'string', description: 'Space-separated class names' },
        },
        required: ['selector', 'classes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_element',
      description: 'Remove an element from the DOM',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for element to remove' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_element',
      description: 'Add a new HTML element relative to an existing element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for reference element' },
          position: {
            type: 'string',
            enum: ['before', 'after', 'prepend', 'append', 'replace'],
            description: 'Where to insert',
          },
          html: { type: 'string', description: 'HTML to insert' },
        },
        required: ['selector', 'position', 'html'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_style',
      description: 'Set inline CSS styles on an element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
          styles: { type: 'object', description: 'CSS properties and values' },
        },
        required: ['selector', 'styles'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'hide_element',
      description: 'Hide an element (display: none)',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_element',
      description: 'Show a hidden element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
          display: { type: 'string', description: 'Display value (optional)' },
        },
        required: ['selector'],
      },
    },
  },
]

// Screen management tools
const SCREEN_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'create_screen',
      description: 'Create a new screen for the prototype',
      parameters: {
        type: 'object',
        properties: {
          screenId: { type: 'string', description: 'Unique screen identifier' },
          baseScreenId: { type: 'string', description: 'Screen to copy as starting point' },
          title: { type: 'string', description: 'Page title' },
        },
        required: ['screenId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_navigation',
      description: 'Make an element navigate to another screen when clicked',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for clickable element' },
          targetScreen: { type: 'string', description: 'Screen ID to navigate to' },
          transition: {
            type: 'string',
            enum: ['instant', 'fade', 'slide-left', 'slide-right'],
            description: 'Transition animation',
          },
        },
        required: ['selector', 'targetScreen'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'define_route',
      description: 'Define URL route for a screen',
      parameters: {
        type: 'object',
        properties: {
          screenId: { type: 'string', description: 'Screen ID' },
          path: { type: 'string', description: 'URL path pattern' },
        },
        required: ['screenId', 'path'],
      },
    },
  },
]

// Interaction tools - add click handlers, toggle visibility, state management
const INTERACTION_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'add_click_toggle',
      description: 'Make an element clickable to toggle visibility of another element (for modals, panels, dropdowns). IMPORTANT: Use this to connect trigger buttons to their modal/panel targets.',
      parameters: {
        type: 'object',
        properties: {
          triggerSelector: { type: 'string', description: 'CSS selector for the clickable element (e.g., button that opens modal)' },
          targetSelector: { type: 'string', description: 'CSS selector for the element to show/hide (e.g., the modal itself)' },
          closeOnClickOutside: { type: 'boolean', description: 'Close when clicking outside the target (default: true for modals)' },
          closeButtonSelector: { type: 'string', description: 'Optional: CSS selector for close button inside the target' },
        },
        required: ['triggerSelector', 'targetSelector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_initial_hidden',
      description: 'Set an element to be initially hidden (for modals, panels, dropdowns that should only appear on interaction). ALWAYS call this for modals and panels you create.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector for element to hide initially' },
        },
        required: ['selector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_hover_effect',
      description: 'Add hover effect that shows/hides a tooltip or dropdown on hover',
      parameters: {
        type: 'object',
        properties: {
          triggerSelector: { type: 'string', description: 'CSS selector for the hoverable element' },
          targetSelector: { type: 'string', description: 'CSS selector for element to show on hover' },
          showDelay: { type: 'number', description: 'Delay in ms before showing (default: 0)' },
          hideDelay: { type: 'number', description: 'Delay in ms before hiding (default: 200)' },
        },
        required: ['triggerSelector', 'targetSelector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_tab_interaction',
      description: 'Set up tab navigation where clicking a tab shows its content panel and hides others',
      parameters: {
        type: 'object',
        properties: {
          tabsSelector: { type: 'string', description: 'CSS selector for tab buttons container' },
          panelsSelector: { type: 'string', description: 'CSS selector for tab panels container' },
          activeClass: { type: 'string', description: 'CSS class for active tab (default: "active")' },
        },
        required: ['tabsSelector', 'panelsSelector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_accordion_interaction',
      description: 'Set up accordion where clicking a header toggles its content panel',
      parameters: {
        type: 'object',
        properties: {
          containerSelector: { type: 'string', description: 'CSS selector for accordion container' },
          headerSelector: { type: 'string', description: 'CSS selector for clickable headers within container' },
          contentSelector: { type: 'string', description: 'CSS selector for content panels within container' },
          allowMultiple: { type: 'boolean', description: 'Allow multiple panels open (default: false)' },
        },
        required: ['containerSelector', 'headerSelector', 'contentSelector'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_form_validation',
      description: 'Add basic form validation that shows error messages for required fields',
      parameters: {
        type: 'object',
        properties: {
          formSelector: { type: 'string', description: 'CSS selector for the form element' },
          submitButtonSelector: { type: 'string', description: 'CSS selector for submit button' },
          errorClass: { type: 'string', description: 'CSS class to add to invalid inputs (default: "error")' },
        },
        required: ['formSelector'],
      },
    },
  },
]

// Generic component insertion tools
const GENERIC_COMPONENT_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'insert_generic_button',
      description: 'Insert a button element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Parent element selector' },
          position: { type: 'string', enum: ['before', 'after', 'prepend', 'append', 'replace'] },
          text: { type: 'string', description: 'Button text' },
          variant: { type: 'string', enum: ['primary', 'secondary', 'outline', 'ghost', 'danger'] },
        },
        required: ['selector', 'position', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_input',
      description: 'Insert an input field',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Parent element selector' },
          position: { type: 'string', enum: ['before', 'after', 'prepend', 'append', 'replace'] },
          type: { type: 'string', enum: ['text', 'email', 'password', 'number', 'tel', 'url', 'search'] },
          placeholder: { type: 'string', description: 'Placeholder text' },
          label: { type: 'string', description: 'Label text' },
        },
        required: ['selector', 'position', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'insert_generic_card',
      description: 'Insert a card container',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'Parent element selector' },
          position: { type: 'string', enum: ['before', 'after', 'prepend', 'append', 'replace'] },
          title: { type: 'string', description: 'Card title' },
          content: { type: 'string', description: 'Card body content' },
          imageUrl: { type: 'string', description: 'Header image URL' },
        },
        required: ['selector', 'position'],
      },
    },
  },
]

// =============================================================================
// Tool Generation
// =============================================================================

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 30)
}

function generateComponentTool(component: ExtractedComponent): ToolDefinition {
  const toolName = `insert_${sanitizeName(component.category)}_${sanitizeName(component.name)}`

  const properties: Record<string, unknown> = {
    selector: { type: 'string', description: 'Parent element selector' },
    position: {
      type: 'string',
      enum: ['before', 'after', 'prepend', 'append', 'replace'],
      description: 'Where to insert',
    },
  }

  // Add component props
  for (const prop of component.props) {
    properties[prop.name] = {
      type: prop.type === 'enum' ? 'string' : prop.type,
      description: `${prop.name} property`,
    }
  }

  // Add variant option if component has variants
  if (component.variants.length > 0) {
    properties['variant'] = {
      type: 'string',
      enum: component.variants.map(v => v.name),
      description: 'Component variant',
    }
  }

  const required = ['selector', 'position']
  for (const prop of component.props) {
    if (prop.required) {
      required.push(prop.name)
    }
  }

  return {
    type: 'function',
    function: {
      name: toolName,
      description: `Insert ${component.name}: ${component.description}`,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  }
}

function generateStyleTool(tokens: DesignToken[]): ToolDefinition {
  const colorTokens = tokens.filter(t => t.category === 'color').map(t => t.name)
  const spacingTokens = tokens.filter(t => t.category === 'spacing').map(t => t.name)

  return {
    type: 'function',
    function: {
      name: 'apply_style',
      description: 'Apply design token styles to an element',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector' },
          backgroundColor: colorTokens.length > 0
            ? { type: 'string', enum: colorTokens, description: 'Background color token' }
            : { type: 'string', description: 'Background color value' },
          textColor: colorTokens.length > 0
            ? { type: 'string', enum: colorTokens, description: 'Text color token' }
            : { type: 'string', description: 'Text color value' },
          padding: spacingTokens.length > 0
            ? { type: 'string', enum: spacingTokens, description: 'Padding token' }
            : { type: 'string', description: 'Padding value' },
          margin: spacingTokens.length > 0
            ? { type: 'string', enum: spacingTokens, description: 'Margin token' }
            : { type: 'string', description: 'Margin value' },
        },
        required: ['selector'],
      },
    },
  }
}

function generateAllTools(
  components: ExtractedComponent[],
  tokens: DesignToken[],
  includeScreenTools: boolean,
  includeInteractionTools: boolean = true  // Default to enabled
): ToolDefinition[] {
  const tools: ToolDefinition[] = [...DOM_TOOLS]

  // Add component tools
  const approvedComponents = components.filter(c => c.approved)
  if (approvedComponents.length > 0) {
    tools.push(...approvedComponents.map(generateComponentTool))
  } else {
    tools.push(...GENERIC_COMPONENT_TOOLS)
  }

  // Add style tool
  tools.push(generateStyleTool(tokens))

  // Add screen tools if enabled
  if (includeScreenTools) {
    tools.push(...SCREEN_TOOLS)
  }

  // Add interaction tools if enabled (default: enabled)
  if (includeInteractionTools) {
    tools.push(...INTERACTION_TOOLS)
  }

  return tools
}

// =============================================================================
// DOM Summarization
// =============================================================================

function summarizeDOM(html: string): string {
  // Simple regex-based summary for edge function (no DOM parser)
  const lines: string[] = ['## Source DOM Structure\n']

  // Extract IDs
  const idMatches = html.matchAll(/id=["']([^"']+)["']/g)
  const ids: string[] = []
  for (const match of idMatches) {
    ids.push(`#${match[1]}`)
  }
  if (ids.length > 0) {
    lines.push(`### Elements with IDs:\n${ids.slice(0, 15).join(', ')}\n`)
  }

  // Extract unique classes
  const classMatches = html.matchAll(/class=["']([^"']+)["']/g)
  const classSet = new Set<string>()
  for (const match of classMatches) {
    const classes = match[1].split(/\s+/).filter(c =>
      c.length > 2 && !c.startsWith('css-') && !c.match(/^[a-z]{6,}$/)
    )
    classes.slice(0, 2).forEach(c => classSet.add(c))
  }
  if (classSet.size > 0) {
    lines.push(`### Key Classes:\n${Array.from(classSet).slice(0, 20).map(c => `.${c}`).join(', ')}\n`)
  }

  // Detect sections
  const sections: string[] = []
  if (html.includes('<header')) sections.push('header')
  if (html.includes('<nav')) sections.push('nav')
  if (html.includes('<main')) sections.push('main')
  if (html.includes('<section')) sections.push('section')
  if (html.includes('<footer')) sections.push('footer')
  if (sections.length > 0) {
    lines.push(`### Sections: ${sections.join(', ')}\n`)
  }

  lines.push(`### Size: ~${Math.round(html.length / 1024)}KB\n`)

  return lines.join('\n')
}

// =============================================================================
// System Prompt
// =============================================================================

function buildSystemPrompt(
  domSummary: string,
  components: ExtractedComponent[],
  tokens: DesignToken[]
): string {
  const approvedComponents = components.filter(c => c.approved)

  let prompt = `You are a UI prototype modifier creating high-fidelity INTERACTIVE prototypes. Your job is to MODIFY an existing webpage DOM using the provided tools to implement the requested feature or change.

CRITICAL RULES:
1. Use ONLY the provided tools - never output raw HTML in your response text
2. Make MULTIPLE tool calls (typically 8-20) to fully implement the request
3. Add new UI elements, update text, apply styling to create a complete implementation
4. Reference elements using CSS selectors from the source DOM
5. Create realistic, INTERACTIVE prototypes - not just static HTML!

## INTERACTION RULES (CRITICAL - READ CAREFULLY):

When creating modals, panels, dropdowns, or any overlay UI, you MUST follow this exact order:

1. FIRST: Create the TRIGGER BUTTON (if it doesn't exist in source DOM) with add_element
2. SECOND: Add the modal/panel HTML using add_element (with unique id attribute)
3. THIRD: Call set_initial_hidden to hide the modal/panel initially
4. FOURTH: Call add_click_toggle to connect trigger to modal/panel

⚠️ IMPORTANT: The triggerSelector in add_click_toggle MUST reference an element that EXISTS in the DOM!
- If you're adding a new button, add it FIRST with add_element, then use its selector
- If reusing an existing button from the source, use that selector
- NEVER use a triggerSelector for an element that doesn't exist!

Example for a modal (CORRECT ORDER):
\`\`\`
// Step 1: Add trigger button FIRST (skip if using existing button from source)
add_element(selector: ".actions", position: "append", html: "<button id='open-modal-btn' class='btn btn-primary'>Open Contact Form</button>")

// Step 2: Add the modal HTML
add_element(selector: "body", position: "append", html: "<div id='contact-modal' class='modal-overlay'><div class='modal-content'><button class='close-btn'>&times;</button><h2>Contact</h2></div></div>")

// Step 3: Hide modal initially
set_initial_hidden(selector: "#contact-modal")

// Step 4: Connect trigger to modal (trigger MUST exist from step 1 or source DOM!)
add_click_toggle(triggerSelector: "#open-modal-btn", targetSelector: "#contact-modal", closeButtonSelector: ".close-btn", closeOnClickOutside: true)
\`\`\`

For side panels (CORRECT ORDER):
\`\`\`
// Step 1: Add trigger button FIRST
add_element(selector: ".toolbar", position: "append", html: "<button id='open-panel-btn' class='btn'>Open Panel</button>")

// Step 2: Add panel HTML
add_element(selector: "body", position: "append", html: "<div id='side-panel' class='slide-panel'><button class='close-panel'>&times;</button>...</div>")

// Step 3: Hide panel initially
set_initial_hidden(selector: "#side-panel")

// Step 4: Connect trigger (uses button from step 1)
add_click_toggle(triggerSelector: "#open-panel-btn", targetSelector: "#side-panel", closeButtonSelector: ".close-panel")
\`\`\`

For tabs/accordions: Use add_tab_interaction or add_accordion_interaction

For step-by-step breakdowns/progress indicators:
\`\`\`
// Create interactive steps that expand/collapse on click
add_element(selector: ".content", position: "append", html: "<div class='steps' id='task-steps'><div class='step-item' data-step='1'><div class='step-indicator'>1</div><div class='step-content'><div class='step-title'>Step Title</div><div class='step-description'>Description...</div></div></div>...</div>")
add_accordion_interaction(containerSelector: "#task-steps", headerSelector: ".step-item", contentSelector: ".step-description", allowMultiple: true)
\`\`\`

IMPORTANT: A good interactive prototype requires:
- Add new buttons, forms, modals, or panels as needed
- UPDATE existing text and labels to match the feature
- Apply visual styling (colors, spacing, borders)
- SET UP INTERACTIVITY with set_initial_hidden and add_click_toggle
- Give new elements unique IDs so they can be targeted by interaction tools

${domSummary}
`

  if (approvedComponents.length > 0) {
    prompt += `\n## Available Components\n`
    for (const comp of approvedComponents.slice(0, 10)) {
      prompt += `- insert_${sanitizeName(comp.category)}_${sanitizeName(comp.name)}: ${comp.description}\n`
    }
  }

  if (tokens.length > 0) {
    const colorTokens = tokens.filter(t => t.category === 'color').slice(0, 8)
    if (colorTokens.length > 0) {
      prompt += `\n## Color Tokens\n${colorTokens.map(t => `- ${t.name}: ${t.value}`).join('\n')}\n`
    }
  }

  prompt += `
## Usage Examples

### Update text content
\`\`\`
update_text(selector: ".hero-title", text: "New Headline")
\`\`\`

### Add element with unique ID
\`\`\`
add_element(selector: ".actions", position: "append", html: "<button id='open-modal-btn' class='btn'>Open Modal</button>")
\`\`\`

### Apply styles
\`\`\`
set_style(selector: ".cta-button", styles: { "backgroundColor": "#007bff", "color": "white" })
\`\`\`

### Create interactive modal (FOLLOW THIS ORDER!)
\`\`\`
// 1. FIRST add trigger button (skip if reusing existing button)
add_element(selector: ".header-actions", position: "append", html: "<button id='open-modal-btn' class='btn btn-primary'>Contact Us</button>")

// 2. Add the modal HTML with unique ID
add_element(selector: "body", position: "append", html: "<div id='contact-modal' class='modal-overlay'><div class='modal-content'><button class='close-modal'>&times;</button><h2>Contact Form</h2><form>...</form></div></div>")

// 3. Hide it initially
set_initial_hidden(selector: "#contact-modal")

// 4. Connect trigger to modal (trigger from step 1 MUST exist!)
add_click_toggle(triggerSelector: "#open-modal-btn", targetSelector: "#contact-modal", closeButtonSelector: ".close-modal", closeOnClickOutside: true)
\`\`\`

### Create slide-out panel (FOLLOW THIS ORDER!)
\`\`\`
// 1. FIRST add trigger button
add_element(selector: ".toolbar", position: "append", html: "<button id='view-details-btn' class='btn'>View Details</button>")

// 2. Add panel HTML
add_element(selector: "body", position: "append", html: "<div id='detail-panel' class='slide-panel'><button class='panel-close'>&times;</button>...</div>")

// 3. Hide initially
set_initial_hidden(selector: "#detail-panel")

// 4. Connect trigger (uses button from step 1)
add_click_toggle(triggerSelector: "#view-details-btn", targetSelector: "#detail-panel", closeButtonSelector: ".panel-close")
\`\`\`

Now implement the user's request comprehensively. Use 8-20 tool calls to:
1. Add any new UI elements needed (buttons, forms, modals, panels) WITH UNIQUE IDs
2. Update text content to match the feature
3. Apply visual styling for a polished look
4. SET UP INTERACTIVITY - use set_initial_hidden + add_click_toggle for ANY overlay UI
5. Make it feel like a real, working prototype

CRITICAL INTERACTIVITY RULES:
- Trigger buttons MUST EXIST before calling add_click_toggle - add them first with add_element!
- Modals and panels MUST be HIDDEN initially - always call set_initial_hidden
- Modals and panels MUST be connected to triggers - always call add_click_toggle
- For task breakdowns, use accordion or step components with interactivity
- Include close buttons in modals/panels and reference them in closeButtonSelector
- Use semantic class names: modal-overlay, modal-content, panel-footer, close-btn, step-item

AVOID THESE COMMON MISTAKES:
- Using a triggerSelector that doesn't exist (trigger must be added FIRST or exist in source!)
- Adding a modal/panel without set_initial_hidden (it will show immediately!)
- Adding a trigger button without add_click_toggle (clicking does nothing!)
- Forgetting close buttons or not connecting them
- Using static lists when interactive accordions/tabs would be better
- Creating panels without proper footer styling (buttons will overflow!)`

  return prompt
}

// =============================================================================
// Tool Call Parsing
// =============================================================================

function parseToolCallsToSpec(toolCalls: ToolCall[]): ModificationSpec {
  const screens = new Map<string, ScreenModification>()
  let currentScreen = 'main'

  // Initialize main screen
  screens.set('main', {
    screenId: 'main',
    modifications: [],
  })

  for (const call of toolCalls) {
    const args = call.arguments

    // Handle screen creation
    if (call.name === 'create_screen') {
      const screenId = args.screenId as string
      screens.set(screenId, {
        screenId,
        sourceScreenId: args.baseScreenId as string | undefined,
        title: args.title as string | undefined,
        modifications: [],
      })
      currentScreen = screenId
      continue
    }

    // Handle screen switching
    if (call.name === 'switch_screen') {
      currentScreen = args.screenId as string
      continue
    }

    // Add modification to current screen
    const screen = screens.get(currentScreen)
    if (screen) {
      screen.modifications.push({
        tool: call.name,
        selector: args.selector as string | undefined,
        position: args.position as Modification['position'],
        params: args,
      })
    }
  }

  // Extract navigation config
  const routes: Array<{ path: string; screenId: string }> = []
  let defaultScreen = 'main'

  for (const call of toolCalls) {
    if (call.name === 'define_route') {
      routes.push({
        path: call.arguments.path as string,
        screenId: call.arguments.screenId as string,
      })
    }
    if (call.name === 'set_default_screen') {
      defaultScreen = call.arguments.screenId as string
    }
  }

  return {
    screens: Array.from(screens.values()),
    navigation: routes.length > 0 ? { routes, defaultScreen } : undefined,
    metadata: {
      toolCallCount: toolCalls.length,
      generatedAt: new Date().toISOString(),
    },
  }
}

// =============================================================================
// LLM Calls
// =============================================================================

// Check if error is an overload/rate limit error
function isOverloadError(errorMessage: string): boolean {
  const msg = errorMessage.toLowerCase()
  return msg.includes('overload') ||
    msg.includes('capacity') ||
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('529') ||
    msg.includes('503')
}

// Fallback models for each provider when primary model is overloaded
const FALLBACK_MODELS: Record<string, string[]> = {
  anthropic: ['claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'],
  openai: ['gpt-4o-mini', 'gpt-3.5-turbo'],
  google: ['gemini-1.5-flash', 'gemini-1.0-pro'],
}

// Sleep helper for retry backoff
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function callAnthropicWithTools(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  tools: ToolDefinition[]
): Promise<ToolCall[]> {
  console.log('[generate-prototype-v2] Calling Anthropic with', tools.length, 'tools')

  // Convert tools to Anthropic format
  const anthropicTools = tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }))

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      tools: anthropicTools,
      tool_choice: { type: 'any' },
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Anthropic API error')
  }

  const data = await response.json()

  // Extract tool calls from response
  const toolCalls: ToolCall[] = []
  for (const block of data.content) {
    if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input,
      })
    }
  }

  console.log('[generate-prototype-v2] Received', toolCalls.length, 'tool calls')
  return toolCalls
}

async function callOpenAIWithTools(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  tools: ToolDefinition[]
): Promise<ToolCall[]> {
  console.log('[generate-prototype-v2] Calling OpenAI with', tools.length, 'tools')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      max_tokens: 8192,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools: tools,
      tool_choice: 'required',
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'OpenAI API error')
  }

  const data = await response.json()
  const message = data.choices?.[0]?.message

  // Extract tool calls
  const toolCalls: ToolCall[] = []
  if (message?.tool_calls) {
    for (const tc of message.tool_calls) {
      try {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        })
      } catch {
        console.warn('[generate-prototype-v2] Failed to parse tool call arguments')
      }
    }
  }

  console.log('[generate-prototype-v2] Received', toolCalls.length, 'tool calls')
  return toolCalls
}

async function callGoogleWithTools(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  tools: ToolDefinition[]
): Promise<ToolCall[]> {
  console.log('[generate-prototype-v2] Calling Google Gemini with', tools.length, 'tools')

  // Convert tools to Google/Gemini format
  const googleTools = [{
    functionDeclarations: tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      parameters: {
        type: 'OBJECT',
        properties: Object.fromEntries(
          Object.entries(t.function.parameters.properties).map(([key, value]) => [
            key,
            {
              type: (value as { type?: string }).type?.toUpperCase() || 'STRING',
              description: (value as { description?: string }).description || '',
              enum: (value as { enum?: string[] }).enum,
            }
          ])
        ),
        required: t.function.parameters.required,
      },
    })),
  }]

  const modelId = model || 'gemini-1.5-pro'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: [{
        role: 'user',
        parts: [{ text: userPrompt }],
      }],
      tools: googleTools,
      toolConfig: {
        functionCallingConfig: {
          mode: 'ANY',
        },
      },
      generationConfig: {
        maxOutputTokens: 8192,
      },
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || `Google API error: ${response.status}`)
  }

  const data = await response.json()

  // Extract tool calls from response
  const toolCalls: ToolCall[] = []
  const candidates = data.candidates || []

  for (const candidate of candidates) {
    const content = candidate.content
    if (content?.parts) {
      for (const part of content.parts) {
        if (part.functionCall) {
          toolCalls.push({
            id: `google-${Date.now()}-${toolCalls.length}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args || {},
          })
        }
      }
    }
  }

  console.log('[generate-prototype-v2] Received', toolCalls.length, 'tool calls from Google')
  return toolCalls
}

// =============================================================================
// Main Handler
// =============================================================================

Deno.serve(async (req) => {
  console.log('[generate-prototype-v2] Request received:', req.method)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let parsedBody: GenerateRequest | null = null

  try {
    // Environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables')
    }

    // Verify authorization
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      throw new Error('Missing or invalid authorization header')
    }
    const jwt = authHeader.replace('Bearer ', '')

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt)
    if (userError || !user) {
      throw new Error(`Unauthorized: ${userError?.message || 'Invalid token'}`)
    }
    console.log('[generate-prototype-v2] User authenticated:', user.id)

    // Parse request
    parsedBody = await req.json()
    const body = parsedBody
    console.log('[generate-prototype-v2] Generating variant', body.variantIndex, 'for session:', body.sessionId)

    if (!body.sessionId || body.variantIndex === undefined || !body.prompt || !body.sourceHtml) {
      throw new Error('Missing required fields: sessionId, variantIndex, prompt, sourceHtml')
    }

    // Get user's API key
    const requestedProvider = body.provider
    let keyQuery = supabase
      .from('user_api_key_refs')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (requestedProvider) {
      keyQuery = keyQuery.eq('provider', requestedProvider)
    }

    const { data: keyConfigs } = await keyQuery.limit(1)
    const keyConfig = keyConfigs?.[0]

    if (!keyConfig) {
      throw new Error('No API key configured. Please add your API key in Settings.')
    }

    const modelToUse = body.model || keyConfig.model
    console.log('[generate-prototype-v2] Using provider:', keyConfig.provider, 'model:', modelToUse)

    // Get decrypted API key
    const { data: apiKey, error: decryptError } = await supabase
      .rpc('get_api_key', { p_user_id: user.id, p_provider: keyConfig.provider })

    if (decryptError || !apiKey) {
      throw new Error('Failed to retrieve API key')
    }

    // Generate tools
    const components = body.components || []
    const tokens = body.tokens || []
    const tools = generateAllTools(
      components,
      tokens,
      body.includeScreenTools !== false,
      body.includeInteractionTools !== false  // Default to enabled
    )

    // Build context
    const domSummary = summarizeDOM(body.sourceHtml)
    const systemPrompt = buildSystemPrompt(domSummary, components, tokens)
    const userPrompt = `Source DOM (modify this):\n\`\`\`html\n${body.sourceHtml.slice(0, 50000)}\n\`\`\`\n\nUser Request: ${body.prompt}`

    // Call LLM with tools (with retry and fallback logic for overload errors)
    let toolCalls: ToolCall[]
    let actualModelUsed = modelToUse
    const maxRetries = 3
    const fallbackModels = FALLBACK_MODELS[keyConfig.provider] || []

    // Helper function to call the appropriate provider
    const callProvider = async (model: string): Promise<ToolCall[]> => {
      if (keyConfig.provider === 'anthropic') {
        return await callAnthropicWithTools(apiKey, model, systemPrompt, userPrompt, tools)
      } else if (keyConfig.provider === 'openai') {
        return await callOpenAIWithTools(apiKey, model, systemPrompt, userPrompt, tools)
      } else if (keyConfig.provider === 'google') {
        return await callGoogleWithTools(apiKey, model, systemPrompt, userPrompt, tools)
      } else {
        throw new Error(`Unsupported provider: ${keyConfig.provider}`)
      }
    }

    // Try with primary model first, then fallbacks on overload
    let lastError: Error | null = null
    let modelIndex = -1 // -1 = primary model, 0+ = fallback models

    for (let attempt = 0; attempt < maxRetries + fallbackModels.length; attempt++) {
      const currentModel = modelIndex === -1 ? modelToUse : fallbackModels[modelIndex]

      try {
        console.log(`[generate-prototype-v2] Attempt ${attempt + 1}: trying model ${currentModel}`)
        toolCalls = await callProvider(currentModel)
        actualModelUsed = currentModel
        break // Success!
      } catch (err) {
        lastError = err as Error
        console.warn(`[generate-prototype-v2] Attempt ${attempt + 1} failed:`, lastError.message)

        if (isOverloadError(lastError.message)) {
          // If we haven't tried fallback models yet and there are some available
          if (modelIndex < fallbackModels.length - 1) {
            modelIndex++
            console.log(`[generate-prototype-v2] Overload detected, trying fallback model: ${fallbackModels[modelIndex]}`)
          } else if (attempt < maxRetries + fallbackModels.length - 1) {
            // Exponential backoff before retry
            const backoffMs = Math.min(1000 * Math.pow(2, attempt), 10000)
            console.log(`[generate-prototype-v2] Waiting ${backoffMs}ms before retry...`)
            await sleep(backoffMs)
          }
        } else {
          // Non-overload error, don't retry
          throw lastError
        }
      }
    }

    // If we exhausted all retries
    if (!toolCalls!) {
      throw lastError || new Error('All retry attempts failed')
    }

    console.log(`[generate-prototype-v2] Success with model: ${actualModelUsed}`)

    // Parse tool calls into modification spec
    const spec = parseToolCallsToSpec(toolCalls)

    const duration = Date.now() - startTime
    console.log('[generate-prototype-v2] Generated spec with', toolCalls.length, 'tool calls in', duration, 'ms')

    // Store the spec
    const specPath = `${user.id}/${body.sessionId}/variant_${body.variantIndex}_spec.json`
    await supabase.storage
      .from('vibe-files')
      .upload(specPath, new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }), {
        contentType: 'application/json',
        upsert: true,
      })

    return new Response(
      JSON.stringify({
        success: true,
        spec,
        specPath,
        toolCallCount: toolCalls.length,
        screensGenerated: spec.screens.length,
        durationMs: duration,
        model: actualModelUsed,
        provider: keyConfig.provider,
        fallbackUsed: actualModelUsed !== modelToUse,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[generate-prototype-v2] Error:', errorMessage)

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        variantIndex: parsedBody?.variantIndex,
        sessionId: parsedBody?.sessionId,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
