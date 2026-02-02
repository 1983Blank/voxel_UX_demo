// Supabase Edge Function for LLM-based design token extraction
// Uses vision capabilities to analyze screenshots + extracted values for semantic classification
// Deploy with: supabase functions deploy extract-design-tokens

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RawToken {
  type: 'color' | 'typography' | 'spacing' | 'border-radius' | 'shadow'
  value: string
  count: number
}

interface ExtractRequest {
  screenId: string
  screenName: string
  screenshotBase64: string
  rawTokens: RawToken[]
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
}

interface ClassifiedToken {
  type: 'color' | 'typography' | 'spacing' | 'border-radius' | 'shadow'
  value: string
  name: string
  category: string
  subcategory?: string
  description: string
  usageCount: number
  cssVariable?: string
}

interface ExtractResponse {
  success: boolean
  tokens?: ClassifiedToken[]
  error?: string
  provider?: string
  model?: string
  durationMs?: number
}

// System prompt for design token classification
const SYSTEM_PROMPT = `You are an expert design system architect specializing in design token extraction and classification.

Your task is to analyze a web UI screenshot along with pre-extracted design values (colors, typography, spacing) and:
1. Classify each value with a semantic name and purpose
2. Identify the role each value plays in the design system
3. Suggest appropriate CSS variable names

## CLASSIFICATION RULES:

### Colors:
- Identify primary, secondary, accent colors
- Recognize semantic colors: success, warning, error, info
- Distinguish background vs text vs border colors
- Name based on purpose, not appearance (e.g., "Primary Button Background" not "Blue")

### Typography:
- Identify heading vs body vs caption fonts
- Recognize font hierarchies (h1, h2, body, small)
- Note font weights and their purposes

### Spacing:
- Identify spacing scale patterns (xs, sm, md, lg, xl)
- Recognize component vs layout spacing
- Note padding vs margin usage patterns

### Border Radius:
- Identify shape patterns (sharp, rounded, pill)
- Note component-specific radius values

### Shadows:
- Classify by elevation level (subtle, medium, strong)
- Identify hover/focus shadow states

## OUTPUT FORMAT:
Return a JSON array of classified tokens. Each token should have:
- type: "color" | "typography" | "spacing" | "border-radius" | "shadow"
- value: The original value (hex color, font-family, pixel value, etc.)
- name: Semantic name (e.g., "Primary Brand Color", "Heading Font Family")
- category: Subcategory within type (e.g., for colors: "brand", "semantic", "neutral", "surface")
- subcategory: Optional further classification
- description: Brief description of how this token is used
- cssVariable: Suggested CSS variable name (e.g., "--color-primary", "--font-heading")

IMPORTANT: Return ONLY valid JSON array. No markdown, no explanations, just the JSON array.
Only classify the tokens provided - do not invent new values.`

// Build the prompt with extracted tokens
function buildClassificationPrompt(rawTokens: RawToken[], screenName: string): string {
  const colorTokens = rawTokens.filter(t => t.type === 'color')
  const typographyTokens = rawTokens.filter(t => t.type === 'typography')
  const spacingTokens = rawTokens.filter(t => t.type === 'spacing')
  const borderRadiusTokens = rawTokens.filter(t => t.type === 'border-radius')
  const shadowTokens = rawTokens.filter(t => t.type === 'shadow')

  return `Analyze the attached screenshot of "${screenName}" and classify these extracted design tokens:

## EXTRACTED COLORS (${colorTokens.length}):
${colorTokens.map(t => `- ${t.value} (used ${t.count}x)`).join('\n') || 'None found'}

## EXTRACTED TYPOGRAPHY (${typographyTokens.length}):
${typographyTokens.map(t => `- ${t.value} (used ${t.count}x)`).join('\n') || 'None found'}

## EXTRACTED SPACING (${spacingTokens.length}):
${spacingTokens.map(t => `- ${t.value} (used ${t.count}x)`).join('\n') || 'None found'}

## EXTRACTED BORDER RADIUS (${borderRadiusTokens.length}):
${borderRadiusTokens.map(t => `- ${t.value} (used ${t.count}x)`).join('\n') || 'None found'}

## EXTRACTED SHADOWS (${shadowTokens.length}):
${shadowTokens.map(t => `- ${t.value} (used ${t.count}x)`).join('\n') || 'None found'}

## INSTRUCTIONS:
1. Look at the screenshot to understand the visual context
2. Classify each token with a semantic name based on its visual role
3. For colors, identify which are primary brand colors, semantic colors (success/error), neutrals, etc.
4. For typography, identify the font hierarchy
5. Suggest CSS variable names following design system conventions

Return a JSON array classifying ALL the tokens listed above.`
}

// Strip data URL prefix from base64 string if present
function stripBase64Prefix(base64: string): string {
  const match = base64.match(/^data:image\/[a-zA-Z]+;base64,(.+)$/)
  if (match) {
    return match[1]
  }
  return base64
}

// Parse LLM response into classified tokens
function parseTokensResponse(response: string, rawTokens: RawToken[]): ClassifiedToken[] {
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
      console.error('[extract-design-tokens] Response is not an array')
      return []
    }

    // Create a map of raw tokens for usage count lookup
    const rawTokenMap = new Map<string, number>()
    rawTokens.forEach(t => {
      rawTokenMap.set(`${t.type}:${t.value}`, t.count)
    })

    // Validate and enhance each token
    return parsed.map((token: Partial<ClassifiedToken>) => ({
      type: token.type || 'color',
      value: token.value || '',
      name: token.name || 'Unnamed Token',
      category: token.category || 'other',
      subcategory: token.subcategory,
      description: token.description || '',
      usageCount: rawTokenMap.get(`${token.type}:${token.value}`) || 1,
      cssVariable: token.cssVariable,
    })).filter((t: ClassifiedToken) => t.value && t.value.length > 0)
  } catch (error) {
    console.error('[extract-design-tokens] Failed to parse response:', error)
    console.error('[extract-design-tokens] Response was:', jsonStr.slice(0, 500))
    return []
  }
}

// Extract with Anthropic Claude
async function extractWithAnthropic(
  apiKey: string,
  model: string,
  prompt: string,
  screenshotBase64: string
): Promise<ClassifiedToken[]> {
  console.log('[extract-design-tokens] Calling Anthropic API with vision')

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
  return parseTokensResponse(responseText, [])
}

// Extract with OpenAI GPT-4 Vision
async function extractWithOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  screenshotBase64: string
): Promise<ClassifiedToken[]> {
  console.log('[extract-design-tokens] Calling OpenAI API with vision')

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
  return parseTokensResponse(responseText, [])
}

// Extract with Google Gemini
async function extractWithGoogle(
  apiKey: string,
  model: string,
  prompt: string,
  screenshotBase64: string
): Promise<ClassifiedToken[]> {
  console.log('[extract-design-tokens] Calling Google Gemini API with vision')

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
        generationConfig: { maxOutputTokens: 4096 },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Google AI API error')
  }

  const data = await response.json()
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  return parseTokensResponse(responseText, [])
}

Deno.serve(async (req) => {
  console.log('[extract-design-tokens] Request received:', req.method)

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
    console.log('[extract-design-tokens] User authenticated:', user.id)

    // Parse request
    const body: ExtractRequest = await req.json()
    console.log('[extract-design-tokens] Extracting from screen:', body.screenId)
    console.log('[extract-design-tokens] Raw tokens count:', body.rawTokens?.length)

    if (!body.screenId || !body.screenshotBase64 || !body.rawTokens) {
      throw new Error('Missing required fields: screenId, screenshotBase64, and rawTokens')
    }

    // Strip data URL prefix from base64 if present
    const screenshotBase64 = stripBase64Prefix(body.screenshotBase64)

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
    console.log('[extract-design-tokens] Using provider:', keyConfig.provider, 'model:', modelToUse)

    // Get decrypted API key
    const { data: apiKey, error: decryptError } = await supabase
      .rpc('get_api_key', { p_user_id: user.id, p_provider: keyConfig.provider })

    if (decryptError || !apiKey) {
      throw new Error('Failed to retrieve API key')
    }

    // Build the prompt
    const prompt = buildClassificationPrompt(body.rawTokens, body.screenName || 'Screen')

    // Extract and classify tokens based on provider
    let tokens: ClassifiedToken[]

    switch (keyConfig.provider) {
      case 'anthropic':
        tokens = await extractWithAnthropic(apiKey, modelToUse, prompt, screenshotBase64)
        break
      case 'openai':
        tokens = await extractWithOpenAI(apiKey, modelToUse, prompt, screenshotBase64)
        break
      case 'google':
        tokens = await extractWithGoogle(apiKey, modelToUse, prompt, screenshotBase64)
        break
      default:
        throw new Error(`Unsupported provider: ${keyConfig.provider}`)
    }

    const durationMs = Date.now() - startTime
    console.log('[extract-design-tokens] Classified', tokens.length, 'tokens in', durationMs, 'ms')

    const response: ExtractResponse = {
      success: true,
      tokens,
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
    console.error('[extract-design-tokens] Error:', errorMessage)

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
