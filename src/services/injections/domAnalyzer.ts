/**
 * DOM Analyzer Service
 * Analyzes HTML to find injection points for interactivity
 */

export interface InjectionPoint {
  id: string;
  type: InjectionPointType;
  selector: string;
  element: string; // tag name
  attributes: Record<string, string>;
  textContent?: string;
  suggestedInjections: SuggestedInjection[];
  context?: string; // surrounding context for LLM
}

export type InjectionPointType =
  | 'button'
  | 'form'
  | 'link'
  | 'modal'
  | 'tab'
  | 'table'
  | 'dropdown'
  | 'input'
  | 'card'
  | 'list'
  | 'accordion'
  | 'carousel'
  | 'tooltip-trigger'
  | 'menu';

export interface SuggestedInjection {
  type: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AnalysisResult {
  injectionPoints: InjectionPoint[];
  summary: {
    totalPoints: number;
    byType: Record<InjectionPointType, number>;
    interactivityScore: number; // 0-100
  };
  recommendations: string[];
}

/**
 * Check if a class name is safe to use in a CSS selector
 * Tailwind CSS v3+ uses arbitrary values with special characters that are invalid in selectors
 */
function isSafeClassName(className: string): boolean {
  // Skip classes with special characters that are invalid in CSS selectors
  // These include: [ ] / : ! @ $ % ^ & * ( ) + = { } | \ ; " ' < > , ?
  const unsafePattern = /[\[\]\/\:\!\@\$\%\^\&\*\(\)\+\=\{\}\|\\\;\"\'\<\>\,\?]/;
  if (unsafePattern.test(className)) {
    return false;
  }
  // Skip state-related classes
  if (className.match(/^(hover|active|focus|disabled|group|peer)/)) {
    return false;
  }
  // Skip very short classes (often utility prefixes)
  if (className.length < 2) {
    return false;
  }
  return true;
}

/**
 * Escape special characters in CSS selector
 */
function escapeCSS(str: string): string {
  return str.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/**
 * Generate a unique selector for an element
 */
function generateSelector(element: Element, index: number): string {
  // Try ID first (must be valid CSS identifier)
  if (element.id && !element.id.match(/[\s\[\]\/\:]/)) {
    return `#${escapeCSS(element.id)}`;
  }

  // Try unique class combination - only use safe class names
  const classes = Array.from(element.classList).filter(isSafeClassName);
  if (classes.length > 0) {
    // Limit to first 3 classes to avoid overly specific selectors
    const safeClasses = classes.slice(0, 3);
    const classSelector = `.${safeClasses.map(escapeCSS).join('.')}`;
    return classSelector;
  }

  // Try data attributes (prefer simple ones)
  const dataAttrs = Array.from(element.attributes)
    .filter(attr => attr.name.startsWith('data-') && !attr.value.includes('[') && attr.value.length < 50)
    .slice(0, 1)
    .map(attr => `[${attr.name}="${escapeCSS(attr.value)}"]`);
  if (dataAttrs.length > 0) {
    return `${element.tagName.toLowerCase()}${dataAttrs[0]}`;
  }

  // Try role attribute
  const role = element.getAttribute('role');
  if (role) {
    return `${element.tagName.toLowerCase()}[role="${role}"]`;
  }

  // Try type attribute for inputs
  const type = element.getAttribute('type');
  if (type && element.tagName.toLowerCase() === 'input') {
    return `input[type="${type}"]:nth-of-type(${index + 1})`;
  }

  // Fallback to tag + nth-of-type
  return `${element.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
}

/**
 * Get element attributes as a record
 */
function getAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  Array.from(element.attributes).forEach(attr => {
    attrs[attr.name] = attr.value;
  });
  return attrs;
}

/**
 * Detect buttons and button-like elements
 */
function detectButtons(doc: Document): InjectionPoint[] {
  const points: InjectionPoint[] = [];

  // Actual buttons
  const buttons = doc.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]');
  buttons.forEach((el, i) => {
    const text = el.textContent?.trim() || '';
    const isSubmit = el.getAttribute('type') === 'submit' || el.closest('form');

    points.push({
      id: `btn-${i}`,
      type: 'button',
      selector: generateSelector(el, i),
      element: el.tagName.toLowerCase(),
      attributes: getAttributes(el),
      textContent: text,
      suggestedInjections: [
        {
          type: isSubmit ? 'form-submit' : 'click-feedback',
          description: isSubmit ? 'Show form submission feedback' : `Handle "${text || 'button'}" click`,
          priority: 'high'
        },
        {
          type: 'tooltip',
          description: 'Show tooltip on hover',
          priority: 'low'
        }
      ],
      context: `Button with text: "${text}"`
    });
  });

  // Clickable divs/spans that look like buttons
  const clickables = doc.querySelectorAll('[class*="btn"], [class*="button"], [onclick]');
  clickables.forEach((el, i) => {
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') return;

    points.push({
      id: `clickable-${i}`,
      type: 'button',
      selector: generateSelector(el, i),
      element: el.tagName.toLowerCase(),
      attributes: getAttributes(el),
      textContent: el.textContent?.trim().slice(0, 50),
      suggestedInjections: [
        {
          type: 'click-feedback',
          description: 'Add click interaction',
          priority: 'medium'
        }
      ]
    });
  });

  return points;
}

/**
 * Detect forms and form fields
 */
function detectForms(doc: Document): InjectionPoint[] {
  const points: InjectionPoint[] = [];

  const forms = doc.querySelectorAll('form');
  forms.forEach((form, i) => {
    const inputs = form.querySelectorAll('input, textarea, select');

    points.push({
      id: `form-${i}`,
      type: 'form',
      selector: generateSelector(form, i),
      element: 'form',
      attributes: getAttributes(form),
      suggestedInjections: [
        {
          type: 'form-validation',
          description: `Validate ${inputs.length} form fields`,
          priority: 'high'
        },
        {
          type: 'form-submit',
          description: 'Handle form submission with feedback',
          priority: 'high'
        },
        {
          type: 'form-autofill',
          description: 'Auto-fill with mock data',
          priority: 'medium'
        }
      ],
      context: `Form with ${inputs.length} inputs`
    });
  });

  // Standalone inputs not in forms
  const standaloneInputs = doc.querySelectorAll('input:not(form input), textarea:not(form textarea), select:not(form select)');
  standaloneInputs.forEach((input, i) => {
    const type = input.getAttribute('type') || 'text';
    const placeholder = input.getAttribute('placeholder') || '';

    points.push({
      id: `input-${i}`,
      type: 'input',
      selector: generateSelector(input, i),
      element: input.tagName.toLowerCase(),
      attributes: getAttributes(input),
      suggestedInjections: [
        {
          type: 'input-validation',
          description: `Validate ${type} input`,
          priority: 'medium'
        },
        {
          type: 'input-autofill',
          description: placeholder ? `Auto-fill "${placeholder}"` : 'Auto-fill with mock data',
          priority: 'low'
        }
      ],
      context: `${type} input${placeholder ? ` (${placeholder})` : ''}`
    });
  });

  return points;
}

/**
 * Detect navigation links
 */
function detectLinks(doc: Document): InjectionPoint[] {
  const points: InjectionPoint[] = [];

  const links = doc.querySelectorAll('a[href], [role="link"]');
  links.forEach((link, i) => {
    const href = link.getAttribute('href') || '';
    const text = link.textContent?.trim() || '';
    const isAnchor = href.startsWith('#');

    // Skip empty or javascript: links
    if (!href || href === '#' || href.startsWith('javascript:')) {
      points.push({
        id: `link-${i}`,
        type: 'link',
        selector: generateSelector(link, i),
        element: 'a',
        attributes: getAttributes(link),
        textContent: text,
        suggestedInjections: [
          {
            type: 'navigation',
            description: `Handle "${text}" navigation`,
            priority: 'high'
          }
        ],
        context: `Navigation link: "${text}"`
      });
    } else if (isAnchor) {
      points.push({
        id: `link-${i}`,
        type: 'link',
        selector: generateSelector(link, i),
        element: 'a',
        attributes: getAttributes(link),
        textContent: text,
        suggestedInjections: [
          {
            type: 'smooth-scroll',
            description: `Smooth scroll to ${href}`,
            priority: 'medium'
          }
        ],
        context: `Anchor link to ${href}`
      });
    }
  });

  return points;
}

/**
 * Detect modals and dialogs
 */
function detectModals(doc: Document): InjectionPoint[] {
  const points: InjectionPoint[] = [];

  // Common modal selectors
  const modalSelectors = [
    '[role="dialog"]',
    '[aria-modal="true"]',
    '.modal',
    '.dialog',
    '[class*="modal"]',
    '[class*="dialog"]',
    '[class*="popup"]',
    '[class*="overlay"]'
  ];

  const modals = doc.querySelectorAll(modalSelectors.join(', '));
  modals.forEach((modal, i) => {
    points.push({
      id: `modal-${i}`,
      type: 'modal',
      selector: generateSelector(modal, i),
      element: modal.tagName.toLowerCase(),
      attributes: getAttributes(modal),
      suggestedInjections: [
        {
          type: 'modal-toggle',
          description: 'Toggle modal open/close',
          priority: 'high'
        },
        {
          type: 'modal-backdrop',
          description: 'Close on backdrop click',
          priority: 'medium'
        },
        {
          type: 'modal-escape',
          description: 'Close on Escape key',
          priority: 'medium'
        }
      ],
      context: 'Modal/dialog element'
    });
  });

  // Detect modal triggers
  const triggers = doc.querySelectorAll('[data-toggle="modal"], [data-bs-toggle="modal"], [data-target*="modal"]');
  triggers.forEach((trigger, i) => {
    points.push({
      id: `modal-trigger-${i}`,
      type: 'button',
      selector: generateSelector(trigger, i),
      element: trigger.tagName.toLowerCase(),
      attributes: getAttributes(trigger),
      textContent: trigger.textContent?.trim(),
      suggestedInjections: [
        {
          type: 'modal-open',
          description: 'Open associated modal',
          priority: 'high'
        }
      ],
      context: 'Modal trigger button'
    });
  });

  return points;
}

/**
 * Detect tabs and tab panels
 */
function detectTabs(doc: Document): InjectionPoint[] {
  const points: InjectionPoint[] = [];

  // Tab lists
  const tabLists = doc.querySelectorAll('[role="tablist"], .tabs, .tab-list, [class*="tabs"]');
  tabLists.forEach((tabList, i) => {
    const tabs = tabList.querySelectorAll('[role="tab"], .tab, [class*="tab-item"]');

    points.push({
      id: `tablist-${i}`,
      type: 'tab',
      selector: generateSelector(tabList, i),
      element: tabList.tagName.toLowerCase(),
      attributes: getAttributes(tabList),
      suggestedInjections: [
        {
          type: 'tab-switch',
          description: `Handle ${tabs.length} tab switching`,
          priority: 'high'
        },
        {
          type: 'tab-keyboard',
          description: 'Arrow key navigation',
          priority: 'medium'
        }
      ],
      context: `Tab list with ${tabs.length} tabs`
    });
  });

  return points;
}

/**
 * Detect tables
 */
function detectTables(doc: Document): InjectionPoint[] {
  const points: InjectionPoint[] = [];

  const tables = doc.querySelectorAll('table');
  tables.forEach((table, i) => {
    const rows = table.querySelectorAll('tbody tr');
    const headers = table.querySelectorAll('th');
    const hasActions = table.querySelector('[class*="action"], button, a') !== null;

    points.push({
      id: `table-${i}`,
      type: 'table',
      selector: generateSelector(table, i),
      element: 'table',
      attributes: getAttributes(table),
      suggestedInjections: [
        {
          type: 'table-mock-data',
          description: `Populate ${rows.length} rows with realistic data`,
          priority: 'high'
        },
        {
          type: 'table-sort',
          description: `Add sorting for ${headers.length} columns`,
          priority: 'medium'
        },
        {
          type: 'table-row-click',
          description: 'Handle row selection',
          priority: 'medium'
        },
        ...(hasActions ? [{
          type: 'table-actions' as const,
          description: 'Handle row action buttons',
          priority: 'high' as const
        }] : [])
      ],
      context: `Table with ${headers.length} columns, ${rows.length} rows`
    });
  });

  return points;
}

/**
 * Detect dropdowns and menus
 */
function detectDropdowns(doc: Document): InjectionPoint[] {
  const points: InjectionPoint[] = [];

  const dropdownSelectors = [
    '[role="menu"]',
    '[role="listbox"]',
    '.dropdown',
    '.dropdown-menu',
    '[class*="dropdown"]',
    'select'
  ];

  const dropdowns = doc.querySelectorAll(dropdownSelectors.join(', '));
  dropdowns.forEach((dropdown, i) => {
    const isSelect = dropdown.tagName === 'SELECT';
    const options = dropdown.querySelectorAll('option, [role="option"], .dropdown-item, li');

    points.push({
      id: `dropdown-${i}`,
      type: 'dropdown',
      selector: generateSelector(dropdown, i),
      element: dropdown.tagName.toLowerCase(),
      attributes: getAttributes(dropdown),
      suggestedInjections: [
        {
          type: isSelect ? 'select-change' : 'dropdown-toggle',
          description: isSelect ? 'Handle selection change' : 'Toggle dropdown menu',
          priority: 'high'
        },
        {
          type: 'dropdown-keyboard',
          description: 'Keyboard navigation',
          priority: 'medium'
        }
      ],
      context: `${isSelect ? 'Select' : 'Dropdown'} with ${options.length} options`
    });
  });

  return points;
}

/**
 * Detect cards and list items
 */
function detectCardsAndLists(doc: Document): InjectionPoint[] {
  const points: InjectionPoint[] = [];

  // Cards
  const cards = doc.querySelectorAll('.card, [class*="card"], article');
  cards.forEach((card, i) => {
    const hasImage = card.querySelector('img') !== null;

    points.push({
      id: `card-${i}`,
      type: 'card',
      selector: generateSelector(card, i),
      element: card.tagName.toLowerCase(),
      attributes: getAttributes(card),
      suggestedInjections: [
        {
          type: 'card-mock-content',
          description: 'Populate with mock content',
          priority: 'medium'
        },
        {
          type: 'card-click',
          description: 'Handle card click/selection',
          priority: 'medium'
        },
        ...(hasImage ? [{
          type: 'image-placeholder' as const,
          description: 'Replace with placeholder image',
          priority: 'low' as const
        }] : [])
      ]
    });
  });

  // Lists
  const lists = doc.querySelectorAll('ul, ol, [role="list"]');
  lists.forEach((list, i) => {
    const items = list.querySelectorAll('li, [role="listitem"]');
    if (items.length < 2) return; // Skip single-item lists

    points.push({
      id: `list-${i}`,
      type: 'list',
      selector: generateSelector(list, i),
      element: list.tagName.toLowerCase(),
      attributes: getAttributes(list),
      suggestedInjections: [
        {
          type: 'list-mock-data',
          description: `Populate ${items.length} list items`,
          priority: 'medium'
        },
        {
          type: 'list-item-click',
          description: 'Handle item selection',
          priority: 'low'
        }
      ],
      context: `List with ${items.length} items`
    });
  });

  return points;
}

/**
 * Detect accordions
 */
function detectAccordions(doc: Document): InjectionPoint[] {
  const points: InjectionPoint[] = [];

  const accordionSelectors = [
    '[class*="accordion"]',
    '[class*="collapse"]',
    '[class*="expand"]',
    'details'
  ];

  const accordions = doc.querySelectorAll(accordionSelectors.join(', '));
  accordions.forEach((accordion, i) => {
    points.push({
      id: `accordion-${i}`,
      type: 'accordion',
      selector: generateSelector(accordion, i),
      element: accordion.tagName.toLowerCase(),
      attributes: getAttributes(accordion),
      suggestedInjections: [
        {
          type: 'accordion-toggle',
          description: 'Expand/collapse section',
          priority: 'high'
        }
      ]
    });
  });

  return points;
}

/**
 * Main analysis function
 */
export function analyzeForInjections(html: string): AnalysisResult {
  // Parse HTML into a document
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Collect all injection points
  const injectionPoints: InjectionPoint[] = [
    ...detectButtons(doc),
    ...detectForms(doc),
    ...detectLinks(doc),
    ...detectModals(doc),
    ...detectTabs(doc),
    ...detectTables(doc),
    ...detectDropdowns(doc),
    ...detectCardsAndLists(doc),
    ...detectAccordions(doc)
  ];

  // Calculate summary
  const byType: Record<InjectionPointType, number> = {
    button: 0,
    form: 0,
    link: 0,
    modal: 0,
    tab: 0,
    table: 0,
    dropdown: 0,
    input: 0,
    card: 0,
    list: 0,
    accordion: 0,
    carousel: 0,
    'tooltip-trigger': 0,
    menu: 0
  };

  injectionPoints.forEach(point => {
    byType[point.type]++;
  });

  // Calculate interactivity score (0-100)
  const weights: Record<InjectionPointType, number> = {
    button: 10,
    form: 15,
    link: 5,
    modal: 12,
    tab: 10,
    table: 15,
    dropdown: 8,
    input: 5,
    card: 5,
    list: 5,
    accordion: 8,
    carousel: 10,
    'tooltip-trigger': 2,
    menu: 8
  };

  let rawScore = 0;
  Object.entries(byType).forEach(([type, count]) => {
    rawScore += Math.min(count, 3) * weights[type as InjectionPointType];
  });
  const interactivityScore = Math.min(100, rawScore);

  // Generate recommendations
  const recommendations: string[] = [];

  if (byType.button === 0) {
    recommendations.push('Add button interactions for better user engagement');
  }
  if (byType.form > 0) {
    recommendations.push('Consider adding form validation and mock submission handling');
  }
  if (byType.table > 0) {
    recommendations.push('Tables detected - recommend adding mock data and sorting');
  }
  if (byType.modal > 0 || byType.tab > 0) {
    recommendations.push('Interactive components detected - ensure open/close states work');
  }
  if (interactivityScore < 30) {
    recommendations.push('Low interactivity score - consider adding more interactive elements');
  }

  return {
    injectionPoints,
    summary: {
      totalPoints: injectionPoints.length,
      byType,
      interactivityScore
    },
    recommendations
  };
}

/**
 * Get a simplified summary for LLM context
 */
export function getAnalysisSummaryForLLM(result: AnalysisResult): string {
  const lines = [
    `Found ${result.summary.totalPoints} injection points:`,
    ...Object.entries(result.summary.byType)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `- ${count} ${type}(s)`),
    '',
    'Key injection points:',
    ...result.injectionPoints
      .filter(p => p.suggestedInjections.some(s => s.priority === 'high'))
      .slice(0, 10)
      .map(p => `- ${p.type}: "${p.textContent || p.selector}" (${p.suggestedInjections[0]?.description})`)
  ];

  return lines.join('\n');
}
