/**
 * Tool Schema Types for Dynamic Tools Architecture
 *
 * This module defines types for the tool-based prototype generation system where:
 * - LLM returns compact modification instructions using predefined tools
 * - Tools operate ON the existing DOM (modify, insert, remove, style)
 * - Tools are dynamically generated from extracted components and design tokens
 */

// =============================================================================
// JSON Schema Types (for OpenAI/Anthropic tool definitions)
// =============================================================================

export interface JSONSchemaProperty {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  description?: string;
  enum?: (string | number | boolean | null)[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

// =============================================================================
// Tool Definition Types
// =============================================================================

/** Tool categories - operate ON existing DOM */
export type ToolCategory =
  | 'selection'      // Select DOM elements to modify
  | 'modification'   // Modify selected elements
  | 'insertion'      // Insert components from library
  | 'style'          // Apply design tokens
  | 'screen'         // Multi-file/screen management
  | 'interaction';   // Add behavior and state

/** Base tool definition (OpenAI function calling format) */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, JSONSchemaProperty>;
      required: string[];
    };
  };
  /** Internal metadata - not sent to LLM */
  _meta?: {
    category: ToolCategory;
    componentId?: string;  // For insertion tools, links to ExtractedComponent
    tokenCategory?: string; // For style tools, links to design token category
  };
}

/** Tool call from LLM response */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Generated tool schema with context for LLM */
export interface GeneratedToolSchema {
  tools: ToolDefinition[];
  systemContext: string;  // Describes source DOM structure + available tools
  componentCount: number;
  tokenCount: number;
}

// =============================================================================
// Modification Types
// =============================================================================

/** Position for inserting elements */
export type InsertPosition = 'before' | 'after' | 'prepend' | 'append' | 'replace';

/** Individual modification instruction */
export interface Modification {
  /** Tool name: "update_text", "insert_button_primary", etc. */
  tool: string;
  /** CSS selector for target element */
  selector?: string;
  /** Position for insertions relative to selector */
  position?: InsertPosition;
  /** Tool-specific parameters */
  params: Record<string, unknown>;
}

/** Modifications for a single screen */
export interface ScreenModification {
  /** Unique screen identifier: "main", "checkout", "profile", etc. */
  screenId: string;
  /** Which captured screen to use as starting point */
  sourceScreenId?: string;
  /** Title for the screen (used in navigation, tabs) */
  title?: string;
  /** Ordered list of modifications to apply */
  modifications: Modification[];
}

/** Complete modification specification from LLM */
export interface ModificationSpec {
  /** All screens and their modifications (multi-file support) */
  screens: ScreenModification[];
  /** Shared state across screens */
  sharedState?: StateDefinition;
  /** Navigation configuration */
  navigation?: NavigationConfig;
  /** Metadata about the generation */
  metadata?: {
    model?: string;
    promptTokens?: number;
    completionTokens?: number;
    toolCallCount?: number;
    generatedAt?: string;
  };
}

// =============================================================================
// State & Interaction Types
// =============================================================================

/** State variable definition */
export interface StateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  defaultValue: unknown;
  description?: string;
}

/** Shared state definition for multi-screen prototypes */
export interface StateDefinition {
  variables: StateVariable[];
  /** Optional persistence: 'session' | 'local' | 'none' */
  persistence?: 'session' | 'local' | 'none';
}

/** Click/interaction handler */
export interface InteractionHandler {
  type: 'navigate' | 'setState' | 'toggle' | 'submit' | 'custom';
  /** For navigate: target screen ID */
  targetScreen?: string;
  /** For setState: state changes */
  stateChanges?: Record<string, unknown>;
  /** For toggle: element selector to toggle visibility */
  toggleSelector?: string;
  /** For custom: JavaScript code (sanitized) */
  customCode?: string;
}

// =============================================================================
// Navigation Types (Multi-file support)
// =============================================================================

/** Route definition for multi-file prototypes */
export interface Route {
  /** URL path: "/", "/checkout", "/profile/:id" */
  path: string;
  /** Screen ID this route renders */
  screenId: string;
  /** URL parameters: ["id"] */
  params?: string[];
}

/** Navigation configuration */
export interface NavigationConfig {
  /** All routes */
  routes: Route[];
  /** Default screen to show */
  defaultScreen: string;
  /** Transition animation type */
  defaultTransition?: 'instant' | 'fade' | 'slide-left' | 'slide-right';
}

/** Navigation manifest for generated prototype */
export interface NavigationManifest {
  routes: Route[];
  defaultScreen: string;
  defaultTransition: 'instant' | 'fade' | 'slide-left' | 'slide-right';
  /** Screen IDs that exist */
  screens: string[];
}

// =============================================================================
// DOM Summary Types (for Context Builder)
// =============================================================================

/** Key element identified in source DOM */
export interface KeyElement {
  /** CSS selector to target this element */
  selector: string;
  /** Element type for context */
  type: 'button' | 'link' | 'input' | 'form' | 'card' | 'header' | 'footer' | 'nav' | 'section' | 'image' | 'text' | 'list' | 'table' | 'other';
  /** Text content or description */
  text?: string;
  /** Count if multiple similar elements */
  count?: number;
  /** Nested key elements */
  children?: KeyElement[];
}

/** Summarized DOM structure for LLM context */
export interface DOMSummary {
  /** Simplified DOM tree representation */
  structure: string;
  /** Key interactive/semantic elements */
  keyElements: KeyElement[];
  /** Main layout sections detected */
  sections: string[];
  /** Estimated complexity */
  complexity: 'simple' | 'moderate' | 'complex';
  /** Original HTML size in bytes */
  originalSize: number;
}

// =============================================================================
// Component Types (for dynamic tool generation)
// =============================================================================

/** Component prop definition */
export interface ComponentProp {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'slot';
  description?: string;
  required?: boolean;
  defaultValue?: unknown;
  /** For enum type: allowed values */
  options?: string[];
}

/** Component variant (e.g., primary, secondary, outline for buttons) */
export interface ComponentVariant {
  name: string;
  description?: string;
  /** CSS classes or styles that differentiate this variant */
  styles?: string;
}

/** Extracted component with full metadata for tool generation */
export interface ExtractedComponentForTools {
  id: string;
  name: string;
  category: string;
  description: string;
  html: string;
  css?: string;
  props: ComponentProp[];
  variants: ComponentVariant[];
  /** Whether this component is approved for use in generation */
  approved: boolean;
  /** Example usage for LLM context */
  exampleUsage?: string;
}

// =============================================================================
// Design Token Types
// =============================================================================

/** Design token category */
export type TokenCategory = 'color' | 'font' | 'spacing' | 'radius' | 'shadow' | 'border' | 'animation';

/** Design token definition */
export interface DesignToken {
  name: string;
  category: TokenCategory;
  value: string;
  description?: string;
  /** CSS variable name: --color-primary */
  cssVariable?: string;
}

/** Design token palette for LLM context */
export interface TokenPalette {
  colors: DesignToken[];
  fonts: DesignToken[];
  spacing: DesignToken[];
  radius: DesignToken[];
  shadows: DesignToken[];
  borders: DesignToken[];
  animations: DesignToken[];
}

// =============================================================================
// Prototype Context Types (for LLM)
// =============================================================================

/** Complete context for prototype generation */
export interface PrototypeContext {
  /** Generated tools (DOM + Component + Style + Screen) */
  tools: ToolDefinition[];
  /** System prompt with DOM summary and instructions */
  systemPrompt: string;
  /** Source DOM summary */
  sourceContext: string;
  /** User's modification request */
  userPrompt: string;
  /** Available components catalog */
  componentCatalog: ComponentCatalogEntry[];
  /** Design tokens */
  tokens: TokenPalette;
}

/** Component catalog entry for LLM context */
export interface ComponentCatalogEntry {
  /** Tool name: insert_button_primary */
  toolName: string;
  /** Human-readable name */
  displayName: string;
  /** Description for LLM */
  description: string;
  /** Category: button, card, form, etc. */
  category: string;
  /** Available props */
  props: string[];
}

// =============================================================================
// Modification Result Types
// =============================================================================

/** Result of applying modifications to source DOM */
export interface ModificationResult {
  /** Generated screens: screenId → modified HTML */
  screens: Map<string, string>;
  /** Navigation configuration */
  navigation: NavigationManifest;
  /** Additional assets (shared CSS, scripts) */
  assets: string[];
  /** Errors encountered during modification */
  errors: ModificationError[];
}

/** Error during modification */
export interface ModificationError {
  screenId: string;
  modificationIndex: number;
  tool: string;
  selector?: string;
  message: string;
  recoverable: boolean;
}

// =============================================================================
// Prototype Bundle Types (Multi-file output)
// =============================================================================

/** File type in prototype bundle */
export type PrototypeFileType = 'html' | 'css' | 'js' | 'json';

/** Individual file in prototype bundle */
export interface PrototypeFile {
  filename: string;
  content: string;
  type: PrototypeFileType;
  /** Is this the entry point? */
  isEntry?: boolean;
  /** Screen ID if this is an HTML screen file */
  screenId?: string;
}

/** Complete prototype bundle for multi-file output */
export interface PrototypeBundle {
  /** All generated files */
  files: Map<string, string>;
  /** Main HTML file to load */
  entryPoint: string;
  /** Manifest for navigation and screens */
  manifest: {
    screens: string[];
    routes: Route[];
    defaultScreen: string;
  };
  /** Original modification spec (for editing) */
  spec: ModificationSpec;
}

// =============================================================================
// Generation Request/Response Types
// =============================================================================

/** Request to generate prototype with tool mode */
export interface ToolModeGenerationRequest {
  sessionId: string;
  variantIndex: number;
  prompt: string;
  /** Source screen ID to modify */
  sourceScreenId: string;
  /** Use tool mode (vs raw HTML) */
  useToolMode: true;
  /** Optional: specific tools to enable/disable */
  toolOptions?: {
    enableScreenTools?: boolean;
    enableInteractionTools?: boolean;
    componentFilter?: string[];  // Only these component IDs
  };
}

/** Response from tool mode generation */
export interface ToolModeGenerationResponse {
  /** Modification specification (for editing) */
  spec: ModificationSpec;
  /** Generated files manifest */
  files: {
    screens: string[];
    entryPoint: string;
    routes: Route[];
  };
  /** Generation metadata */
  metadata: {
    toolCallCount: number;
    screensGenerated: number;
    duration: number;
    model: string;
  };
  /** Any errors during generation */
  errors?: ModificationError[];
}

// =============================================================================
// Database Types (for prototype_files table)
// =============================================================================

/** Database row for prototype files */
export interface PrototypeFileRow {
  id: string;
  session_id: string;
  variant_index: number;
  filename: string;
  content: string;
  file_type: PrototypeFileType;
  is_entry: boolean;
  screen_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Insert type for prototype files */
export interface PrototypeFileInsert {
  id?: string;
  session_id: string;
  variant_index: number;
  filename: string;
  content: string;
  file_type: PrototypeFileType;
  is_entry?: boolean;
  screen_id?: string | null;
  created_at?: string;
  updated_at?: string;
}
