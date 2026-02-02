/**
 * Injection Service
 * High-level API for adding interactivity to prototypes
 */

import { supabase } from './supabase';
import {
  analyzeForInjections,
  injectRuntime
} from './injections';
import type {
  InjectionConfig,
  AnalysisResult,
  RuntimeOptions
} from './injections';
import { logLLMCall, completeLLMCall, failLLMCall } from '@/store/debugStore';

// ============================================================================
// Types
// ============================================================================

export interface EnhancePrototypeOptions {
  /** User intent for LLM to consider */
  userIntent?: string;
  /** Enable mock data population */
  enableMockData?: boolean;
  /** Enable interaction tracking/analytics */
  enableAnalytics?: boolean;
  /** LLM provider (anthropic or openai) */
  provider?: string;
  /** Specific model to use */
  model?: string;
  /** Use LLM to generate smart injections */
  useLLM?: boolean;
  /** Custom injection configs (if not using LLM) */
  customInjections?: InjectionConfig[];
}

export interface EnhanceResult {
  /** Enhanced HTML with runtime injected */
  html: string;
  /** Analysis of injection points */
  analysis: AnalysisResult;
  /** Injection configurations applied */
  injections: InjectionConfig[];
  /** Summary of what was added */
  summary: string;
}

// ============================================================================
// Default Injections
// ============================================================================

/**
 * Generate default injections based on analysis (without LLM)
 */
function generateDefaultInjections(analysis: AnalysisResult): InjectionConfig[] {
  const injections: InjectionConfig[] = [];
  let idCounter = 0;

  const getId = () => `inj-${++idCounter}`;

  for (const point of analysis.injectionPoints) {
    switch (point.type) {
      case 'button':
        injections.push({
          id: getId(),
          type: 'click-feedback',
          selector: point.selector,
          options: {
            feedbackType: 'ripple',
            feedbackMessage: point.textContent
              ? `${point.textContent} clicked!`
              : 'Action completed!',
            feedbackDuration: 2000
          }
        });
        break;

      case 'form':
        injections.push({
          id: getId(),
          type: 'form-submit',
          selector: point.selector,
          options: {
            successMessage: 'Form submitted successfully!',
            errorMessage: 'Please fix the errors and try again.',
            resetAfterSubmit: true
          }
        });
        break;

      case 'link':
        if (point.suggestedInjections?.some(s => s.type === 'smooth-scroll')) {
          injections.push({
            id: getId(),
            type: 'navigation',
            selector: point.selector,
            options: {
              scrollBehavior: 'smooth'
            }
          });
        } else {
          injections.push({
            id: getId(),
            type: 'click-feedback',
            selector: point.selector,
            options: {
              feedbackType: 'toast',
              feedbackMessage: `Navigating to ${point.textContent || 'page'}...`,
              feedbackDuration: 1500
            }
          });
        }
        break;

      case 'modal':
        injections.push({
          id: getId(),
          type: 'modal-toggle',
          selector: point.selector,
          options: {
            closeOnBackdrop: true,
            closeOnEscape: true
          }
        });
        break;

      case 'tab':
        injections.push({
          id: getId(),
          type: 'tab-switch',
          selector: point.selector,
          options: {
            activeClass: 'active'
          }
        });
        break;

      case 'table':
        injections.push({
          id: getId(),
          type: 'table-sort',
          selector: point.selector,
          options: {
            sortableColumns: 'all'
          }
        });
        break;

      case 'dropdown':
        injections.push({
          id: getId(),
          type: 'dropdown-toggle',
          selector: point.selector,
          options: {
            closeOnSelect: true
          }
        });
        break;

      case 'accordion':
        injections.push({
          id: getId(),
          type: 'state-toggle',
          selector: point.selector,
          options: {
            toggleClass: 'open'
          }
        });
        break;
    }
  }

  return injections;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Analyze HTML for potential injection points
 */
export function analyzePrototype(html: string): AnalysisResult {
  return analyzeForInjections(html);
}

/**
 * Generate injections using LLM
 */
export async function generateSmartInjections(
  analysis: AnalysisResult,
  userIntent?: string,
  provider?: string,
  model?: string
): Promise<{ injections: InjectionConfig[]; summary: string }> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${supabaseUrl}/functions/v1/generate-injections`;

  // Start debug logging
  const debugId = logLLMCall(
    'other', // Using 'other' since there's no specific stage for injections
    functionUrl,
    {
      injectionPoints: analysis.injectionPoints.slice(0, 10), // Truncate for display
      injectionPointsCount: analysis.injectionPoints.length,
      userIntent,
      provider,
      model,
    }
  );

  console.log('[InjectionService] Calling generate-injections:', {
    injectionPointsCount: analysis.injectionPoints.length,
    userIntent,
  });

  try {
    const response = await supabase.functions.invoke('generate-injections', {
      body: {
        injectionPoints: analysis.injectionPoints,
        userIntent,
        provider,
        model
      }
    });

    if (response.error) {
      completeLLMCall(debugId, 500, false, null, response.error.message);
      throw new Error(response.error.message);
    }

    // Log successful completion
    completeLLMCall(debugId, 200, true, response.data);

    console.log('[InjectionService] Generated', response.data?.injections?.length, 'smart injections');

    return response.data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    failLLMCall(debugId, errorMessage);
    throw error;
  }
}

/**
 * Enhance a prototype with interactivity
 */
export async function enhancePrototype(
  html: string,
  options: EnhancePrototypeOptions = {}
): Promise<EnhanceResult> {
  // Step 1: Analyze HTML
  const analysis = analyzeForInjections(html);

  console.log('[InjectionService] Analysis:', {
    totalPoints: analysis.summary.totalPoints,
    byType: analysis.summary.byType,
    score: analysis.summary.interactivityScore
  });

  let injections: InjectionConfig[];
  let summary: string;

  // Step 2: Generate injections
  if (options.customInjections) {
    // Use custom injections
    injections = options.customInjections;
    summary = `Applied ${injections.length} custom injections`;
  } else if (options.useLLM && analysis.summary.totalPoints > 0) {
    // Use LLM to generate smart injections
    try {
      const result = await generateSmartInjections(
        analysis,
        options.userIntent,
        options.provider,
        options.model
      );
      injections = result.injections;
      summary = result.summary;
    } catch (error) {
      console.warn('[InjectionService] LLM generation failed, using defaults:', error);
      injections = generateDefaultInjections(analysis);
      summary = `Applied ${injections.length} default injections (LLM unavailable)`;
    }
  } else {
    // Use default injections based on analysis
    injections = generateDefaultInjections(analysis);
    summary = `Applied ${injections.length} default injections`;
  }

  // Step 3: Inject runtime into HTML
  const runtimeOptions: RuntimeOptions = {
    enableLogging: true,
    enableAnalytics: options.enableAnalytics || false
  };

  const enhancedHtml = injectRuntime(html, injections, runtimeOptions);

  return {
    html: enhancedHtml,
    analysis,
    injections,
    summary
  };
}

/**
 * Quick enhance - add basic interactivity without LLM
 */
export function quickEnhance(html: string): string {
  const analysis = analyzeForInjections(html);
  const injections = generateDefaultInjections(analysis);
  return injectRuntime(html, injections, { enableLogging: false });
}

/**
 * Get analysis summary for display
 */
export function getAnalysisSummary(analysis: AnalysisResult): string {
  const lines = [
    `Found ${analysis.summary.totalPoints} interactive elements:`,
    ...Object.entries(analysis.summary.byType)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `  - ${count} ${type}(s)`)
  ];

  if (analysis.recommendations.length > 0) {
    lines.push('', 'Recommendations:');
    analysis.recommendations.forEach(rec => {
      lines.push(`  - ${rec}`);
    });
  }

  lines.push('', `Interactivity Score: ${analysis.summary.interactivityScore}/100`);

  return lines.join('\n');
}
