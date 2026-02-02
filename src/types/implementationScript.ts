/**
 * Implementation Script Types
 *
 * These types define the structure of Implementation Scripts used to
 * generate file-based prototypes with real interactivity.
 */

// ============ Entry Points ============

export interface EntryPoint {
  /** CSS selector to find the entry point element */
  selector: string;
  /** The user action that triggers the flow */
  action: 'click' | 'submit' | 'input' | 'change' | 'hover' | 'focus';
  /** State path to set when triggered */
  triggersState?: string;
  /** Flow name to execute when triggered */
  triggersFlow?: string;
  /** Optional label for documentation */
  label?: string;
}

// ============ State Schema ============

export type StateType =
  | 'boolean'
  | 'string'
  | 'number'
  | 'string|null'
  | 'number|null'
  | `enum:${string}`  // e.g., "enum:idle|loading|success|error"
  | 'array'
  | 'object';

export interface StateSchema {
  [key: string]: StateType | StateSchema;
}

// ============ Flow Steps ============

export interface SetStep {
  /** State path to set */
  set: string;
  /** Value to set (can include templates like {{random:6}}) */
  to: string | number | boolean | null;
}

export interface ToggleStep {
  /** State path to toggle (must be boolean) */
  toggle: string;
}

export interface IncrementStep {
  /** State path to increment (must be number) */
  increment: string;
  /** Amount to increment by (default: 1) */
  by?: number;
}

export interface PushStep {
  /** State path to array to push to */
  push: string;
  /** Value to push */
  value: unknown;
}

export interface RemoveStep {
  /** State path to array to remove from */
  remove: string;
  /** Index to remove at */
  at?: number;
  /** Predicate function as string */
  where?: string;
}

export interface DelayStep {
  /** Milliseconds to delay */
  delay: number;
  /** Optional label for documentation */
  label?: string;
}

export interface AfterStep {
  /** Delay in milliseconds before executing */
  after: number;
  /** State path to set after delay */
  set: string;
  /** Value to set */
  to: string | number | boolean | null;
}

export interface ConditionalStep {
  /** Condition to evaluate */
  if: string | Record<string, unknown>;
  /** Steps to execute if condition is true */
  then?: FlowStep[];
  /** Steps to execute if condition is false */
  else?: FlowStep[];
}

export interface RepeatStep {
  /** Number of times to repeat (or template for dynamic value) */
  repeat: number | string;
  /** Steps to execute each iteration */
  steps: FlowStep[];
}

export interface ExecuteFlowStep {
  /** Name of flow to execute */
  flow: string;
}

export interface DispatchStep {
  /** Custom event name to dispatch */
  dispatch: string;
  /** Event detail data */
  detail?: Record<string, unknown>;
}

export interface LogStep {
  /** Message to log (can include templates) */
  log: string;
}

export interface AnalyticsStep {
  /** Analytics event name */
  analytics: string;
  /** Event data */
  data?: Record<string, unknown>;
}

export interface WaitForStep {
  /** Condition to wait for */
  waitFor: string | Record<string, unknown>;
  /** Timeout in milliseconds */
  timeout?: number;
}

export type FlowStep =
  | SetStep
  | ToggleStep
  | IncrementStep
  | PushStep
  | RemoveStep
  | DelayStep
  | AfterStep
  | ConditionalStep
  | RepeatStep
  | ExecuteFlowStep
  | DispatchStep
  | LogStep
  | AnalyticsStep
  | WaitForStep;

// ============ Flow Definition ============

export interface FlowTrigger {
  /** Event that triggers the flow */
  event: string;
  /** CSS selector for DOM-based triggers */
  selector?: string;
  /** Condition that must be met for flow to execute */
  when?: string | Record<string, unknown>;
  /** Whether to prevent default browser behavior */
  preventDefault?: boolean;
}

export interface Flow {
  /** Unique name for the flow */
  name: string;
  /** Optional description */
  description?: string;
  /** Trigger configuration */
  trigger?: FlowTrigger;
  /** Condition that must be met for flow to execute */
  when?: string | Record<string, unknown>;
  /** Sequence of steps to execute */
  steps: FlowStep[];
}

// ============ Success Criteria ============

export interface SuccessCriteria {
  /** State conditions that indicate success */
  state?: Record<string, unknown>;
  /** Description of what success looks like visually */
  display?: string;
  /** Analytics events that should have been triggered */
  analyticsEvents?: string[];
}

// ============ Implementation Script ============

export interface ImplementationScript {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this script implements */
  description: string;
  /** Entry points where user interaction begins */
  entryPoints: EntryPoint[];
  /** Schema defining all state variables */
  stateSchema: StateSchema;
  /** Initial state values */
  initialState?: Record<string, unknown>;
  /** User flows with state transitions */
  flows: Flow[];
  /** Criteria for successful completion */
  successCriteria?: SuccessCriteria;
  /** Tags for categorization */
  tags?: string[];
  /** Estimated complexity (1-5) */
  complexity?: 1 | 2 | 3 | 4 | 5;
}

// ============ Detected Components ============

export interface DetectedComponent {
  /** Type of component detected */
  type: 'button' | 'form' | 'modal' | 'dropdown' | 'tabs' | 'accordion' | 'table' | 'card' | 'nav' | 'hero' | 'footer' | 'input';
  /** CSS selector to find this component */
  selector: string;
  /** Extracted text content */
  text?: string;
  /** Detected purpose */
  purpose?: string;
  /** Suggested interactions */
  suggestedInteractions?: string[];
  /** Bounding box coordinates */
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// ============ Analysis Response ============

export interface ScreenAnalysisResponse {
  /** Suggested implementation scripts based on analysis */
  suggestedScripts: ImplementationScript[];
  /** Entry points detected in the screen */
  detectedEntryPoints: EntryPoint[];
  /** Components detected in the screen */
  detectedComponents: DetectedComponent[];
  /** Recommended approach for prototyping */
  recommendedApproach: string;
  /** Screen category (e.g., "e-commerce", "dashboard", "landing") */
  screenCategory?: string;
  /** Estimated effort for full prototype */
  estimatedEffort?: 'low' | 'medium' | 'high';
}

// ============ Variant Approach ============

export type VariantApproach =
  | 'minimal'      // Clean, focused, essential features only
  | 'feature-rich' // Full-featured with all bells and whistles
  | 'gamified'     // Engaging with progress, rewards, animations
  | 'accessible'   // WCAG compliant, high contrast, screen reader friendly
  | 'mobile-first' // Optimized for mobile/touch interfaces
  | 'enterprise';  // Professional, data-dense, power-user focused

export interface VariantGuidelines {
  approach: VariantApproach;
  description: string;
  focusAreas: string[];
  avoidAreas: string[];
  tonality: string;
}

export const VARIANT_GUIDELINES: Record<VariantApproach, Omit<VariantGuidelines, 'approach'>> = {
  minimal: {
    description: 'Clean and focused with only essential features',
    focusAreas: ['Simplicity', 'Fast interactions', 'Clear hierarchy', 'White space'],
    avoidAreas: ['Feature creep', 'Visual clutter', 'Complex animations'],
    tonality: 'Direct and concise',
  },
  'feature-rich': {
    description: 'Comprehensive with full functionality and options',
    focusAreas: ['Complete features', 'Power user shortcuts', 'Advanced options', 'Customization'],
    avoidAreas: ['Overwhelming new users', 'Slow performance'],
    tonality: 'Informative and detailed',
  },
  gamified: {
    description: 'Engaging experience with progress indicators and rewards',
    focusAreas: ['Progress feedback', 'Micro-animations', 'Achievement moments', 'Delight'],
    avoidAreas: ['Childish aesthetics', 'Distracting elements', 'Over-animation'],
    tonality: 'Encouraging and playful',
  },
  accessible: {
    description: 'WCAG compliant with focus on inclusivity',
    focusAreas: ['High contrast', 'Large touch targets', 'Screen reader support', 'Keyboard navigation'],
    avoidAreas: ['Color-only indicators', 'Small text', 'Complex gestures'],
    tonality: 'Clear and supportive',
  },
  'mobile-first': {
    description: 'Optimized for mobile and touch interfaces',
    focusAreas: ['Touch targets', 'Swipe gestures', 'Bottom navigation', 'Thumb zones'],
    avoidAreas: ['Hover states', 'Desktop-only patterns', 'Small controls'],
    tonality: 'Quick and efficient',
  },
  enterprise: {
    description: 'Professional and data-dense for power users',
    focusAreas: ['Data density', 'Keyboard shortcuts', 'Bulk actions', 'Export options'],
    avoidAreas: ['Casual aesthetics', 'Unnecessary animations', 'Limited functionality'],
    tonality: 'Professional and efficient',
  },
};

// ============ Prototype Generation ============

export interface GeneratePrototypeRequest {
  /** Screen ID being prototyped */
  screenId: string;
  /** Original screen HTML */
  screenHtml: string;
  /** Screenshot as base64 */
  screenshotBase64?: string;
  /** Implementation script defining behavior */
  implementationScript: ImplementationScript;
  /** Design tokens extracted from screen */
  designTokens: DesignToken[];
  /** Variant approach to use */
  variantApproach: VariantApproach;
  /** Custom variant instructions */
  customInstructions?: string;
}

export interface DesignToken {
  name: string;
  value: string;
  type: 'color' | 'typography' | 'spacing' | 'radius' | 'shadow';
  cssVariable: string;
}

export interface GeneratedFile {
  /** Relative path within variant directory */
  path: string;
  /** File content */
  content: string;
  /** File type */
  type: 'html' | 'js' | 'css' | 'json';
}

export interface GeneratePrototypeResponse {
  /** All generated files for the variant */
  files: GeneratedFile[];
  /** Instructions for previewing the prototype */
  previewInstructions: string;
  /** Any warnings or notes */
  warnings?: string[];
  /** Components used in this variant */
  componentsUsed: string[];
}

// ============ Virtual File System Types ============

export interface PrototypeFileStructure {
  'index.html': string;
  'components/': Record<string, string>;
  'state/store.json': string;
  'flows/user-flow.json': string;
  'styles/tokens.css': string;
}

export interface PrototypeMetadata {
  variantId: string;
  sessionId: string;
  screenId: string;
  approach: VariantApproach;
  createdAt: string;
  implementationScriptId: string;
}
