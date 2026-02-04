/**
 * UserFlowDiagram - Visual flow diagram showing interactions in a prototype
 *
 * Displays:
 * - Page state as the starting node
 * - Hidden elements (modals, panels, etc.) as state nodes
 * - Click interactions as arrows connecting triggers to targets
 *
 * This is a simple CSS-based implementation. Can be upgraded to React Flow
 * for more advanced features like drag-and-drop, zooming, etc.
 */

import { useMemo } from 'react';
import { Box, Typography, Paper, Chip, Tooltip } from '@mui/material';
import {
  CursorClick,
  Eye,
  EyeSlash,
  ArrowsClockwise,
  Mouse,
  CaretRight,
} from '@phosphor-icons/react';

// =============================================================================
// Types
// =============================================================================

interface ClickToggle {
  triggerSelector: string;
  targetSelector: string;
  closeOnClickOutside?: boolean;
  closeButtonSelector?: string;
}

interface HoverEffect {
  triggerSelector: string;
  targetSelector: string;
}

interface InteractionState {
  hiddenSelectors: string[];
  clickToggles: ClickToggle[];
  hoverEffects: HoverEffect[];
  tabInteractions?: Array<{
    tabsSelector: string;
    panelsSelector: string;
  }>;
  accordions?: Array<{
    containerSelector: string;
    headerSelector: string;
    contentSelector: string;
  }>;
}

interface UserFlowDiagramProps {
  interactionState?: InteractionState;
  variantTitle?: string;
  compact?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Simplify a CSS selector for display
 */
function simplifySelector(selector: string): string {
  // Extract meaningful parts from selectors
  if (selector.includes('#')) {
    // ID selector - extract ID
    const match = selector.match(/#([a-zA-Z0-9_-]+)/);
    if (match) return `#${match[1]}`;
  }
  if (selector.includes('.')) {
    // Class selector - extract main class
    const match = selector.match(/\.([a-zA-Z0-9_-]+)/);
    if (match) return `.${match[1]}`;
  }
  // Just return first 25 chars
  return selector.length > 25 ? selector.slice(0, 22) + '...' : selector;
}

/**
 * Determine the type of element from its selector
 */
function guessElementType(selector: string): 'modal' | 'panel' | 'dropdown' | 'tooltip' | 'element' {
  const lower = selector.toLowerCase();
  if (lower.includes('modal') || lower.includes('dialog')) return 'modal';
  if (lower.includes('panel') || lower.includes('sidebar') || lower.includes('drawer')) return 'panel';
  if (lower.includes('dropdown') || lower.includes('menu')) return 'dropdown';
  if (lower.includes('tooltip') || lower.includes('popover')) return 'tooltip';
  return 'element';
}

/**
 * Get a friendly name for an element type
 */
function getElementTypeName(type: string): string {
  const names: Record<string, string> = {
    modal: 'Modal',
    panel: 'Panel',
    dropdown: 'Menu',
    tooltip: 'Tooltip',
    element: 'Element',
  };
  return names[type] || 'Element';
}

// =============================================================================
// Sub-components
// =============================================================================

function FlowNode({
  label,
  sublabel,
  type = 'default',
  icon,
}: {
  label: string;
  sublabel?: string;
  type?: 'page' | 'hidden' | 'default';
  icon?: React.ReactNode;
}) {
  const bgColors = {
    page: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    hidden: '#f5f5f5',
    default: 'white',
  };

  const borderColors = {
    page: 'transparent',
    hidden: '#e0e0e0',
    default: '#e0e0e0',
  };

  const textColors = {
    page: 'white',
    hidden: 'text.primary',
    default: 'text.primary',
  };

  return (
    <Paper
      elevation={type === 'page' ? 3 : 1}
      sx={{
        px: 2,
        py: 1.5,
        borderRadius: 2,
        background: bgColors[type],
        border: '2px solid',
        borderColor: borderColors[type],
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        minWidth: 120,
        transition: 'all 0.2s ease',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 3,
        },
      }}
    >
      {icon && (
        <Box sx={{ color: textColors[type], display: 'flex', alignItems: 'center' }}>
          {icon}
        </Box>
      )}
      <Box>
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ color: textColors[type], lineHeight: 1.2 }}
        >
          {label}
        </Typography>
        {sublabel && (
          <Typography
            variant="caption"
            sx={{ color: type === 'page' ? 'rgba(255,255,255,0.8)' : 'text.secondary', lineHeight: 1.2 }}
          >
            {sublabel}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

function FlowArrow({
  label,
  type = 'click',
}: {
  label?: string;
  type?: 'click' | 'hover' | 'close';
}) {
  const colors = {
    click: '#667eea',
    hover: '#10b981',
    close: '#ef4444',
  };

  const icons = {
    click: <CursorClick size={12} />,
    hover: <Mouse size={12} />,
    close: <ArrowsClockwise size={12} />,
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        color: colors[type],
      }}
    >
      <Box
        sx={{
          width: 40,
          height: 2,
          bgcolor: colors[type],
          position: 'relative',
          '&::after': {
            content: '""',
            position: 'absolute',
            right: -4,
            top: '50%',
            transform: 'translateY(-50%)',
            borderLeft: `8px solid ${colors[type]}`,
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
          },
        }}
      />
      {label && (
        <Chip
          icon={icons[type]}
          label={label}
          size="small"
          sx={{
            height: 20,
            fontSize: 10,
            bgcolor: `${colors[type]}15`,
            color: colors[type],
            '& .MuiChip-icon': { color: colors[type], fontSize: 12 },
          }}
        />
      )}
    </Box>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function UserFlowDiagram({
  interactionState,
  variantTitle,
  compact = false,
}: UserFlowDiagramProps) {
  // Build flow data from interaction state
  const flowData = useMemo(() => {
    if (!interactionState) return null;

    const { hiddenSelectors, clickToggles, hoverEffects, tabInteractions, accordions } = interactionState;

    // Build unique targets (hidden elements that can be shown)
    const uniqueTargets = new Set<string>();

    // Add hidden selectors
    hiddenSelectors.forEach(s => uniqueTargets.add(s));

    // Add click toggle targets
    clickToggles.forEach(t => uniqueTargets.add(t.targetSelector));

    // Add hover effect targets
    hoverEffects.forEach(h => uniqueTargets.add(h.targetSelector));

    // Build nodes
    const nodes = Array.from(uniqueTargets).map(selector => ({
      id: selector,
      label: simplifySelector(selector),
      type: guessElementType(selector),
      isInitiallyHidden: hiddenSelectors.includes(selector),
    }));

    // Build edges (interactions)
    const edges: Array<{
      from: string;
      to: string;
      type: 'click' | 'hover' | 'close';
      label: string;
    }> = [];

    // Click toggles
    clickToggles.forEach(toggle => {
      edges.push({
        from: 'page',
        to: toggle.targetSelector,
        type: 'click',
        label: simplifySelector(toggle.triggerSelector),
      });

      // Close interactions
      if (toggle.closeOnClickOutside) {
        edges.push({
          from: toggle.targetSelector,
          to: 'page',
          type: 'close',
          label: 'Outside click',
        });
      }
      if (toggle.closeButtonSelector) {
        edges.push({
          from: toggle.targetSelector,
          to: 'page',
          type: 'close',
          label: simplifySelector(toggle.closeButtonSelector),
        });
      }
    });

    // Hover effects
    hoverEffects.forEach(hover => {
      edges.push({
        from: 'page',
        to: hover.targetSelector,
        type: 'hover',
        label: simplifySelector(hover.triggerSelector),
      });
    });

    return {
      nodes,
      edges,
      hasTabInteractions: (tabInteractions?.length || 0) > 0,
      hasAccordions: (accordions?.length || 0) > 0,
      tabCount: tabInteractions?.length || 0,
      accordionCount: accordions?.length || 0,
    };
  }, [interactionState]);

  // Empty state
  if (!flowData || (flowData.nodes.length === 0 && flowData.edges.length === 0)) {
    return (
      <Box
        sx={{
          p: compact ? 2 : 4,
          textAlign: 'center',
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2">
          No interactions found in this prototype.
        </Typography>
        <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
          Add click toggles, hover effects, or navigation to see the flow.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: compact ? 1.5 : 3 }}>
      {/* Header */}
      {variantTitle && !compact && (
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
          User Flow: {variantTitle}
        </Typography>
      )}

      {/* Flow diagram */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          alignItems: 'flex-start',
        }}
      >
        {/* Page node */}
        <FlowNode label="Page" sublabel="Initial state" type="page" icon={<Eye size={16} />} />

        {/* Hidden elements section */}
        {flowData.nodes.length > 0 && (
          <Box sx={{ ml: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <CaretRight size={14} />
              <Typography variant="caption" color="text.secondary" fontWeight={500}>
                Toggleable Elements ({flowData.nodes.length})
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {flowData.nodes.map(node => {
                // Find edges related to this node
                const incomingEdges = flowData.edges.filter(e => e.to === node.id);
                const outgoingEdges = flowData.edges.filter(e => e.from === node.id);

                return (
                  <Box key={node.id} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {/* Incoming arrow */}
                    {incomingEdges.length > 0 && (
                      <Tooltip
                        title={
                          <Box>
                            {incomingEdges.map((edge, i) => (
                              <Typography key={i} variant="caption" display="block">
                                {edge.type === 'click' ? 'Click' : 'Hover'}: {edge.label}
                              </Typography>
                            ))}
                          </Box>
                        }
                      >
                        <Box>
                          <FlowArrow
                            type={incomingEdges[0].type}
                            label={incomingEdges[0].type === 'click' ? 'click' : 'hover'}
                          />
                        </Box>
                      </Tooltip>
                    )}

                    {/* Node */}
                    <FlowNode
                      label={getElementTypeName(node.type)}
                      sublabel={node.label}
                      type="hidden"
                      icon={node.isInitiallyHidden ? <EyeSlash size={14} /> : <Eye size={14} />}
                    />

                    {/* Outgoing arrow (close) */}
                    {outgoingEdges.length > 0 && (
                      <Tooltip
                        title={
                          <Box>
                            {outgoingEdges.map((edge, i) => (
                              <Typography key={i} variant="caption" display="block">
                                Close: {edge.label}
                              </Typography>
                            ))}
                          </Box>
                        }
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <FlowArrow type="close" label="close" />
                          <Typography variant="caption" color="text.secondary">
                            (returns to page)
                          </Typography>
                        </Box>
                      </Tooltip>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        {/* Additional interactions summary */}
        {(flowData.hasTabInteractions || flowData.hasAccordions) && (
          <Box sx={{ ml: 4, mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Additional patterns:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
              {flowData.hasTabInteractions && (
                <Chip
                  label={`${flowData.tabCount} Tab${flowData.tabCount > 1 ? 's' : ''}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 10, height: 20 }}
                />
              )}
              {flowData.hasAccordions && (
                <Chip
                  label={`${flowData.accordionCount} Accordion${flowData.accordionCount > 1 ? 's' : ''}`}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: 10, height: 20 }}
                />
              )}
            </Box>
          </Box>
        )}
      </Box>

      {/* Legend */}
      {!compact && (
        <Box
          sx={{
            mt: 4,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
            display: 'flex',
            gap: 3,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CursorClick size={14} style={{ color: '#667eea' }} />
            <Typography variant="caption" color="text.secondary">
              Click interaction
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Mouse size={14} style={{ color: '#10b981' }} />
            <Typography variant="caption" color="text.secondary">
              Hover interaction
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ArrowsClockwise size={14} style={{ color: '#ef4444' }} />
            <Typography variant="caption" color="text.secondary">
              Close action
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <EyeSlash size={14} />
            <Typography variant="caption" color="text.secondary">
              Initially hidden
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default UserFlowDiagram;
