/**
 * StateInspector - Real-time state visualization panel
 *
 * Displays the current state of a prototype with live updates,
 * allowing debugging and manual state manipulation.
 */

import { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Tooltip,
  Chip,
  Collapse,
  alpha,
} from '@mui/material';
import {
  Eye,
  EyeSlash,
  ArrowClockwise,
  CaretDown,
  CaretRight,
  PencilSimple,
  Check,
  X,
} from '@phosphor-icons/react';

// ============ Types ============

interface StateInspectorProps {
  /** Current state object */
  state: Record<string, unknown>;
  /** Callback when state is changed manually */
  onStateChange?: (path: string, value: unknown) => void;
  /** Callback to reset state */
  onReset?: () => void;
  /** Whether to allow editing */
  editable?: boolean;
  /** Title for the panel */
  title?: string;
  /** Compact mode */
  compact?: boolean;
}

interface StateNodeProps {
  name: string;
  path: string;
  value: unknown;
  depth: number;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onEdit?: (path: string, value: unknown) => void;
  editable?: boolean;
  compact?: boolean;
}

// ============ Helpers ============

function getValueType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    string: '#22c55e',
    number: '#3b82f6',
    boolean: '#f59e0b',
    null: '#6b7280',
    undefined: '#6b7280',
    object: '#8b5cf6',
    array: '#ec4899',
  };
  return colors[type] || '#6b7280';
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return `Object(${Object.keys(value as object).length})`;
  return String(value);
}

// ============ State Node Component ============

function StateNode({
  name,
  path,
  value,
  depth,
  expanded,
  onToggle,
  onEdit,
  editable,
  compact,
}: StateNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const type = getValueType(value);
  const isExpandable = type === 'object' || type === 'array';
  const isExpanded = expanded.has(path);
  const indent = depth * (compact ? 12 : 16);

  const handleStartEdit = () => {
    if (!editable) return;
    setEditValue(type === 'string' ? String(value) : JSON.stringify(value));
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!onEdit) return;

    let newValue: unknown;
    try {
      // Try to parse as JSON first
      newValue = JSON.parse(editValue);
    } catch {
      // If not valid JSON, treat as string
      newValue = editValue;
    }

    onEdit(path, newValue);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleToggle = () => {
    if (isExpandable) {
      onToggle(path);
    }
  };

  const renderValue = () => {
    if (isEditing) {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
          <TextField
            size="small"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSaveEdit();
              if (e.key === 'Escape') handleCancelEdit();
            }}
            autoFocus
            sx={{
              flex: 1,
              '& .MuiInputBase-input': {
                py: 0.5,
                px: 1,
                fontSize: '0.75rem',
                fontFamily: 'monospace',
              },
            }}
          />
          <IconButton size="small" onClick={handleSaveEdit} color="success">
            <Check size={14} />
          </IconButton>
          <IconButton size="small" onClick={handleCancelEdit}>
            <X size={14} />
          </IconButton>
        </Box>
      );
    }

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          flex: 1,
          minWidth: 0,
        }}
      >
        <Typography
          variant="body2"
          sx={{
            fontFamily: 'monospace',
            fontSize: compact ? '0.75rem' : '0.8125rem',
            color: getTypeColor(type),
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {formatValue(value)}
        </Typography>

        {editable && !isExpandable && (
          <Tooltip title="Edit value">
            <IconButton
              size="small"
              onClick={handleStartEdit}
              sx={{ opacity: 0, '.state-node:hover &': { opacity: 1 } }}
            >
              <PencilSimple size={12} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    );
  };

  return (
    <>
      <Box
        className="state-node"
        onClick={handleToggle}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: compact ? 0.25 : 0.5,
          pl: `${indent + 8}px`,
          cursor: isExpandable ? 'pointer' : 'default',
          borderRadius: 0.5,
          '&:hover': {
            bgcolor: (theme) => alpha(theme.palette.action.hover, 0.04),
          },
        }}
      >
        {/* Expand/collapse icon */}
        {isExpandable ? (
          <Box sx={{ width: 14, display: 'flex', justifyContent: 'center' }}>
            {isExpanded ? (
              <CaretDown size={12} weight="bold" />
            ) : (
              <CaretRight size={12} weight="bold" />
            )}
          </Box>
        ) : (
          <Box sx={{ width: 14 }} />
        )}

        {/* Key name */}
        <Typography
          variant="body2"
          sx={{
            fontFamily: 'monospace',
            fontSize: compact ? '0.75rem' : '0.8125rem',
            color: 'text.primary',
            fontWeight: 500,
            flexShrink: 0,
          }}
        >
          {name}:
        </Typography>

        {/* Value */}
        {renderValue()}

        {/* Type badge */}
        <Chip
          label={type}
          size="small"
          sx={{
            height: 16,
            fontSize: '0.625rem',
            fontFamily: 'monospace',
            bgcolor: alpha(getTypeColor(type), 0.1),
            color: getTypeColor(type),
            flexShrink: 0,
          }}
        />
      </Box>

      {/* Children */}
      {isExpandable && isExpanded && (
        <Collapse in>
          {type === 'array' ? (
            (value as unknown[]).map((item, index) => (
              <StateNode
                key={`${path}[${index}]`}
                name={`[${index}]`}
                path={`${path}[${index}]`}
                value={item}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onEdit={onEdit}
                editable={editable}
                compact={compact}
              />
            ))
          ) : (
            Object.entries(value as Record<string, unknown>).map(([key, val]) => (
              <StateNode
                key={`${path}.${key}`}
                name={key}
                path={path ? `${path}.${key}` : key}
                value={val}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onEdit={onEdit}
                editable={editable}
                compact={compact}
              />
            ))
          )}
        </Collapse>
      )}
    </>
  );
}

// ============ Main Component ============

export function StateInspector({
  state,
  onStateChange,
  onReset,
  editable = false,
  title = 'State',
  compact = false,
}: StateInspectorProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [showAll, setShowAll] = useState(true);

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleExpandAll = () => {
    const allPaths = new Set<string>(['']);
    const collectPaths = (obj: unknown, prefix: string) => {
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj)) {
          obj.forEach((_, i) => {
            const path = `${prefix}[${i}]`;
            allPaths.add(path);
            collectPaths(obj[i], path);
          });
        } else {
          Object.keys(obj as Record<string, unknown>).forEach((key) => {
            const path = prefix ? `${prefix}.${key}` : key;
            allPaths.add(path);
            collectPaths((obj as Record<string, unknown>)[key], path);
          });
        }
      }
    };
    collectPaths(state, '');
    setExpanded(allPaths);
  };

  const handleCollapseAll = () => {
    setExpanded(new Set(['']));
  };

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {title}
          </Typography>
          <Chip
            label="Live"
            size="small"
            color="success"
            sx={{ height: 18, fontSize: '0.625rem' }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title={showAll ? 'Hide empty values' : 'Show all values'}>
            <IconButton size="small" onClick={() => setShowAll(!showAll)}>
              {showAll ? <Eye size={16} /> : <EyeSlash size={16} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Expand all">
            <IconButton size="small" onClick={handleExpandAll}>
              <CaretDown size={16} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Collapse all">
            <IconButton size="small" onClick={handleCollapseAll}>
              <CaretRight size={16} />
            </IconButton>
          </Tooltip>
          {onReset && (
            <Tooltip title="Reset state">
              <IconButton size="small" onClick={onReset} color="warning">
                <ArrowClockwise size={16} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* State tree */}
      <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
        {Object.keys(state).length === 0 ? (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No state defined
            </Typography>
          </Box>
        ) : (
          Object.entries(state).map(([key, value]) => (
            <StateNode
              key={key}
              name={key}
              path={key}
              value={value}
              depth={0}
              expanded={expanded}
              onToggle={handleToggle}
              onEdit={onStateChange}
              editable={editable}
              compact={compact}
            />
          ))
        )}
      </Box>

      {/* Footer */}
      {editable && (
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
            Click values to edit • Changes update preview in real-time
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default StateInspector;
