// Supabase Edge Function for generating individual prototype files
// Step 2 of the multi-stage agent architecture
// Generates one file at a time: flows.json, components, or index.html
// Deploy with: supabase functions deploy generate-prototype-file

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ Types ============

type FileType = 'tokens.css' | 'store.json' | 'flows.json' | 'component' | 'index.html'
type VariantApproach = 'minimal' | 'feature-rich' | 'gamified' | 'accessible' | 'mobile-first' | 'enterprise'

interface DesignToken {
  name: string
  value: string
  type: 'color' | 'typography' | 'spacing' | 'radius' | 'shadow'
  cssVariable: string
}

interface ImplementationScript {
  stateSchema: Record<string, string>
  initialState: Record<string, unknown>
  entryPoints: Array<{
    selector: string
    action: string
    triggersState?: string
    triggersFlow?: string
    label?: string
  }>
  flows: Array<{
    name: string
    description?: string
    trigger?: { event: string; selector?: string; when?: unknown }
    when?: unknown
    steps: unknown[]
  }>
  componentsNeeded: string[]
  successCriteria?: {
    state?: Record<string, unknown>
    display?: string
  }
  variantGuidelines: {
    description: string
    focusAreas: string[]
    avoidAreas: string[]
    tonality: string
  }
}

interface PreviousFile {
  path: string
  exports?: string[]
  summary?: string
}

interface GenerateFileRequest {
  fileType: FileType
  implementationScript: ImplementationScript
  variantApproach: VariantApproach
  designTokens: DesignToken[]
  componentName?: string
  previousFiles?: PreviousFile[]
  sourceHtml?: string
  screenshotBase64?: string
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
}

interface GenerateFileResponse {
  path: string
  content: string
  type: 'html' | 'js' | 'css' | 'json'
  exports?: string[]
  summary?: string
}

// ============ LLM Output Sanitization ============

/**
 * Sanitize LLM-generated code to fix common issues
 * - Smart quotes that break JavaScript
 * - Fancy Unicode characters
 * - Zero-width characters
 */
function sanitizeLLMOutput(content: string): string {
  let sanitized = content

  // Replace smart/curly quotes with straight quotes (common LLM issue)
  sanitized = sanitized.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // Various double quotes
  sanitized = sanitized.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // Various single quotes
  sanitized = sanitized.replace(/[\u00AB\u00BB]/g, '"') // Guillemets

  // Replace fancy dashes with regular hyphens/dashes
  sanitized = sanitized.replace(/[\u2013\u2014\u2015]/g, '-')

  // Replace non-breaking spaces with regular spaces
  sanitized = sanitized.replace(/[\u00A0\u2007\u202F]/g, ' ')

  // Remove zero-width characters that can cause issues
  sanitized = sanitized.replace(/[\u200B\u200C\u200D\uFEFF]/g, '')

  // Replace ellipsis character with three dots
  sanitized = sanitized.replace(/\u2026/g, '...')

  return sanitized
}

// ============ Non-LLM File Generators ============

function generateTokensCss(designTokens: DesignToken[]): GenerateFileResponse {
  const cssVars = designTokens.map(token => {
    return `  ${token.cssVariable}: ${token.value}; /* ${token.name} */`
  }).join('\n')

  const content = `:root {
${cssVars}
}

/* Base styles */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-family, system-ui, -apple-system, sans-serif);
  background: var(--color-background, #f8fafc);
  color: var(--color-text, #1e293b);
}

/* Utility classes */
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-center { justify-content: center; }
.gap-1 { gap: 4px; }
.gap-2 { gap: 8px; }
.gap-4 { gap: 16px; }
.p-2 { padding: 8px; }
.p-4 { padding: 16px; }
.m-0 { margin: 0; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.text-center { text-align: center; }
.text-sm { font-size: 0.875rem; }
.text-lg { font-size: 1.125rem; }
.font-medium { font-weight: 500; }
.font-bold { font-weight: 700; }
.rounded { border-radius: var(--radius-md, 8px); }
.shadow { box-shadow: var(--shadow-md, 0 4px 6px -1px rgb(0 0 0 / 0.1)); }
`

  return {
    path: 'styles/tokens.css',
    content,
    type: 'css',
    summary: 'Design tokens as CSS custom properties',
  }
}

function generateStoreJson(initialState: Record<string, unknown>): GenerateFileResponse {
  const content = JSON.stringify(initialState, null, 2)

  return {
    path: 'state/store.json',
    content,
    type: 'json',
    summary: 'Initial state for VxStore',
  }
}

// ============ LLM-Based File Generators ============

const FLOWS_SYSTEM_PROMPT = `You are a UX engineer creating flow definitions for an interactive prototype.

Generate a JSON file defining user flows based on the implementation script.

FLOW STRUCTURE:
{
  "flows": [
    {
      "name": "flow-name",
      "description": "What this flow does",
      "trigger": { "event": "click", "selector": ".button" },
      "steps": [
        { "set": "state.path", "to": "value" },
        { "delay": 1000 },
        { "set": "state.loading", "to": false }
      ]
    }
  ]
}

STEP TYPES:
- { "set": "path", "to": value } - Set state value
- { "toggle": "path" } - Toggle boolean
- { "delay": ms } - Wait milliseconds
- { "after": ms, "set": "path", "to": value } - Set after delay
- { "if": condition, "then": [...], "else": [...] } - Conditional
- { "flow": "name" } - Execute another flow
- { "analytics": "event_name", "data": {...} } - Track event

Return ONLY valid JSON, no markdown.`

const COMPONENT_SYSTEM_PROMPT = `You are a UX engineer creating Web Components for Voxel prototypes.

Create a JavaScript Web Component that extends the globally available VxComponentClass.

CRITICAL: Use window.VxComponentClass (NOT imports). The runtime is bundled and globally available.

COMPONENT TEMPLATE:
\`\`\`javascript
// Component: component-name
// Description: Brief description

(function() {
  class ComponentName extends window.VxComponentClass {
    static get observedAttributes() {
      return ['variant', 'disabled', 'state-path'];
    }

    template() {
      return \`
        <style>\${this.getBaseStyles()}</style>
        <style>
          /* Component-specific styles using CSS variables */
          .component-root { /* styles */ }
        </style>
        <div class="component-root">
          <!-- Component HTML -->
        </div>
      \`;
    }

    init() {
      // Initialize component state
    }

    afterRender() {
      // Called after render, set up click handlers
      this.$('.button')?.addEventListener('click', () => {
        const statePath = this.getAttribute('set-state');
        if (statePath) {
          const value = this.getAttribute('set-to');
          try {
            this.setState(statePath, JSON.parse(value));
          } catch {
            this.setState(statePath, value);
          }
        }
      });
    }

    getSubscribedPaths() {
      // Return array of state paths this component cares about
      const path = this.getAttribute('state-path');
      return path ? [path] : [];
    }

    onStoreChange(path, newValue, oldValue) {
      // React to state changes - render is called automatically
    }
  }

  customElements.define('component-name', ComponentName);
})();
\`\`\`

IMPORTANT:
- MUST extend window.VxComponentClass (globally available, no imports)
- Wrap in IIFE to avoid global scope pollution
- Use Shadow DOM for encapsulation (automatic via base class)
- Use CSS custom properties from design tokens (var(--color-primary), var(--spacing-md), etc.)
- CRITICAL: Style the component to match the original UI design - same colors, fonts, spacing, borders, shadows
- Use this.$() and this.$$() for querying shadow DOM elements
- Use this.getState(path), this.setState(path, value), this.toggleState(path)
- Call this.getBaseStyles() in template for design token CSS variables
- NO export statements - component is registered globally via customElements.define
- Make the component look polished and production-ready, not like a basic wireframe

Return ONLY the JavaScript code, no markdown code blocks.`

const INDEX_SYSTEM_PROMPT = `You are adding interactivity to an EXISTING HTML page. DO NOT redesign or recreate the page.

ABSOLUTE RULE: COPY THE SOURCE HTML EXACTLY
- Start with the EXACT source HTML provided below
- Copy EVERY element, class, style, and attribute VERBATIM
- The only changes allowed are adding interactive attributes

WHAT YOU CAN DO:
1. Add trigger-flow="flowName" to buttons/links for click actions
2. Add set-state="path" set-to="value" to elements for state changes
3. Add toggle-state="path" to elements for boolean toggles
4. Add a <script> block at the end of body with initVxRuntime()

WHAT YOU CANNOT DO:
- Change any CSS colors, fonts, spacing, or layout
- Remove, rename, or restructure any HTML elements
- Change any class names or inline styles
- Add new elements (except modal/overlay containers for flows)
- Use Web Components or ES modules

OUTPUT FORMAT:
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  [COPY EXACT HEAD FROM SOURCE - all meta tags, styles, links]
</head>
<body>
  [COPY EXACT BODY FROM SOURCE - only add trigger-flow/set-state/toggle-state attributes]

  <!-- Add any needed modal containers for flows -->
  <div id="modal-container" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:1000;">
    <div style="background:white; margin:10% auto; padding:24px; max-width:500px; border-radius:8px;">
      <!-- Modal content matching the source design -->
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      if (typeof window.initVxRuntime === 'function') {
        window.initVxRuntime({
          initialState: { /* state for the flows */ },
          flows: [
            {
              name: "flow-name",
              trigger: { event: "click", selector: "[trigger-flow='flow-name']" },
              steps: [{ set: "state.path", to: true }]
            }
          ],
          debug: true
        });
      }
    });
  </script>
</body>
</html>
\`\`\`

FLOW EXAMPLES:
- Open modal: { set: "modal.open", to: true }
- Close modal: { set: "modal.open", to: false }
- Toggle state: { toggle: "isEnabled" }
- Chain actions: multiple steps in the steps array

CRITICAL: The visual appearance must be IDENTICAL to the source. If you change anything visually, you have failed.

Return ONLY the HTML, no markdown code blocks.`

// ============ LLM Providers ============

async function generateWithAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  screenshotBase64?: string
): Promise<string> {
  console.log('[generate-prototype-file] Calling Anthropic API')

  const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = []

  if (screenshotBase64) {
    let mediaType = 'image/png'
    let imageData = screenshotBase64

    const dataUrlMatch = screenshotBase64.match(/^data:(image\/\w+);base64,(.+)$/)
    if (dataUrlMatch) {
      mediaType = dataUrlMatch[1]
      imageData = dataUrlMatch[2]
    } else if (screenshotBase64.startsWith('data:')) {
      imageData = screenshotBase64.replace(/^data:image\/\w+;base64,/, '')
    }

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: imageData,
      },
    })
  }

  content.push({ type: 'text', text: userPrompt })

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
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Anthropic API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.content[0]?.text || ''
}

async function generateWithOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  screenshotBase64?: string
): Promise<string> {
  console.log('[generate-prototype-file] Calling OpenAI API')

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = []

  if (screenshotBase64) {
    content.push({
      type: 'image_url',
      image_url: {
        url: screenshotBase64.startsWith('data:')
          ? screenshotBase64
          : `data:image/png;base64,${screenshotBase64}`,
      },
    })
  }

  content.push({ type: 'text', text: userPrompt })

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
        { role: 'user', content },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

async function generateWithGoogle(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  screenshotBase64?: string
): Promise<string> {
  console.log('[generate-prototype-file] Calling Google API')

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []

  parts.push({ text: systemPrompt + '\n\n' + userPrompt })

  if (screenshotBase64) {
    let mimeType = 'image/png'
    let imageData = screenshotBase64

    const dataUrlMatch = screenshotBase64.match(/^data:(image\/\w+);base64,(.+)$/)
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1]
      imageData = dataUrlMatch[2]
    } else if (screenshotBase64.startsWith('data:')) {
      imageData = screenshotBase64.replace(/^data:image\/\w+;base64,/, '')
    }

    parts.push({
      inlineData: {
        mimeType,
        data: imageData,
      },
    })
  }

  const modelName = model || 'gemini-2.0-flash'
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Google API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

// ============ File Generators ============

async function generateFlowsJson(
  request: GenerateFileRequest,
  apiKey: string
): Promise<GenerateFileResponse> {
  const { implementationScript, variantApproach, provider, model } = request

  const userPrompt = `Generate flows JSON for a "${variantApproach}" prototype variant.

IMPLEMENTATION SCRIPT:
${JSON.stringify(implementationScript, null, 2)}

Create flows that implement the entry points and match the variant guidelines.
Focus on: ${implementationScript.variantGuidelines.focusAreas.join(', ')}
Avoid: ${implementationScript.variantGuidelines.avoidAreas.join(', ')}

Return ONLY the JSON object with "flows" array.`

  // Log the actual prompts being sent to the LLM
  console.log('[generate-prototype-file] ═══════════════════════════════════════')
  console.log('[generate-prototype-file] 📝 SYSTEM PROMPT (flows.json):')
  console.log(FLOWS_SYSTEM_PROMPT)
  console.log('[generate-prototype-file] ═══════════════════════════════════════')
  console.log('[generate-prototype-file] 📝 USER PROMPT (flows.json):')
  console.log(userPrompt)
  console.log('[generate-prototype-file] ═══════════════════════════════════════')

  let rawResponse: string
  switch (provider) {
    case 'openai':
      rawResponse = await generateWithOpenAI(apiKey, model || 'gpt-4o', FLOWS_SYSTEM_PROMPT, userPrompt)
      break
    case 'google':
      rawResponse = await generateWithGoogle(apiKey, model || 'gemini-2.0-flash', FLOWS_SYSTEM_PROMPT, userPrompt)
      break
    case 'anthropic':
    default:
      rawResponse = await generateWithAnthropic(apiKey, model || 'claude-sonnet-4-20250514', FLOWS_SYSTEM_PROMPT, userPrompt)
      break
  }

  // Clean markdown if present
  let content = rawResponse.trim()
  if (content.startsWith('```json')) content = content.slice(7)
  else if (content.startsWith('```')) content = content.slice(3)
  if (content.endsWith('```')) content = content.slice(0, -3)
  content = content.trim()

  // Sanitize LLM output to fix smart quotes and other issues
  content = sanitizeLLMOutput(content)

  // Validate JSON
  JSON.parse(content)

  return {
    path: 'flows/user-flow.json',
    content,
    type: 'json',
    summary: 'User flow definitions for VxFlowEngine',
  }
}

async function generateComponent(
  request: GenerateFileRequest,
  apiKey: string
): Promise<GenerateFileResponse> {
  const { implementationScript, variantApproach, designTokens, componentName, previousFiles, provider, model } = request

  if (!componentName) {
    throw new Error('componentName is required for component generation')
  }

  const userPrompt = `Generate a "${componentName}" Web Component for a "${variantApproach}" prototype.

VARIANT GUIDELINES:
${implementationScript.variantGuidelines.description}
Focus on: ${implementationScript.variantGuidelines.focusAreas.join(', ')}
Avoid: ${implementationScript.variantGuidelines.avoidAreas.join(', ')}
Tone: ${implementationScript.variantGuidelines.tonality}

STATE SCHEMA:
${JSON.stringify(implementationScript.stateSchema, null, 2)}

AVAILABLE DESIGN TOKENS (use these to match the original design):
${designTokens.slice(0, 50).map(t => `${t.cssVariable}: ${t.value}`).join('\n')}

${previousFiles?.length ? `PREVIOUSLY GENERATED FILES:\n${previousFiles.map(f => `- ${f.path}: ${f.summary || f.exports?.join(', ') || 'no info'}`).join('\n')}` : ''}

Create the ${componentName} component following the VxComponent pattern.
Return ONLY the JavaScript code.`

  // Log the actual prompts being sent to the LLM
  console.log('[generate-prototype-file] ═══════════════════════════════════════')
  console.log(`[generate-prototype-file] 📝 SYSTEM PROMPT (component: ${componentName}):`)
  console.log(COMPONENT_SYSTEM_PROMPT)
  console.log('[generate-prototype-file] ═══════════════════════════════════════')
  console.log(`[generate-prototype-file] 📝 USER PROMPT (component: ${componentName}):`)
  console.log(userPrompt)
  console.log('[generate-prototype-file] ═══════════════════════════════════════')

  let rawResponse: string
  switch (provider) {
    case 'openai':
      rawResponse = await generateWithOpenAI(apiKey, model || 'gpt-4o', COMPONENT_SYSTEM_PROMPT, userPrompt)
      break
    case 'google':
      rawResponse = await generateWithGoogle(apiKey, model || 'gemini-2.0-flash', COMPONENT_SYSTEM_PROMPT, userPrompt)
      break
    case 'anthropic':
    default:
      rawResponse = await generateWithAnthropic(apiKey, model || 'claude-sonnet-4-20250514', COMPONENT_SYSTEM_PROMPT, userPrompt)
      break
  }

  // Clean markdown if present
  let content = rawResponse.trim()
  if (content.startsWith('```javascript') || content.startsWith('```js')) {
    content = content.replace(/^```(?:javascript|js)\n?/, '')
  } else if (content.startsWith('```')) {
    content = content.slice(3)
  }
  if (content.endsWith('```')) content = content.slice(0, -3)
  content = content.trim()

  // Sanitize LLM output to fix smart quotes and other issues
  content = sanitizeLLMOutput(content)

  // Extract exports
  const exportMatch = content.match(/export\s*\{\s*([^}]+)\s*\}/)
  const exports = exportMatch
    ? exportMatch[1].split(',').map(e => e.trim())
    : []

  return {
    path: `components/${componentName}.js`,
    content,
    type: 'js',
    exports,
    summary: `${componentName} Web Component`,
  }
}

async function generateIndexHtml(
  request: GenerateFileRequest,
  apiKey: string
): Promise<GenerateFileResponse> {
  const { implementationScript, variantApproach, previousFiles, sourceHtml, screenshotBase64, provider, model } = request

  const componentImports = implementationScript.componentsNeeded
    .map(c => `  <script type="module" src="components/${c}.js"></script>`)
    .join('\n')

  const previousFilesContext = previousFiles
    ?.filter(f => f.path.startsWith('components/'))
    .map(f => `- ${f.path}: ${f.summary || 'component'}`)
    .join('\n') || 'No custom components'

  // For index.html, we want to include MORE of the source HTML to preserve the design
  const sourceHtmlForPrompt = sourceHtml ? sourceHtml.slice(0, 50000) : ''

  const userPrompt = `Enhance this existing UI with "${variantApproach}" interactive behavior.

VARIANT APPROACH: ${variantApproach}
- ${implementationScript.variantGuidelines.description}
- Focus: ${implementationScript.variantGuidelines.focusAreas.join(', ')}

INTERACTIVE ENTRY POINTS TO ADD:
${implementationScript.entryPoints.map(ep => `- ${ep.selector}: ${ep.action} → triggers ${ep.triggersFlow || ep.triggersState || 'state change'}`).join('\n')}

FLOWS TO IMPLEMENT:
${implementationScript.flows.map(f => `- ${f.name}: ${f.description || 'implements the interaction'}`).join('\n')}

INITIAL STATE:
${JSON.stringify(implementationScript.initialState, null, 2)}

${sourceHtmlForPrompt ? `
========================================
SOURCE HTML - COPY THIS DESIGN EXACTLY
========================================
The following is the source HTML. Your output MUST:
1. COPY the exact CSS styles (colors, fonts, spacing, layouts)
2. COPY the exact HTML structure (sidebar, header, table, cards, etc.)
3. ONLY add interactive attributes (trigger-flow, set-state, toggle-state) to existing elements
4. Add the initVxRuntime script at the bottom

SOURCE HTML:
${sourceHtmlForPrompt}
========================================
` : 'No source HTML provided - create a clean design following the variant approach.'}

Return the enhanced HTML that looks EXACTLY like the source but with interactive behavior added.
Return ONLY the HTML, no markdown.`

  // Log the actual prompts being sent to the LLM
  console.log('[generate-prototype-file] ═══════════════════════════════════════')
  console.log('[generate-prototype-file] 📝 SYSTEM PROMPT (index.html):')
  console.log(INDEX_SYSTEM_PROMPT)
  console.log('[generate-prototype-file] ═══════════════════════════════════════')
  console.log('[generate-prototype-file] 📝 USER PROMPT (index.html):')
  console.log(userPrompt)
  console.log('[generate-prototype-file] ═══════════════════════════════════════')
  console.log(`[generate-prototype-file] 📊 Prompt lengths: system=${INDEX_SYSTEM_PROMPT.length} chars, user=${userPrompt.length} chars`)
  console.log(`[generate-prototype-file] 📷 Screenshot included: ${!!screenshotBase64} (${screenshotBase64 ? Math.round(screenshotBase64.length/1024) + 'KB' : 'none'})`)

  let rawResponse: string
  switch (provider) {
    case 'openai':
      rawResponse = await generateWithOpenAI(apiKey, model || 'gpt-4o', INDEX_SYSTEM_PROMPT, userPrompt, screenshotBase64)
      break
    case 'google':
      rawResponse = await generateWithGoogle(apiKey, model || 'gemini-2.0-flash', INDEX_SYSTEM_PROMPT, userPrompt, screenshotBase64)
      break
    case 'anthropic':
    default:
      rawResponse = await generateWithAnthropic(apiKey, model || 'claude-sonnet-4-20250514', INDEX_SYSTEM_PROMPT, userPrompt, screenshotBase64)
      break
  }

  // Clean markdown if present
  let content = rawResponse.trim()
  if (content.startsWith('```html')) content = content.slice(7)
  else if (content.startsWith('```')) content = content.slice(3)
  if (content.endsWith('```')) content = content.slice(0, -3)
  content = content.trim()

  // Sanitize LLM output to fix smart quotes and other issues
  content = sanitizeLLMOutput(content)

  return {
    path: 'index.html',
    content,
    type: 'html',
    summary: 'Entry point HTML for the prototype',
  }
}

// ============ Main Handler ============

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request
    const request: GenerateFileRequest = await req.json()

    // Log what we received
    console.log(`[generate-prototype-file] 📥 Received request for: ${request.fileType}`)
    console.log(`[generate-prototype-file] 📋 Request details:`, {
      fileType: request.fileType,
      variantApproach: request.variantApproach,
      componentName: request.componentName || 'N/A',
      componentsNeeded: request.implementationScript?.componentsNeeded,
      entryPointsCount: request.implementationScript?.entryPoints?.length || 0,
      flowsCount: request.implementationScript?.flows?.length || 0,
      designTokensCount: request.designTokens?.length || 0,
      previousFilesCount: request.previousFiles?.length || 0,
      sourceHtmlLength: request.sourceHtml?.length || 0,
      hasScreenshot: !!request.screenshotBase64,
      screenshotSize: request.screenshotBase64 ? `${Math.round(request.screenshotBase64.length / 1024)}KB` : 'none',
      provider: request.provider,
      model: request.model,
    })

    // For index.html, log the implementation details
    if (request.fileType === 'index.html') {
      console.log('[generate-prototype-file] 📋 Entry points:', JSON.stringify(request.implementationScript?.entryPoints, null, 2))
      console.log('[generate-prototype-file] 📋 Flows:', JSON.stringify(request.implementationScript?.flows?.map(f => ({ name: f.name, desc: f.description })), null, 2))
      console.log('[generate-prototype-file] 📋 Initial state:', JSON.stringify(request.implementationScript?.initialState, null, 2))
      console.log('[generate-prototype-file] 📋 Source HTML preview (first 500 chars):', request.sourceHtml?.slice(0, 500))
    }

    if (!request.fileType || !request.implementationScript || !request.variantApproach) {
      return new Response(
        JSON.stringify({ error: 'fileType, implementationScript, and variantApproach are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle non-LLM file types
    if (request.fileType === 'tokens.css') {
      const result = generateTokensCss(request.designTokens)
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (request.fileType === 'store.json') {
      const result = generateStoreJson(request.implementationScript.initialState)
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // LLM-based generation requires authentication
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get API key
    const provider = request.provider || 'anthropic'
    const { data: apiKey, error: apiKeyError } = await supabaseClient.rpc('get_api_key', {
      p_user_id: user.id,
      p_provider: provider,
    })

    if (apiKeyError || !apiKey) {
      return new Response(
        JSON.stringify({ error: `No ${provider} API key configured` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate based on file type
    let result: GenerateFileResponse
    switch (request.fileType) {
      case 'flows.json':
        result = await generateFlowsJson(request, apiKey)
        break
      case 'component':
        result = await generateComponent(request, apiKey)
        break
      case 'index.html':
        result = await generateIndexHtml(request, apiKey)
        break
      default:
        throw new Error(`Unknown file type: ${request.fileType}`)
    }

    console.log('[generate-prototype-file] Generated:', {
      path: result.path,
      type: result.type,
      length: result.content.length,
    })

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[generate-prototype-file] Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'File generation failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
