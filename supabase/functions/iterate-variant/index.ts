// Supabase Edge Function for iterating on a variant
// Takes current HTML and a refinement prompt, generates modified HTML
// Deploy with: supabase functions deploy iterate-variant

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface VariantContext {
  variantIndex: number
  title: string
  description: string
  approach: string
  screenshotUrl?: string
}

interface IterateRequest {
  sessionId: string
  variantId: string
  variantIndex: number
  currentHtml: string
  iterationPrompt: string
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
  otherVariantsContext?: VariantContext[]
}

// System prompt for iteration
const SYSTEM_PROMPT = `You are an expert front-end developer refining a UI based on user feedback.

Your task is to modify the provided HTML according to the user's iteration request. The result should be a complete, self-contained HTML document.

CRITICAL REQUIREMENTS:
1. Return ONLY the complete HTML document - no explanations, no markdown code blocks
2. Make ONLY the changes requested by the user
3. Preserve all other functionality and styling from the original
4. Use inline styles for all CSS changes
5. Ensure the HTML is valid and renders correctly
6. Maintain responsive design patterns

ITERATION GUIDELINES:
- Focus specifically on what the user asked for
- Don't make unrelated changes unless they're necessary for the requested feature
- If the request is ambiguous, make reasonable assumptions
- Keep changes minimal but complete

Start your response directly with <!DOCTYPE html> or <html>.`

function buildIterationPrompt(
  currentHtml: string,
  iterationPrompt: string,
  variantIndex: number,
  otherVariantsContext?: VariantContext[]
): string {
  // Build context about other variants if provided
  let contextSection = ''
  if (otherVariantsContext && otherVariantsContext.length > 0) {
    contextSection = `
Context about other variants in this prototype session (for awareness, not for copying):
${otherVariantsContext.map(v =>
  `- Variant ${String.fromCharCode(64 + v.variantIndex)} (${v.approach}): "${v.title}"
   ${v.description}`
).join('\n')}

You are modifying Variant ${String.fromCharCode(64 + variantIndex)}. Ensure your changes maintain this variant's unique identity and approach while addressing the user's request.

`
  }

  return `${contextSection}Current HTML to modify:
${currentHtml}

User's iteration request:
${iterationPrompt}

Generate the complete modified HTML document implementing this change. Return ONLY the HTML.`
}

// Clean HTML response
function cleanHtmlResponse(html: string): string {
  let cleaned = html.trim()
  if (cleaned.startsWith('```html')) {
    cleaned = cleaned.slice(7)
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3)
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3)
  }
  return cleaned.trim()
}

// Generate with Anthropic
async function generateWithAnthropic(apiKey: string, model: string, prompt: string): Promise<string> {
  console.log('[iterate-variant] Calling Anthropic API')

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
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Anthropic API error')
  }

  const data = await response.json()
  return cleanHtmlResponse(data.content[0]?.text || '')
}

// Generate with OpenAI
async function generateWithOpenAI(apiKey: string, model: string, prompt: string): Promise<string> {
  console.log('[iterate-variant] Calling OpenAI API')

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
        { role: 'user', content: prompt },
      ],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'OpenAI API error')
  }

  const data = await response.json()
  return cleanHtmlResponse(data.choices[0]?.message?.content || '')
}

// Generate with Google
async function generateWithGoogle(apiKey: string, model: string, prompt: string): Promise<string> {
  console.log('[iterate-variant] Calling Google API')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-pro'}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM_PROMPT + '\n\n' + prompt }] }],
        generationConfig: { maxOutputTokens: 16384 },
      }),
    }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Google AI API error')
  }

  const data = await response.json()
  return cleanHtmlResponse(data.candidates?.[0]?.content?.parts?.[0]?.text || '')
}

// Upload iterated HTML to storage
async function uploadIteratedHtml(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sessionId: string,
  variantIndex: number,
  iterationNumber: number,
  html: string
): Promise<{ htmlPath: string; htmlUrl: string }> {
  const htmlPath = `${userId}/${sessionId}/variant_${variantIndex}_iter_${iterationNumber}.html`

  const { error: uploadError } = await supabase.storage
    .from('vibe-files')
    .upload(htmlPath, new Blob([html], { type: 'text/html' }), {
      contentType: 'text/html',
      upsert: true,
    })

  if (uploadError) {
    console.error('[iterate-variant] Storage upload error:', uploadError)
    throw new Error(`Failed to upload HTML: ${uploadError.message}`)
  }

  const { data: urlData } = supabase.storage
    .from('vibe-files')
    .getPublicUrl(htmlPath)

  return {
    htmlPath,
    htmlUrl: urlData.publicUrl,
  }
}

Deno.serve(async (req) => {
  console.log('[iterate-variant] Request received:', req.method)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let parsedBody: IterateRequest | null = null

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
    console.log('[iterate-variant] User authenticated:', user.id)

    // Parse request
    parsedBody = await req.json()
    const body = parsedBody
    console.log('[iterate-variant] Iterating variant', body.variantIndex, 'for session:', body.sessionId)

    if (!body.sessionId || !body.variantId || !body.variantIndex || !body.currentHtml || !body.iterationPrompt) {
      throw new Error('Missing required fields')
    }

    // Get current iteration count for this variant
    const { data: variant, error: variantError } = await supabase
      .from('vibe_variants')
      .select('iteration_count')
      .eq('id', body.variantId)
      .single()

    if (variantError) {
      throw new Error(`Failed to fetch variant: ${variantError.message}`)
    }

    const currentIterationCount = variant?.iteration_count || 0
    const newIterationNumber = currentIterationCount + 1

    console.log('[iterate-variant] Current iteration count:', currentIterationCount, 'New number:', newIterationNumber)

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
    console.log('[iterate-variant] Using provider:', keyConfig.provider, 'model:', modelToUse)

    // Get decrypted API key
    const { data: apiKey, error: decryptError } = await supabase
      .rpc('get_api_key', { p_user_id: user.id, p_provider: keyConfig.provider })

    if (decryptError || !apiKey) {
      throw new Error('Failed to retrieve API key')
    }

    // Build prompt with variant context
    const prompt = buildIterationPrompt(
      body.currentHtml,
      body.iterationPrompt,
      body.variantIndex,
      body.otherVariantsContext
    )

    // Generate iterated HTML based on provider
    let generatedHtml: string

    switch (keyConfig.provider) {
      case 'anthropic':
        generatedHtml = await generateWithAnthropic(apiKey, modelToUse, prompt)
        break
      case 'openai':
        generatedHtml = await generateWithOpenAI(apiKey, modelToUse, prompt)
        break
      case 'google':
        generatedHtml = await generateWithGoogle(apiKey, modelToUse, prompt)
        break
      default:
        throw new Error(`Unsupported provider: ${keyConfig.provider}`)
    }

    console.log('[iterate-variant] Generated HTML length:', generatedHtml.length)

    // Validate generated HTML
    if (!generatedHtml || generatedHtml.length < 100) {
      throw new Error('Generated HTML is too short or empty')
    }

    // Upload to storage
    console.log('[iterate-variant] Uploading to storage...')
    const { htmlPath, htmlUrl } = await uploadIteratedHtml(
      supabase,
      user.id,
      body.sessionId,
      body.variantIndex,
      newIterationNumber,
      generatedHtml
    )

    const duration = Date.now() - startTime

    // Save iteration to history
    const { data: iteration, error: iterationError } = await supabase
      .from('vibe_iterations')
      .insert({
        variant_id: body.variantId,
        session_id: body.sessionId,
        variant_index: body.variantIndex,
        iteration_number: newIterationNumber,
        prompt: body.iterationPrompt,
        html_before: body.currentHtml,
        html_after: generatedHtml,
        generation_model: modelToUse,
        generation_duration_ms: duration,
      })
      .select()
      .single()

    if (iterationError) {
      console.error('[iterate-variant] Failed to save iteration:', iterationError)
      // Don't throw - the HTML was generated successfully
    }

    // Update variant with new HTML and increment iteration count
    const { error: updateError } = await supabase
      .from('vibe_variants')
      .update({
        html_path: htmlPath,
        html_url: htmlUrl,
        iteration_count: newIterationNumber,
      })
      .eq('id', body.variantId)

    if (updateError) {
      console.error('[iterate-variant] Failed to update variant:', updateError)
      throw new Error(`Failed to update variant: ${updateError.message}`)
    }

    console.log('[iterate-variant] Iteration', newIterationNumber, 'complete in', duration, 'ms')

    return new Response(
      JSON.stringify({
        success: true,
        iteration: iteration,
        htmlUrl,
        htmlPath,
        iterationNumber: newIterationNumber,
        generatedHtmlLength: generatedHtml.length,
        durationMs: duration,
        model: modelToUse,
        provider: keyConfig.provider,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error('[iterate-variant] Error:', errorMessage)

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        variantId: parsedBody?.variantId,
        sessionId: parsedBody?.sessionId,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
