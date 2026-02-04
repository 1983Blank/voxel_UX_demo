/**
 * SpecEditor - Edit modification specifications directly
 *
 * Allows users to view and edit the modification instructions
 * that define how a prototype differs from its source.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Button,
  Paper,
  Chip,
  alpha,
  Divider,
} from '@mui/material';
import {
  ArrowsClockwise,
  Plus,
  X,
  TreeStructure,
  ArrowBendUpRight,
} from '@phosphor-icons/react';
import type {
  ModificationSpec,
  ScreenModification,
  Modification,
} from '@/types/toolSchema';
import { ModificationList } from './ModificationList';

// ============ Types ============

interface SpecEditorProps {
  /** The specification to edit */
  spec: ModificationSpec;
  /** Callback when spec is modified */
  onChange: (spec: ModificationSpec) => void;
  /** Callback to regenerate from edited spec */
  onRegenerate: () => void;
  /** Callback to close the editor */
  onClose?: () => void;
  /** Whether regeneration is in progress */
  regenerating?: boolean;
  /** Height of the component */
  height?: number | string;
}

// ============ Screen Tab ============

interface ScreenTabProps {
  screen: ScreenModification;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function ScreenTab({ screen, isSelected, onSelect, onDelete, canDelete }: ScreenTabProps) {
  return (
    <Box
      onClick={onSelect}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.5,
        py: 0.75,
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: isSelected ? 'primary.main' : 'transparent',
        color: isSelected ? 'primary.contrastText' : 'text.primary',
        '&:hover': {
          bgcolor: isSelected ? 'primary.main' : theme => alpha(theme.palette.primary.main, 0.08),
        },
        transition: 'all 0.15s ease',
      }}
    >
      <Typography variant="body2" fontWeight={isSelected ? 600 : 400}>
        {screen.screenId}
      </Typography>
      <Chip
        label={screen.modifications.length}
        size="small"
        sx={{
          height: 18,
          fontSize: '0.65rem',
          bgcolor: isSelected ? 'primary.dark' : 'action.hover',
          color: isSelected ? 'primary.contrastText' : 'text.secondary',
        }}
      />
      {canDelete && (
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          sx={{
            p: 0.25,
            ml: 0.5,
            opacity: 0.6,
            '&:hover': { opacity: 1 },
          }}
        >
          <X size={14} />
        </IconButton>
      )}
    </Box>
  );
}

// ============ Stats Display ============

interface SpecStatsProps {
  spec: ModificationSpec;
}

function SpecStats({ spec }: SpecStatsProps) {
  const stats = useMemo(() => {
    let totalMods = 0;
    const toolCounts: Record<string, number> = {};

    for (const screen of spec.screens) {
      totalMods += screen.modifications.length;
      for (const mod of screen.modifications) {
        toolCounts[mod.tool] = (toolCounts[mod.tool] || 0) + 1;
      }
    }

    const topTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      screens: spec.screens.length,
      totalMods,
      hasNavigation: !!spec.navigation?.routes?.length,
      topTools,
    };
  }, [spec]);

  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      <Chip
        icon={<TreeStructure size={14} />}
        label={`${stats.screens} screen${stats.screens !== 1 ? 's' : ''}`}
        size="small"
      />
      <Chip
        label={`${stats.totalMods} modification${stats.totalMods !== 1 ? 's' : ''}`}
        size="small"
      />
      {stats.hasNavigation && (
        <Chip
          icon={<ArrowBendUpRight size={14} />}
          label="Navigation"
          size="small"
          color="primary"
          variant="outlined"
        />
      )}
    </Box>
  );
}

// ============ Main Component ============

export function SpecEditor({
  spec,
  onChange,
  onRegenerate,
  onClose,
  regenerating = false,
  height = 500,
}: SpecEditorProps) {
  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);

  // Current screen
  const currentScreen = spec.screens[currentScreenIndex];

  // Add a new screen
  const handleAddScreen = useCallback(() => {
    const newScreenId = `screen-${spec.screens.length + 1}`;
    const newScreen: ScreenModification = {
      screenId: newScreenId,
      modifications: [],
    };

    onChange({
      ...spec,
      screens: [...spec.screens, newScreen],
    });

    setCurrentScreenIndex(spec.screens.length);
  }, [spec, onChange]);

  // Delete a screen
  const handleDeleteScreen = useCallback((index: number) => {
    if (spec.screens.length <= 1) return;

    const newScreens = spec.screens.filter((_, i) => i !== index);
    onChange({
      ...spec,
      screens: newScreens,
    });

    if (currentScreenIndex >= newScreens.length) {
      setCurrentScreenIndex(newScreens.length - 1);
    }
  }, [spec, onChange, currentScreenIndex]);

  // Update modifications for current screen
  const handleModificationsChange = useCallback((modifications: Modification[]) => {
    const newScreens = [...spec.screens];
    newScreens[currentScreenIndex] = {
      ...newScreens[currentScreenIndex],
      modifications,
    };

    onChange({
      ...spec,
      screens: newScreens,
    });
  }, [spec, currentScreenIndex, onChange]);

  // Add a new modification
  const handleAddModification = useCallback(() => {
    const newMod: Modification = {
      tool: 'update_text',
      selector: '',
      params: { text: '' },
    };

    handleModificationsChange([
      ...currentScreen.modifications,
      newMod,
    ]);
  }, [currentScreen, handleModificationsChange]);

  return (
    <Paper
      elevation={0}
      sx={{
        height,
        display: 'flex',
        flexDirection: 'column',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          bgcolor: theme => alpha(theme.palette.background.default, 0.5),
        }}
      >
        <Typography variant="subtitle1" fontWeight={600}>
          Modification Spec
        </Typography>

        <Box sx={{ flex: 1 }} />

        <Button
          variant="contained"
          size="small"
          startIcon={<ArrowsClockwise size={16} weight={regenerating ? 'fill' : 'regular'} />}
          onClick={onRegenerate}
          disabled={regenerating}
          sx={{
            animation: regenerating ? 'spin 1s linear infinite' : 'none',
            '@keyframes spin': {
              '0%': { transform: 'rotate(0deg)' },
              '100%': { transform: 'rotate(360deg)' },
            },
          }}
        >
          {regenerating ? 'Regenerating...' : 'Apply Changes'}
        </Button>

        {onClose && (
          <IconButton size="small" onClick={onClose}>
            <X size={18} />
          </IconButton>
        )}
      </Box>

      {/* Stats */}
      <Box sx={{ px: 2, pt: 2 }}>
        <SpecStats spec={spec} />
      </Box>

      {/* Screen Tabs */}
      <Box
        sx={{
          px: 2,
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          overflowX: 'auto',
        }}
      >
        {spec.screens.map((screen, index) => (
          <ScreenTab
            key={screen.screenId}
            screen={screen}
            isSelected={index === currentScreenIndex}
            onSelect={() => setCurrentScreenIndex(index)}
            onDelete={() => handleDeleteScreen(index)}
            canDelete={spec.screens.length > 1}
          />
        ))}
        <Tooltip title="Add new screen">
          <IconButton size="small" onClick={handleAddScreen}>
            <Plus size={18} />
          </IconButton>
        </Tooltip>
      </Box>

      <Divider />

      {/* Modifications List */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {currentScreen && (
          <ModificationList
            modifications={currentScreen.modifications}
            onChange={handleModificationsChange}
          />
        )}

        {/* Add Modification Button */}
        <Button
          variant="outlined"
          size="small"
          startIcon={<Plus size={16} />}
          onClick={handleAddModification}
          sx={{ mt: 2 }}
        >
          Add Modification
        </Button>
      </Box>

      {/* Footer with JSON preview */}
      <Box
        sx={{
          px: 2,
          py: 1,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: theme => alpha(theme.palette.background.default, 0.5),
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {spec.metadata?.generatedAt
            ? `Generated: ${new Date(spec.metadata.generatedAt).toLocaleString()}`
            : 'Not yet generated'}
        </Typography>
      </Box>
    </Paper>
  );
}

export default SpecEditor;
