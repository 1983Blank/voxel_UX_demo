// Supabase Edge Function for server-side generation orchestration
// Coordinates multi-variant prototype generation with Realtime progress streaming
// Handles timeout by self-invoking with continuation tokens
// Deploy with: supabase functions deploy orchestrate-generation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Edge function timeout is ~60s, leave buffer for cleanup
const TIMEOUT_BUFFER_MS = 50000

// ============ Types ============

type VariantApproach = 'minimal' | 'feature-rich' | 'gamified' | 'accessible'
type GenerationPhase = 'queued' | 'script' | 'files' | 'assembly' | 'complete' | 'failed'
type StepStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

interface VariantPlan {
  id: string
  variant_index: number
  title: string
  description: string
  key_changes: string[]
  style_notes?: string
}

interface GenerationContext {
  vibeSessionId: string
  sourceHtml: string
  screenshotBase64?: string
  designTokens: Array<{
    name: string
    value: string
    type: string
    cssVariable: string
  }>
  plans: VariantPlan[]
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
}

interface StartRequest {
  vibeSessionId: string
  sourceHtml: string
  screenshotBase64?: string
  designTokens?: Array<{
    name: string
    value: string
    type: string
    cssVariable: string
  }>
  plans: VariantPlan[]
  provider?: 'anthropic' | 'openai' | 'google'
  model?: string
}

interface ContinueRequest {
  sessionId: string
  continuationToken: string
}

interface GenerationSession {
  id: string
  user_id: string
  vibe_session_id: string
  status: string
  generation_context: GenerationContext
  current_variant_index: number | null
  total_variants: number
  continuation_token: string | null
}

interface GenerationVariant {
  id: string
  generation_session_id: string
  variant_index: number
  phase: GenerationPhase
  current_step: string | null
  completed_steps: number
  total_steps: number | null
  implementation_script: Record<string, unknown> | null
  virtual_fs: Record<string, unknown> | null
}

interface GenerationStep {
  id: string
  variant_id: string
  step_key: string
  step_label: string
  status: StepStatus
  file_path: string | null
  file_content: string | null
  file_type: string | null
}

// Map variant index to approach
const INDEX_TO_APPROACH: Record<number, VariantApproach> = {
  1: 'minimal',
  2: 'feature-rich',
  3: 'gamified',
  4: 'accessible',
}

// ============ Database Helpers ============

async function createGenerationSession(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  context: GenerationContext
): Promise<GenerationSession> {
  const { data, error } = await supabase
    .from('generation_sessions')
    .insert({
      user_id: userId,
      vibe_session_id: context.vibeSessionId,
      status: 'running',
      generation_context: context,
      total_variants: context.plans.length,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create session: ${error.message}`)
  return data
}

async function createGenerationVariants(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  plans: VariantPlan[]
): Promise<GenerationVariant[]> {
  const variants = plans.map((plan) => ({
    generation_session_id: sessionId,
    variant_index: plan.variant_index,
    phase: 'queued' as const,
    completed_steps: 0,
  }))

  const { data, error } = await supabase
    .from('generation_variants')
    .insert(variants)
    .select()

  if (error) throw new Error(`Failed to create variants: ${error.message}`)
  return data
}

async function getSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<GenerationSession> {
  const { data, error } = await supabase
    .from('generation_sessions')
    .select('*')
    .eq('id', sessionId)
    .single()

  if (error) throw new Error(`Failed to get session: ${error.message}`)
  return data
}

async function getVariants(
  supabase: ReturnType<typeof createClient>,
  sessionId: string
): Promise<GenerationVariant[]> {
  const { data, error } = await supabase
    .from('generation_variants')
    .select('*')
    .eq('generation_session_id', sessionId)
    .order('variant_index')

  if (error) throw new Error(`Failed to get variants: ${error.message}`)
  return data
}

async function updateSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  updates: Partial<GenerationSession>
): Promise<void> {
  const { error } = await supabase
    .from('generation_sessions')
    .update(updates)
    .eq('id', sessionId)

  if (error) throw new Error(`Failed to update session: ${error.message}`)
}

async function updateVariant(
  supabase: ReturnType<typeof createClient>,
  variantId: string,
  updates: Partial<GenerationVariant>
): Promise<void> {
  const { error } = await supabase
    .from('generation_variants')
    .update(updates)
    .eq('id', variantId)

  if (error) throw new Error(`Failed to update variant: ${error.message}`)
}

async function createStep(
  supabase: ReturnType<typeof createClient>,
  variantId: string,
  stepKey: string,
  stepLabel: string
): Promise<GenerationStep> {
  const { data, error } = await supabase
    .from('generation_steps')
    .insert({
      variant_id: variantId,
      step_key: stepKey,
      step_label: stepLabel,
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create step: ${error.message}`)
  return data
}

async function updateStep(
  supabase: ReturnType<typeof createClient>,
  stepId: string,
  updates: Partial<GenerationStep> & {
    status?: StepStatus
    started_at?: string
    completed_at?: string
    duration_ms?: number
    error_message?: string
  }
): Promise<void> {
  const { error } = await supabase
    .from('generation_steps')
    .update(updates)
    .eq('id', stepId)

  if (error) throw new Error(`Failed to update step: ${error.message}`)
}

// ============ Edge Function Callers ============

async function callEdgeFunction(
  supabaseUrl: string,
  functionName: string,
  accessToken: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`${functionName} failed: ${response.status} - ${errorText}`)
  }

  return response.json()
}

async function generateImplementationScript(
  supabaseUrl: string,
  accessToken: string,
  plan: VariantPlan,
  context: GenerationContext
): Promise<Record<string, unknown>> {
  const approach = INDEX_TO_APPROACH[plan.variant_index] || 'minimal'

  const result = await callEdgeFunction(
    supabaseUrl,
    'generate-implementation-script',
    accessToken,
    {
      variantPlan: plan,
      designTokens: context.designTokens || [],
      variantApproach: approach,
      provider: context.provider || 'anthropic',
      model: context.model,
    }
  )

  return result as Record<string, unknown>
}

async function generateFile(
  supabaseUrl: string,
  accessToken: string,
  fileType: string,
  implementationScript: Record<string, unknown>,
  context: GenerationContext,
  componentName?: string,
  previousFiles?: Array<{ path: string; exports?: string[]; summary?: string }>
): Promise<{ path: string; content: string; type: string; exports?: string[]; summary?: string }> {
  const approach = INDEX_TO_APPROACH[1] || 'minimal' // Will be set per variant

  const result = await callEdgeFunction(
    supabaseUrl,
    'generate-prototype-file',
    accessToken,
    {
      fileType,
      implementationScript,
      variantApproach: approach,
      designTokens: context.designTokens || [],
      componentName,
      previousFiles,
      sourceHtml: context.sourceHtml,
      screenshotBase64: context.screenshotBase64,
      provider: context.provider || 'anthropic',
      model: context.model,
    }
  )

  return result as { path: string; content: string; type: string; exports?: string[]; summary?: string }
}

// ============ Processing Logic ============

async function processVariant(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  accessToken: string,
  variant: GenerationVariant,
  plan: VariantPlan,
  context: GenerationContext,
  startTime: number
): Promise<boolean> {
  const approach = INDEX_TO_APPROACH[plan.variant_index] || 'minimal'
  console.log(`[orchestrate-generation] Processing variant ${plan.variant_index} (${approach})`)

  // Track generated files for assembly
  const generatedFiles: Array<{ path: string; content: string; type: string; exports?: string[] }> = []

  try {
    // Phase 1: Generate implementation script
    if (variant.phase === 'queued' || variant.phase === 'script') {
      // Check timeout
      if (Date.now() - startTime > TIMEOUT_BUFFER_MS) {
        console.log('[orchestrate-generation] Timeout approaching during script phase')
        return false
      }

      await updateVariant(supabase, variant.id, {
        phase: 'script',
        current_step: 'Generating implementation script',
      })

      const scriptStep = await createStep(
        supabase,
        variant.id,
        'implementation-script',
        'Generate implementation script'
      )

      await updateStep(supabase, scriptStep.id, {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })

      const scriptStartTime = Date.now()

      try {
        const script = await generateImplementationScript(
          supabaseUrl,
          accessToken,
          plan,
          context
        )

        await updateVariant(supabase, variant.id, {
          implementation_script: script,
          phase: 'files',
        })

        await updateStep(supabase, scriptStep.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - scriptStartTime,
        })

        variant.implementation_script = script
        variant.phase = 'files'
      } catch (error) {
        await updateStep(supabase, scriptStep.id, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          duration_ms: Date.now() - scriptStartTime,
          error_message: error instanceof Error ? error.message : 'Script generation failed',
        })
        throw error
      }
    }

    // Phase 2: Generate files
    if (variant.phase === 'files') {
      const script = variant.implementation_script as Record<string, unknown>
      const componentsNeeded = (script?.componentsNeeded as string[]) || ['vx-button', 'vx-loading']

      // Build file generation order
      const fileSteps = [
        { key: 'tokens.css', label: 'Design tokens CSS', fileType: 'tokens.css' },
        { key: 'store.json', label: 'Initial state store', fileType: 'store.json' },
        { key: 'flows.json', label: 'User flow definitions', fileType: 'flows.json' },
        ...componentsNeeded.map(c => ({
          key: `component-${c}`,
          label: `Component: ${c}`,
          fileType: 'component',
          componentName: c,
        })),
        { key: 'index.html', label: 'Entry point HTML', fileType: 'index.html' },
      ]

      // Update total steps
      await updateVariant(supabase, variant.id, {
        total_steps: fileSteps.length + 1, // +1 for script step
      })

      // Get existing steps to resume from
      const { data: existingSteps } = await supabase
        .from('generation_steps')
        .select('*')
        .eq('variant_id', variant.id)

      const completedStepKeys = new Set(
        existingSteps?.filter(s => s.status === 'completed').map(s => s.step_key) || []
      )

      // Process each file
      for (const fileStep of fileSteps) {
        // Check timeout before each step
        if (Date.now() - startTime > TIMEOUT_BUFFER_MS) {
          console.log(`[orchestrate-generation] Timeout approaching at step ${fileStep.key}`)
          return false
        }

        // Skip completed steps
        if (completedStepKeys.has(fileStep.key)) {
          // Load completed file content
          const existingStep = existingSteps?.find(s => s.step_key === fileStep.key)
          if (existingStep?.file_path && existingStep?.file_content) {
            generatedFiles.push({
              path: existingStep.file_path,
              content: existingStep.file_content,
              type: existingStep.file_type || 'txt',
            })
          }
          continue
        }

        await updateVariant(supabase, variant.id, {
          current_step: fileStep.label,
        })

        // Find or create step
        let step = existingSteps?.find(s => s.step_key === fileStep.key)
        if (!step) {
          step = await createStep(supabase, variant.id, fileStep.key, fileStep.label)
        }

        await updateStep(supabase, step.id, {
          status: 'in_progress',
          started_at: new Date().toISOString(),
        })

        const stepStartTime = Date.now()

        try {
          const file = await generateFile(
            supabaseUrl,
            accessToken,
            fileStep.fileType,
            script,
            context,
            (fileStep as { componentName?: string }).componentName,
            generatedFiles.map(f => ({
              path: f.path,
              exports: f.exports,
              summary: f.type,
            }))
          )

          generatedFiles.push(file)

          await updateStep(supabase, step.id, {
            status: 'completed',
            file_path: file.path,
            file_content: file.content,
            file_type: file.type,
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - stepStartTime,
          })

          // Update completed count
          const completedCount = generatedFiles.length + 1 // +1 for script
          await updateVariant(supabase, variant.id, {
            completed_steps: completedCount,
          })
        } catch (error) {
          await updateStep(supabase, step.id, {
            status: 'failed',
            completed_at: new Date().toISOString(),
            duration_ms: Date.now() - stepStartTime,
            error_message: error instanceof Error ? error.message : 'File generation failed',
          })
          throw error
        }
      }

      // Move to assembly phase
      await updateVariant(supabase, variant.id, {
        phase: 'assembly',
      })
      variant.phase = 'assembly'
    }

    // Phase 3: Assembly (build VirtualFS snapshot)
    if (variant.phase === 'assembly') {
      await updateVariant(supabase, variant.id, {
        current_step: 'Assembling prototype files',
      })

      // Get all completed file steps
      const { data: completedSteps } = await supabase
        .from('generation_steps')
        .select('*')
        .eq('variant_id', variant.id)
        .eq('status', 'completed')
        .not('file_path', 'is', null)

      // Build VirtualFS snapshot
      const files = completedSteps?.map(step => ({
        path: step.file_path,
        content: step.file_content,
        type: step.file_type || 'txt',
      })) || []

      const virtualFsSnapshot = {
        files,
        metadata: {
          createdAt: new Date().toISOString(),
          variantId: variant.id,
          variantIndex: variant.variant_index,
        },
      }

      await updateVariant(supabase, variant.id, {
        phase: 'complete',
        virtual_fs: virtualFsSnapshot,
        current_step: null,
        completed_at: new Date().toISOString(),
      })

      console.log(`[orchestrate-generation] Variant ${plan.variant_index} complete with ${files.length} files`)
    }

    return true
  } catch (error) {
    console.error(`[orchestrate-generation] Variant ${plan.variant_index} failed:`, error)

    await updateVariant(supabase, variant.id, {
      phase: 'failed',
      error_message: error instanceof Error ? error.message : 'Generation failed',
    })

    return true // Continue with other variants
  }
}

async function processGeneration(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  accessToken: string,
  session: GenerationSession,
  startTime: number
): Promise<{ status: 'complete' | 'continuing' | 'failed'; continuationToken?: string }> {
  const context = session.generation_context
  const variants = await getVariants(supabase, session.id)

  // Process variants
  for (const variant of variants) {
    if (variant.phase === 'complete' || variant.phase === 'failed') {
      continue
    }

    // Find the plan for this variant
    const plan = context.plans.find(p => p.variant_index === variant.variant_index)
    if (!plan) {
      console.error(`[orchestrate-generation] No plan found for variant ${variant.variant_index}`)
      continue
    }

    // Update current variant index
    await updateSession(supabase, session.id, {
      current_variant_index: variant.variant_index,
    })

    const completed = await processVariant(
      supabase,
      supabaseUrl,
      accessToken,
      variant,
      plan,
      context,
      startTime
    )

    if (!completed) {
      // Timeout - save state and return for continuation
      const token = crypto.randomUUID()
      await updateSession(supabase, session.id, {
        status: 'paused',
        continuation_token: token,
      })

      console.log('[orchestrate-generation] Pausing for continuation')
      return { status: 'continuing', continuationToken: token }
    }
  }

  // Check if all variants are complete
  const finalVariants = await getVariants(supabase, session.id)
  const allComplete = finalVariants.every(v => v.phase === 'complete' || v.phase === 'failed')
  const anyFailed = finalVariants.some(v => v.phase === 'failed')

  if (allComplete) {
    await updateSession(supabase, session.id, {
      status: anyFailed ? 'completed' : 'completed', // Mark complete even with partial failures
      completed_at: new Date().toISOString(),
      continuation_token: null,
    })

    console.log('[orchestrate-generation] All variants processed')
    return { status: 'complete' }
  }

  // Should not reach here
  return { status: 'complete' }
}

// ============ Main Handler ============

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()

  try {
    const body = await req.json()
    const isContinuation = 'continuationToken' in body

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get auth header for edge function calls
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let session: GenerationSession

    if (isContinuation) {
      // Resume existing session
      const { sessionId, continuationToken } = body as ContinueRequest

      session = await getSession(supabase, sessionId)

      if (session.continuation_token !== continuationToken) {
        return new Response(
          JSON.stringify({ error: 'Invalid continuation token' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify ownership
      if (session.user_id !== user.id) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Resume
      await updateSession(supabase, session.id, {
        status: 'running',
        continuation_token: null,
      })

      console.log(`[orchestrate-generation] Resuming session ${session.id}`)
    } else {
      // Start new generation
      const request = body as StartRequest

      if (!request.vibeSessionId || !request.sourceHtml || !request.plans?.length) {
        return new Response(
          JSON.stringify({ error: 'vibeSessionId, sourceHtml, and plans are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const context: GenerationContext = {
        vibeSessionId: request.vibeSessionId,
        sourceHtml: request.sourceHtml,
        screenshotBase64: request.screenshotBase64,
        designTokens: request.designTokens || [],
        plans: request.plans,
        provider: request.provider,
        model: request.model,
      }

      session = await createGenerationSession(supabase, user.id, context)
      await createGenerationVariants(supabase, session.id, request.plans)

      console.log(`[orchestrate-generation] Created session ${session.id} with ${request.plans.length} variants`)
    }

    // Process generation
    const result = await processGeneration(
      supabase,
      supabaseUrl,
      authHeader.replace('Bearer ', ''),
      session,
      startTime
    )

    // If continuing, schedule self-invoke
    if (result.status === 'continuing' && result.continuationToken) {
      // In production, this would use a queue or scheduler
      // For now, return continuation info to client for retry
      return new Response(
        JSON.stringify({
          status: 'continuing',
          sessionId: session.id,
          continuationToken: result.continuationToken,
          message: 'Generation paused for continuation. Call again with sessionId and continuationToken to resume.',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        status: result.status,
        sessionId: session.id,
        message: result.status === 'complete'
          ? 'Generation complete'
          : 'Generation failed',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[orchestrate-generation] Error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Orchestration failed',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
