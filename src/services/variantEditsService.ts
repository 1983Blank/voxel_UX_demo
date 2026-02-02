/**
 * Variant Edits Service (V2)
 *
 * Generates and applies structured edit operations to create variants.
 * Uses element summary instead of full HTML for LLM context efficiency.
 *
 * Flow:
 * 1. Extract element summary from original HTML (compact representation)
 * 2. Send summary + screenshot + plan to LLM
 * 3. LLM returns structured EditOperation[]
 * 4. Apply operations to original HTML using DOM manipulation
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { VariantPlan } from './variantPlanService';
import { extractMinimalSummary } from './elementSummaryService';
import {
  applyEditOperations,
  type EditOperation,
  type ApplyOperationsResult,
} from './editOperationsService';
import { logLLMCall, completeLLMCall, failLLMCall } from '@/store/debugStore';

// ============================================================================
// Types
// ============================================================================

export interface VariantEditsV2 {
  variantIndex: number;
  planId: string;
  operations: EditOperation[];
  summary: string;
}

export interface GenerateEditsProgress {
  stage: 'preparing' | 'extracting' | 'generating' | 'applying' | 'saving' | 'complete';
  message: string;
  percent: number;
  variantIndex?: number;
  operationsApplied?: number;
  operationsFailed?: number;
}

export interface GenerateVariantsResult {
  variantIndex: number;
  html: string;
  operationsApplied: number;
  operationsFailed: number;
}

type ProgressCallback = (progress: GenerateEditsProgress) => void;
type VariantCompleteCallback = (variantIndex: number, html: string) => void;

// ============================================================================
// V2: Element Summary Based Generation
// ============================================================================

/**
 * Generate edit operations using element summary (V2 approach)
 * This sends a compact representation instead of full HTML
 */
export async function generateVariantEditsV2(
  sessionId: string,
  plans: VariantPlan[],
  originalHtml: string,
  onProgress?: ProgressCallback,
  screenshotBase64?: string,
  provider?: string,
  model?: string
): Promise<VariantEditsV2[]> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  onProgress?.({
    stage: 'extracting',
    message: 'Extracting element structure...',
    percent: 10,
  });

  // Extract element summary (compact representation)
  // Limit to 1500 tokens (~6000 chars) to leave room for screenshot + prompt
  const elementSummary = extractMinimalSummary(originalHtml, 1500);

  console.log('[VariantEditsService V2] Element summary extracted:', {
    originalLength: originalHtml.length,
    summaryLength: elementSummary.length,
    compressionRatio: (originalHtml.length / elementSummary.length).toFixed(1) + 'x',
  });

  onProgress?.({
    stage: 'preparing',
    message: 'Preparing edit generation...',
    percent: 20,
  });

  // Prepare plans payload
  const plansPayload = plans.map(p => ({
    id: p.id,
    variantIndex: p.variant_index,
    title: p.title,
    description: p.description,
    keyChanges: p.key_changes,
    styleNotes: p.style_notes || '',
  }));

  onProgress?.({
    stage: 'generating',
    message: 'AI is generating edit operations...',
    percent: 30,
  });

  // Call V2 Edge Function using direct fetch for better error visibility
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${supabaseUrl}/functions/v1/generate-variant-edits-v2`;

  console.log('[VariantEditsService V2] Calling:', functionUrl);

  // Start debug logging
  const debugId = logLLMCall(
    'generate-variant-edits-v2',
    functionUrl,
    {
      sessionId,
      plans: plansPayload,
      elementSummary,
      screenshotBase64,
      provider,
      model,
    },
    sessionId
  );

  const requestBody = JSON.stringify({
    sessionId,
    plans: plansPayload,
    elementSummary,
    screenshotBase64,
    provider,
    model,
  });

  console.log('[VariantEditsService V2] Request body size:', Math.round(requestBody.length / 1024), 'KB');
  console.log('[VariantEditsService V2] - elementSummary:', Math.round(elementSummary.length / 1024), 'KB');
  console.log('[VariantEditsService V2] - screenshotBase64:', Math.round((screenshotBase64?.length || 0) / 1024), 'KB');
  console.log('[VariantEditsService V2] - plans:', plansPayload.length, 'plans');

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: requestBody,
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    console.error('[VariantEditsService V2] Failed to parse response:', e);
    const text = await response.text().catch(() => 'Unable to read response');
    console.error('[VariantEditsService V2] Raw response:', text);
    failLLMCall(debugId, `Failed to parse response: ${text.slice(0, 200)}`);
    throw new Error(`Edge function returned invalid JSON: ${response.status}`);
  }

  if (!response.ok) {
    console.error('[VariantEditsService V2] Edge function error:', response.status, data);
    completeLLMCall(debugId, response.status, false, data, data?.error);
    throw new Error(data?.error || `Edge function failed: ${response.status}`);
  }

  if (!data?.success) {
    console.error('[VariantEditsService V2] Generation failed:', data?.error);
    console.error('[VariantEditsService V2] Full response:', data);
    completeLLMCall(debugId, response.status, false, data, data?.error);
    throw new Error(data?.error || 'Variant edits generation failed');
  }

  // Log successful completion
  completeLLMCall(debugId, response.status, true, data);

  console.log('[VariantEditsService V2] Generated operations for', data.variantEdits?.length, 'variants');

  onProgress?.({
    stage: 'complete',
    message: 'Edit operations ready!',
    percent: 100,
  });

  return data.variantEdits || [];
}

/**
 * Generate variants by applying edit operations to original HTML (V2)
 * This is the main entry point that:
 * 1. Extracts element summary
 * 2. Generates edit operations via LLM
 * 3. Applies operations using DOM manipulation
 * 4. Saves results to storage and database
 */
export async function generateVariantsFromEditsV2(
  sessionId: string,
  plans: VariantPlan[],
  originalHtml: string,
  onProgress?: ProgressCallback,
  onVariantComplete?: VariantCompleteCallback,
  screenshotBase64?: string,
  provider?: string,
  model?: string
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const userId = session.user.id;

  // Update session status
  await supabase
    .from('vibe_sessions')
    .update({ status: 'generating' })
    .eq('id', sessionId);

  try {
    // Step 1: Generate edit operations (V2)
    const variantEdits = await generateVariantEditsV2(
      sessionId,
      plans,
      originalHtml,
      (progress) => {
        // Map progress to 0-50% range
        onProgress?.({
          ...progress,
          percent: progress.percent * 0.5,
        });
      },
      screenshotBase64,
      provider,
      model
    );

    // Step 2: Apply operations and save each variant
    for (let i = 0; i < variantEdits.length; i++) {
      const variantEdit = variantEdits[i];
      const progressBase = 50 + (i / variantEdits.length) * 40;

      onProgress?.({
        stage: 'applying',
        message: `Applying ${variantEdit.operations.length} edits for Variant ${String.fromCharCode(64 + variantEdit.variantIndex)}...`,
        percent: progressBase,
        variantIndex: variantEdit.variantIndex,
      });

      // Apply operations using DOM manipulation (V2 approach)
      let applyResult: ApplyOperationsResult;
      try {
        applyResult = applyEditOperations(originalHtml, variantEdit.operations);
      } catch (applyError) {
        console.error(`[VariantEditsService V2] Failed to apply operations for variant ${variantEdit.variantIndex}:`, applyError);
        // Surface the error rather than silently falling back
        throw new Error(`Failed to apply edit operations for Variant ${String.fromCharCode(64 + variantEdit.variantIndex)}: ${applyError instanceof Error ? applyError.message : 'Unknown error'}`);
      }

      const successRate = applyResult.totalOperations > 0
        ? Math.round((applyResult.successfulOperations / applyResult.totalOperations) * 100)
        : 0;

      console.log(`[VariantEditsService V2] Variant ${variantEdit.variantIndex}: Applied ${applyResult.successfulOperations}/${applyResult.totalOperations} operations (${successRate}% success)`);

      if (applyResult.failedOperations > 0) {
        console.warn(`[VariantEditsService V2] Variant ${variantEdit.variantIndex}: ${applyResult.failedOperations} operations failed`);
        // Log failed operations for debugging
        const failedOps = applyResult.results.filter(r => !r.success);
        failedOps.forEach(r => console.warn('  Failed:', r.operation.type, r.operation.selector, r.error));

        // If all operations failed, this is a critical error
        if (applyResult.successfulOperations === 0 && variantEdit.operations.length > 0) {
          console.error(`[VariantEditsService V2] All operations failed for variant ${variantEdit.variantIndex}. Selectors may not match the HTML structure.`);
        }
      }

      // Update progress with operation results
      onProgress?.({
        stage: 'applying',
        message: `Applied ${applyResult.successfulOperations}/${applyResult.totalOperations} edits (${successRate}% success)`,
        percent: progressBase + 3,
        variantIndex: variantEdit.variantIndex,
        operationsApplied: applyResult.successfulOperations,
        operationsFailed: applyResult.failedOperations,
      });

      // Notify caller of completed variant
      onVariantComplete?.(variantEdit.variantIndex, applyResult.html);

      onProgress?.({
        stage: 'saving',
        message: `Saving Variant ${String.fromCharCode(64 + variantEdit.variantIndex)}...`,
        percent: progressBase + 5,
        variantIndex: variantEdit.variantIndex,
      });

      // Save to storage
      const htmlPath = `${userId}/${sessionId}/variant_${variantEdit.variantIndex}.html`;
      const { error: uploadError } = await supabase.storage
        .from('vibe-files')
        .upload(htmlPath, new Blob([applyResult.html], { type: 'text/html' }), {
          contentType: 'text/html',
          upsert: true,
        });

      if (uploadError) {
        console.error(`[VariantEditsService V2] Failed to upload variant ${variantEdit.variantIndex}:`, uploadError);
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('vibe-files')
        .getPublicUrl(htmlPath);

      // Check if variant record exists
      const { data: existingVariant } = await supabase
        .from('vibe_variants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('variant_index', variantEdit.variantIndex)
        .single();

      if (existingVariant) {
        // Update existing variant
        await supabase
          .from('vibe_variants')
          .update({
            html_path: htmlPath,
            html_url: urlData.publicUrl,
            status: 'complete',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingVariant.id);
      } else {
        // Create new variant record
        await supabase
          .from('vibe_variants')
          .insert({
            session_id: sessionId,
            plan_id: variantEdit.planId,
            variant_index: variantEdit.variantIndex,
            html_path: htmlPath,
            html_url: urlData.publicUrl,
            status: 'complete',
          });
      }
    }

    // Update session status to complete
    await supabase
      .from('vibe_sessions')
      .update({ status: 'complete' })
      .eq('id', sessionId);

    onProgress?.({
      stage: 'complete',
      message: 'All variants generated!',
      percent: 100,
    });

  } catch (error) {
    console.error('[VariantEditsService V2] Error:', error);

    // Update session status to failed
    await supabase
      .from('vibe_sessions')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
      })
      .eq('id', sessionId);

    throw error;
  }
}

// ============================================================================
// Legacy V1 Support (for backwards compatibility)
// ============================================================================

// Re-export the old types for backwards compatibility
export interface EditOperationV1 {
  find: string;
  replace: string;
  description?: string;
}

export interface VariantEdits {
  variantIndex: number;
  planId: string;
  edits: EditOperationV1[];
  summary: string;
}

export interface ApplyEditsResult {
  html: string;
  appliedEdits: number;
  failedEdits: EditOperationV1[];
}

/**
 * Apply V1 edit operations (find/replace strings) - Legacy
 */
export function applyEdits(html: string, edits: EditOperationV1[]): ApplyEditsResult {
  let result = html;
  let appliedEdits = 0;
  const failedEdits: EditOperationV1[] = [];

  for (const edit of edits) {
    if (result.includes(edit.find)) {
      result = result.replace(edit.find, edit.replace);
      appliedEdits++;
    } else {
      console.warn('[applyEdits V1] Could not find string to replace:', edit.find.substring(0, 100));
      failedEdits.push(edit);
    }
  }

  return { html: result, appliedEdits, failedEdits };
}

/**
 * Generate V1 edits - Legacy (calls old edge function)
 */
export async function generateVariantEdits(
  sessionId: string,
  plans: VariantPlan[],
  originalHtml: string,
  onProgress?: ProgressCallback,
  screenshotBase64?: string,
  provider?: string,
  model?: string
): Promise<VariantEdits[]> {
  // Redirect to V2 and convert result format
  const v2Results = await generateVariantEditsV2(
    sessionId,
    plans,
    originalHtml,
    onProgress,
    screenshotBase64,
    provider,
    model
  );

  // Convert V2 operations to V1 format (best effort)
  return v2Results.map(v2 => ({
    variantIndex: v2.variantIndex,
    planId: v2.planId,
    edits: [], // V1 edits are no longer generated
    summary: v2.summary,
  }));
}

/**
 * Generate variants from edits - Updated to use V2
 */
export async function generateVariantsFromEdits(
  sessionId: string,
  plans: VariantPlan[],
  originalHtml: string,
  onProgress?: ProgressCallback,
  onVariantComplete?: VariantCompleteCallback,
  screenshotBase64?: string,
  provider?: string,
  model?: string
): Promise<void> {
  // Use V2 implementation
  return generateVariantsFromEditsV2(
    sessionId,
    plans,
    originalHtml,
    onProgress,
    onVariantComplete,
    screenshotBase64,
    provider,
    model
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get stored edit operations for a session
 */
export async function getEditsForSession(sessionId: string): Promise<VariantEditsV2[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('vibe_variant_plans')
    .select('id, variant_index, edit_operations, edit_summary')
    .eq('session_id', sessionId)
    .not('edit_operations', 'is', null)
    .order('variant_index', { ascending: true });

  if (error) {
    console.error('[VariantEditsService] Error fetching edits:', error);
    return [];
  }

  return (data || []).map(row => ({
    variantIndex: row.variant_index,
    planId: row.id,
    operations: row.edit_operations || [],
    summary: row.edit_summary || '',
  }));
}
