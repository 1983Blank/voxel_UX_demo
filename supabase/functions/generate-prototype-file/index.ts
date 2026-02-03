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

Create a JavaScript Web Component that extends VxComponent.

COMPONENT TEMPLATE:
\`\`\`javascript
// Component: component-name
// Description: Brief description

class ComponentName extends VxComponent {
  static get observedAttributes() {
    return ['variant', 'disabled', 'state-path'];
  }

  get template() {
    return \`
      <style>
        :host { display: block; }
        /* Component styles using CSS variables */
      </style>
      <div class="component-root">
        <!-- Component HTML -->
      </div>
    \`;
  }

  connectedCallback() {
    super.connectedCallback();
    this.render();
    this.setupListeners();
  }

  setupListeners() {
    // Event handling using VxStore
    this.shadowRoot.querySelector('.button')?.addEventListener('click', () => {
      this.dispatchVxEvent('click');
      const statePath = this.getAttribute('set-state');
      if (statePath) {
        window.VxStore?.set(statePath, this.getAttribute('set-to'));
      }
    });
  }

  onStateChange(state) {
    // React to state changes
    const path = this.getAttribute('state-path');
    if (path) {
      const value = this.getStateValue(path);
      this.updateFromState(value);
    }
  }

  updateFromState(value) {
    // Update component based on state
  }
}

customElements.define('component-name', ComponentName);
export { ComponentName };
\`\`\`

IMPORTANT:
- Use Shadow DOM for encapsulation
- Use CSS custom properties (var(--color-primary), etc.)
- Support state-path, set-state, set-to attributes
- Call super.connectedCallback() and super methods
- Export the component class

Return ONLY the JavaScript code, no markdown code blocks.`

const INDEX_SYSTEM_PROMPT = `You are a UX engineer creating the entry HTML for an interactive prototype.

Create an index.html that:
1. Imports the VxRuntime
2. Imports all generated components
3. Loads design tokens CSS
4. Creates the UI structure using Voxel components
5. Initializes the runtime with initial state

TEMPLATE:
\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prototype Title</title>
  <link rel="stylesheet" href="styles/tokens.css">
  <script type="module" src="runtime/vx-runtime.js"></script>
  <!-- Component imports -->
</head>
<body>
  <div id="prototype-root">
    <!-- UI structure using vx-* components -->
    <!-- Use state-path for reactive bindings -->
    <!-- Use set-state/set-to for actions -->
    <!-- Use trigger-flow for complex interactions -->
  </div>

  <script type="module">
    import { initVxRuntime } from './runtime/vx-runtime.js';
    import initialState from './state/store.json' with { type: 'json' };
    import flows from './flows/user-flow.json' with { type: 'json' };

    initVxRuntime({
      initialState,
      flows: flows.flows,
      debug: true,
    });
  </script>
</body>
</html>
\`\`\`

COMPONENT ATTRIBUTES:
- state-path="ui.loading": Bind to state path
- set-state="modal.open" set-to="true": Set state on action
- toggle-state="sidebar.expanded": Toggle boolean on action
- trigger-flow="submit-form": Execute flow on action
- vx-bind:visible="state.path": Conditional visibility
- vx-bind:class="state.path": Dynamic class binding

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

AVAILABLE DESIGN TOKENS:
${designTokens.slice(0, 10).map(t => `${t.cssVariable}: ${t.value}`).join('\n')}

${previousFiles?.length ? `PREVIOUSLY GENERATED FILES:\n${previousFiles.map(f => `- ${f.path}: ${f.summary || f.exports?.join(', ') || 'no info'}`).join('\n')}` : ''}

Create the ${componentName} component following the VxComponent pattern.
Return ONLY the JavaScript code.`

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

  const userPrompt = `Generate index.html for a "${variantApproach}" prototype variant.

VARIANT: ${variantApproach}
- ${implementationScript.variantGuidelines.description}
- Focus: ${implementationScript.variantGuidelines.focusAreas.join(', ')}
- Avoid: ${implementationScript.variantGuidelines.avoidAreas.join(', ')}

ENTRY POINTS:
${implementationScript.entryPoints.map(ep => `- ${ep.selector} (${ep.action}) → ${ep.triggersFlow || ep.triggersState || 'action'}`).join('\n')}

FLOWS:
${implementationScript.flows.map(f => `- ${f.name}: ${f.description || 'no description'}`).join('\n')}

COMPONENTS TO USE:
${implementationScript.componentsNeeded.join(', ')}

GENERATED COMPONENTS:
${previousFilesContext}

${sourceHtml ? `SOURCE HTML REFERENCE (adapt this structure):\n${sourceHtml.slice(0, 5000)}` : ''}

Create a complete, interactive HTML prototype.
Use vx-* components with state-path bindings.
Include all component imports.
Return ONLY the HTML.`

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
