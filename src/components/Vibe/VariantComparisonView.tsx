/**
 * VariantComparisonView - Grid/split/overlay comparison of generated variants
 */

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Badge from '@mui/material/Badge';
import CircularProgress from '@mui/material/CircularProgress';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import VerticalSplitIcon from '@mui/icons-material/VerticalSplit';
import LayersIcon from '@mui/icons-material/Layers';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CheckIcon from '@mui/icons-material/Check';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import OpenInFullIcon from '@mui/icons-material/OpenInFull';
import CodeIcon from '@mui/icons-material/Code';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { EmptyState } from '@/components';
import { getVibeVariantColor, getVibeVariantLabel, useVibeStore } from '../../store/vibeStore';
import { InteractiveVariantView } from './InteractiveVariantView';
import type { VibeVariant } from '../../services/variantCodeService';
import type { VariantPlan } from '../../services/variantPlanService';

type ComparisonMode = 'grid' | 'split' | 'overlay';

interface VariantComparisonViewProps {
  plans: VariantPlan[];
  variants: VibeVariant[];
  selectedVariantIndex: number | null;
  onSelectVariant: (index: number) => void;
  onPreviewVariant: (index: number) => void;
  comparisonMode: ComparisonMode;
  onChangeMode: (mode: ComparisonMode) => void;
  isGenerating?: boolean;
}

// Variant card for grid view
const VariantGridCard: React.FC<{
  plan: VariantPlan;
  variant?: VibeVariant;
  isSelected: boolean;
  onSelect: () => void;
  onPreview: () => void;
}> = ({ plan, variant, isSelected, onSelect, onPreview }) => {
  const color = getVibeVariantColor(plan.variant_index);
  const label = getVibeVariantLabel(plan.variant_index);
  const isComplete = variant?.status === 'complete';
  const isLoading = variant?.status === 'generating' || variant?.status === 'capturing';

  return (
    <Card
      onClick={isComplete ? onSelect : undefined}
      sx={{
        height: '100%',
        borderColor: isSelected ? color : 'divider',
        borderWidth: isSelected ? 2 : 1,
        borderStyle: 'solid',
        boxShadow: isSelected ? `0 0 12px ${color}40` : undefined,
        cursor: isComplete ? 'pointer' : 'default',
        '&:hover': isComplete ? { boxShadow: 2 } : undefined,
      }}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        {/* Header */}
        <Box sx={{ mb: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Badge
              badgeContent={isSelected ? <EmojiEventsIcon sx={{ fontSize: 12, color: 'warning.main' }} /> : null}
              anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <Chip label={plan.variant_index} size="small" sx={{ bgcolor: color, color: 'white', fontWeight: 600 }} />
            </Badge>
            <Typography variant="body2" fontWeight={600}>{label}</Typography>
          </Box>
          {isComplete && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Tooltip title="Preview in fullscreen">
                <Button
                  size="small"
                  sx={{ minWidth: 'auto', p: 0.5 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreview();
                  }}
                >
                  <OpenInFullIcon fontSize="small" />
                </Button>
              </Tooltip>
              {isSelected && (
                <Chip label="Selected" size="small" color="warning" icon={<CheckIcon />} />
              )}
            </Box>
          )}
        </Box>

        {/* Preview Area */}
        <Box
          sx={{
            bgcolor: 'grey.100',
            borderRadius: 1,
            height: 200,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {isLoading && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'rgba(255,255,255,0.9)',
                zIndex: 1,
              }}
            >
              <CircularProgress />
            </Box>
          )}
          {isComplete && variant?.html_url && (
            <iframe
              src={variant.html_url}
              title={`Variant ${plan.variant_index} preview`}
              style={{
                width: '200%',
                height: '200%',
                border: 'none',
                transform: 'scale(0.5)',
                transformOrigin: 'top left',
                pointerEvents: 'none',
              }}
            />
          )}
          {!isComplete && !isLoading && (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography color="text.secondary">Pending...</Typography>
            </Box>
          )}
        </Box>

        {/* Plan Title */}
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="body2" fontWeight={600}>
            {plan.title}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {plan.description}
          </Typography>
        </Box>

        {/* Duration */}
        {variant?.generation_duration_ms && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              Generated in {(variant.generation_duration_ms / 1000).toFixed(1)}s
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export const VariantComparisonView: React.FC<VariantComparisonViewProps> = ({
  plans,
  variants,
  selectedVariantIndex,
  onSelectVariant,
  onPreviewVariant,
  comparisonMode,
  onChangeMode,
  isGenerating = false,
}) => {
  const [splitPair, setSplitPair] = useState<[number, number]>([1, 2]);

  // Get prototype mode from store
  const prototypeMode = useVibeStore((state) => state.prototypeMode);
  const setPrototypeMode = useVibeStore((state) => state.setPrototypeMode);

  // Build variant map
  const variantMap = new Map(variants.map((v) => [v.variant_index, v]));

  // Sort plans
  const sortedPlans = [...plans].sort((a, b) => a.variant_index - b.variant_index);

  // Check if any variants are complete
  const completedVariants = variants.filter((v) => v.status === 'complete');
  const hasCompleteVariants = completedVariants.length > 0;

  if (!hasCompleteVariants && !isGenerating) {
    return (
      <Card>
        <CardContent>
          <EmptyState title="No variants generated yet" />
        </CardContent>
      </Card>
    );
  }

  // Interactive mode - show new file-based prototype viewer
  if (prototypeMode === 'interactive') {
    return (
      <Box>
        {/* Header with mode toggle */}
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <PlayArrowIcon />
              Interactive Prototypes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {completedVariants.length} of 4 variants ready • Explore with debugging tools
            </Typography>
          </Box>

          <ToggleButtonGroup
            value={prototypeMode}
            exclusive
            onChange={(_, value) => value && setPrototypeMode(value)}
            size="small"
          >
            <ToggleButton value="classic">
              <Tooltip title="Classic View (Grid/Split)">
                <GridViewOutlinedIcon />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="interactive">
              <Tooltip title="Interactive View (with debugging)">
                <CodeIcon />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Interactive Variant View */}
        <Card sx={{ height: 600 }}>
          <InteractiveVariantView
            plans={plans}
            variants={variants}
            selectedVariantIndex={selectedVariantIndex}
            onSelectVariant={onSelectVariant}
          />
        </Card>
      </Box>
    );
  }

  // Classic mode - existing grid/split view
  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <VisibilityOutlinedIcon />
            Compare Variants
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {completedVariants.length} of 4 variants ready • Click to select winner
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          {/* Mode toggle */}
          <ToggleButtonGroup
            value={prototypeMode}
            exclusive
            onChange={(_, value) => value && setPrototypeMode(value)}
            size="small"
          >
            <ToggleButton value="classic">
              <Tooltip title="Classic View (Grid/Split)">
                <GridViewOutlinedIcon />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="interactive">
              <Tooltip title="Interactive View (with debugging)">
                <CodeIcon />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Comparison mode toggle (only in classic mode) */}
          <ToggleButtonGroup
            value={comparisonMode}
            exclusive
            onChange={(_, value) => value && onChangeMode(value as ComparisonMode)}
            size="small"
          >
            <ToggleButton value="grid">
              <Tooltip title="Grid"><GridViewOutlinedIcon /></Tooltip>
            </ToggleButton>
            <ToggleButton value="split">
              <Tooltip title="Split"><VerticalSplitIcon /></Tooltip>
            </ToggleButton>
            <ToggleButton value="overlay" disabled>
              <Tooltip title="Overlay (coming soon)"><LayersIcon /></Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {/* Grid View */}
      {comparisonMode === 'grid' && (
        <Grid container spacing={2}>
          {sortedPlans.map((plan) => (
            <Grid item key={plan.id} xs={12} sm={6} lg={3}>
              <VariantGridCard
                plan={plan}
                variant={variantMap.get(plan.variant_index)}
                isSelected={selectedVariantIndex === plan.variant_index}
                onSelect={() => onSelectVariant(plan.variant_index)}
                onPreview={() => onPreviewVariant(plan.variant_index)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Split View */}
      {comparisonMode === 'split' && (
        <Box>
          {/* Split selector */}
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography color="text.secondary">Compare:</Typography>
            {[1, 2, 3, 4].map((idx) => (
              <Button
                key={idx}
                variant={splitPair.includes(idx) ? 'contained' : 'outlined'}
                size="small"
                onClick={() => {
                  if (splitPair[0] === idx) {
                    setSplitPair([splitPair[1], idx]);
                  } else if (splitPair[1] === idx) {
                    setSplitPair([idx, splitPair[0]]);
                  } else {
                    setSplitPair([splitPair[0], idx]);
                  }
                }}
                sx={{
                  backgroundColor: splitPair.includes(idx) ? getVibeVariantColor(idx) : undefined,
                  borderColor: getVibeVariantColor(idx),
                  '&:hover': {
                    backgroundColor: splitPair.includes(idx) ? getVibeVariantColor(idx) : undefined,
                  },
                }}
              >
                {idx}
              </Button>
            ))}
          </Box>

          {/* Split panels */}
          <Grid container spacing={2}>
            {splitPair.map((idx) => {
              const plan = sortedPlans.find((p) => p.variant_index === idx);
              const variant = variantMap.get(idx);

              if (!plan) return null;

              return (
                <Grid item key={idx} xs={6}>
                  <Card>
                    <CardHeader
                      title={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip label={idx} size="small" sx={{ bgcolor: getVibeVariantColor(idx), color: 'white' }} />
                          <span>{getVibeVariantLabel(idx)}</span>
                        </Box>
                      }
                      action={
                        <Button
                          variant={selectedVariantIndex === idx ? 'contained' : 'outlined'}
                          size="small"
                          startIcon={selectedVariantIndex === idx ? <CheckIcon /> : null}
                          onClick={() => onSelectVariant(idx)}
                        >
                          {selectedVariantIndex === idx ? 'Selected' : 'Select'}
                        </Button>
                      }
                      sx={{ pb: 0 }}
                    />
                    <CardContent sx={{ p: 0, height: 400, '&:last-child': { pb: 0 } }}>
                      {variant?.status === 'complete' && variant.html_url ? (
                        <iframe
                          src={variant.html_url}
                          title={`Variant ${idx} preview`}
                          style={{ width: '100%', height: '100%', border: 'none' }}
                        />
                      ) : (
                        <Box
                          sx={{
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <CircularProgress />
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default VariantComparisonView;
