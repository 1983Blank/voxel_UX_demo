// Supabase Edge Function for LLM-based component extraction
// Uses vision capabilities to analyze screenshots + HTML and generate clean component code
// Deploy with: supabase functions deploy extract-components

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExtractRequest {
  screenId: string
  html: string
  screenshotBase64: string  // Base64 encoded screenshot
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
}

interface ComponentVariant {
  name: string
  html: string
  css: string
}

interface ExtractedComponentLLM {
  id: string
  name: string
  category: string
  description: string
  html: string
  css: string
  variants?: ComponentVariant[]
  props?: string[]
  sourceLocation?: {
    selector?: string
    boundingBox?: { x: number; y: number; width: number; height: number }
  }
}

interface ExtractResponse {
  success: boolean
  components?: ExtractedComponentLLM[]
  error?: string
  provider?: string
  model?: string
  durationMs?: number
}

// System prompt for component extraction
const SYSTEM_PROMPT = `You are an expert UI/UX engineer specializing in component extraction and design systems.

Your task is to analyze a web UI screenshot along with its HTML source code to:
1. Identify all distinct, reusable UI components visible in the screenshot
2. Generate clean, standalone HTML+CSS code for each component

## COMPONENT IDENTIFICATION RULES:
- Focus on UI patterns that could be reused: buttons, inputs, cards, navigation items, badges, alerts, modals, etc.
- Identify visual variations of the same component type (primary vs secondary buttons, etc.)
- Skip purely structural elements (generic divs, wrappers) unless they have distinct visual styling
- Group related elements (e.g., a button with its icon) as a single component

## CODE GENERATION RULES:
- Generate CLEAN, self-contained HTML that works in isolation
- Use semantic HTML elements (button, input, nav, etc.)
- Include ALL necessary CSS for the component to render correctly
- Use CSS class names prefixed with "vx-" to avoid conflicts
- Extract actual colors, fonts, and spacing from the original design
- Include hover/focus/active states when visible or implied
- Do NOT include external dependencies or JavaScript

## OUTPUT FORMAT:
Return a JSON array of components. Each component should have:
- name: Descriptive name (e.g., "Primary Action Button", "Search Input Field")
- category: One of: button, input, card, navigation, header, footer, modal, list, table, image, icon, badge, alert, form, dropdown, tabs, other
- description: Brief description of what this component does/represents
- html: Clean HTML code (use class names, not inline styles)
- css: Scoped CSS with .vx- prefix
- variants: Optional array of state variations (hover, disabled, etc.)
- props: Optional array of customizable properties

IMPORTANT: Return ONLY valid JSON. No markdown, no explanations, just the JSON array.`

// Build the prompt for component extraction
function buildExtractionPrompt(html: string): string {
  // Truncate HTML if too long to avoid token limits
  const maxHtmlLength = 50000
  const truncatedHtml = html.length > maxHtmlLength
    ? html.slice(0, maxHtmlLength) + '\n<!-- HTML truncated for length -->'
    : html

  return `Analyze the attached screenshot and this HTML source code to extract reusable UI components.

## HTML SOURCE:
\`\`\`html
${truncatedHtml}
\`\`\`

## INSTRUCTIONS:
1. Look at the screenshot to identify visual UI components
2. Cross-reference with the HTML to understand structure
3. For each component, generate clean, standalone HTML+CSS
4. Focus on commonly reusable patterns (buttons, inputs, cards, etc.)

Return a JSON array of extracted components. Maximum 20 components.`
}

// Generate component ID
function generateComponentId(): string {
  return `comp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

// Strip data URL prefix from base64 string if present
function stripBase64Prefix(base64: string): string {
  // Handle data URLs like "data:image/jpeg;base64,/9j/4AAQ..."
  const match = base64.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/)
  if (match) {
    return match[1]
  }
  return base64
}

// Parse LLM response into components array
function parseComponentsResponse(response: string): ExtractedComponentLLM[] {
  // Try to extract JSON from the response
  let jsonStr = response.trim()

  // Remove markdown code blocks if present
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7)
  } else if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3)
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3)
  }
  jsonStr = jsonStr.trim()

  // Try to find JSON array in the response
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    jsonStr = arrayMatch[0]
  }

  try {
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) {
      console.error('[extract-components] Response is not an array')
      return []
    }

    // Validate and add IDs to each component
    return parsed.map((comp: Partial<ExtractedComponentLLM>) => ({
      id: generateComponentId(),
      name: comp.name || 'Unnamed Component',
      category: comp.category || 'other',
      description: comp.description || '',
      html: comp.html || '',
      css: comp.css || '',
      variants: comp.variants || [],
      props: comp.props || [],
      sourceLocation: comp.sourceLocation,
    })).filter((comp: ExtractedComponentLLM) => comp.html && comp.html.length > 0)
  } catch (error) {
    console.error('[extract-components] Failed to parse response:', error)
    console.error('[extract-components] Response was:', jsonStr.slice(0, 500))
    return []
  }
}

// Extract components using Anthropic Claude
async function extractWithAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  screenshotBase64: string
): Promise<ExtractedComponentLLM[]> {
  console.log('[extract-components] Calling Anthropic API with vision')

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
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: screenshotBase64,
            },
          },
          {
            type: 'text',
            text: prompt,
          },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Anthropic API error')
  }

  const data = await response.json()
  const responseText = data.content[0]?.text || ''
  return parseComponentsResponse(responseText)
}

// Extract components using OpenAI GPT-4 Vision
async function extractWithOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  screenshotBase64: string
): Promise<ExtractedComponentLLM[]> {
  console.log('[extract-components] Calling OpenAI API with vision')

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
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${screenshotBase64}`,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'OpenAI API error')
  }

  const data = await response.json()
  const responseText = data.choices[0]?.message?.content || ''
  return parseComponentsResponse(responseText)
}

// Extract components using Google Gemini
async function extractWithGoogle(
  apiKey: string,
  model: string,
  prompt: string,
  screenshotBase64: string
): Promise<ExtractedComponentLLM[]> {
  console.log('[extract-components] Calling Google Gemini API with vision')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'image/jpeg',
                data: screenshotBase64,
              },
            },
            {
              text: SYSTEM_PROMPT + '\n\n' + prompt,
            },
          ],
        }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Google AI API error')
  }

  const data = await response.json()
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return parseComponentsResponse(responseText)
}

Deno.serve(async (req) => {
  console.log('[extract-components] Request received:', req.method)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

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
    console.log('[extract-components] User authenticated:', user.id)

    // Parse request
    const body: ExtractRequest = await req.json()
    console.log('[extract-components] Extracting from screen:', body.screenId)
    console.log('[extract-components] HTML length:', body.html?.length)
    console.log('[extract-components] Screenshot size:', body.screenshotBase64?.length)

    if (!body.screenId || !body.html || !body.screenshotBase64) {
      throw new Error('Missing required fields: screenId, html, and screenshotBase64')
    }

    // Strip data URL prefix from base64 if present
    const screenshotBase64 = stripBase64Prefix(body.screenshotBase64)
    console.log('[extract-components] Screenshot base64 length after stripping prefix:', screenshotBase64.length)

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

    const { data: keyConfigs, error: keyError } = await keyQuery.limit(1)
    const keyConfig = keyConfigs?.[0]

    if (keyError || !keyConfig) {
      throw new Error('No API key configured. Please add your API key in Settings.')
    }

    const modelToUse = body.model || keyConfig.model
    console.log('[extract-components] Using provider:', keyConfig.provider, 'model:', modelToUse)

    // Get decrypted API key
    const { data: apiKey, error: decryptError } = await supabase
      .rpc('get_api_key', { p_user_id: user.id, p_provider: keyConfig.provider })

    if (decryptError || !apiKey) {
      throw new Error('Failed to retrieve API key')
    }

    // Build the prompt
    const prompt = buildExtractionPrompt(body.html)

    // Extract components based on provider
    let components: ExtractedComponentLLM[]

    switch (keyConfig.provider) {
      case 'anthropic':
        components = await extractWithAnthropic(apiKey, modelToUse, prompt, screenshotBase64)
        break
      case 'openai':
        components = await extractWithOpenAI(apiKey, modelToUse, prompt, screenshotBase64)
        break
      case 'google':
        components = await extractWithGoogle(apiKey, modelToUse, prompt, screenshotBase64)
        break
      default:
        throw new Error(`Unsupported provider: ${keyConfig.provider}`)
    }

    const durationMs = Date.now() - startTime
    console.log('[extract-components] Extracted', components.length, 'components in', durationMs, 'ms')

    const response: ExtractResponse = {
      success: true,
      components,
      provider: keyConfig.provider,
      model: modelToUse,
      durationMs,
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[extract-components] Error:', errorMessage)

    const response: ExtractResponse = {
      success: false,
      error: errorMessage,
    }

    return new Response(
      JSON.stringify(response),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
