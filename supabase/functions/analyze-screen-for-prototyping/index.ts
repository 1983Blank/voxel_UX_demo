// Supabase Edge Function for analyzing screens for file-based prototyping
// Detects entry points, components, and suggests implementation scripts
// Deploy with: supabase functions deploy analyze-screen-for-prototyping

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ============ Types ============

interface AnalyzeRequest {
  screenId: string
  screenHtml: string
  screenshotBase64?: string
  designTokens?: DesignToken[]
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
}

interface DesignToken {
  name: string
  value: string
  type: 'color' | 'typography' | 'spacing' | 'radius' | 'shadow'
  cssVariable: string
}

interface EntryPoint {
  selector: string
  action: 'click' | 'submit' | 'input' | 'change' | 'hover' | 'focus'
  triggersState?: string
  triggersFlow?: string
  label?: string
}

interface DetectedComponent {
  type: string
  selector: string
  text?: string
  purpose?: string
  suggestedInteractions?: string[]
}

interface StateSchema {
  [key: string]: string | StateSchema
}

interface Flow {
  name: string
  description?: string
  trigger?: {
    event: string
    selector?: string
    when?: string | Record<string, unknown>
  }
  steps: FlowStep[]
}

interface FlowStep {
  set?: string
  to?: unknown
  toggle?: string
  delay?: number
  after?: number
  label?: string
}

interface ImplementationScript {
  id: string
  name: string
  description: string
  entryPoints: EntryPoint[]
  stateSchema: StateSchema
  initialState?: Record<string, unknown>
  flows: Flow[]
  successCriteria?: {
    state?: Record<string, unknown>
    display?: string
  }
  tags?: string[]
  complexity?: 1 | 2 | 3 | 4 | 5
}

interface AnalysisResponse {
  suggestedScripts: ImplementationScript[]
  detectedEntryPoints: EntryPoint[]
  detectedComponents: DetectedComponent[]
  recommendedApproach: string
  screenCategory?: string
  estimatedEffort?: 'low' | 'medium' | 'high'
}

// ============ System Prompt ============

const SYSTEM_PROMPT = `You are an expert UI/UX analyst specializing in identifying interaction patterns and prototyping opportunities in web interfaces.

Your task is to analyze HTML and screenshots to:
1. Detect interactive entry points (buttons, forms, links, CTAs)
2. Identify UI components that could be enhanced with interactivity
3. Create implementation scripts that define user flows
4. Suggest realistic state management for prototypes

ANALYSIS PRINCIPLES:
- Focus on the PRIMARY user journey (e.g., checkout flow, signup process)
- Identify 1-3 key interaction flows, not every possible interaction
- State schemas should be minimal but complete for the flows
- Entry points should map to real DOM elements with valid selectors
- Flows should simulate realistic user experiences with appropriate delays

IMPLEMENTATION SCRIPT STRUCTURE:
Each script defines:
- entryPoints: Where users start interacting (with CSS selectors)
- stateSchema: What data the prototype manages
- flows: Sequences of state transitions
- successCriteria: What "completion" looks like

COMPONENT DETECTION:
Look for these patterns:
- Modals/dialogs (often triggered by buttons)
- Forms with validation requirements
- Tab/accordion navigation
- Dropdown menus
- Loading/progress indicators
- Toast/notification areas
- Stepper/wizard flows

STATE TYPES:
- "boolean" for toggles (modal open/closed)
- "string" for text values
- "number" for counts
- "enum:a|b|c" for fixed options (status: idle|loading|success|error)
- "string|null" for optional values

FLOW STEPS:
- { "set": "path.to.state", "to": value }
- { "toggle": "path.to.boolean" }
- { "delay": 1500, "label": "Simulating API call" }
- { "after": 2000, "set": "modal.open", "to": false }

Return JSON matching the AnalysisResponse interface. Focus on actionable, implementable suggestions.`

// ============ Prompt Builder ============

function buildAnalysisPrompt(request: AnalyzeRequest): string {
  let prompt = `Analyze this web screen for prototyping opportunities.\n\n`

  if (request.designTokens && request.designTokens.length > 0) {
    prompt += `Design Tokens Available:\n`
    const colorTokens = request.designTokens.filter(t => t.type === 'color').slice(0, 10)
    if (colorTokens.length > 0) {
      prompt += `Colors: ${colorTokens.map(t => `${t.name}=${t.value}`).join(', ')}\n`
    }
    prompt += '\n'
  }

  prompt += `HTML Structure (compacted):\n${request.screenHtml.slice(0, 20000)}\n\n`

  prompt += `Analyze this screen and return a JSON object with:
1. suggestedScripts: 1-3 implementation scripts for the main user flows
2. detectedEntryPoints: All interactive elements found
3. detectedComponents: UI components that could be enhanced
4. recommendedApproach: Brief strategy recommendation
5. screenCategory: e.g., "e-commerce", "dashboard", "landing", "form"
6. estimatedEffort: "low", "medium", or "high"

Focus on the PRIMARY user journey. Return ONLY valid JSON.`

  return prompt
}

// ============ Response Parser ============

function parseAnalysisResponse(response: string): AnalysisResponse {
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

  // Validate and normalize
  return {
    suggestedScripts: Array.isArray(parsed.suggestedScripts)
      ? parsed.suggestedScripts.map(normalizeScript)
      : [],
    detectedEntryPoints: Array.isArray(parsed.detectedEntryPoints)
      ? parsed.detectedEntryPoints
      : [],
    detectedComponents: Array.isArray(parsed.detectedComponents)
      ? parsed.detectedComponents
      : [],
    recommendedApproach: parsed.recommendedApproach || 'Use the suggested implementation scripts to add interactivity',
    screenCategory: parsed.screenCategory,
    estimatedEffort: parsed.estimatedEffort,
  }
}

function normalizeScript(script: Partial<ImplementationScript>): ImplementationScript {
  return {
    id: script.id || `script-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: script.name || 'Untitled Flow',
    description: script.description || '',
    entryPoints: Array.isArray(script.entryPoints) ? script.entryPoints : [],
    stateSchema: script.stateSchema || {},
    initialState: script.initialState,
    flows: Array.isArray(script.flows) ? script.flows : [],
    successCriteria: script.successCriteria,
    tags: script.tags,
    complexity: script.complexity,
  }
}

// ============ LLM Providers ============

async function generateWithAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  screenshotBase64?: string
): Promise<string> {
  console.log('[analyze-screen-for-prototyping] Calling Anthropic API', screenshotBase64 ? 'with screenshot' : 'text only')

  const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = []

  if (screenshotBase64) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: screenshotBase64.replace(/^data:image\/\w+;base64,/, ''),
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
      max_tokens: 8192,
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
  console.log('[analyze-screen-for-prototyping] Calling OpenAI API', screenshotBase64 ? 'with screenshot' : 'text only')

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
      max_tokens: 8192,
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
  console.log('[analyze-screen-for-prototyping] Calling Google API', screenshotBase64 ? 'with screenshot' : 'text only')

  const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = []

  parts.push({ text: SYSTEM_PROMPT + '\n\n' + prompt })

  if (screenshotBase64) {
    parts.push({
      inlineData: {
        mimeType: 'image/png',
        data: screenshotBase64.replace(/^data:image\/\w+;base64,/, ''),
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

// ============ Main Handler ============

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request
    const request: AnalyzeRequest = await req.json()

    if (!request.screenHtml) {
      return new Response(
        JSON.stringify({ error: 'screenHtml is required' }),
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

    // Get API key from user's settings
    const provider = request.provider || 'anthropic'
    const { data: apiKeyData } = await supabaseClient
      .from('user_api_keys')
      .select('encrypted_key')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .single()

    if (!apiKeyData?.encrypted_key) {
      return new Response(
        JSON.stringify({ error: `No ${provider} API key configured` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build prompt
    const prompt = buildAnalysisPrompt(request)

    // Call LLM
    let rawResponse: string
    switch (provider) {
      case 'openai':
        rawResponse = await generateWithOpenAI(
          apiKeyData.encrypted_key,
          request.model || 'gpt-4o',
          prompt,
          request.screenshotBase64
        )
        break
      case 'google':
        rawResponse = await generateWithGoogle(
          apiKeyData.encrypted_key,
          request.model || 'gemini-2.0-flash',
          prompt,
          request.screenshotBase64
        )
        break
      case 'anthropic':
      default:
        rawResponse = await generateWithAnthropic(
          apiKeyData.encrypted_key,
          request.model || 'claude-sonnet-4-20250514',
          prompt,
          request.screenshotBase64
        )
        break
    }

    // Parse response
    const analysisResult = parseAnalysisResponse(rawResponse)

    console.log('[analyze-screen-for-prototyping] Analysis complete:', {
      scriptsCount: analysisResult.suggestedScripts.length,
      entryPointsCount: analysisResult.detectedEntryPoints.length,
      componentsCount: analysisResult.detectedComponents.length,
      category: analysisResult.screenCategory,
    })

    return new Response(
      JSON.stringify(analysisResult),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[analyze-screen-for-prototyping] Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Analysis failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
