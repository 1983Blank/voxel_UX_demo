/**
 * ModificationList - Display and edit a list of modifications
 *
 * Shows each modification with its tool, selector, and parameters,
 * allowing users to edit, reorder, and delete modifications.
 */

import { useCallback, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Collapse,
  Paper,
  alpha,
  Chip,
} from '@mui/material';
import {
  Trash,
  CaretUp,
  CaretDown,
  CaretRight,
  PencilSimple,
  Code,
  Target,
} from '@phosphor-icons/react';
import type { Modification, InsertPosition } from '@/types/toolSchema';

// ============ Types ============

interface ModificationListProps {
  /** List of modifications */
  modifications: Modification[];
  /** Callback when modifications change */
  onChange: (modifications: Modification[]) => void;
}

interface ModificationItemProps {
  modification: Modification;
  index: number;
  onUpdate: (mod: Modification) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

// ============ Tool Categories ============

const TOOL_OPTIONS = [
  { group: 'Text & Content', tools: ['update_text', 'update_html'] },
  { group: 'Attributes', tools: ['update_attribute', 'remove_attribute'] },
  { group: 'Classes', tools: ['add_class', 'remove_class', 'replace_class'] },
  { group: 'Elements', tools: ['remove_element', 'add_element', 'wrap_element', 'clone_element'] },
  { group: 'Visibility', tools: ['hide_element', 'show_element'] },
  { group: 'Styles', tools: ['set_style', 'apply_style'] },
  { group: 'Navigation', tools: ['add_navigation', 'add_back_navigation'] },
];

const POSITION_OPTIONS: InsertPosition[] = ['before', 'after', 'prepend', 'append', 'replace'];

// ============ Tool Icon ============

function getToolIcon(tool: string): React.ReactElement {
  if (tool.startsWith('update_')) return <PencilSimple size={14} />;
  if (tool.startsWith('add_') || tool.startsWith('insert_')) return <Code size={14} />;
  if (tool.startsWith('remove_')) return <Trash size={14} />;
  if (tool.startsWith('apply_')) return <Target size={14} />;
  return <Code size={14} />;
}

// ============ Modification Item ============

function ModificationItem({
  modification,
  index,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: ModificationItemProps) {
  const [expanded, setExpanded] = useState(false);

  const handleToolChange = useCallback((tool: string) => {
    onUpdate({ ...modification, tool });
  }, [modification, onUpdate]);

  const handleSelectorChange = useCallback((selector: string) => {
    onUpdate({ ...modification, selector });
  }, [modification, onUpdate]);

  const handlePositionChange = useCallback((position: InsertPosition) => {
    onUpdate({ ...modification, position });
  }, [modification, onUpdate]);

  const handleParamChange = useCallback((key: string, value: unknown) => {
    onUpdate({
      ...modification,
      params: { ...modification.params, [key]: value },
    });
  }, [modification, onUpdate]);

  // Determine which params to show based on tool
  const showPosition = modification.tool.startsWith('add_') ||
    modification.tool.startsWith('insert_') ||
    modification.tool === 'clone_element';

  return (
    <Paper
      elevation={0}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        mb: 1,
      }}
    >
      {/* Header */}
      <Box
        onClick={() => setExpanded(!expanded)}
        sx={{
          px: 1.5,
          py: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: 'pointer',
          bgcolor: theme => alpha(theme.palette.background.default, 0.3),
          '&:hover': {
            bgcolor: theme => alpha(theme.palette.background.default, 0.6),
          },
        }}
      >
        <IconButton size="small" sx={{ p: 0.25 }}>
          {expanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
        </IconButton>

        <Typography variant="caption" color="text.secondary" sx={{ width: 24 }}>
          #{index + 1}
        </Typography>

        <Chip
          icon={getToolIcon(modification.tool)}
          label={modification.tool}
          size="small"
          sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
        />

        {modification.selector && (
          <Typography
            variant="caption"
            fontFamily="monospace"
            color="text.secondary"
            sx={{
              maxWidth: 200,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {modification.selector}
          </Typography>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Move buttons */}
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
          disabled={!canMoveUp}
          sx={{ p: 0.25 }}
        >
          <CaretUp size={14} />
        </IconButton>
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
          disabled={!canMoveDown}
          sx={{ p: 0.25 }}
        >
          <CaretDown size={14} />
        </IconButton>

        {/* Delete button */}
        <IconButton
          size="small"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          color="error"
          sx={{ p: 0.25 }}
        >
          <Trash size={14} />
        </IconButton>
      </Box>

      {/* Expanded content */}
      <Collapse in={expanded}>
        <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {/* Tool selector */}
          <FormControl size="small" fullWidth>
            <InputLabel>Tool</InputLabel>
            <Select
              value={modification.tool}
              onChange={(e) => handleToolChange(e.target.value)}
              label="Tool"
            >
              {TOOL_OPTIONS.map(group => [
                <MenuItem key={`header-${group.group}`} disabled sx={{ fontWeight: 600, fontSize: '0.75rem' }}>
                  {group.group}
                </MenuItem>,
                ...group.tools.map(tool => (
                  <MenuItem key={tool} value={tool} sx={{ pl: 3, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {tool}
                  </MenuItem>
                )),
              ])}
            </Select>
          </FormControl>

          {/* Selector */}
          <TextField
            size="small"
            label="CSS Selector"
            value={modification.selector || ''}
            onChange={(e) => handleSelectorChange(e.target.value)}
            placeholder=".class, #id, tag"
            fullWidth
            InputProps={{
              sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
            }}
          />

          {/* Position (for insertion tools) */}
          {showPosition && (
            <FormControl size="small" fullWidth>
              <InputLabel>Position</InputLabel>
              <Select
                value={modification.position || 'append'}
                onChange={(e) => handlePositionChange(e.target.value as InsertPosition)}
                label="Position"
              >
                {POSITION_OPTIONS.map(pos => (
                  <MenuItem key={pos} value={pos}>
                    {pos}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Tool-specific params */}
          {modification.tool === 'update_text' && (
            <TextField
              size="small"
              label="Text Content"
              value={(modification.params.text as string) || ''}
              onChange={(e) => handleParamChange('text', e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          )}

          {modification.tool === 'update_html' && (
            <TextField
              size="small"
              label="HTML Content"
              value={(modification.params.html as string) || ''}
              onChange={(e) => handleParamChange('html', e.target.value)}
              fullWidth
              multiline
              minRows={3}
              InputProps={{
                sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
              }}
            />
          )}

          {modification.tool === 'add_element' && (
            <TextField
              size="small"
              label="HTML to Insert"
              value={(modification.params.html as string) || ''}
              onChange={(e) => handleParamChange('html', e.target.value)}
              fullWidth
              multiline
              minRows={3}
              InputProps={{
                sx: { fontFamily: 'monospace', fontSize: '0.85rem' },
              }}
            />
          )}

          {modification.tool === 'update_attribute' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                label="Attribute"
                value={(modification.params.attribute as string) || ''}
                onChange={(e) => handleParamChange('attribute', e.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Value"
                value={(modification.params.value as string) || ''}
                onChange={(e) => handleParamChange('value', e.target.value)}
                sx={{ flex: 2 }}
              />
            </Box>
          )}

          {(modification.tool === 'add_class' || modification.tool === 'remove_class') && (
            <TextField
              size="small"
              label="CSS Classes"
              value={(modification.params.classes as string) || ''}
              onChange={(e) => handleParamChange('classes', e.target.value)}
              placeholder="class1 class2 class3"
              fullWidth
            />
          )}

          {modification.tool === 'replace_class' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                label="Old Class"
                value={(modification.params.oldClass as string) || ''}
                onChange={(e) => handleParamChange('oldClass', e.target.value)}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="New Class"
                value={(modification.params.newClass as string) || ''}
                onChange={(e) => handleParamChange('newClass', e.target.value)}
                sx={{ flex: 1 }}
              />
            </Box>
          )}

          {modification.tool === 'add_navigation' && (
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                size="small"
                label="Target Screen"
                value={(modification.params.targetScreen as string) || ''}
                onChange={(e) => handleParamChange('targetScreen', e.target.value)}
                sx={{ flex: 1 }}
              />
              <FormControl size="small" sx={{ minWidth: 120 }}>
                <InputLabel>Transition</InputLabel>
                <Select
                  value={(modification.params.transition as string) || 'instant'}
                  onChange={(e) => handleParamChange('transition', e.target.value)}
                  label="Transition"
                >
                  <MenuItem value="instant">Instant</MenuItem>
                  <MenuItem value="fade">Fade</MenuItem>
                  <MenuItem value="slide-left">Slide Left</MenuItem>
                  <MenuItem value="slide-right">Slide Right</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}

          {/* Generic JSON editor for complex params */}
          {Object.keys(modification.params).length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                All Parameters (JSON)
              </Typography>
              <TextField
                size="small"
                value={JSON.stringify(modification.params, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    onUpdate({ ...modification, params: parsed });
                  } catch {
                    // Invalid JSON, don't update
                  }
                }}
                fullWidth
                multiline
                minRows={2}
                InputProps={{
                  sx: { fontFamily: 'monospace', fontSize: '0.75rem' },
                }}
              />
            </Box>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
}

// ============ Main Component ============

export function ModificationList({ modifications, onChange }: ModificationListProps) {
  const handleUpdate = useCallback((index: number, mod: Modification) => {
    const newMods = [...modifications];
    newMods[index] = mod;
    onChange(newMods);
  }, [modifications, onChange]);

  const handleDelete = useCallback((index: number) => {
    const newMods = modifications.filter((_, i) => i !== index);
    onChange(newMods);
  }, [modifications, onChange]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    const newMods = [...modifications];
    [newMods[index - 1], newMods[index]] = [newMods[index], newMods[index - 1]];
    onChange(newMods);
  }, [modifications, onChange]);

  const handleMoveDown = useCallback((index: number) => {
    if (index === modifications.length - 1) return;
    const newMods = [...modifications];
    [newMods[index], newMods[index + 1]] = [newMods[index + 1], newMods[index]];
    onChange(newMods);
  }, [modifications, onChange]);

  if (modifications.length === 0) {
    return (
      <Box
        sx={{
          py: 4,
          textAlign: 'center',
          color: 'text.secondary',
        }}
      >
        <Typography variant="body2">
          No modifications yet
        </Typography>
        <Typography variant="caption">
          Add modifications to change the source DOM
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {modifications.map((mod, index) => (
        <ModificationItem
          key={index}
          modification={mod}
          index={index}
          onUpdate={(updated) => handleUpdate(index, updated)}
          onDelete={() => handleDelete(index)}
          onMoveUp={() => handleMoveUp(index)}
          onMoveDown={() => handleMoveDown(index)}
          canMoveUp={index > 0}
          canMoveDown={index < modifications.length - 1}
        />
      ))}
    </Box>
  );
}

export default ModificationList;
