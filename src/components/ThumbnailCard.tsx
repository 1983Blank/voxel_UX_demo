/**
 * ThumbnailCard - Unified card component for Screens and Prototypes
 * Provides consistent styling, animations, and responsive behavior
 */

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Checkbox from '@mui/material/Checkbox';
import Fade from '@mui/material/Fade';
import { DotsThreeVertical, Sparkle } from '@phosphor-icons/react';
import { useThemeStore } from '@/store/themeStore';

export interface ThumbnailCardProps {
  /** Unique identifier */
  id: string;
  /** Card title */
  title: string;
  /** Optional subtitle (e.g., date) */
  subtitle?: string;
  /** Optional secondary info (e.g., "4 variants · 234 views") */
  secondaryInfo?: string;
  /** Optional status chip */
  status?: {
    label: string;
    color?: 'default' | 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
  };
  /** Optional tags */
  tags?: string[];
  /** Preview content - either HTML content or a URL */
  preview?: {
    type: 'html' | 'url' | 'placeholder';
    content?: string;
  };
  /** Selection mode */
  isSelectionMode?: boolean;
  /** Is this card selected */
  isSelected?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Selection toggle handler */
  onSelect?: () => void;
  /** Menu click handler */
  onMenuClick?: (event: React.MouseEvent<HTMLElement>) => void;
  /** Primary action button */
  primaryAction?: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
  };
}

export const ThumbnailCard: React.FC<ThumbnailCardProps> = ({
  title,
  subtitle,
  secondaryInfo,
  status,
  tags,
  preview,
  // isSelectionMode is kept for backwards compatibility but no longer used
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isSelectionMode: _isSelectionMode = false,
  isSelected = false,
  onClick,
  onSelect,
  onMenuClick,
  primaryAction,
}) => {
  const { config, mode } = useThemeStore();
  const [isHovered, setIsHovered] = useState(false);

  // Show checkbox on hover or when selected (no explicit selection mode needed)
  const showCheckbox = isHovered || isSelected;

  const handleCardClick = () => {
    // If checkbox is showing and user clicks, treat as selection toggle
    if (showCheckbox && onSelect && !primaryAction) {
      onSelect();
    } else if (onClick) {
      onClick();
    }
  };

  const renderPreview = () => {
    if (!preview || preview.type === 'placeholder') {
      return (
        <Sparkle
          size={32}
          weight="duotone"
          color={mode === 'modern' ? 'rgba(255,255,255,0.6)' : config.colors.primary}
          style={{ opacity: 0.7 }}
        />
      );
    }

    if (preview.type === 'html' && preview.content) {
      return (
        <iframe
          srcDoc={preview.content}
          style={{
            width: '200%',
            height: '200%',
            transform: 'scale(0.5)',
            transformOrigin: 'top left',
            pointerEvents: 'none',
            border: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
          title={title}
        />
      );
    }

    if (preview.type === 'url' && preview.content) {
      return (
        <iframe
          src={preview.content}
          style={{
            width: '200%',
            height: '200%',
            transform: 'scale(0.5)',
            transformOrigin: 'top left',
            pointerEvents: 'none',
            border: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
          title={title}
        />
      );
    }

    return null;
  };

  const secondaryColor = config.colors.secondary || config.colors.primary;

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        border: isSelected ? '2px solid' : '1px solid',
        borderColor: isSelected ? 'primary.main' : 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        cursor: onClick ? 'pointer' : 'default',
        backgroundColor: isSelected ? 'primary.50' : 'background.paper',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
          borderColor: isSelected ? 'primary.main' : config.colors.primary,
        },
        '&:active': {
          transform: 'translateY(-2px)',
        },
      }}
    >
      {/* Thumbnail Area */}
      <Box
        onClick={handleCardClick}
        sx={{
          height: 160,
          background: mode === 'modern' && config.gradients
            ? `linear-gradient(135deg, ${config.colors.primary}20 0%, ${secondaryColor}40 100%)`
            : `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {renderPreview()}

        {/* Status chip */}
        {status && (
          <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 5 }}>
            <Chip
              label={status.label}
              size="small"
              color={status.color || 'default'}
              sx={{
                fontSize: '0.7rem',
                height: 22,
                transition: 'transform 0.2s ease',
                '&:hover': { transform: 'scale(1.05)' },
              }}
            />
          </Box>
        )}

        {/* Selection checkbox - visible on hover or when selected */}
        {onSelect && (
          <Fade in={showCheckbox} timeout={200}>
            <Box
              sx={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
            >
              <Checkbox
                checked={isSelected}
                sx={{
                  color: 'white',
                  '&.Mui-checked': { color: 'white' },
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  borderRadius: 1,
                  transition: 'all 0.2s ease',
                  '&:hover': { backgroundColor: 'rgba(0,0,0,0.5)' },
                }}
              />
            </Box>
          </Fade>
        )}

        {/* Hover overlay with action */}
        {primaryAction && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              opacity: 0,
              transition: 'opacity 0.25s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              '&:hover': { opacity: 1 },
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                transform: 'translateY(10px)',
                transition: 'transform 0.25s ease',
                '.MuiCard-root:hover &': { transform: 'translateY(0)' },
              }}
            >
              {primaryAction.icon}
              <Typography variant="caption" sx={{ color: 'white', fontWeight: 500 }}>
                {primaryAction.label}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>

      {/* Card Content - Compact styling */}
      <CardContent
        sx={{
          flex: 1,
          p: 1.5,
          '&:last-child': { pb: 1.5 },
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle2"
              noWrap
              sx={{
                fontWeight: 600,
                fontSize: '0.875rem',
                lineHeight: 1.3,
                mb: 0.25,
              }}
            >
              {title}
            </Typography>
          </Box>
          {onMenuClick && (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onMenuClick(e);
              }}
              sx={{
                p: 0.5,
                ml: 1,
                color: config.colors.textSecondary,
                opacity: 0.6,
                transition: 'all 0.2s ease',
                '&:hover': { opacity: 1, backgroundColor: 'action.hover' },
              }}
            >
              <DotsThreeVertical size={18} />
            </IconButton>
          )}
        </Box>

        {secondaryInfo && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.75rem', mb: 0.25 }}
          >
            {secondaryInfo}
          </Typography>
        )}

        {subtitle && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: '0.75rem' }}
          >
            {subtitle}
          </Typography>
        )}

        {/* Tags */}
        {tags && tags.length > 0 && (
          <Box
            sx={{
              mt: 'auto',
              pt: 1,
              display: 'flex',
              gap: 0.5,
              flexWrap: 'wrap',
            }}
          >
            {tags.slice(0, 3).map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                variant="outlined"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  transition: 'all 0.2s ease',
                  '&:hover': { borderColor: config.colors.primary },
                }}
              />
            ))}
            {tags.length > 3 && (
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                +{tags.length - 3}
              </Typography>
            )}
          </Box>
        )}
      </CardContent>

    </Card>
  );
};

export default ThumbnailCard;
