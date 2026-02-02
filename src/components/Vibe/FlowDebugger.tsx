/**
 * FlowDebugger - Flow execution debugger panel
 *
 * Allows stepping through flows, viewing execution history,
 * and manually triggering flows for testing.
 */

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  Collapse,
  alpha,
  LinearProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Play,
  Pause,
  Stop,
  SkipForward,
  ArrowClockwise,
  CaretDown,
  CaretRight,
  Lightning,
  Timer,
  CheckCircle,
  XCircle,
  Clock,
} from '@phosphor-icons/react';
import type { Flow, FlowStep } from '../../types/implementationScript';

// ============ Types ============

interface FlowDebuggerProps {
  /** Flow definitions */
  flows: Flow[];
  /** Currently active flow */
  activeFlow?: string;
  /** Current step index within active flow */
  currentStep?: number;
  /** Whether a flow is currently executing */
  isExecuting?: boolean;
  /** Execution history */
  history?: ExecutionEvent[];
  /** Callback to start a flow */
  onStartFlow?: (flowName: string) => void;
  /** Callback to pause execution */
  onPause?: () => void;
  /** Callback to resume execution */
  onResume?: () => void;
  /** Callback to step forward */
  onStep?: () => void;
  /** Callback to stop execution */
  onStop?: () => void;
  /** Callback to clear history */
  onClearHistory?: () => void;
}

interface ExecutionEvent {
  id: string;
  timestamp: number;
  type: 'flow_start' | 'flow_end' | 'step_execute' | 'state_change' | 'error';
  flowName?: string;
  step?: FlowStep;
  path?: string;
  value?: unknown;
  error?: string;
  duration?: number;
}

// ============ Helpers ============

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStepDescription(step: FlowStep): string {
  if ('set' in step && step.set) {
    return `Set ${step.set} = ${JSON.stringify(step.to)}`;
  }
  if ('toggle' in step && step.toggle) {
    return `Toggle ${step.toggle}`;
  }
  if ('delay' in step && step.delay) {
    return `Wait ${step.delay}ms${step.label ? ` (${step.label})` : ''}`;
  }
  if ('after' in step && step.after && 'set' in step) {
    return `After ${step.after}ms: Set ${step.set} = ${JSON.stringify(step.to)}`;
  }
  if ('flow' in step && (step as { flow: string }).flow) {
    return `Execute flow: ${(step as { flow: string }).flow}`;
  }
  if ('dispatch' in step && (step as { dispatch: string }).dispatch) {
    return `Dispatch: ${(step as { dispatch: string }).dispatch}`;
  }
  if ('log' in step && (step as { log: string }).log) {
    return `Log: ${(step as { log: string }).log}`;
  }
  return JSON.stringify(step).slice(0, 50);
}

function getEventIcon(type: ExecutionEvent['type']) {
  const iconProps = { size: 16, weight: 'duotone' as const };
  switch (type) {
    case 'flow_start':
      return <Play {...iconProps} color="#22c55e" />;
    case 'flow_end':
      return <CheckCircle {...iconProps} color="#22c55e" />;
    case 'step_execute':
      return <SkipForward {...iconProps} color="#3b82f6" />;
    case 'state_change':
      return <Lightning {...iconProps} color="#f59e0b" />;
    case 'error':
      return <XCircle {...iconProps} color="#ef4444" />;
    default:
      return <Clock {...iconProps} />;
  }
}

// ============ Flow Card Component ============

interface FlowCardProps {
  flow: Flow;
  isActive?: boolean;
  currentStep?: number;
  isExpanded?: boolean;
  onToggle?: () => void;
  onStart?: () => void;
}

function FlowCard({
  flow,
  isActive,
  currentStep,
  isExpanded,
  onToggle,
  onStart,
}: FlowCardProps) {
  return (
    <Box
      sx={{
        borderRadius: 1,
        border: 1,
        borderColor: isActive ? 'primary.main' : 'divider',
        overflow: 'hidden',
        mb: 1,
      }}
    >
      {/* Header */}
      <Box
        onClick={onToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          cursor: 'pointer',
          bgcolor: isActive
            ? (theme) => alpha(theme.palette.primary.main, 0.08)
            : 'transparent',
          '&:hover': {
            bgcolor: (theme) => alpha(theme.palette.action.hover, 0.04),
          },
        }}
      >
        {isExpanded ? (
          <CaretDown size={14} weight="bold" />
        ) : (
          <CaretRight size={14} weight="bold" />
        )}

        <Typography
          variant="body2"
          sx={{
            flex: 1,
            fontWeight: isActive ? 600 : 500,
            color: isActive ? 'primary.main' : 'text.primary',
          }}
        >
          {flow.name}
        </Typography>

        {isActive && (
          <Chip
            label="Active"
            size="small"
            color="primary"
            sx={{ height: 18, fontSize: '0.625rem' }}
          />
        )}

        <Chip
          label={`${flow.steps.length} steps`}
          size="small"
          sx={{ height: 18, fontSize: '0.625rem' }}
        />

        <Tooltip title="Run flow">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onStart?.();
            }}
            disabled={isActive}
          >
            <Play size={14} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Progress bar for active flow */}
      {isActive && typeof currentStep === 'number' && (
        <LinearProgress
          variant="determinate"
          value={((currentStep + 1) / flow.steps.length) * 100}
          sx={{ height: 2 }}
        />
      )}

      {/* Steps */}
      <Collapse in={isExpanded}>
        <Box sx={{ px: 1.5, py: 1, bgcolor: (theme) => alpha(theme.palette.background.default, 0.5) }}>
          {flow.trigger && (
            <Box sx={{ mb: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Trigger: {flow.trigger.event}
                {flow.trigger.selector && ` on "${flow.trigger.selector}"`}
              </Typography>
            </Box>
          )}

          {flow.steps.map((step, index) => (
            <Box
              key={index}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.5,
                px: 1,
                borderRadius: 0.5,
                bgcolor:
                  isActive && currentStep === index
                    ? (theme) => alpha(theme.palette.primary.main, 0.12)
                    : 'transparent',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  width: 20,
                  color: 'text.secondary',
                  fontFamily: 'monospace',
                }}
              >
                {index + 1}.
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  flex: 1,
                  fontFamily: 'monospace',
                  color:
                    isActive && currentStep === index
                      ? 'primary.main'
                      : 'text.primary',
                }}
              >
                {getStepDescription(step)}
              </Typography>
              {isActive && currentStep === index && (
                <Timer size={12} className="animate-pulse" />
              )}
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

// ============ Main Component ============

export function FlowDebugger({
  flows,
  activeFlow,
  currentStep,
  isExecuting,
  history = [],
  onStartFlow,
  onPause,
  onResume,
  onStep,
  onStop,
  onClearHistory,
}: FlowDebuggerProps) {
  const [expandedFlows, setExpandedFlows] = useState<Set<string>>(new Set());
  const [showHistory, setShowHistory] = useState(true);

  const handleToggleFlow = useCallback((flowName: string) => {
    setExpandedFlows((prev) => {
      const next = new Set(prev);
      if (next.has(flowName)) {
        next.delete(flowName);
      } else {
        next.add(flowName);
      }
      return next;
    });
  }, []);

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: 1,
        borderColor: 'divider',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: (theme) => alpha(theme.palette.background.default, 0.5),
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Flow Debugger
        </Typography>

        {/* Execution controls */}
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {isExecuting ? (
            <>
              <Tooltip title="Pause">
                <IconButton size="small" onClick={onPause}>
                  <Pause size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Step">
                <IconButton size="small" onClick={onStep}>
                  <SkipForward size={16} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Stop">
                <IconButton size="small" onClick={onStop} color="error">
                  <Stop size={16} />
                </IconButton>
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Resume">
              <IconButton size="small" onClick={onResume} disabled={!activeFlow}>
                <Play size={16} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {/* Flows section */}
        <Box sx={{ p: 1.5 }}>
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, display: 'block' }}
          >
            FLOWS ({flows.length})
          </Typography>

          {flows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No flows defined
            </Typography>
          ) : (
            flows.map((flow) => (
              <FlowCard
                key={flow.name}
                flow={flow}
                isActive={activeFlow === flow.name}
                currentStep={activeFlow === flow.name ? currentStep : undefined}
                isExpanded={expandedFlows.has(flow.name)}
                onToggle={() => handleToggleFlow(flow.name)}
                onStart={() => onStartFlow?.(flow.name)}
              />
            ))
          )}
        </Box>

        <Divider />

        {/* History section */}
        <Box sx={{ p: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: 'text.secondary', cursor: 'pointer' }}
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory ? <CaretDown size={12} /> : <CaretRight size={12} />}
              {' '}EXECUTION HISTORY ({history.length})
            </Typography>

            {history.length > 0 && (
              <Tooltip title="Clear history">
                <IconButton size="small" onClick={onClearHistory}>
                  <ArrowClockwise size={14} />
                </IconButton>
              </Tooltip>
            )}
          </Box>

          <Collapse in={showHistory}>
            {history.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                No execution history yet
              </Typography>
            ) : (
              <List dense sx={{ py: 0 }}>
                {history.slice().reverse().slice(0, 20).map((event) => (
                  <ListItem
                    key={event.id}
                    sx={{
                      py: 0.5,
                      px: 1,
                      borderRadius: 0.5,
                      '&:hover': {
                        bgcolor: (theme) => alpha(theme.palette.action.hover, 0.04),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 28 }}>
                      {getEventIcon(event.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {event.type === 'flow_start' && `Started: ${event.flowName}`}
                          {event.type === 'flow_end' && `Completed: ${event.flowName}${event.duration ? ` (${formatDuration(event.duration)})` : ''}`}
                          {event.type === 'step_execute' && event.step && getStepDescription(event.step)}
                          {event.type === 'state_change' && `${event.path} = ${JSON.stringify(event.value)}`}
                          {event.type === 'error' && `Error: ${event.error}`}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Collapse>
        </Box>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: (theme) => alpha(theme.palette.background.default, 0.5),
        }}
      >
        <Typography variant="caption" color="text.secondary">
          Click flow to expand • Play button to execute
        </Typography>
      </Box>
    </Box>
  );
}

export default FlowDebugger;
