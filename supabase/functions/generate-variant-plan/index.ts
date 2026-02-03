// Supabase Edge Function for generating variant plans
// Creates 4 variant concepts from LLM based on user prompt
// Deploy with: supabase functions deploy generate-variant-plan

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GeneratePlanRequest {
  sessionId: string
  prompt: string
  compactedHtml: string
  screenshotBase64?: string  // Base64-encoded screenshot of current screen
  uiMetadata?: {
    colors: Record<string, string[]>
    typography: Record<string, string[]>
    layout: Record<string, string[]>
    components: Array<{ type: string; count: number }>
  }
  productContext?: string
  uxGuidelines?: string      // UX guidelines extracted from product videos
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
}

interface VariantPlan {
  variantIndex: number
  title: string
  description: string
  keyChanges: string[]
  styleNotes: string
}

// System prompt for plan generation - emphasizes MODIFYING the existing UI
const SYSTEM_PROMPT = `You are an expert UI/UX designer creating modification plans for an EXISTING web page.

IMPORTANT: You are NOT designing from scratch. The user has an existing web application with a specific UI that they want to ENHANCE or MODIFY based on their request. Your plans should describe targeted changes to the existing design, not replacement designs.

Given a source HTML page and a user's modification request, create exactly 4 variant plans. Each plan describes HOW to modify the existing UI.

CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations
2. Generate exactly 4 variants with indices 1, 2, 3, 4
3. Each variant proposes MODIFICATIONS to the existing design (not replacements)
4. Key changes should be specific edits like "update header background to..." or "add a new button in..."

VARIANT APPROACHES (all modify the existing UI):
- Variant 1: Conservative - Minimal, subtle changes; keep most of the existing design
- Variant 2: Modern - Apply modern styling to existing elements; preserve structure
- Variant 3: Bold - More noticeable changes while maintaining core layout and content
- Variant 4: Alternative - Different approach to the same problem; still based on original

WHAT GOOD KEY CHANGES LOOK LIKE:
- "Update the header background from white to a gradient of #667eea to #764ba2"
- "Increase the padding on content cards from 16px to 24px"
- "Add a 'Quick Actions' toolbar below the existing navigation"
- "Change the primary button color to match brand color #2563eb"
- "Add subtle box-shadows to the existing card components"

WHAT TO AVOID:
- "Create a new minimalist dashboard" (too vague, sounds like replacement)
- "Design a modern interface" (not specific modifications)
- "Build a new navigation system" (sounds like replacing, not modifying)

JSON Schema (MUST follow exactly):
{
  "variants": [
    {
      "variantIndex": 1,
      "title": "Short descriptive title (3-5 words)",
      "description": "2-3 sentence explanation of what modifications will be made to the existing UI",
      "keyChanges": ["Specific change 1", "Specific change 2", "Specific change 3"],
      "styleNotes": "Specific style modifications (colors, typography, spacing)"
    },
    // ... repeat for indices 2, 3, 4
  ]
}`

function buildPlanPrompt(request: GeneratePlanRequest): string {
  let prompt = `User Request: "${request.prompt}"\n\n`

  if (request.uiMetadata) {
    prompt += `Current UI Analysis:\n`
    prompt += `- Colors used: ${JSON.stringify(request.uiMetadata.colors.primary || [])}\n`
    prompt += `- Font families: ${JSON.stringify(request.uiMetadata.typography.fontFamilies || [])}\n`
    prompt += `- Layout systems: ${JSON.stringify(request.uiMetadata.layout.gridSystems || [])}\n`
    prompt += `- Components found: ${request.uiMetadata.components?.map(c => `${c.type}(${c.count})`).join(', ')}\n\n`
  }

  if (request.productContext) {
    prompt += `Product Context (important for understanding the product and UX patterns):\n${request.productContext.slice(0, 8000)}\n\n`
  }

  if (request.uxGuidelines) {
    prompt += `UX Guidelines (follow these patterns):\n${request.uxGuidelines.slice(0, 5000)}\n\n`
  }

  prompt += `Source HTML (CRITICAL - preserve this design's visual style, colors, fonts, and layout):\n${request.compactedHtml.slice(0, 30000)}\n\n`
  prompt += `Generate 4 variant concepts as a JSON object with a "variants" array. Return ONLY the JSON, no other text.`

  return prompt
}

// Attempt to repair common JSON issues
function repairJson(json: string): string {
  let repaired = json

  // Remove any control characters except \n, \r, \t (do this first)
  repaired = repaired.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1')

  // Fix missing commas between array elements (common LLM issue)
  // Pattern: "string1" "string2" (missing comma between strings in array)
  repaired = repaired.replace(/"(\s+)"/g, '", "')

  // Pattern: "string1"\n"string2" (missing comma between strings on different lines)
  repaired = repaired.replace(/"\s*\n\s*"/g, '",\n"')

  // Fix missing commas between object properties - multiple patterns
  // Pattern 1: "value"\n"key": (missing comma after string value)
  repaired = repaired.replace(/(")\s*\n\s*(")/g, '$1,\n$2')

  // Pattern 2: value (number/bool/null) followed by "key"
  repaired = repaired.replace(/(\d+|true|false|null)\s*\n\s*"/g, '$1,\n"')

  // Pattern 3: ] followed by "key" (end of array, then next property)
  repaired = repaired.replace(/\]\s*\n\s*"/g, '],\n"')

  // Pattern 4: } followed by { (objects in array without comma)
  repaired = repaired.replace(/}\s*\n\s*{/g, '},\n{')

  // Pattern 5: } followed by "key" (end of object, then next property in parent)
  repaired = repaired.replace(/}\s*\n\s*"/g, '},\n"')

  // Fix unescaped newlines in strings (common LLM issue)
  // Process line by line to fix strings with embedded newlines
  // This is complex because we need to track whether we're inside a string
  const lines = repaired.split('\n')
  const fixedLines: string[] = []
  let inString = false
  let stringBuffer = ''

  for (const line of lines) {
    let i = 0
    while (i < line.length) {
      const char = line[i]
      if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
        if (inString) {
          // End of string
          stringBuffer += char
          fixedLines.push(stringBuffer)
          stringBuffer = ''
          inString = false
        } else {
          // Start of string
          inString = true
          stringBuffer = char
        }
      } else if (inString) {
        stringBuffer += char
      } else {
        if (stringBuffer) {
          fixedLines.push(stringBuffer)
          stringBuffer = ''
        }
        fixedLines.push(char)
      }
      i++
    }

    if (inString) {
      // We're in a string that continues to the next line - escape the newline
      stringBuffer += '\\n'
    } else if (stringBuffer) {
      fixedLines.push(stringBuffer)
      stringBuffer = ''
    }
  }

  if (stringBuffer) {
    fixedLines.push(stringBuffer)
  }

  repaired = fixedLines.join('')

  // Fix unescaped quotes inside strings (very common)
  // This is tricky - look for patterns suggesting unescaped quotes mid-string
  repaired = repaired.replace(/:\s*"([^"]*)"([^",:\[\]{}]+)"([^"]*)"/g, ': "$1\\"$2\\"$3"')

  // Fix single quotes used instead of double quotes for property values
  repaired = repaired.replace(/:\s*'([^']*)'/g, ': "$1"')

  // Fix truncated strings at the end (add closing quote if missing)
  if (repaired.match(/"[^"]*$/)) {
    repaired = repaired + '"'
  }

  // Ensure proper array/object closure
  const openBraces = (repaired.match(/{/g) || []).length
  const closeBraces = (repaired.match(/}/g) || []).length
  const openBrackets = (repaired.match(/\[/g) || []).length
  const closeBrackets = (repaired.match(/]/g) || []).length

  // Add missing closing braces/brackets
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}'
  }
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']'
  }

  return repaired
}

// Try to extract JSON object from text that might have extra content
function extractJsonObject(text: string): string {
  // Find the first { and last }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1)
  }

  return text
}

// More aggressive JSON repair for stubborn cases
function aggressiveRepairJson(json: string): string {
  let repaired = json

  // Strip all control characters
  repaired = repaired.replace(/[\x00-\x1F]/g, (match) => {
    if (match === '\n' || match === '\r' || match === '\t') return ' '
    return ''
  })

  // Normalize all whitespace to single spaces
  repaired = repaired.replace(/\s+/g, ' ')

  // Fix common array issues: "item1" "item2" -> "item1", "item2"
  repaired = repaired.replace(/" "/g, '", "')

  // Fix: "item1"  "item2" (multiple spaces)
  repaired = repaired.replace(/"\s+"/g, '", "')

  // Fix: ]["  or ]"  (missing comma before next element/property)
  repaired = repaired.replace(/\]\s*"/g, '], "')
  repaired = repaired.replace(/}\s*"/g, '}, "')
  repaired = repaired.replace(/}\s*{/g, '}, {')

  // Remove trailing commas
  repaired = repaired.replace(/,\s*([}\]])/g, '$1')

  // Fix double commas
  repaired = repaired.replace(/,\s*,/g, ',')

  return repaired
}

// Final fallback: try to manually reconstruct valid JSON by extracting variant objects
function reconstructVariantsJson(json: string): string {
  console.log('[generate-variant-plan] Attempting to reconstruct variants from malformed JSON...')

  // Try to extract individual variant objects using regex
  const variantPattern = /\{\s*"variantIndex"\s*:\s*(\d+)\s*,\s*"title"\s*:\s*"([^"]*?)"\s*,\s*"description"\s*:\s*"([^"]*?)"\s*,\s*"keyChanges"\s*:\s*\[([^\]]*?)\]\s*,\s*"styleNotes"\s*:\s*"([^"]*?)"\s*\}/gs

  const variants: string[] = []
  let match

  while ((match = variantPattern.exec(json)) !== null) {
    const [fullMatch] = match
    variants.push(fullMatch)
  }

  if (variants.length >= 1) {
    console.log(`[generate-variant-plan] Extracted ${variants.length} variant(s) via regex`)

    // If we got less than 4, try a simpler extraction
    if (variants.length < 4) {
      // Try to find objects by looking for variantIndex patterns
      const simplePattern = /\{[^{}]*"variantIndex"\s*:\s*\d[^{}]*\}/g
      const simpleMatches = json.match(simplePattern)
      if (simpleMatches && simpleMatches.length > variants.length) {
        console.log(`[generate-variant-plan] Found ${simpleMatches.length} variants with simple pattern`)
        return `{"variants": [${simpleMatches.join(', ')}]}`
      }
    }

    return `{"variants": [${variants.join(', ')}]}`
  }

  // If regex extraction failed, try a different approach: find balanced braces
  const extractedVariants: string[] = []
  let depth = 0
  let start = -1
  let inVariant = false

  for (let i = 0; i < json.length; i++) {
    const char = json[i]

    if (char === '{') {
      if (depth === 1 || (depth === 0 && json.slice(i, i + 50).includes('variantIndex'))) {
        // Starting a potential variant object
        if (!inVariant && json.slice(i, i + 100).includes('variantIndex')) {
          start = i
          inVariant = true
        }
      }
      depth++
    } else if (char === '}') {
      depth--
      if (inVariant && depth <= 1 && start !== -1) {
        // Found end of a variant object
        const extracted = json.slice(start, i + 1)
        if (extracted.includes('variantIndex') && extracted.includes('title')) {
          extractedVariants.push(extracted)
        }
        inVariant = false
        start = -1
      }
    }
  }

  if (extractedVariants.length >= 1) {
    console.log(`[generate-variant-plan] Extracted ${extractedVariants.length} variant(s) via brace matching`)
    return `{"variants": [${extractedVariants.join(', ')}]}`
  }

  throw new Error('Could not extract any valid variants from response')
}

// Parse and validate JSON response
function parseVariantPlans(response: string): VariantPlan[] {
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

  // Try to extract JSON if there's extra text
  cleaned = extractJsonObject(cleaned)

  // Attempt to parse, with repair fallback
  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch (firstError) {
    console.log('[generate-variant-plan] First JSON parse failed, attempting repair...')
    console.log('[generate-variant-plan] First error:', (firstError as Error).message)

    // Try to repair and parse again
    const repaired = repairJson(cleaned)
    try {
      parsed = JSON.parse(repaired)
      console.log('[generate-variant-plan] JSON repair successful')
    } catch (secondError) {
      console.log('[generate-variant-plan] Standard repair failed, trying aggressive repair...')

      // Try more aggressive repair
      const aggressiveRepaired = aggressiveRepairJson(cleaned)
      try {
        parsed = JSON.parse(aggressiveRepaired)
        console.log('[generate-variant-plan] Aggressive JSON repair successful')
      } catch (thirdError) {
        console.log('[generate-variant-plan] Aggressive repair failed, trying reconstruction...')

        // Final fallback: try to reconstruct from fragments
        try {
          const reconstructed = reconstructVariantsJson(cleaned)
          parsed = JSON.parse(reconstructed)
          console.log('[generate-variant-plan] JSON reconstruction successful')
        } catch (fourthError) {
          // Log the problematic section for debugging
          const errorMatch = (firstError as Error).message.match(/position (\d+)/)
          if (errorMatch) {
            const pos = parseInt(errorMatch[1])
            const context = cleaned.slice(Math.max(0, pos - 100), pos + 100)
            console.error('[generate-variant-plan] JSON error near position', pos, ':', context)
          }
          console.error('[generate-variant-plan] All repair attempts failed')
          throw firstError // Throw original error
        }
      }
    }
  }

  // Extract variants array
  const variants = (parsed as { variants?: unknown[] }).variants || parsed

  // Be more lenient - accept 1-4 variants (fill in missing ones if needed)
  if (!Array.isArray(variants) || variants.length === 0) {
    throw new Error(`Expected array of variants, got ${typeof variants}`)
  }

  if (variants.length < 4) {
    console.warn(`[generate-variant-plan] Only got ${variants.length} variants, expected 4. Padding with defaults.`)
  }

  // Validate and normalize each variant, padding if needed
  const normalizedVariants: VariantPlan[] = []
  for (let i = 0; i < 4; i++) {
    const v = variants[i] as Record<string, unknown> | undefined
    if (v) {
      normalizedVariants.push({
        variantIndex: (v.variantIndex as number) || i + 1,
        title: (v.title as string) || `Variant ${i + 1}`,
        description: (v.description as string) || '',
        keyChanges: Array.isArray(v.keyChanges) ? v.keyChanges as string[] : [],
        styleNotes: (v.styleNotes as string) || '',
      })
    } else {
      // Pad with default variant
      const approaches = ['Conservative', 'Modern', 'Bold', 'Alternative']
      normalizedVariants.push({
        variantIndex: i + 1,
        title: `${approaches[i]} Approach`,
        description: `A ${approaches[i].toLowerCase()} approach to the requested modifications.`,
        keyChanges: ['Apply requested changes with a ' + approaches[i].toLowerCase() + ' style'],
        styleNotes: 'Maintain existing design language',
      })
    }
  }

  return normalizedVariants
}

// Generate with Anthropic (with optional vision support)
async function generateWithAnthropic(apiKey: string, model: string, prompt: string, screenshotBase64?: string): Promise<string> {
  console.log('[generate-variant-plan] Calling Anthropic API', screenshotBase64 ? 'with screenshot' : 'text only')

  // Build message content - text or text + image
  const content: Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> = []

  if (screenshotBase64) {
    // Handle both raw base64 and data URL formats
    let base64Data = screenshotBase64
    let mediaType = 'image/jpeg' // default

    if (screenshotBase64.startsWith('data:')) {
      // Extract media type and base64 data from data URL
      const match = screenshotBase64.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        mediaType = match[1]
        base64Data = match[2]
      }
    }

    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: base64Data,
      },
    })
    content.push({
      type: 'text',
      text: 'This is the current screen that needs to be modified. Study it carefully to understand the existing layout, style, and components.\n\n' + prompt,
    })
  } else {
    content.push({ type: 'text', text: prompt })
  }

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
      messages: [{ role: 'user', content }],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Anthropic API error')
  }

  const data = await response.json()
  return data.content[0]?.text || ''
}

// Generate with OpenAI (with optional vision support)
async function generateWithOpenAI(apiKey: string, model: string, prompt: string, screenshotBase64?: string): Promise<string> {
  console.log('[generate-variant-plan] Calling OpenAI API', screenshotBase64 ? 'with screenshot' : 'text only')

  // Build message content - text or text + image
  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = []

  if (screenshotBase64) {
    // Handle both raw base64 and data URL formats
    let imageUrl = screenshotBase64

    if (!screenshotBase64.startsWith('data:')) {
      // If raw base64, add data URL prefix
      imageUrl = `data:image/jpeg;base64,${screenshotBase64}`
    }

    content.push({
      type: 'image_url',
      image_url: {
        url: imageUrl,
      },
    })
    content.push({
      type: 'text',
      text: 'This is the current screen that needs to be modified. Study it carefully to understand the existing layout, style, and components.\n\n' + prompt,
    })
  } else {
    content.push({ type: 'text', text: prompt })
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'OpenAI API error')
  }

  const data = await response.json()
  return data.choices[0]?.message?.content || ''
}

// Generate with Google (with optional vision support)
async function generateWithGoogle(apiKey: string, model: string, prompt: string, screenshotBase64?: string): Promise<string> {
  console.log('[generate-variant-plan] Calling Google API', screenshotBase64 ? 'with screenshot' : 'text only')

  // Build parts array - text or text + image
  const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = []

  if (screenshotBase64) {
    // Handle both raw base64 and data URL formats
    let base64Data = screenshotBase64
    let mimeType = 'image/jpeg' // default

    if (screenshotBase64.startsWith('data:')) {
      // Extract media type and base64 data from data URL
      const match = screenshotBase64.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        mimeType = match[1]
        base64Data = match[2]
      }
    }

    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64Data,
      },
    })
    parts.push({
      text: SYSTEM_PROMPT + '\n\nThis is the current screen that needs to be modified. Study it carefully to understand the existing layout, style, and components.\n\n' + prompt,
    })
  } else {
    parts.push({ text: SYSTEM_PROMPT + '\n\n' + prompt })
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Google AI API error')
  }

  const data = await response.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

Deno.serve(async (req) => {
  console.log('[generate-variant-plan] Request received:', req.method)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
    console.log('[generate-variant-plan] User authenticated:', user.id)

    // Parse request
    const body: GeneratePlanRequest = await req.json()
    console.log('[generate-variant-plan] Session:', body.sessionId, 'Prompt:', body.prompt?.slice(0, 100))

    if (!body.sessionId || !body.prompt || !body.compactedHtml) {
      throw new Error('Missing required fields: sessionId, prompt, compactedHtml')
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

    const { data: keyConfigs, error: keyError } = await keyQuery.limit(1)
    const keyConfig = keyConfigs?.[0]

    if (keyError || !keyConfig) {
      throw new Error('No API key configured. Please add your API key in Settings.')
    }

    const modelToUse = body.model || keyConfig.model
    console.log('[generate-variant-plan] Using provider:', keyConfig.provider, 'model:', modelToUse)

    // Get decrypted API key
    const { data: apiKey, error: decryptError } = await supabase
      .rpc('get_api_key', { p_user_id: user.id, p_provider: keyConfig.provider })

    if (decryptError || !apiKey) {
      throw new Error('Failed to retrieve API key')
    }

    // Build prompt
    const prompt = buildPlanPrompt(body)

    // Log and validate screenshot if provided
    let validatedScreenshot: string | undefined = undefined
    if (body.screenshotBase64) {
      console.log('[generate-variant-plan] Screenshot provided, size:', Math.round(body.screenshotBase64.length / 1024), 'KB')

      // Validate base64 data
      let base64Data = body.screenshotBase64

      // Handle data URL format
      if (base64Data.startsWith('data:')) {
        const match = base64Data.match(/^data:([^;]+);base64,(.+)$/)
        if (match) {
          base64Data = match[2]
        } else {
          console.warn('[generate-variant-plan] Invalid data URL format, skipping screenshot')
          base64Data = ''
        }
      }

      // Basic base64 validation - check if it only contains valid base64 characters
      if (base64Data && base64Data.length > 100) {
        const base64Regex = /^[A-Za-z0-9+/]+=*$/
        // Check a sample of the data (first and last 100 chars) to avoid performance issues
        const sample = base64Data.slice(0, 100) + base64Data.slice(-100)
        if (base64Regex.test(sample.replace(/\s/g, ''))) {
          validatedScreenshot = body.screenshotBase64
          console.log('[generate-variant-plan] Screenshot validated successfully')
        } else {
          console.warn('[generate-variant-plan] Invalid base64 characters detected, skipping screenshot')
        }
      } else {
        console.warn('[generate-variant-plan] Screenshot too small or empty, skipping')
      }
    }

    // Generate plan based on provider (with optional screenshot for vision)
    let rawResponse: string

    switch (keyConfig.provider) {
      case 'anthropic':
        rawResponse = await generateWithAnthropic(apiKey, modelToUse, prompt, validatedScreenshot)
        break
      case 'openai':
        rawResponse = await generateWithOpenAI(apiKey, modelToUse, prompt, validatedScreenshot)
        break
      case 'google':
        rawResponse = await generateWithGoogle(apiKey, modelToUse, prompt, validatedScreenshot)
        break
      default:
        throw new Error(`Unsupported provider: ${keyConfig.provider}`)
    }

    console.log('[generate-variant-plan] Raw response length:', rawResponse.length)

    // Parse and validate variants
    const variantPlans = parseVariantPlans(rawResponse)
    console.log('[generate-variant-plan] Parsed', variantPlans.length, 'variants')

    // Save plans to database
    console.log('[generate-variant-plan] Saving plans to database...')

    const plansToInsert = variantPlans.map(plan => ({
      session_id: body.sessionId,
      variant_index: plan.variantIndex,
      title: plan.title,
      description: plan.description,
      key_changes: plan.keyChanges,
      style_notes: plan.styleNotes,
    }))

    // Delete existing plans for this session first
    await supabase
      .from('vibe_variant_plans')
      .delete()
      .eq('session_id', body.sessionId)

    const { data: savedPlans, error: saveError } = await supabase
      .from('vibe_variant_plans')
      .insert(plansToInsert)
      .select()

    if (saveError) {
      console.error('[generate-variant-plan] Failed to save plans:', saveError)
      throw new Error('Failed to save variant plans')
    }

    // Update session status
    await supabase
      .from('vibe_sessions')
      .update({ status: 'plan_ready' })
      .eq('id', body.sessionId)

    console.log('[generate-variant-plan] Plan generation complete')

    return new Response(
      JSON.stringify({
        success: true,
        plans: savedPlans,
        model: modelToUse,
        provider: keyConfig.provider,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[generate-variant-plan] Error:', error.message)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
