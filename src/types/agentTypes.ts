/**
 * Agent Types for Multi-Stage Prototype Generation
 *
 * These types define the structure for the agent orchestration
 * system that breaks prototype generation into smaller, more
 * manageable LLM calls with granular progress tracking.
 */

import type {
  VariantApproach,
  DesignToken,
  StateSchema,
  EntryPoint,
  Flow,
  SuccessCriteria,
  GeneratedFile,
} from './implementationScript';
import type { VariantPlan } from '../services/variantPlanService';
import type { UnderstandingResponse } from '../services/understandingService';
import type { UIMetadata } from '../services/screenAnalyzerService';

// ============================================================================
// Agent Progress Types
// ============================================================================

export type AgentPhase =
  | 'queued'      // Waiting to start
  | 'script'      // Generating implementation script
  | 'files'       // Generating individual files
  | 'assembly'    // Assembling final VirtualFS
  | 'complete'    // Successfully finished
  | 'failed';     // Failed with error

export interface AgentStepProgress {
  /** Unique identifier for this step */
  stepKey: string;
  /** Human-readable label */
  label: string;
  /** Step status */
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  /** Optional error message if failed */
  error?: string;
  /** Optional duration in ms */
  duration?: number;
  /** File path if this step generates a file */
  filePath?: string;
}

export interface AgentProgress {
  /** Which variant (0-indexed) */
  variantIndex: number;
  /** Variant title from plan */
  variantTitle: string;
  /** Variant approach */
  approach: VariantApproach;
  /** Current phase */
  phase: AgentPhase;
  /** Human-readable current step description */
  currentStep: string;
  /** Number of completed steps */
  completedSteps: number;
  /** Total number of steps */
  totalSteps: number;
  /** Current file being generated (if any) */
  currentFile?: string;
  /** List of completed file paths */
  filesCompleted: string[];
  /** Detailed step progress */
  steps: AgentStepProgress[];
  /** Error message if failed */
  error?: string;
  /** Start time */
  startedAt?: number;
  /** End time */
  completedAt?: number;
}

// ============================================================================
// Implementation Script Generation (Step 1)
// ============================================================================

export interface GenerateScriptRequest {
  /** The variant plan with title, description, key_changes */
  variantPlan: VariantPlan;
  /** Understanding response from understand-request */
  screenUnderstanding?: UnderstandingResponse;
  /** Design tokens extracted from source screen */
  designTokens: DesignToken[];
  /** UI metadata from screen analysis */
  uiMetadata?: UIMetadata;
  /** Optional product context from context store */
  productContext?: string;
  /** The variant approach */
  variantApproach: VariantApproach;
  /** LLM provider to use */
  provider?: 'anthropic' | 'openai' | 'google';
  /** Model override */
  model?: string;
}

export interface GenerateScriptResponse {
  /** State schema defining all state variables */
  stateSchema: StateSchema;
  /** Initial state values */
  initialState: Record<string, unknown>;
  /** Entry points where user interaction begins */
  entryPoints: EntryPoint[];
  /** User flows with state transitions */
  flows: Flow[];
  /** Components needed for this variant */
  componentsNeeded: string[];
  /** Criteria for successful completion */
  successCriteria?: SuccessCriteria;
  /** Variant-specific guidelines */
  variantGuidelines: {
    description: string;
    focusAreas: string[];
    avoidAreas: string[];
    tonality: string;
  };
}

// ============================================================================
// Individual File Generation (Step 2)
// ============================================================================

export type GeneratableFileType =
  | 'tokens.css'      // Design tokens CSS (no LLM needed)
  | 'store.json'      // Initial state JSON (no LLM needed)
  | 'flows.json'      // Flow definitions (minimal LLM)
  | 'component'       // Web component JS (LLM per component)
  | 'index.html';     // Entry point HTML (LLM needed)

export interface GenerateFileRequest {
  /** Type of file to generate */
  fileType: GeneratableFileType;
  /** Implementation script from Step 1 */
  implementationScript: GenerateScriptResponse;
  /** Variant approach */
  variantApproach: VariantApproach;
  /** Design tokens */
  designTokens: DesignToken[];
  /** Component name (required if fileType is 'component') */
  componentName?: string;
  /** Previously generated files for context */
  previousFiles?: Array<{
    path: string;
    exports?: string[];
    summary?: string;
  }>;
  /** Original source HTML for reference */
  sourceHtml?: string;
  /** Source screenshot base64 */
  screenshotBase64?: string;
  /** LLM provider */
  provider?: 'anthropic' | 'openai' | 'google';
  /** Model override */
  model?: string;
}

export interface GenerateFileResponse {
  /** Relative path of the generated file */
  path: string;
  /** File content */
  content: string;
  /** File type */
  type: 'html' | 'js' | 'css' | 'json';
  /** Exported symbols (for JS files) */
  exports?: string[];
  /** Brief summary of what this file does */
  summary?: string;
}

// ============================================================================
// Orchestration Types
// ============================================================================

export interface GenerationContext {
  /** Session ID for this generation run */
  sessionId: string;
  /** Original source HTML */
  sourceHtml: string;
  /** Screenshot as base64 */
  screenshotBase64?: string;
  /** Design tokens from source */
  designTokens: DesignToken[];
  /** UI metadata from analysis */
  uiMetadata?: UIMetadata;
  /** Understanding from first LLM call */
  understanding?: UnderstandingResponse;
  /** Product context (optional) */
  productContext?: string;
  /** LLM provider preference */
  provider?: 'anthropic' | 'openai' | 'google';
  /** Model override */
  model?: string;
}

export interface OrchestrationConfig {
  /** Maximum variants to generate in parallel */
  parallelVariants: number;
  /** Maximum components to generate in parallel within a variant */
  parallelComponents: number;
  /** Enable checkpointing for resume capability */
  enableCheckpoints: boolean;
  /** Maximum retries per step */
  maxRetries: number;
  /** Timeout per LLM call in ms */
  timeoutMs: number;
  /** Optional AbortSignal for cancellation */
  abortSignal?: AbortSignal;
}

export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
  parallelVariants: 2,
  parallelComponents: 2,
  enableCheckpoints: true,
  maxRetries: 2,
  timeoutMs: 30000,
};

export interface OrchestrationResult {
  /** Successfully generated variants */
  variants: Array<{
    variantIndex: number;
    approach: VariantApproach;
    files: GeneratedFile[];
    implementationScript: GenerateScriptResponse;
    previewUrl?: string;
  }>;
  /** Variants that failed */
  failures: Array<{
    variantIndex: number;
    approach: VariantApproach;
    error: string;
    partialFiles?: GeneratedFile[];
  }>;
  /** Total duration in ms */
  totalDuration: number;
}

// ============================================================================
// Checkpoint Types (for resume capability)
// ============================================================================

export type CheckpointStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface Checkpoint {
  /** Unique checkpoint ID */
  id: string;
  /** Session ID this belongs to */
  sessionId: string;
  /** Variant index */
  variantIndex: number;
  /** Step key (e.g., 'implementation_script', 'vx-modal.js') */
  stepKey: string;
  /** Checkpoint status */
  status: CheckpointStatus;
  /** Result JSON if completed */
  resultJson?: unknown;
  /** Error message if failed */
  error?: string;
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

export interface CheckpointState {
  /** Session ID */
  sessionId: string;
  /** All checkpoints for this session */
  checkpoints: Record<string, Checkpoint>;
  /** Last updated timestamp */
  lastUpdated: string;
}

// ============================================================================
// Progress Callback Types
// ============================================================================

export type AgentProgressCallback = (progress: AgentProgress[]) => void;

export interface AgentEvents {
  /** Called when a variant starts processing */
  onVariantStart?: (variantIndex: number, approach: VariantApproach) => void;
  /** Called when a step starts */
  onStepStart?: (variantIndex: number, stepKey: string, label: string) => void;
  /** Called when a step completes */
  onStepComplete?: (variantIndex: number, stepKey: string, duration: number) => void;
  /** Called when a step fails */
  onStepFail?: (variantIndex: number, stepKey: string, error: string) => void;
  /** Called when a variant completes */
  onVariantComplete?: (variantIndex: number, files: GeneratedFile[]) => void;
  /** Called when a variant fails */
  onVariantFail?: (variantIndex: number, error: string) => void;
  /** Called when all variants are done */
  onAllComplete?: (result: OrchestrationResult) => void;
  /** Called when generation is aborted by user */
  onAbort?: () => void;
}

// ============================================================================
// Step Definitions
// ============================================================================

export interface StepDefinition {
  /** Unique step key */
  key: string;
  /** Human-readable label */
  label: string;
  /** Active form (present tense) for display */
  activeLabel: string;
  /** Whether this step requires an LLM call */
  requiresLLM: boolean;
  /** File type this step generates (if any) */
  generatesFileType?: GeneratableFileType;
  /** File path this step generates (for fixed-path files) */
  generatesFilePath?: string;
  /** Dependencies (step keys that must complete first) */
  dependencies: string[];
}

export const GENERATION_STEPS: StepDefinition[] = [
  {
    key: 'implementation_script',
    label: 'Design behavior',
    activeLabel: 'Designing behavior...',
    requiresLLM: true,
    dependencies: [],
  },
  {
    key: 'tokens_css',
    label: 'Create design tokens',
    activeLabel: 'Creating design tokens...',
    requiresLLM: false,
    generatesFileType: 'tokens.css',
    generatesFilePath: 'styles/tokens.css',
    dependencies: ['implementation_script'],
  },
  {
    key: 'store_json',
    label: 'Set up state',
    activeLabel: 'Setting up state...',
    requiresLLM: false,
    generatesFileType: 'store.json',
    generatesFilePath: 'state/store.json',
    dependencies: ['implementation_script'],
  },
  {
    key: 'flows_json',
    label: 'Configure flows',
    activeLabel: 'Configuring flows...',
    requiresLLM: true,
    generatesFileType: 'flows.json',
    generatesFilePath: 'flows/user-flow.json',
    dependencies: ['implementation_script'],
  },
  // Component steps are added dynamically based on componentsNeeded
  {
    key: 'index_html',
    label: 'Assemble prototype',
    activeLabel: 'Assembling prototype...',
    requiresLLM: true,
    generatesFileType: 'index.html',
    generatesFilePath: 'index.html',
    dependencies: ['tokens_css', 'store_json', 'flows_json'], // + all component steps
  },
];

/**
 * Create step definitions for components
 */
export function createComponentSteps(componentsNeeded: string[]): StepDefinition[] {
  return componentsNeeded.map((componentName) => ({
    key: `component_${componentName}`,
    label: `Build ${componentName} component`,
    activeLabel: `Building ${componentName}...`,
    requiresLLM: true,
    generatesFileType: 'component' as const,
    generatesFilePath: `components/${componentName}.js`,
    dependencies: ['implementation_script'],
  }));
}

/**
 * Get all steps for a variant including dynamic component steps
 */
export function getAllSteps(componentsNeeded: string[]): StepDefinition[] {
  const baseSteps = GENERATION_STEPS.filter(s => s.key !== 'index_html');
  const componentSteps = createComponentSteps(componentsNeeded);
  const indexStep = GENERATION_STEPS.find(s => s.key === 'index_html')!;

  // Update index.html dependencies to include all component steps
  const updatedIndexStep: StepDefinition = {
    ...indexStep,
    dependencies: [
      ...indexStep.dependencies,
      ...componentSteps.map(s => s.key),
    ],
  };

  return [...baseSteps, ...componentSteps, updatedIndexStep];
}
