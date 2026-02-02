/**
 * BatchSelectionBar - Floating action bar for batch selection operations
 * Appears at the bottom of the screen when items are selected
 */

import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Slide from '@mui/material/Slide';
import Tooltip from '@mui/material/Tooltip';
import { X } from '@phosphor-icons/react';
import { Button } from '@/components/ui';

export interface BatchAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  color?: 'primary' | 'error' | 'success' | 'warning' | 'inherit';
  disabled?: boolean;
  tooltip?: string;
}

export interface BatchSelectionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  actions: BatchAction[];
}

export const BatchSelectionBar: React.FC<BatchSelectionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  actions,
}) => {
  const allSelected = selectedCount === totalCount && totalCount > 0;
  const someSelected = selectedCount > 0 && selectedCount < totalCount;
  const isVisible = selectedCount > 0;

  return (
    <Slide direction="up" in={isVisible} mountOnEnter unmountOnExit>
      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1200,
          borderRadius: 3,
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          backdropFilter: 'blur(12px)',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          border: '1px solid',
          borderColor: 'divider',
          minWidth: 400,
          maxWidth: '90vw',
        }}
      >
        {/* Select All Checkbox */}
        <Tooltip title={allSelected ? 'Deselect all' : 'Select all'}>
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onChange={onSelectAll}
            sx={{
              p: 0.5,
              '&.Mui-checked, &.MuiCheckbox-indeterminate': {
                color: 'primary.main',
              },
            }}
          />
        </Tooltip>

        {/* Selection count */}
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            color: 'text.primary',
            minWidth: 100,
          }}
        >
          {selectedCount} selected
        </Typography>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Action buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
          {actions.map((action, index) => (
            <Tooltip key={index} title={action.tooltip || action.label}>
              <span>
                <Button
                  size="small"
                  variant="text"
                  color={action.color || 'inherit'}
                  startIcon={action.icon}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    '&:hover': {
                      backgroundColor: action.color === 'error'
                        ? 'error.50'
                        : action.color === 'success'
                        ? 'success.50'
                        : action.color === 'warning'
                        ? 'warning.50'
                        : 'action.hover',
                    },
                  }}
                >
                  {action.label}
                </Button>
              </span>
            </Tooltip>
          ))}
        </Box>

        {/* Close button */}
        <Tooltip title="Clear selection">
          <IconButton
            size="small"
            onClick={onClearSelection}
            sx={{
              ml: 1,
              color: 'text.secondary',
              '&:hover': {
                backgroundColor: 'action.hover',
                color: 'text.primary',
              },
            }}
          >
            <X size={18} weight="bold" />
          </IconButton>
        </Tooltip>
      </Paper>
    </Slide>
  );
};

export default BatchSelectionBar;
