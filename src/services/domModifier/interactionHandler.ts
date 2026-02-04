/**
 * Interaction Handler - Processes interaction tool calls and injects JavaScript
 *
 * This module handles interaction tools like:
 * - add_click_toggle: Connect trigger elements to show/hide targets
 * - set_initial_hidden: Hide elements initially
 * - add_hover_effect: Show elements on hover
 * - add_tab_interaction: Tab navigation
 * - add_accordion_interaction: Accordion behavior
 */

import type { Modification } from '@/types/toolSchema';
import { querySelectorSafe } from './operations';

export interface InteractionResult {
  success: boolean;
  error?: string;
}

/**
 * Check if a tool is an interaction tool
 */
export function isInteractionTool(tool: string): boolean {
  const interactionTools = [
    'add_click_toggle',
    'set_initial_hidden',
    'add_hover_effect',
    'add_tab_interaction',
    'add_accordion_interaction',
    'add_form_validation',
  ];
  return interactionTools.includes(tool);
}

/**
 * Interaction configuration stored for later JavaScript injection
 */
export interface ClickToggleConfig {
  triggerSelector: string;
  targetSelector: string;
  closeOnClickOutside?: boolean;
  closeButtonSelector?: string;
}

export interface HoverEffectConfig {
  triggerSelector: string;
  targetSelector: string;
  showDelay?: number;
  hideDelay?: number;
}

export interface TabInteractionConfig {
  tabsSelector: string;
  panelsSelector: string;
  activeClass?: string;
}

export interface AccordionConfig {
  containerSelector: string;
  headerSelector: string;
  contentSelector: string;
  allowMultiple?: boolean;
}

export interface FormValidationConfig {
  formSelector: string;
  submitButtonSelector?: string;
  errorClass?: string;
}

export interface InteractionState {
  hiddenSelectors: string[];
  clickToggles: ClickToggleConfig[];
  hoverEffects: HoverEffectConfig[];
  tabInteractions: TabInteractionConfig[];
  accordions: AccordionConfig[];
  formValidations: FormValidationConfig[];
}

/**
 * Create a fresh interaction state
 */
export function createInteractionState(): InteractionState {
  return {
    hiddenSelectors: [],
    clickToggles: [],
    hoverEffects: [],
    tabInteractions: [],
    accordions: [],
    formValidations: [],
  };
}

/**
 * Validation result for interaction selectors
 */
export interface InteractionValidationResult {
  valid: boolean;
  warnings: string[];
  fixedConfigs: {
    clickToggles: ClickToggleConfig[];
  };
}

/**
 * Try to find a button element that could serve as a trigger
 * Looks for buttons with similar text or in similar position
 */
function findAlternativeTrigger(doc: Document, originalSelector: string, targetSelector: string): string | null {
  // Extract any text hint from the original selector (e.g., "open", "add", "create")
  const textHints = originalSelector.toLowerCase().match(/open|add|create|new|show|toggle|close|cancel|save|submit|delete|remove|edit|view/g) || [];

  // Also check for button name patterns in the selector
  const selectorParts = originalSelector.replace(/[#.]/g, ' ').toLowerCase().split(/[-_\s]+/);
  const hints = [...new Set([...textHints, ...selectorParts])].filter(h => h.length > 2);

  console.log('[InteractionValidation] Looking for alternative trigger, hints:', hints);

  // Strategy 1: Find buttons/links with matching text content
  const clickableElements = doc.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]');
  for (const el of clickableElements) {
    const text = el.textContent?.toLowerCase().trim() || '';
    const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';

    // Check if element text contains any hints
    for (const hint of hints) {
      if (text.includes(hint) || ariaLabel.includes(hint)) {
        // Found a match - generate a selector for it
        if (el.id) {
          console.log(`[InteractionValidation] Found alternative trigger by ID: #${el.id}`);
          return `#${el.id}`;
        }
        // Try to generate a unique selector
        const classes = Array.from(el.classList).join('.');
        if (classes) {
          const selector = `${el.tagName.toLowerCase()}.${classes}`;
          // Verify it's unique
          if (doc.querySelectorAll(selector).length === 1) {
            console.log(`[InteractionValidation] Found alternative trigger by class: ${selector}`);
            return selector;
          }
        }
        // Use text-based pseudo-selector (handled by querySelectorSafe)
        if (text) {
          const pseudoSelector = `button:has-text("${text.substring(0, 30)}")`;
          console.log(`[InteractionValidation] Found alternative trigger by text: ${pseudoSelector}`);
          return pseudoSelector;
        }
      }
    }
  }

  // Strategy 2: Find button near the target element (in same parent container)
  const targetEl = querySelectorSafe(doc, targetSelector);
  if (targetEl && targetEl.parentElement) {
    const sibling = targetEl.parentElement.querySelector('button, a[href="#"], [role="button"]');
    if (sibling && sibling !== targetEl) {
      if ((sibling as HTMLElement).id) {
        console.log(`[InteractionValidation] Found sibling trigger: #${(sibling as HTMLElement).id}`);
        return `#${(sibling as HTMLElement).id}`;
      }
    }
  }

  console.log('[InteractionValidation] No alternative trigger found');
  return null;
}

/**
 * Validate and fix interaction selectors in the DOM
 * Call this after all DOM modifications but before injecting scripts
 *
 * NOTE: This is now less strict - it will include interactions even if
 * elements aren't found, letting the runtime script try to find them.
 */
export function validateAndFixInteractions(
  doc: Document,
  state: InteractionState
): InteractionValidationResult {
  const warnings: string[] = [];
  const fixedClickToggles: ClickToggleConfig[] = [];

  // Validate click toggles - but be lenient
  for (const config of state.clickToggles) {
    // Use safe selectors that handle non-standard syntax from LLM
    const trigger = querySelectorSafe(doc, config.triggerSelector);
    const target = querySelectorSafe(doc, config.targetSelector);

    let updatedConfig = { ...config };

    if (!target) {
      warnings.push(`Target element not found at build time: ${config.targetSelector} (will try at runtime)`);
      // Still include - runtime might find it
    }

    if (!trigger) {
      warnings.push(`Trigger element not found at build time: ${config.triggerSelector}`);
      // Try to find an alternative
      const alternative = findAlternativeTrigger(doc, config.triggerSelector, config.targetSelector);
      if (alternative) {
        warnings.push(`  -> Found alternative trigger: ${alternative}`);
        updatedConfig.triggerSelector = alternative;
      } else {
        warnings.push(`  -> No alternative found, will try original selector at runtime`);
        // Still include the original - runtime findElement() might handle it
      }
    }

    // Always include the interaction - let runtime try
    fixedClickToggles.push(updatedConfig);
  }

  // Log validation results
  if (warnings.length > 0) {
    console.warn('[InteractionValidation] Validation warnings:', warnings);
  }

  return {
    valid: warnings.length === 0,
    warnings,
    fixedConfigs: {
      clickToggles: fixedClickToggles,
    },
  };
}

/**
 * Process an interaction tool call and update the state
 */
export function processInteractionTool(
  mod: Modification,
  state: InteractionState
): InteractionResult {
  const { tool, params } = mod;

  switch (tool) {
    case 'set_initial_hidden': {
      const selector = params.selector as string;
      if (!selector) {
        return { success: false, error: 'set_initial_hidden requires selector' };
      }
      state.hiddenSelectors.push(selector);
      return { success: true };
    }

    case 'add_click_toggle': {
      const triggerSelector = params.triggerSelector as string;
      const targetSelector = params.targetSelector as string;
      if (!triggerSelector || !targetSelector) {
        return { success: false, error: 'add_click_toggle requires triggerSelector and targetSelector' };
      }
      state.clickToggles.push({
        triggerSelector,
        targetSelector,
        closeOnClickOutside: params.closeOnClickOutside as boolean | undefined,
        closeButtonSelector: params.closeButtonSelector as string | undefined,
      });
      return { success: true };
    }

    case 'add_hover_effect': {
      const triggerSelector = params.triggerSelector as string;
      const targetSelector = params.targetSelector as string;
      if (!triggerSelector || !targetSelector) {
        return { success: false, error: 'add_hover_effect requires triggerSelector and targetSelector' };
      }
      state.hoverEffects.push({
        triggerSelector,
        targetSelector,
        showDelay: params.showDelay as number | undefined,
        hideDelay: params.hideDelay as number | undefined,
      });
      return { success: true };
    }

    case 'add_tab_interaction': {
      const tabsSelector = params.tabsSelector as string;
      const panelsSelector = params.panelsSelector as string;
      if (!tabsSelector || !panelsSelector) {
        return { success: false, error: 'add_tab_interaction requires tabsSelector and panelsSelector' };
      }
      state.tabInteractions.push({
        tabsSelector,
        panelsSelector,
        activeClass: params.activeClass as string | undefined,
      });
      return { success: true };
    }

    case 'add_accordion_interaction': {
      const containerSelector = params.containerSelector as string;
      const headerSelector = params.headerSelector as string;
      const contentSelector = params.contentSelector as string;
      if (!containerSelector || !headerSelector || !contentSelector) {
        return { success: false, error: 'add_accordion_interaction requires containerSelector, headerSelector, contentSelector' };
      }
      state.accordions.push({
        containerSelector,
        headerSelector,
        contentSelector,
        allowMultiple: params.allowMultiple as boolean | undefined,
      });
      return { success: true };
    }

    case 'add_form_validation': {
      const formSelector = params.formSelector as string;
      if (!formSelector) {
        return { success: false, error: 'add_form_validation requires formSelector' };
      }
      state.formValidations.push({
        formSelector,
        submitButtonSelector: params.submitButtonSelector as string | undefined,
        errorClass: params.errorClass as string | undefined,
      });
      return { success: true };
    }

    default:
      return { success: false, error: `Unknown interaction tool: ${tool}` };
  }
}

/**
 * Generate JavaScript code from interaction state
 * This script will be injected into the HTML
 *
 * @param state - The interaction state (may contain unfixed selectors)
 * @param fixedClickToggles - Optional fixed/validated click toggle configs
 */
export function generateInteractionScript(
  state: InteractionState,
  fixedClickToggles?: ClickToggleConfig[]
): string {
  const parts: string[] = [];

  // Use fixed configs if provided, otherwise use original state
  const clickToggles = fixedClickToggles || state.clickToggles;

  // Opening IIFE - run immediately since srcdoc content is already loaded
  parts.push(`(function() {
  'use strict';

  console.log('[VxInteractions] Script loaded, initializing...');

  // Helper to find element with fallback strategies
  function findElement(selector) {
    // Try direct selector first
    try {
      var el = document.querySelector(selector);
      if (el) return el;
    } catch (e) {
      console.log('[VxInteractions] Invalid selector, trying alternatives:', selector);
    }

    // Handle :has-text() pseudo-selector
    var hasTextMatch = selector.match(/^(.+?):has-text\\(["'](.+?)["']\\)$/);
    if (hasTextMatch) {
      var baseSelector = hasTextMatch[1].trim() || '*';
      var searchText = hasTextMatch[2];
      var elements = document.querySelectorAll(baseSelector);
      for (var i = 0; i < elements.length; i++) {
        if (elements[i].textContent && elements[i].textContent.includes(searchText)) {
          return elements[i];
        }
      }
    }

    // Strategy: Extract keywords from selector and find matching buttons
    var keywords = selector.toLowerCase().replace(/[#.\\[\\]]/g, ' ').split(/[-_\\s]+/).filter(function(k) { return k.length > 2; });
    if (keywords.length > 0) {
      var buttons = document.querySelectorAll('button, a, [role="button"]');
      for (var i = 0; i < buttons.length; i++) {
        var btn = buttons[i];
        var text = (btn.textContent || '').toLowerCase().trim();
        var ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        for (var j = 0; j < keywords.length; j++) {
          if (text.includes(keywords[j]) || ariaLabel.includes(keywords[j])) {
            console.log('[VxInteractions] Found button by keyword "' + keywords[j] + '":', btn);
            return btn;
          }
        }
      }
    }

    return null;
  }

  // For srcdoc iframes, DOM is ready immediately
  // Use setTimeout(0) to ensure all elements are parsed
  setTimeout(function() {
    console.log('[VxInteractions] Initializing interactions...');
`);

  // Hide initially hidden elements
  if (state.hiddenSelectors.length > 0) {
    parts.push(`
    // Hide initially hidden elements (with transition support)
    var hiddenSelectors = ${JSON.stringify(state.hiddenSelectors)};
    hiddenSelectors.forEach(function(selector) {
      var el = document.querySelector(selector);
      if (el) {
        // Set up for CSS transitions
        if (!el.style.transition) {
          el.style.transition = 'opacity 0.25s ease-out, visibility 0.25s ease-out, transform 0.3s ease-out';
        }
        // Hide using visibility/opacity instead of display for animation support
        el.setAttribute('data-vx-hidden', 'true');
        el.style.visibility = 'hidden';
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
        console.log('[VxInteractions] Hidden:', selector);
      } else {
        console.warn('[VxInteractions] Element not found for hiding:', selector);
      }
    });
`);
  }

  // Click toggles
  if (clickToggles.length > 0) {
    parts.push(`
    // Click toggle interactions
    var clickToggles = ${JSON.stringify(clickToggles)};
    clickToggles.forEach(function(config) {
      var trigger = findElement(config.triggerSelector);
      var target = findElement(config.targetSelector);

      if (!trigger) {
        console.warn('[VxInteractions] Trigger not found:', config.triggerSelector);
        console.log('[VxInteractions] Available buttons:', Array.from(document.querySelectorAll('button')).map(function(b) { return b.textContent?.trim().substring(0,30) + ' (' + (b.id || b.className || 'no-id') + ')'; }));
        return;
      }
      if (!target) {
        console.warn('[VxInteractions] Target not found:', config.targetSelector);
        return;
      }

      console.log('[VxInteractions] Binding trigger:', config.triggerSelector, 'to target:', config.targetSelector);

      // Ensure target has transition styles for animation
      if (!target.style.transition) {
        target.style.transition = 'opacity 0.25s ease-out, visibility 0.25s ease-out, transform 0.3s ease-out';
      }

      // Show/hide function with CSS transitions
      function toggleTarget() {
        var isHidden = target.getAttribute('data-vx-hidden') === 'true' ||
                       target.style.visibility === 'hidden' ||
                       target.style.display === 'none';
        if (isHidden) {
          showTarget();
        } else {
          hideTarget();
        }
      }

      function showTarget() {
        // First ensure element can be seen (remove display:none if present)
        if (target.style.display === 'none') {
          target.style.display = '';
        }
        // Force reflow to ensure transition works
        void target.offsetHeight;
        // Add visible class and remove hidden state
        target.classList.add('vx-visible');
        target.removeAttribute('data-vx-hidden');
        target.style.visibility = 'visible';
        target.style.opacity = '1';
        target.style.pointerEvents = 'auto';
        console.log('[VxInteractions] Showing:', config.targetSelector);
      }

      function hideTarget() {
        target.classList.remove('vx-visible');
        target.setAttribute('data-vx-hidden', 'true');
        target.style.visibility = 'hidden';
        target.style.opacity = '0';
        target.style.pointerEvents = 'none';
        console.log('[VxInteractions] Hiding:', config.targetSelector);
      }

      // Trigger click
      trigger.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleTarget();
      });

      // Close button
      if (config.closeButtonSelector) {
        var closeBtn = target.querySelector(config.closeButtonSelector);
        if (closeBtn) {
          closeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            hideTarget();
          });
        }
      }

      // Close on click outside
      if (config.closeOnClickOutside !== false) {
        document.addEventListener('click', function(e) {
          if (!target.contains(e.target) && !trigger.contains(e.target)) {
            var isVisible = target.style.display !== 'none' && target.getAttribute('data-vx-hidden') !== 'true';
            if (isVisible) {
              hideTarget();
            }
          }
        });
      }

      console.log('[VxInteractions] Click toggle configured:', config.triggerSelector, '->', config.targetSelector);
    });
`);
  }

  // Hover effects
  if (state.hoverEffects.length > 0) {
    parts.push(`
    // Hover effects with transitions
    var hoverEffects = ${JSON.stringify(state.hoverEffects)};
    hoverEffects.forEach(function(config) {
      var trigger = document.querySelector(config.triggerSelector);
      var target = document.querySelector(config.targetSelector);
      var showTimer, hideTimer;
      var showDelay = config.showDelay || 0;
      var hideDelay = config.hideDelay || 200;

      if (!trigger || !target) {
        console.warn('[VxInteractions] Hover elements not found');
        return;
      }

      // Set up transition
      if (!target.style.transition) {
        target.style.transition = 'opacity 0.2s ease-out, visibility 0.2s ease-out';
      }

      trigger.addEventListener('mouseenter', function() {
        clearTimeout(hideTimer);
        showTimer = setTimeout(function() {
          target.classList.add('vx-visible');
          target.removeAttribute('data-vx-hidden');
          target.style.visibility = 'visible';
          target.style.opacity = '1';
          target.style.pointerEvents = 'auto';
        }, showDelay);
      });

      trigger.addEventListener('mouseleave', function() {
        clearTimeout(showTimer);
        hideTimer = setTimeout(function() {
          target.classList.remove('vx-visible');
          target.setAttribute('data-vx-hidden', 'true');
          target.style.visibility = 'hidden';
          target.style.opacity = '0';
          target.style.pointerEvents = 'none';
        }, hideDelay);
      });

      console.log('[VxInteractions] Hover effect configured:', config.triggerSelector);
    });
`);
  }

  // Tab interactions
  if (state.tabInteractions.length > 0) {
    parts.push(`
    // Tab interactions with fade transitions
    var tabInteractions = ${JSON.stringify(state.tabInteractions)};
    tabInteractions.forEach(function(config) {
      var tabsContainer = document.querySelector(config.tabsSelector);
      var panelsContainer = document.querySelector(config.panelsSelector);
      var activeClass = config.activeClass || 'active';

      if (!tabsContainer || !panelsContainer) {
        console.warn('[VxInteractions] Tab containers not found');
        return;
      }

      var tabs = tabsContainer.children;
      var panels = panelsContainer.children;

      // Set up transitions on all panels
      Array.from(panels).forEach(function(p) {
        if (!p.style.transition) {
          p.style.transition = 'opacity 0.15s ease-out';
        }
      });

      Array.from(tabs).forEach(function(tab, index) {
        tab.addEventListener('click', function(e) {
          e.preventDefault();

          // Remove active from all tabs
          Array.from(tabs).forEach(function(t) { t.classList.remove(activeClass); });
          // Hide all panels with fade
          Array.from(panels).forEach(function(p) {
            p.style.opacity = '0';
            p.style.position = 'absolute';
            p.style.visibility = 'hidden';
          });

          // Activate clicked tab
          tab.classList.add(activeClass);
          if (panels[index]) {
            panels[index].style.position = '';
            panels[index].style.visibility = 'visible';
            panels[index].style.opacity = '1';
          }
        });
      });

      // Activate first tab
      if (tabs[0] && panels[0]) {
        tabs[0].classList.add(activeClass);
        Array.from(panels).forEach(function(p, i) {
          if (i === 0) {
            p.style.opacity = '1';
            p.style.visibility = 'visible';
          } else {
            p.style.opacity = '0';
            p.style.position = 'absolute';
            p.style.visibility = 'hidden';
          }
        });
      }

      console.log('[VxInteractions] Tab interaction configured');
    });
`);
  }

  // Accordions
  if (state.accordions.length > 0) {
    parts.push(`
    // Accordion interactions with height animation
    var accordions = ${JSON.stringify(state.accordions)};
    accordions.forEach(function(config) {
      var container = document.querySelector(config.containerSelector);
      if (!container) {
        console.warn('[VxInteractions] Accordion container not found');
        return;
      }

      var headers = container.querySelectorAll(config.headerSelector);
      var contents = container.querySelectorAll(config.contentSelector);
      var allowMultiple = config.allowMultiple || false;

      // Set up for height animation
      contents.forEach(function(c) {
        c.style.overflow = 'hidden';
        c.style.transition = 'max-height 0.3s ease-out, opacity 0.3s ease-out';
        // Initially collapsed
        c.style.maxHeight = '0';
        c.style.opacity = '0';
        c.setAttribute('data-vx-collapsed', 'true');
      });

      function openContent(content) {
        content.style.maxHeight = content.scrollHeight + 'px';
        content.style.opacity = '1';
        content.removeAttribute('data-vx-collapsed');
      }

      function closeContent(content) {
        content.style.maxHeight = '0';
        content.style.opacity = '0';
        content.setAttribute('data-vx-collapsed', 'true');
      }

      headers.forEach(function(header, index) {
        header.addEventListener('click', function(e) {
          e.preventDefault();
          var content = contents[index];
          if (!content) return;

          var isOpen = !content.hasAttribute('data-vx-collapsed');

          if (!allowMultiple) {
            // Close all others
            contents.forEach(function(c) { closeContent(c); });
            headers.forEach(function(h) { h.classList.remove('active'); });
          }

          if (isOpen) {
            closeContent(content);
            header.classList.remove('active');
          } else {
            openContent(content);
            header.classList.add('active');
          }
        });
      });

      console.log('[VxInteractions] Accordion configured');
    });
`);
  }

  // Form validation
  if (state.formValidations.length > 0) {
    parts.push(`
    // Form validation
    var formValidations = ${JSON.stringify(state.formValidations)};
    formValidations.forEach(function(config) {
      var form = document.querySelector(config.formSelector);
      if (!form) {
        console.warn('[VxInteractions] Form not found');
        return;
      }

      var errorClass = config.errorClass || 'error';

      form.addEventListener('submit', function(e) {
        e.preventDefault();
        var isValid = true;
        var requiredInputs = form.querySelectorAll('[required]');

        requiredInputs.forEach(function(input) {
          input.classList.remove(errorClass);
          if (!input.value.trim()) {
            input.classList.add(errorClass);
            isValid = false;
          }
        });

        if (isValid) {
          console.log('[VxInteractions] Form valid, would submit');
          // In a real app, this would submit the form
          alert('Form submitted successfully!');
        } else {
          console.log('[VxInteractions] Form validation failed');
        }
      });

      console.log('[VxInteractions] Form validation configured');
    });
`);
  }

  // Close IIFE
  parts.push(`
    console.log('[VxInteractions] Initialization complete');
  }, 0); // setTimeout to ensure DOM is ready
})();
`);

  return parts.join('');
}

/**
 * Inject interaction script into HTML document
 * Validates selectors and attempts to fix broken references
 */
export function injectInteractionScript(doc: Document, state: InteractionState): string[] {
  // Only inject if there are interactions
  const hasInteractions =
    state.hiddenSelectors.length > 0 ||
    state.clickToggles.length > 0 ||
    state.hoverEffects.length > 0 ||
    state.tabInteractions.length > 0 ||
    state.accordions.length > 0 ||
    state.formValidations.length > 0;

  if (!hasInteractions) {
    console.log('[interactionHandler] No interactions to inject');
    return [];
  }

  // Validate and fix interaction selectors
  const validation = validateAndFixInteractions(doc, state);

  if (validation.warnings.length > 0) {
    console.warn('[interactionHandler] Interaction validation warnings:', validation.warnings);
  }

  // Generate script with fixed configs
  const scriptContent = generateInteractionScript(state, validation.fixedConfigs.clickToggles);

  // Create script element
  const script = doc.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('data-vx-interactions', 'true');
  script.textContent = scriptContent;

  // Inject at end of body
  if (doc.body) {
    doc.body.appendChild(script);
    console.log('[interactionHandler] Injected interaction script with', {
      hiddenCount: state.hiddenSelectors.length,
      clickToggles: validation.fixedConfigs.clickToggles.length,
      originalClickToggles: state.clickToggles.length,
      hoverEffects: state.hoverEffects.length,
      tabs: state.tabInteractions.length,
      accordions: state.accordions.length,
      forms: state.formValidations.length,
    });
  } else {
    console.warn('[interactionHandler] No body element found to inject script');
  }

  return validation.warnings;
}

/**
 * Add CSS for interaction states (vx-visible class, error styles, etc.)
 */
export function injectInteractionStyles(doc: Document): void {
  const styleContent = `
/* VxInteractions - Styles for interactive prototypes */

/* Generic animated show/hide - using visibility/opacity for transition support */
[data-vx-hidden="true"] {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

/* When vx-visible class is added, make visible with transition */
.vx-visible {
  opacity: 1 !important;
  visibility: visible !important;
  pointer-events: auto !important;
}

/* Elements that need immediate display control (non-animated) */
.vx-display-none {
  display: none !important;
}

/* Modal overlay styles */
.modal-overlay, [data-vx-modal], .modal, .dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Animation: fade in */
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.25s ease-out, visibility 0.25s ease-out;
}

/* Modal visible state */
.modal-overlay.vx-visible, [data-vx-modal].vx-visible, .modal.vx-visible, .dialog-overlay.vx-visible {
  opacity: 1;
  visibility: visible;
}

/* Modal content - prevent overflow */
.modal-content, .modal-dialog, .dialog-content, [data-vx-modal-content] {
  background: white;
  border-radius: 8px;
  max-height: 90vh;
  max-width: 90vw;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
}

/* Side panel styles - fixed overflow issues */
.slide-panel, .side-panel, [data-vx-panel], .panel, .drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 400px;
  max-width: 90vw;
  background: white;
  z-index: 9998;
  box-shadow: -2px 0 10px rgba(0,0,0,0.2);
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  /* Animation: slide in from right */
  transform: translateX(100%);
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
  opacity: 0;
}

/* Side panel visible state */
.slide-panel.vx-visible, .side-panel.vx-visible, [data-vx-panel].vx-visible,
.panel.vx-visible, .drawer.vx-visible {
  transform: translateX(0);
  opacity: 1;
}

/* Panel content area - scrollable */
.panel-content, .side-panel-content, .drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* Panel footer with buttons - fixed at bottom, no overflow */
.panel-footer, .side-panel-footer, .drawer-footer, .panel-actions {
  flex-shrink: 0;
  padding: 16px;
  border-top: 1px solid #e0e0e0;
  background: white;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Ensure buttons don't overflow */
.panel-footer button, .side-panel-footer button, .drawer-footer button,
.modal-footer button, .dialog-footer button {
  flex-shrink: 0;
  white-space: nowrap;
}

/* Close button positioning */
.close-btn, .close-button, .modal-close, .panel-close, [data-close] {
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  z-index: 1;
}

.close-btn:hover, .close-button:hover, .modal-close:hover, .panel-close:hover {
  background: rgba(0,0,0,0.1);
  border-radius: 4px;
}

/* Form error styles */
input.error, select.error, textarea.error {
  border-color: #dc3545 !important;
  background-color: #fff5f5 !important;
}

/* Accordion styles */
.accordion-header, [data-vx-accordion-header] {
  cursor: pointer;
  padding: 12px 16px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  margin-bottom: -1px;
}

.accordion-header.active, [data-vx-accordion-header].active {
  background-color: #e8e8e8;
}

.accordion-content, [data-vx-accordion-content] {
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-top: none;
}

/* Tab styles */
.tab-list, .tabs {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
}

.tab, .tab-button {
  padding: 12px 24px;
  cursor: pointer;
  border: none;
  background: transparent;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}

.tab.active, .tab-button.active {
  border-bottom-color: #007bff;
  color: #007bff;
}

.tab-panel, .tab-content {
  padding: 16px;
}

/* Step/Progress indicator styles for task breakdowns */
.steps, .stepper, .progress-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step, .step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.step:hover, .step-item:hover {
  background: #f0f0f0;
}

.step.active, .step-item.active {
  background: #e3f2fd;
  border-left: 3px solid #2196f3;
}

.step.completed, .step-item.completed {
  background: #e8f5e9;
}

.step-number, .step-indicator {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  flex-shrink: 0;
}

.step.active .step-number, .step-item.active .step-indicator {
  background: #2196f3;
  color: white;
}

.step.completed .step-number, .step-item.completed .step-indicator {
  background: #4caf50;
  color: white;
}

.step-content {
  flex: 1;
}

.step-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.step-description {
  color: #666;
  font-size: 14px;
}

/* Expandable/collapsible content */
.expandable-content, .collapsible-content {
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.expandable-content.collapsed, .collapsible-content.collapsed {
  max-height: 0;
}
`;

  // Check if already injected
  if (doc.querySelector('style[data-vx-interaction-styles]')) {
    return;
  }

  const style = doc.createElement('style');
  style.setAttribute('data-vx-interaction-styles', 'true');
  style.textContent = styleContent;

  if (doc.head) {
    doc.head.appendChild(style);
  } else if (doc.body) {
    doc.body.insertBefore(style, doc.body.firstChild);
  }
}
