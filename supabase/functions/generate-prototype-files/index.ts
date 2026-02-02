// Supabase Edge Function for generating file-based prototypes
// Creates complete file structures with Web Components and interactivity
// Deploy with: supabase functions deploy generate-prototype-files

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ Types ============

interface GenerateRequest {
  screenId: string
  screenHtml: string
  screenshotBase64?: string
  implementationScript: ImplementationScript
  designTokens: DesignToken[]
  variantApproach: 'minimal' | 'feature-rich' | 'gamified' | 'accessible' | 'mobile-first' | 'enterprise'
  customInstructions?: string
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
}

interface DesignToken {
  name: string
  value: string
  type: 'color' | 'typography' | 'spacing' | 'radius' | 'shadow'
  cssVariable: string
}

interface ImplementationScript {
  id: string
  name: string
  description: string
  entryPoints: EntryPoint[]
  stateSchema: Record<string, unknown>
  initialState?: Record<string, unknown>
  flows: Flow[]
  successCriteria?: {
    state?: Record<string, unknown>
    display?: string
  }
}

interface EntryPoint {
  selector: string
  action: string
  triggersState?: string
  triggersFlow?: string
  label?: string
}

interface Flow {
  name: string
  trigger?: { event: string; selector?: string; when?: unknown }
  steps: FlowStep[]
}

interface FlowStep {
  set?: string
  to?: unknown
  toggle?: string
  delay?: number
  after?: number
}

interface GeneratedFile {
  path: string
  content: string
  type: 'html' | 'js' | 'css' | 'json'
}

interface GenerateResponse {
  files: GeneratedFile[]
  previewInstructions: string
  warnings?: string[]
  componentsUsed: string[]
}

// ============ Variant Guidelines ============

const VARIANT_GUIDELINES = {
  minimal: {
    description: 'Clean and focused with only essential features',
    focusAreas: ['Simplicity', 'Fast interactions', 'Clear hierarchy', 'White space'],
    avoidAreas: ['Feature creep', 'Visual clutter', 'Complex animations'],
    tonality: 'Direct and concise',
  },
  'feature-rich': {
    description: 'Comprehensive with full functionality and options',
    focusAreas: ['Complete features', 'Power user shortcuts', 'Advanced options'],
    avoidAreas: ['Overwhelming new users', 'Slow performance'],
    tonality: 'Informative and detailed',
  },
  gamified: {
    description: 'Engaging experience with progress indicators and rewards',
    focusAreas: ['Progress feedback', 'Micro-animations', 'Achievement moments', 'Delight'],
    avoidAreas: ['Childish aesthetics', 'Distracting elements'],
    tonality: 'Encouraging and playful',
  },
  accessible: {
    description: 'WCAG compliant with focus on inclusivity',
    focusAreas: ['High contrast', 'Large touch targets', 'Screen reader support', 'Keyboard navigation'],
    avoidAreas: ['Color-only indicators', 'Small text', 'Complex gestures'],
    tonality: 'Clear and supportive',
  },
  'mobile-first': {
    description: 'Optimized for mobile and touch interfaces',
    focusAreas: ['Touch targets', 'Swipe gestures', 'Bottom navigation', 'Thumb zones'],
    avoidAreas: ['Hover states', 'Desktop-only patterns', 'Small controls'],
    tonality: 'Quick and efficient',
  },
  enterprise: {
    description: 'Professional and data-dense for power users',
    focusAreas: ['Data density', 'Keyboard shortcuts', 'Bulk actions', 'Export options'],
    avoidAreas: ['Casual aesthetics', 'Unnecessary animations'],
    tonality: 'Professional and efficient',
  },
}

// ============ System Prompt ============

const SYSTEM_PROMPT = `You are an expert front-end developer creating file-based interactive prototypes using Web Components.

Your task is to generate a complete prototype file structure that:
1. Uses the provided design tokens for consistent styling
2. Implements the behavior defined in the implementation script
3. Uses Voxel's Web Component library (vx-* components)
4. Creates real interactivity with state management

AVAILABLE WEB COMPONENTS:
- <vx-button> - Button with variants (primary, secondary, ghost, danger), loading state, icons
- <vx-input> - Text input with validation, labels, error states
- <vx-form> - Form wrapper with validation and submission handling
- <vx-dropdown> - Select/dropdown with search and multi-select
- <vx-modal> - Modal dialog with backdrop, animations, keyboard navigation
- <vx-tabs> - Tab navigation with keyboard support
- <vx-accordion> - Expandable/collapsible sections
- <vx-stepper> - Multi-step wizard/flow
- <vx-toast> - Toast notifications
- <vx-loading> - Loading indicators (spinner, skeleton, progress)

COMPONENT ATTRIBUTES:
- state-path: Bind to VxStore state (e.g., state-path="modal.open")
- set-state/set-to: Set state on action (e.g., set-state="step" set-to="2")
- toggle-state: Toggle boolean state
- trigger-flow: Execute a flow on action

STATE MANAGEMENT (VxStore):
- window.VxStore.get('path') - Get value
- window.VxStore.set('path', value) - Set value
- window.VxStore.toggle('path') - Toggle boolean
- window.VxStore.subscribe(callback) - React to changes

FLOW ENGINE (VxFlowEngine):
- Executes flows defined in user-flow.json
- Supports delays, conditions, state transitions
- Template expressions: {{random:6}}, {{timestamp}}, {{state.path}}

FILE STRUCTURE TO GENERATE:
1. index.html - Entry point importing all components and runtime
2. components/*.js - Any custom components needed (extend VxComponent)
3. state/store.json - Initial state from implementation script
4. flows/user-flow.json - Flow definitions from implementation script
5. styles/tokens.css - Design tokens as CSS variables

CODE STYLE:
- Use modern ES6+ syntax
- Use design token CSS variables (var(--color-primary), etc.)
- Keep code clean and well-commented
- Ensure accessibility (ARIA attributes, keyboard support)

Return a JSON object with a "files" array containing all generated files.`

// ============ Prompt Builder ============

function buildGenerationPrompt(request: GenerateRequest): string {
  const guidelines = VARIANT_GUIDELINES[request.variantApproach]

  let prompt = `Generate a ${request.variantApproach} variant prototype.\n\n`

  prompt += `VARIANT APPROACH: ${request.variantApproach}\n`
  prompt += `- ${guidelines.description}\n`
  prompt += `- Focus on: ${guidelines.focusAreas.join(', ')}\n`
  prompt += `- Avoid: ${guidelines.avoidAreas.join(', ')}\n`
  prompt += `- Tone: ${guidelines.tonality}\n\n`

  prompt += `IMPLEMENTATION SCRIPT:\n`
  prompt += `Name: ${request.implementationScript.name}\n`
  prompt += `Description: ${request.implementationScript.description}\n\n`

  prompt += `Entry Points:\n`
  request.implementationScript.entryPoints.forEach(ep => {
    prompt += `- ${ep.selector} (${ep.action}) → ${ep.triggersFlow || ep.triggersState || 'action'}\n`
  })
  prompt += '\n'

  prompt += `State Schema:\n${JSON.stringify(request.implementationScript.stateSchema, null, 2)}\n\n`

  prompt += `Initial State:\n${JSON.stringify(request.implementationScript.initialState || {}, null, 2)}\n\n`

  prompt += `Flows:\n${JSON.stringify(request.implementationScript.flows, null, 2)}\n\n`

  if (request.implementationScript.successCriteria) {
    prompt += `Success Criteria:\n${JSON.stringify(request.implementationScript.successCriteria, null, 2)}\n\n`
  }

  if (request.designTokens.length > 0) {
    prompt += `DESIGN TOKENS:\n`
    request.designTokens.forEach(token => {
      prompt += `${token.cssVariable}: ${token.value}; /* ${token.name} */\n`
    })
    prompt += '\n'
  }

  prompt += `SOURCE HTML (enhance this, don't replace entirely):\n${request.screenHtml.slice(0, 15000)}\n\n`

  if (request.customInstructions) {
    prompt += `CUSTOM INSTRUCTIONS:\n${request.customInstructions}\n\n`
  }

  prompt += `Generate the complete file structure. Return ONLY a JSON object with:
{
  "files": [
    { "path": "index.html", "content": "...", "type": "html" },
    { "path": "components/custom-component.js", "content": "...", "type": "js" },
    { "path": "state/store.json", "content": "...", "type": "json" },
    { "path": "flows/user-flow.json", "content": "...", "type": "json" },
    { "path": "styles/tokens.css", "content": "...", "type": "css" }
  ],
  "componentsUsed": ["vx-modal", "vx-button", "vx-form"],
  "previewInstructions": "Brief instruction for testing the prototype",
  "warnings": ["Optional warnings about limitations"]
}`

  return prompt
}

// ============ Response Parser ============

function parseGenerationResponse(response: string): GenerateResponse {
  // Clean response
  let cleaned = response.trim()

  // Remove markdown code blocks if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7)
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }
  cleaned = cleaned.trim()

  // Parse JSON
  const parsed = JSON.parse(cleaned)

  // Validate
  if (!Array.isArray(parsed.files)) {
    throw new Error('Response must contain a "files" array')
  }

  return {
    files: parsed.files.map((f: GeneratedFile) => ({
      path: f.path,
      content: f.content,
      type: f.type || inferFileType(f.path),
    })),
    previewInstructions: parsed.previewInstructions || 'Open index.html in the preview iframe',
    warnings: parsed.warnings,
    componentsUsed: parsed.componentsUsed || [],
  }
}

function inferFileType(path: string): 'html' | 'js' | 'css' | 'json' {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'html':
    case 'htm':
      return 'html'
    case 'js':
    case 'mjs':
      return 'js'
    case 'css':
      return 'css'
    case 'json':
      return 'json'
    default:
      return 'html'
  }
}

// ============ LLM Providers ============

async function generateWithAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  screenshotBase64?: string
): Promise<string> {
  console.log('[generate-prototype-files] Calling Anthropic API')

  const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = []

  if (screenshotBase64) {
    // Extract media type from data URL or default to png
    let mediaType = 'image/png'
    let imageData = screenshotBase64

    const dataUrlMatch = screenshotBase64.match(/^data:(image\/\w+);base64,(.+)$/)
    if (dataUrlMatch) {
      mediaType = dataUrlMatch[1]
      imageData = dataUrlMatch[2]
    } else if (screenshotBase64.startsWith('data:')) {
      // Has data: prefix but didn't match - strip it
      imageData = screenshotBase64.replace(/^data:image\/\w+;base64,/, '')
    }
    // If no data: prefix, assume it's raw base64

    console.log('[generate-prototype-files] Image media type:', mediaType)

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: imageData,
      },
    })
  }

  content.push({ type: 'text', text: prompt })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 16384,
      system: SYSTEM_PROMPT,
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
  prompt: string,
  screenshotBase64?: string
): Promise<string> {
  console.log('[generate-prototype-files] Calling OpenAI API')

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

  content.push({ type: 'text', text: prompt })

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      max_tokens: 16384,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
  prompt: string,
  screenshotBase64?: string
): Promise<string> {
  console.log('[generate-prototype-files] Calling Google API')

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []

  parts.push({ text: SYSTEM_PROMPT + '\n\n' + prompt })

  if (screenshotBase64) {
    // Extract media type from data URL or default to png
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
        generationConfig: { maxOutputTokens: 16384 },
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

// ============ Main Handler ============

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request
    const request: GenerateRequest = await req.json()

    if (!request.screenHtml || !request.implementationScript) {
      return new Response(
        JSON.stringify({ error: 'screenHtml and implementationScript are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get API key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from auth header
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

    // Get API key from Vault using RPC function (same as other edge functions)
    const provider = request.provider || 'anthropic'
    console.log('[generate-prototype-files] Getting API key for provider:', provider)

    const { data: apiKey, error: apiKeyError } = await supabaseClient.rpc('get_api_key', {
      p_user_id: user.id,
      p_provider: provider,
    })

    if (apiKeyError) {
      console.error('[generate-prototype-files] Error getting API key:', apiKeyError)
      return new Response(
        JSON.stringify({ error: `Failed to get ${provider} API key: ${apiKeyError.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!apiKey) {
      console.error('[generate-prototype-files] No API key found for provider:', provider)
      return new Response(
        JSON.stringify({ error: `No ${provider} API key configured. Please add your API key in Settings.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[generate-prototype-files] Successfully retrieved API key')

    // Build prompt
    const prompt = buildGenerationPrompt(request)

    // Call LLM
    let rawResponse: string
    switch (provider) {
      case 'openai':
        rawResponse = await generateWithOpenAI(
          apiKey,
          request.model || 'gpt-4o',
          prompt,
          request.screenshotBase64
        )
        break
      case 'google':
        rawResponse = await generateWithGoogle(
          apiKey,
          request.model || 'gemini-2.0-flash',
          prompt,
          request.screenshotBase64
        )
        break
      case 'anthropic':
      default:
        rawResponse = await generateWithAnthropic(
          apiKey,
          request.model || 'claude-sonnet-4-20250514',
          prompt,
          request.screenshotBase64
        )
        break
    }

    // Parse response
    const generationResult = parseGenerationResponse(rawResponse)

    console.log('[generate-prototype-files] Generation complete:', {
      fileCount: generationResult.files.length,
      componentsUsed: generationResult.componentsUsed,
      approach: request.variantApproach,
    })

    return new Response(
      JSON.stringify(generationResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[generate-prototype-files] Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Generation failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
