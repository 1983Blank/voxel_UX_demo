/**
 * Generate Injections Edge Function
 *
 * Analyzes HTML and user intent to generate injection configurations
 * that add interactivity to static prototypes.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================================
// Types
// ============================================================================

interface InjectionConfig {
  id: string;
  type: string;
  selector: string;
  options: Record<string, unknown>;
}

interface InjectionPoint {
  type: string;
  selector: string;
  element: string;
  textContent?: string;
  context?: string;
}

interface RequestBody {
  sessionId?: string;
  html: string;
  injectionPoints: InjectionPoint[];
  userIntent?: string;
  provider?: string;
  model?: string;
}

// ============================================================================
// Prompt
// ============================================================================

function buildPrompt(injectionPoints: InjectionPoint[], userIntent?: string): string {
  const pointsSummary = injectionPoints
    .slice(0, 20) // Limit to 20 points
    .map((p, i) => `${i + 1}. ${p.type}: "${p.textContent || p.selector}" (${p.context || 'no context'})`)
    .join('\n');

  return `You are a UI/UX expert specializing in adding interactivity to static HTML prototypes.

Your task is to generate injection configurations that will make this prototype interactive and realistic.

## Available Injection Types

1. **click-feedback** - Show visual feedback on click
   Options: feedbackType (toast|alert|ripple|highlight), feedbackMessage, feedbackDuration

2. **form-submit** - Handle form submission
   Options: successMessage, errorMessage, resetAfterSubmit

3. **form-validation** - Validate form fields
   Options: validationRules (array of {field, type, value, message})

4. **navigation** - Handle navigation/scrolling
   Options: targetSelector, scrollBehavior, showSection

5. **modal-toggle** - Open/close modals
   Options: modalSelector, closeOnBackdrop, closeOnEscape

6. **tab-switch** - Switch between tabs
   Options: tabPanelSelector, activeClass

7. **dropdown-toggle** - Toggle dropdown menus
   Options: menuSelector, closeOnSelect

8. **table-sort** - Sort table columns
   Options: sortableColumns (array of column indices or 'all')

9. **data-populate** - Fill with mock data
   Options: dataType (users|products|orders|etc), dataCount

10. **state-toggle** - Toggle element states
    Options: toggleClass, toggleAttribute, toggleStates

## Detected Injection Points

${pointsSummary}

${userIntent ? `## User Intent\n${userIntent}\n` : ''}

## Instructions

Generate injection configurations for the detected points. For each injection:
1. Choose the most appropriate injection type
2. Use the exact selector provided
3. Configure options that make sense for the element
4. Add realistic feedback messages

Return a JSON object with this structure:
{
  "injections": [
    {
      "id": "unique-id",
      "type": "injection-type",
      "selector": "css-selector",
      "options": { ... }
    }
  ],
  "summary": "Brief description of what interactions were added"
}

IMPORTANT:
- Only return valid JSON, no markdown code blocks
- Generate 5-15 injections focusing on the most impactful interactions
- Use realistic, contextual messages (e.g., "Profile updated successfully!" not just "Success")
- For tables, always add table-sort and consider data-populate
- For forms, always add form-validation and form-submit
- For buttons that aren't form submits, add click-feedback with ripple effect`;
}

// ============================================================================
// LLM Calls
// ============================================================================

async function callAnthropic(
  apiKey: string,
  model: string,
  prompt: string
): Promise<{ injections: InjectionConfig[]; summary: string }> {
  console.log('[callAnthropic] Starting API call...');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[callAnthropic] API error:', response.status, errorText);
    throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || '';

  // Parse JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No valid JSON found in response');
  }

  return JSON.parse(jsonMatch[0]);
}

async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string
): Promise<{ injections: InjectionConfig[]; summary: string }> {
  console.log('[callOpenAI] Starting API call...');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[callOpenAI] API error:', response.status, errorText);
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  return JSON.parse(content);
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { injectionPoints, userIntent, provider, model } = body;

    console.log('[generate-injections] Received request with', injectionPoints.length, 'injection points');

    if (!injectionPoints || injectionPoints.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No injection points provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from vault
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's API key - query for any active key, optionally filtered by provider
    const requestedProvider = provider;
    let keyQuery = supabase
      .from('user_api_key_refs')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);

    if (requestedProvider) {
      keyQuery = keyQuery.eq('provider', requestedProvider);
    }

    const { data: keyConfigs, error: keyError } = await keyQuery.limit(1);
    const keyConfig = keyConfigs?.[0];

    if (keyError || !keyConfig) {
      return new Response(
        JSON.stringify({ error: 'No API key configured. Please add your API key in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const selectedProvider = keyConfig.provider;
    const selectedModel = model || keyConfig.model || (selectedProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o');

    // Get decrypted API key using correct RPC parameters
    const { data: apiKey, error: apiKeyError } = await supabase
      .rpc('get_api_key', { p_user_id: user.id, p_provider: keyConfig.provider });

    if (apiKeyError || !apiKey) {
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve API key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build prompt and call LLM
    const prompt = buildPrompt(injectionPoints, userIntent);

    let result: { injections: InjectionConfig[]; summary: string };

    if (selectedProvider === 'anthropic') {
      result = await callAnthropic(apiKey, selectedModel, prompt);
    } else {
      result = await callOpenAI(apiKey, selectedModel, prompt);
    }

    console.log('[generate-injections] Generated', result.injections.length, 'injections');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[generate-injections] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
