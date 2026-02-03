// Supabase Edge Function for summarizing user feedback using AI
// Synthesizes multiple feedback comments into actionable insights
// Deploy with: supabase functions deploy summarize-feedback

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface FeedbackComment {
  content: string
  userName: string
  resolved: boolean
  isPinned: boolean
}

interface SummarizeFeedbackRequest {
  sessionId: string
  variantIndex: number
  comments: FeedbackComment[]
  variantTitle?: string
  variantDescription?: string
}

interface FeedbackSummaryResponse {
  summary: string
  keyThemes: string[]
  actionItems: string[]
  sentimentScore: number
}

// System prompt for feedback summarization
const SYSTEM_PROMPT = `You are an expert UX researcher analyzing user feedback on a UI prototype.

Your task is to synthesize multiple feedback comments into actionable insights. Focus on:
1. Identifying patterns and common themes across comments
2. Extracting actionable improvement suggestions
3. Assessing overall sentiment toward the design

CRITICAL REQUIREMENTS:
1. Return ONLY valid JSON - no markdown, no code blocks, no explanations
2. Be specific and actionable in your suggestions
3. Focus on design and UX feedback, not technical issues
4. Prioritize frequently mentioned issues

JSON Schema (MUST follow exactly):
{
  "summary": "A 2-3 sentence synthesis of the overall feedback. Mention key pain points and positive aspects.",
  "keyThemes": [
    "Theme 1 (e.g., 'Navigation confusion')",
    "Theme 2 (e.g., 'Visual hierarchy')",
    "Theme 3 (max 5 themes)"
  ],
  "actionItems": [
    "Specific improvement 1",
    "Specific improvement 2",
    "Specific improvement 3 (max 3 items)"
  ],
  "sentimentScore": 0.5
}

sentimentScore is a number from -1 (very negative) to 1 (very positive):
- -1 to -0.5: Very critical/negative feedback
- -0.5 to 0: Somewhat negative, some concerns
- 0 to 0.5: Mixed or neutral feedback
- 0.5 to 1: Positive feedback with minor suggestions

Be constructive and professional in your analysis.`

function buildSummarizationPrompt(request: SummarizeFeedbackRequest): string {
  let prompt = ''

  if (request.variantTitle) {
    prompt += `Variant: ${request.variantTitle}\n`
  }
  if (request.variantDescription) {
    prompt += `Description: ${request.variantDescription}\n`
  }

  prompt += `\nFeedback Comments (${request.comments.length} total):\n\n`

  request.comments.forEach((comment, idx) => {
    const badges = []
    if (comment.resolved) badges.push('RESOLVED')
    if (comment.isPinned) badges.push('PINNED')
    const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : ''

    prompt += `${idx + 1}. ${comment.userName}${badgeStr}:\n"${comment.content}"\n\n`
  })

  prompt += `Please analyze these feedback comments and provide a structured summary as JSON.`

  return prompt
}

// Parse and validate JSON response
function parseFeedbackSummary(response: string): FeedbackSummaryResponse {
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
    summary: parsed.summary || 'Unable to generate summary.',
    keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes.slice(0, 5) : [],
    actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 3) : [],
    sentimentScore: typeof parsed.sentimentScore === 'number'
      ? Math.max(-1, Math.min(1, parsed.sentimentScore))
      : 0,
  }
}

// Generate with Google Gemini (primary choice for this use case)
async function generateWithGoogle(apiKey: string, prompt: string): Promise<string> {
  console.log('[summarize-feedback] Calling Google Gemini API')

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: SYSTEM_PROMPT + '\n\n' + prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
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

// Generate with Anthropic
async function generateWithAnthropic(apiKey: string, prompt: string): Promise<string> {
  console.log('[summarize-feedback] Calling Anthropic API')

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'Anthropic API error')
  }

  const data = await response.json()
  return data.content[0]?.text || ''
}

// Generate with OpenAI
async function generateWithOpenAI(apiKey: string, prompt: string): Promise<string> {
  console.log('[summarize-feedback] Calling OpenAI API')

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      response_format: { type: 'json_object' },
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
  return data.choices[0]?.message?.content || ''
}

Deno.serve(async (req) => {
  console.log('[summarize-feedback] Request received:', req.method)

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

    // Get the anon key for user auth verification
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseAnonKey) {
      throw new Error('Missing SUPABASE_ANON_KEY environment variable')
    }

    // Create Supabase client with anon key and pass the auth header
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Verify user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      throw new Error('Unauthorized')
    }
    console.log('[summarize-feedback] User authenticated:', user.id)

    // Create a service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Parse request
    const body: SummarizeFeedbackRequest = await req.json()
    console.log('[summarize-feedback] Session:', body.sessionId, 'Variant:', body.variantIndex, 'Comments:', body.comments?.length)

    if (!body.sessionId || body.variantIndex === undefined || !body.comments || body.comments.length === 0) {
      throw new Error('Missing required fields: sessionId, variantIndex, comments')
    }

    // Get user's API key - prefer Google for this use case, but fallback to others
    const providers = ['google', 'anthropic', 'openai']
    let keyConfig = null
    let apiKey = null

    for (const provider of providers) {
      const { data: keyConfigs } = await supabase
        .from('user_api_key_refs')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('provider', provider)
        .limit(1)

      if (keyConfigs && keyConfigs.length > 0) {
        keyConfig = keyConfigs[0]

        // Get decrypted API key
        const { data: decryptedKey } = await supabase
          .rpc('get_api_key', { p_user_id: user.id, p_provider: provider })

        if (decryptedKey) {
          apiKey = decryptedKey
          break
        }
      }
    }

    if (!keyConfig || !apiKey) {
      throw new Error('No API key configured. Please add your API key in Settings.')
    }

    console.log('[summarize-feedback] Using provider:', keyConfig.provider)

    // Build prompt
    const prompt = buildSummarizationPrompt(body)

    // Generate summary based on provider
    const startTime = Date.now()
    let rawResponse: string

    switch (keyConfig.provider) {
      case 'google':
        rawResponse = await generateWithGoogle(apiKey, prompt)
        break
      case 'anthropic':
        rawResponse = await generateWithAnthropic(apiKey, prompt)
        break
      case 'openai':
        rawResponse = await generateWithOpenAI(apiKey, prompt)
        break
      default:
        throw new Error(`Unsupported provider: ${keyConfig.provider}`)
    }

    const durationMs = Date.now() - startTime
    console.log('[summarize-feedback] Response length:', rawResponse.length, 'Duration:', durationMs, 'ms')

    // Parse and validate summary
    const summary = parseFeedbackSummary(rawResponse)
    console.log('[summarize-feedback] Parsed summary with', summary.keyThemes.length, 'themes')

    return new Response(
      JSON.stringify({
        success: true,
        ...summary,
        provider: keyConfig.provider,
        durationMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[summarize-feedback] Error:', error.message)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
