// Supabase Edge Function for generating implementation scripts
// Step 1 of the multi-stage agent architecture
// Analyzes variant plan and screen to output structured behavior definition
// Deploy with: supabase functions deploy generate-implementation-script

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ Types ============

interface VariantPlan {
  id: string
  variant_index: number
  title: string
  description: string
  key_changes: string[]
  style_notes?: string
}

interface UIMetadata {
  screenType?: string
  detectedComponents?: string[]
  layout?: { type: string; columns?: number }
  colorPalette?: string[]
  typography?: { headingFont?: string; bodyFont?: string }
}

interface DesignToken {
  name: string
  value: string
  type: 'color' | 'typography' | 'spacing' | 'radius' | 'shadow'
  cssVariable: string
}

type VariantApproach = 'minimal' | 'feature-rich' | 'gamified' | 'accessible' | 'mobile-first' | 'enterprise'

interface GenerateScriptRequest {
  variantPlan: VariantPlan
  screenUnderstanding?: {
    primaryGoal?: string
    userFlows?: string[]
    keyInteractions?: string[]
  }
  designTokens: DesignToken[]
  uiMetadata?: UIMetadata
  productContext?: string
  variantApproach: VariantApproach
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
}

interface EntryPoint {
  selector: string
  action: 'click' | 'submit' | 'input' | 'change' | 'hover' | 'focus'
  triggersState?: string
  triggersFlow?: string
  label?: string
}

interface FlowStep {
  set?: string
  to?: unknown
  toggle?: string
  delay?: number
  after?: number
  label?: string
  if?: string | Record<string, unknown>
  then?: FlowStep[]
  else?: FlowStep[]
  flow?: string
}

interface Flow {
  name: string
  description?: string
  trigger?: {
    event: string
    selector?: string
    when?: string | Record<string, unknown>
  }
  when?: string | Record<string, unknown>
  steps: FlowStep[]
}

interface SuccessCriteria {
  state?: Record<string, unknown>
  display?: string
  analyticsEvents?: string[]
}

interface GenerateScriptResponse {
  stateSchema: Record<string, string>
  initialState: Record<string, unknown>
  entryPoints: EntryPoint[]
  flows: Flow[]
  componentsNeeded: string[]
  successCriteria?: SuccessCriteria
  variantGuidelines: {
    description: string
    focusAreas: string[]
    avoidAreas: string[]
    tonality: string
  }
}

// ============ Variant Guidelines ============

const VARIANT_GUIDELINES: Record<VariantApproach, { description: string; focusAreas: string[]; avoidAreas: string[]; tonality: string }> = {
  minimal: {
    description: 'Clean and focused with only essential features',
    focusAreas: ['Simplicity', 'Fast interactions', 'Clear hierarchy', 'White space'],
    avoidAreas: ['Feature creep', 'Visual clutter', 'Complex animations'],
    tonality: 'Direct and concise',
  },
  'feature-rich': {
    description: 'Comprehensive with full functionality and options',
    focusAreas: ['Complete features', 'Power user shortcuts', 'Advanced options', 'Customization'],
    avoidAreas: ['Overwhelming new users', 'Slow performance'],
    tonality: 'Informative and detailed',
  },
  gamified: {
    description: 'Engaging experience with progress indicators and rewards',
    focusAreas: ['Progress feedback', 'Micro-animations', 'Achievement moments', 'Delight'],
    avoidAreas: ['Childish aesthetics', 'Distracting elements', 'Over-animation'],
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
    avoidAreas: ['Casual aesthetics', 'Unnecessary animations', 'Limited functionality'],
    tonality: 'Professional and efficient',
  },
}

// ============ Available Components ============

const AVAILABLE_COMPONENTS = [
  'vx-button',
  'vx-input',
  'vx-form',
  'vx-dropdown',
  'vx-modal',
  'vx-tabs',
  'vx-accordion',
  'vx-stepper',
  'vx-toast',
  'vx-loading',
  'vx-card',
  'vx-badge',
  'vx-progress',
  'vx-tooltip',
  'vx-checkbox',
  'vx-radio',
  'vx-switch',
  'vx-slider',
  'vx-avatar',
  'vx-alert',
]

// ============ System Prompt ============

const SYSTEM_PROMPT = `You are an expert UX engineer designing interactive prototype behavior.

CRITICAL: You are enhancing an EXISTING UI design, not creating from scratch. The prototype must preserve the original design's visual appearance, colors, typography, spacing, and overall look and feel.

Your task is to analyze a variant plan and create a structured implementation script that defines:
1. State schema - all state variables needed for the prototype
2. Initial state values
3. Entry points - where user interaction begins
4. Flows - sequences of state changes for each interaction
5. Components needed - which Voxel components to use (include ALL components necessary for a complete, functional prototype)
6. Success criteria - what indicates successful completion

AVAILABLE VOXEL COMPONENTS:
${AVAILABLE_COMPONENTS.map(c => `- <${c}>`).join('\n')}

STATE SCHEMA TYPES:
- boolean: true/false values
- string: text values
- number: numeric values
- string|null: nullable string
- number|null: nullable number
- enum:value1|value2|value3: enumeration
- array: list of items
- object: nested object

FLOW STEP TYPES:
- { set: "path", to: value } - Set state value
- { toggle: "path" } - Toggle boolean
- { delay: 1000 } - Wait milliseconds
- { after: 1000, set: "path", to: value } - Set after delay
- { if: "condition", then: [...], else: [...] } - Conditional
- { flow: "flowName" } - Execute another flow

ENTRY POINT ACTIONS:
- click: Button, link, or clickable element
- submit: Form submission
- input: Text input change
- change: Select, checkbox, or radio change
- hover: Mouse hover (desktop)
- focus: Element receives focus

Return a valid JSON object with the implementation script structure.`

// ============ Prompt Builder ============

function buildPrompt(request: GenerateScriptRequest): string {
  const guidelines = VARIANT_GUIDELINES[request.variantApproach]

  let prompt = `Design the behavior for a "${request.variantApproach}" variant prototype.\n\n`

  prompt += `VARIANT PLAN:\n`
  prompt += `Title: ${request.variantPlan.title}\n`
  prompt += `Description: ${request.variantPlan.description}\n`
  prompt += `Key Changes:\n${request.variantPlan.key_changes.map(c => `- ${c}`).join('\n')}\n`
  if (request.variantPlan.style_notes) {
    prompt += `Style Notes: ${request.variantPlan.style_notes}\n`
  }
  prompt += '\n'

  prompt += `VARIANT APPROACH: ${request.variantApproach}\n`
  prompt += `- ${guidelines.description}\n`
  prompt += `- Focus on: ${guidelines.focusAreas.join(', ')}\n`
  prompt += `- Avoid: ${guidelines.avoidAreas.join(', ')}\n`
  prompt += `- Tone: ${guidelines.tonality}\n\n`

  if (request.screenUnderstanding) {
    prompt += `SCREEN UNDERSTANDING:\n`
    if (request.screenUnderstanding.primaryGoal) {
      prompt += `Primary Goal: ${request.screenUnderstanding.primaryGoal}\n`
    }
    if (request.screenUnderstanding.userFlows?.length) {
      prompt += `User Flows:\n${request.screenUnderstanding.userFlows.map(f => `- ${f}`).join('\n')}\n`
    }
    if (request.screenUnderstanding.keyInteractions?.length) {
      prompt += `Key Interactions:\n${request.screenUnderstanding.keyInteractions.map(i => `- ${i}`).join('\n')}\n`
    }
    prompt += '\n'
  }

  if (request.uiMetadata) {
    prompt += `UI METADATA:\n`
    if (request.uiMetadata.screenType) {
      prompt += `Screen Type: ${request.uiMetadata.screenType}\n`
    }
    if (request.uiMetadata.detectedComponents?.length) {
      prompt += `Detected Components: ${request.uiMetadata.detectedComponents.join(', ')}\n`
    }
    if (request.uiMetadata.layout) {
      prompt += `Layout: ${JSON.stringify(request.uiMetadata.layout)}\n`
    }
    prompt += '\n'
  }

  if (request.designTokens.length > 0) {
    prompt += `DESIGN TOKENS AVAILABLE (use these to match the original design):\n`
    request.designTokens.slice(0, 50).forEach(token => {
      prompt += `${token.cssVariable}: ${token.value}\n`
    })
    prompt += '\n'
  }

  if (request.productContext) {
    prompt += `PRODUCT CONTEXT (important for understanding how UI/UX should work):\n${request.productContext.slice(0, 5000)}\n\n`
  }

  prompt += `Generate an implementation script JSON with this structure:
{
  "stateSchema": {
    "ui.loading": "boolean",
    "ui.step": "enum:idle|processing|complete",
    "form.email": "string",
    "modal.open": "boolean"
  },
  "initialState": {
    "ui": { "loading": false, "step": "idle" },
    "form": { "email": "" },
    "modal": { "open": false }
  },
  "entryPoints": [
    {
      "selector": "button.submit-btn",
      "action": "click",
      "triggersFlow": "submit-form",
      "label": "Submit button"
    }
  ],
  "flows": [
    {
      "name": "submit-form",
      "description": "Handles form submission",
      "steps": [
        { "set": "ui.loading", "to": true },
        { "delay": 1500, "label": "API call simulation" },
        { "set": "ui.loading", "to": false },
        { "set": "ui.step", "to": "complete" }
      ]
    }
  ],
  "componentsNeeded": ["vx-button", "vx-input", "vx-form", "vx-loading"],
  "successCriteria": {
    "state": { "ui.step": "complete" },
    "display": "User sees success confirmation"
  },
  "variantGuidelines": {
    "description": "${guidelines.description}",
    "focusAreas": ${JSON.stringify(guidelines.focusAreas)},
    "avoidAreas": ${JSON.stringify(guidelines.avoidAreas)},
    "tonality": "${guidelines.tonality}"
  }
}

IMPORTANT:
- Include entry points based on the key interactions needed
- Create flows for each major user action the prototype should support
- Include ALL components necessary for a complete, functional prototype that matches the original design
- Match the variant approach in complexity and style
- State paths should use dot notation (e.g., "ui.loading", "form.email")
- Keep flows focused and not too long (3-8 steps each)
- Include components for: forms, modals, buttons, lists, cards, navigation, toasts, etc. as needed by the prototype

Return ONLY the JSON object, no markdown code blocks.`

  return prompt
}

// ============ Response Parser ============

function parseResponse(response: string): GenerateScriptResponse {
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

  // Validate required fields
  if (!parsed.stateSchema || typeof parsed.stateSchema !== 'object') {
    throw new Error('Response must contain stateSchema object')
  }
  if (!parsed.initialState || typeof parsed.initialState !== 'object') {
    throw new Error('Response must contain initialState object')
  }
  if (!Array.isArray(parsed.entryPoints)) {
    throw new Error('Response must contain entryPoints array')
  }
  if (!Array.isArray(parsed.flows)) {
    throw new Error('Response must contain flows array')
  }
  if (!Array.isArray(parsed.componentsNeeded)) {
    throw new Error('Response must contain componentsNeeded array')
  }

  // Filter to only valid components and limit to 4 maximum
  const validComponents = parsed.componentsNeeded
    .filter((c: string) => AVAILABLE_COMPONENTS.includes(c))
    .slice(0, 4) // Cap at 4 components max to prevent long generation times

  return {
    stateSchema: parsed.stateSchema,
    initialState: parsed.initialState,
    entryPoints: parsed.entryPoints,
    flows: parsed.flows,
    componentsNeeded: validComponents.length > 0 ? validComponents : ['vx-button', 'vx-loading'],
    successCriteria: parsed.successCriteria,
    variantGuidelines: parsed.variantGuidelines || VARIANT_GUIDELINES[parsed.variantApproach || 'minimal'],
  }
}

// ============ LLM Providers ============

async function generateWithAnthropic(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  console.log('[generate-implementation-script] Calling Anthropic API')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
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
  prompt: string
): Promise<string> {
  console.log('[generate-implementation-script] Calling OpenAI API')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
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
  prompt: string
): Promise<string> {
  console.log('[generate-implementation-script] Calling Google API')

  const modelName = model || 'gemini-2.0-flash'
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM_PROMPT + '\n\n' + prompt }] }],
        generationConfig: { maxOutputTokens: 4096 },
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
    const request: GenerateScriptRequest = await req.json()

    if (!request.variantPlan || !request.variantApproach) {
      return new Response(
        JSON.stringify({ error: 'variantPlan and variantApproach are required' }),
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

    // Get API key from Vault
    const provider = request.provider || 'anthropic'
    console.log('[generate-implementation-script] Getting API key for provider:', provider)

    const { data: apiKey, error: apiKeyError } = await supabaseClient.rpc('get_api_key', {
      p_user_id: user.id,
      p_provider: provider,
    })

    if (apiKeyError || !apiKey) {
      console.error('[generate-implementation-script] Error getting API key:', apiKeyError)
      return new Response(
        JSON.stringify({ error: `No ${provider} API key configured. Please add your API key in Settings.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build prompt
    const prompt = buildPrompt(request)

    // Call LLM
    let rawResponse: string
    switch (provider) {
      case 'openai':
        rawResponse = await generateWithOpenAI(apiKey, request.model || 'gpt-4o', prompt)
        break
      case 'google':
        rawResponse = await generateWithGoogle(apiKey, request.model || 'gemini-2.0-flash', prompt)
        break
      case 'anthropic':
      default:
        rawResponse = await generateWithAnthropic(apiKey, request.model || 'claude-sonnet-4-20250514', prompt)
        break
    }

    // Parse response
    const result = parseResponse(rawResponse)

    console.log('[generate-implementation-script] Generation complete:', {
      entryPoints: result.entryPoints.length,
      flows: result.flows.length,
      componentsNeeded: result.componentsNeeded,
      approach: request.variantApproach,
    })

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[generate-implementation-script] Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Script generation failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
