/**
 * Design System Page
 * Auto-generated design system from captured screens
 * Extracts colors, typography, spacing patterns from captured HTML
 */

import React, { useState, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import Fade from '@mui/material/Fade';
import {
  Button,
  Card,
  CardContent,
  Chip,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@/components/ui';
import {
  Palette,
  TextT,
  ArrowsOutCardinal,
  Copy,
  ArrowClockwise,
  Check,
  Trash,
  PencilSimple,
  CheckCircle,
  Sparkle,
  MagnifyingGlass,
  Robot,
} from '@phosphor-icons/react';
import { useThemeStore } from '@/store/themeStore';
import { useScreensStore } from '@/store/screensStore';
import { useDesignTokensStore } from '@/store/designTokensStore';
import { useSnackbar } from '@/components/SnackbarProvider';
import { PageHeader } from '@/components/PageHeader';
import { BatchSelectionBar } from '@/components/BatchSelectionBar';
import { CheckCircle as CheckCircleIcon, Trash as TrashIcon } from '@phosphor-icons/react';
import {
  labelColorsWithLLM,
  labelFontsWithLLM,
  isLLMLabelingAvailable,
} from '@/services/designSystemLabelingService';
import { captureHtmlScreenshot, compressScreenshot } from '@/services/screenshotService';
import { isLLMExtractionAvailable } from '@/services/designTokenExtractionService';

interface ExtractedColor {
  id: string;
  hex: string;
  rgb: string;
  count: number;
  usage: 'background' | 'text' | 'border' | 'accent';
  label?: string;
  approved?: boolean;
}

interface ExtractedFont {
  id: string;
  family: string;
  weights: string[];
  sizes: string[];
  count: number;
  label?: string;
  approved?: boolean;
}

interface ExtractedSpacing {
  id: string;
  value: string;
  count: number;
  context: string;
  approved?: boolean;
}

interface DesignSystemData {
  colors: ExtractedColor[];
  fonts: ExtractedFont[];
  spacing: ExtractedSpacing[];
  borderRadius: string[];
  shadows: string[];
  lastUpdated: string;
}

// Loading messages for fun extraction state
const LOADING_MESSAGES = [
  { message: 'Scanning screens for design patterns...', icon: '🔍' },
  { message: 'Extracting color palettes...', icon: '🎨' },
  { message: 'Analyzing typography styles...', icon: '📝' },
  { message: 'Measuring spacing patterns...', icon: '📐' },
  { message: 'Detecting border radii...', icon: '⭕' },
  { message: 'Cataloging shadows...', icon: '🌑' },
  { message: 'Building your design system...', icon: '✨' },
];

// Generate unique ID (UUID format for database compatibility)
function generateId(): string {
  return crypto.randomUUID();
}

// Parse CSS color to hex
function normalizeColor(color: string): string | null {
  if (!color || color === 'transparent' || color === 'inherit' || color === 'initial') return null;

  // Already hex
  if (color.startsWith('#')) {
    return color.toLowerCase();
  }

  // RGB/RGBA
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  return null;
}

// Generate semantic label for color based on usage and hex
function generateColorLabel(hex: string, usage: string): string {
  // Common color names
  const colorNames: Record<string, string> = {
    '#000000': 'Black',
    '#ffffff': 'White',
    '#f44336': 'Red',
    '#e91e63': 'Pink',
    '#9c27b0': 'Purple',
    '#673ab7': 'Deep Purple',
    '#3f51b5': 'Indigo',
    '#2196f3': 'Blue',
    '#03a9f4': 'Light Blue',
    '#00bcd4': 'Cyan',
    '#009688': 'Teal',
    '#4caf50': 'Green',
    '#8bc34a': 'Light Green',
    '#cddc39': 'Lime',
    '#ffeb3b': 'Yellow',
    '#ffc107': 'Amber',
    '#ff9800': 'Orange',
    '#ff5722': 'Deep Orange',
  };

  const baseName = colorNames[hex.toLowerCase()];
  if (baseName) {
    return `${baseName} ${usage.charAt(0).toUpperCase() + usage.slice(1)}`;
  }

  // Generate name based on usage
  const usageNames: Record<string, string> = {
    background: 'Background',
    text: 'Text',
    border: 'Border',
    accent: 'Accent',
  };

  return `${usageNames[usage] || 'Color'} ${hex.slice(1, 4).toUpperCase()}`;
}

// Generate semantic label for font
function generateFontLabel(family: string): string {
  const lowerFamily = family.toLowerCase();

  if (lowerFamily.includes('mono') || lowerFamily.includes('code') || lowerFamily.includes('consolas')) {
    return 'Monospace / Code';
  }
  if (lowerFamily.includes('serif') && !lowerFamily.includes('sans')) {
    return 'Serif / Body';
  }
  if (lowerFamily.includes('display') || lowerFamily.includes('heading')) {
    return 'Display / Headings';
  }
  if (lowerFamily.includes('system') || lowerFamily.includes('apple') || lowerFamily.includes('segoe')) {
    return 'System UI';
  }

  return 'Sans-serif / UI';
}

// Extract design tokens from HTML strings
function extractDesignTokens(htmlStrings: string[], onProgress?: (progress: number, message: string) => void): DesignSystemData {
  const colorMap = new Map<string, { count: number; usage: ExtractedColor['usage'] }>();
  const fontMap = new Map<string, { weights: Set<string>; sizes: Set<string>; count: number }>();
  const spacingMap = new Map<string, { count: number; context: string }>();
  const borderRadiusSet = new Set<string>();
  const shadowSet = new Set<string>();

  const totalScreens = htmlStrings.length;

  htmlStrings.forEach((html, index) => {
    if (!html) return;

    // Report progress
    if (onProgress) {
      const progress = ((index + 1) / totalScreens) * 100;
      onProgress(progress, `Processing screen ${index + 1} of ${totalScreens}`);
    }

    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract from inline styles and computed styles simulation
    const allElements = doc.querySelectorAll('*');

    allElements.forEach((el) => {
      const style = (el as HTMLElement).style;
      const computedStyle = el.getAttribute('style') || '';
      const className = el.getAttribute('class') || '';

      // Extract colors from style attribute
      const colorProps = ['color', 'backgroundColor', 'borderColor', 'background'];
      colorProps.forEach((prop) => {
        const value = style.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
        if (value) {
          const normalized = normalizeColor(value);
          if (normalized) {
            const existing = colorMap.get(normalized) || { count: 0, usage: 'text' as const };
            existing.count++;
            if (prop.includes('background') || prop.includes('Background')) existing.usage = 'background';
            if (prop.includes('border') || prop.includes('Border')) existing.usage = 'border';
            colorMap.set(normalized, existing);
          }
        }
      });

      // Extract from style attribute with regex
      const bgMatch = computedStyle.match(/background(?:-color)?:\s*([^;]+)/i);
      if (bgMatch) {
        const normalized = normalizeColor(bgMatch[1].trim());
        if (normalized) {
          const existing = colorMap.get(normalized) || { count: 0, usage: 'background' as const };
          existing.count++;
          colorMap.set(normalized, existing);
        }
      }

      const colorMatch = computedStyle.match(/(?<!background-)color:\s*([^;]+)/i);
      if (colorMatch) {
        const normalized = normalizeColor(colorMatch[1].trim());
        if (normalized) {
          const existing = colorMap.get(normalized) || { count: 0, usage: 'text' as const };
          existing.count++;
          colorMap.set(normalized, existing);
        }
      }

      // Extract fonts from style attribute
      const fontMatch = computedStyle.match(/font-family:\s*([^;]+)/i);
      if (fontMatch) {
        const family = fontMatch[1].split(',')[0].trim().replace(/['"]/g, '');
        if (family && family.length > 1) {
          const existing = fontMap.get(family) || { weights: new Set(), sizes: new Set(), count: 0 };
          existing.count++;

          const weightMatch = computedStyle.match(/font-weight:\s*(\d+|bold|normal)/i);
          if (weightMatch) existing.weights.add(weightMatch[1]);

          const sizeMatch = computedStyle.match(/font-size:\s*([^;]+)/i);
          if (sizeMatch) existing.sizes.add(sizeMatch[1].trim());

          fontMap.set(family, existing);
        }
      }

      // Extract fonts from class-based hints
      if (className) {
        // Look for common font class patterns
        const fontClasses = className.match(/font-\w+/g);
        if (fontClasses) {
          fontClasses.forEach(fc => {
            const family = fc.replace('font-', '');
            if (family.length > 2) {
              const existing = fontMap.get(family) || { weights: new Set(), sizes: new Set(), count: 0 };
              existing.count++;
              fontMap.set(family, existing);
            }
          });
        }
      }

      // Extract spacing (padding, margin)
      const spacingMatches = computedStyle.match(/(padding|margin)(?:-(?:top|right|bottom|left))?:\s*([^;]+)/gi);
      if (spacingMatches) {
        spacingMatches.forEach((match) => {
          const parts = match.split(':').map((s) => s.trim());
          if (parts.length === 2) {
            const [prop, value] = parts;
            if (value && !value.includes('auto') && value !== '0') {
              const existing = spacingMap.get(value) || { count: 0, context: prop };
              existing.count++;
              spacingMap.set(value, existing);
            }
          }
        });
      }

      // Extract border radius
      const radiusMatch = computedStyle.match(/border-radius:\s*([^;]+)/i);
      if (radiusMatch && radiusMatch[1] !== '0' && radiusMatch[1] !== '0px') {
        borderRadiusSet.add(radiusMatch[1].trim());
      }

      // Extract shadows
      const shadowMatch = computedStyle.match(/box-shadow:\s*([^;]+)/i);
      if (shadowMatch && shadowMatch[1] !== 'none') {
        shadowSet.add(shadowMatch[1].trim());
      }
    });
  });

  // Convert maps to arrays with IDs and labels
  const colors: ExtractedColor[] = Array.from(colorMap.entries())
    .map(([hex, data]) => ({
      id: generateId(),
      hex,
      rgb: `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`,
      count: data.count,
      usage: data.usage,
      label: generateColorLabel(hex, data.usage),
      approved: false,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);

  const fonts: ExtractedFont[] = Array.from(fontMap.entries())
    .map(([family, data]) => ({
      id: generateId(),
      family,
      weights: Array.from(data.weights),
      sizes: Array.from(data.sizes).sort(),
      count: data.count,
      label: generateFontLabel(family),
      approved: false,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const spacing: ExtractedSpacing[] = Array.from(spacingMap.entries())
    .map(([value, data]) => ({
      id: generateId(),
      value,
      count: data.count,
      context: data.context,
      approved: false,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    colors,
    fonts,
    spacing,
    borderRadius: Array.from(borderRadiusSet).slice(0, 10),
    shadows: Array.from(shadowSet).slice(0, 10),
    lastUpdated: new Date().toISOString(),
  };
}

// Color swatch component with actions
function ColorSwatch({
  color,
  onCopy,
  onApprove,
  onEdit,
  onDelete,
  isSelected,
  onSelect,
}: {
  color: ExtractedColor;
  onCopy: (value: string) => void;
  onApprove: (id: string) => void;
  onEdit: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(color.label || '');
  const [isHovered, setIsHovered] = useState(false);

  const showCheckbox = isHovered || isSelected;

  const handleCopy = () => {
    navigator.clipboard.writeText(color.hex);
    onCopy(color.hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSaveEdit = () => {
    onEdit(color.id, editLabel);
    setIsEditing(false);
  };

  return (
    <Card
      variant="outlined"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        overflow: 'hidden',
        border: isSelected ? '2px solid' : color.approved ? '2px solid' : '1px solid',
        borderColor: isSelected ? 'primary.main' : color.approved ? 'success.main' : 'divider',
        transition: 'all 0.2s ease',
      }}
    >
      <Box
        sx={{
          height: 60,
          bgcolor: color.hex,
          position: 'relative',
          cursor: 'pointer',
          '&:hover .swatch-actions': { opacity: 1 },
        }}
        onClick={handleCopy}
      >
        {/* Selection checkbox - appears on hover */}
        {onSelect && (
          <Fade in={showCheckbox}>
            <Box
              sx={{
                position: 'absolute',
                top: 4,
                left: 4,
                zIndex: 10,
              }}
            >
              <Checkbox
                checked={isSelected}
                onChange={(e) => {
                  e.stopPropagation();
                  onSelect(color.id);
                }}
                onClick={(e) => e.stopPropagation()}
                sx={{
                  p: 0,
                  bgcolor: 'rgba(255,255,255,0.9)',
                  borderRadius: 0.5,
                  '&:hover': { bgcolor: 'white' },
                  '& .MuiSvgIcon-root': { fontSize: 18 },
                }}
              />
            </Box>
          </Fade>
        )}
        <Box
          className="swatch-actions"
          sx={{
            position: 'absolute',
            top: 4,
            right: 4,
            display: 'flex',
            gap: 0.5,
            opacity: 0,
            transition: 'opacity 0.2s',
          }}
        >
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            sx={{
              bgcolor: 'rgba(255,255,255,0.9)',
              '&:hover': { bgcolor: 'white' },
              width: 24,
              height: 24,
            }}
          >
            {copied ? <Check size={12} color="green" /> : <Copy size={12} />}
          </IconButton>
        </Box>
        {color.approved && (
          <CheckCircle
            size={20}
            weight="fill"
            style={{
              position: 'absolute',
              bottom: 4,
              left: 4,
              color: '#4caf50',
              background: 'white',
              borderRadius: '50%',
            }}
          />
        )}
      </Box>
      <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
        {isEditing ? (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <TextField
              size="small"
              value={editLabel}
              onChange={(e) => setEditLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveEdit();
                if (e.key === 'Escape') setIsEditing(false);
              }}
              autoFocus
              sx={{ flex: 1, '& input': { py: 0.5, fontSize: '0.75rem' } }}
            />
            <IconButton size="small" onClick={handleSaveEdit}>
              <Check size={14} />
            </IconButton>
          </Box>
        ) : (
          <>
            <Typography variant="caption" fontWeight={600} sx={{ display: 'block', mb: 0.25 }}>
              {color.label || 'Unnamed'}
            </Typography>
            <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
              {color.hex}
            </Typography>
          </>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
          <Chip
            label={color.usage}
            size="small"
            sx={{ height: 18, fontSize: '0.6rem' }}
          />
          <Typography variant="caption" color="text.secondary">
            {color.count}×
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Edit label">
            <IconButton size="small" onClick={() => setIsEditing(true)} sx={{ p: 0.25 }}>
              <PencilSimple size={12} />
            </IconButton>
          </Tooltip>
          <Tooltip title={color.approved ? 'Unapprove' : 'Approve'}>
            <IconButton
              size="small"
              onClick={() => onApprove(color.id)}
              sx={{ p: 0.25 }}
              color={color.approved ? 'success' : 'default'}
            >
              <CheckCircle size={12} weight={color.approved ? 'fill' : 'regular'} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton size="small" onClick={() => onDelete(color.id)} sx={{ p: 0.25 }} color="error">
              <Trash size={12} />
            </IconButton>
          </Tooltip>
        </Box>
      </CardContent>
    </Card>
  );
}

// Font card component with actions
function FontCard({
  font,
  onApprove,
  onEdit,
  onDelete,
}: {
  font: ExtractedFont;
  onApprove: (id: string) => void;
  onEdit: (id: string, label: string) => void;
  onDelete: (id: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(font.label || '');

  const handleSaveEdit = () => {
    onEdit(font.id, editLabel);
    setIsEditing(false);
  };

  return (
    <Card
      variant="outlined"
      sx={{
        border: font.approved ? '2px solid' : '1px solid',
        borderColor: font.approved ? 'success.main' : 'divider',
        transition: 'all 0.2s ease',
      }}
    >
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box>
            <Typography
              variant="h6"
              sx={{ fontFamily: font.family, mb: 0.5 }}
            >
              {font.family}
            </Typography>
            {isEditing ? (
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <TextField
                  size="small"
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveEdit();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                  autoFocus
                  sx={{ width: 150, '& input': { py: 0.5, fontSize: '0.75rem' } }}
                />
                <IconButton size="small" onClick={handleSaveEdit}>
                  <Check size={14} />
                </IconButton>
              </Box>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {font.label || 'Uncategorized'}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <Tooltip title="Edit label">
              <IconButton size="small" onClick={() => setIsEditing(true)}>
                <PencilSimple size={14} />
              </IconButton>
            </Tooltip>
            <Tooltip title={font.approved ? 'Unapprove' : 'Approve'}>
              <IconButton
                size="small"
                onClick={() => onApprove(font.id)}
                color={font.approved ? 'success' : 'default'}
              >
                <CheckCircle size={14} weight={font.approved ? 'fill' : 'regular'} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => onDelete(font.id)} color="error">
                <Trash size={14} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
          {font.weights.map((w) => (
            <Chip key={w} label={`${w}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
          ))}
        </Box>
        {font.sizes.length > 0 && (
          <Typography variant="caption" color="text.secondary">
            Sizes: {font.sizes.join(', ')}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          Used {font.count}× across screens
        </Typography>
      </CardContent>
    </Card>
  );
}

// Fun loading component
function ExtractionLoader({ progress, message }: { progress: number; message: string }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const currentMessage = LOADING_MESSAGES[messageIndex];

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 8,
        gap: 3,
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: 80,
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Sparkle
          size={48}
          weight="duotone"
          style={{
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <style>
          {`
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.1); opacity: 0.7; }
            }
          `}
        </style>
      </Box>
      <Box sx={{ textAlign: 'center' }}>
        <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
          <span>{currentMessage.icon}</span>
          {currentMessage.message}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      </Box>
      <Box sx={{ width: 300 }}>
        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 8,
            borderRadius: 4,
            bgcolor: 'grey.200',
            '& .MuiLinearProgress-bar': {
              borderRadius: 4,
              background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            },
          }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', textAlign: 'center' }}>
          {Math.round(progress)}% complete
        </Typography>
      </Box>
    </Box>
  );
}

export const DesignSystem: React.FC = () => {
  const { config } = useThemeStore();
  const { screens, initializeScreens } = useScreensStore();
  const {
    tokens,
    isLoading: isLoadingTokens,
    isInitialized: isTokensInitialized,
    isExtracting: isStoreExtracting,
    lastExtractionTime,
    initializeTokens,
    extractTokensFromScreens,
    extractTokensWithLLM,
    deleteTokens,
    updateToken,
    selectedIds,
    toggleTokenSelection,
    selectAllTokens,
    clearSelection,
    approveSelectedTokens,
    deleteSelectedTokens,
  } = useDesignTokensStore();
  const { showSuccess, showError } = useSnackbar();

  const [activeTab, setActiveTab] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [extractionMessage, setExtractionMessage] = useState('');
  const [designSystem, setDesignSystem] = useState<DesignSystemData | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'color' | 'font' | 'spacing'; id: string } | null>(null);
  const [isLabeling, setIsLabeling] = useState(false);
  const [llmAvailable, setLlmAvailable] = useState(false);

  // Check LLM availability on mount
  useEffect(() => {
    isLLMLabelingAvailable().then(setLlmAvailable);
  }, []);

  // Initialize screens and tokens on mount
  useEffect(() => {
    if (screens.length === 0) {
      initializeScreens();
    }
    initializeTokens();
  }, []);

  // Convert stored tokens to design system format for display
  // Runs after tokens are initialized from Supabase or after extraction completes
  useEffect(() => {
    // Skip while extracting or loading
    if (isLoadingTokens || isStoreExtracting) return;
    if (!isTokensInitialized) return;

    // If we have tokens, convert them to display format
    // Always rebuild to ensure we show current state from store
    if (tokens.length > 0) {
      const colorTokens = tokens.filter(t => t.category === 'color');
      const typographyTokens = tokens.filter(t => t.category === 'typography');
      const spacingTokens = tokens.filter(t => t.category === 'spacing');
      const borderRadiusTokens = tokens.filter(t => t.category === 'border-radius');
      const shadowTokens = tokens.filter(t => t.category === 'shadow');

      // Map tokens to legacy format for backward compatibility
      const colors: ExtractedColor[] = colorTokens.map(t => ({
        id: t.id,
        hex: t.value,
        rgb: `rgb(${parseInt(t.value.slice(1, 3), 16)}, ${parseInt(t.value.slice(3, 5), 16)}, ${parseInt(t.value.slice(5, 7), 16)})`,
        count: t.usageCount,
        usage: 'text' as const,
        label: t.name,
        approved: t.status === 'approved',
      }));

      const fonts: ExtractedFont[] = [];
      const fontFamilyMap = new Map<string, ExtractedFont>();
      typographyTokens.forEach(t => {
        if (t.subcategory === 'font-family' || !t.subcategory) {
          const family = t.value.split(',')[0].trim();
          if (!fontFamilyMap.has(family)) {
            fontFamilyMap.set(family, {
              id: t.id,
              family,
              weights: [],
              sizes: [],
              count: t.usageCount,
              label: t.name,
              approved: t.status === 'approved',
            });
          }
        }
      });
      fonts.push(...fontFamilyMap.values());

      const spacing: ExtractedSpacing[] = spacingTokens.map(t => ({
        id: t.id,
        value: t.value,
        count: t.usageCount,
        context: t.subcategory || 'spacing',
        approved: t.status === 'approved',
      }));

      setDesignSystem({
        colors,
        fonts,
        spacing,
        borderRadius: borderRadiusTokens.map(t => t.value),
        shadows: shadowTokens.map(t => t.value),
        lastUpdated: lastExtractionTime || new Date().toISOString(),
      });
    } else {
      // No tokens exist - set empty design system so we show empty state
      setDesignSystem({
        colors: [],
        fonts: [],
        spacing: [],
        borderRadius: [],
        shadows: [],
        lastUpdated: new Date().toISOString(),
      });
    }
  }, [tokens, lastExtractionTime, isTokensInitialized, isLoadingTokens, isStoreExtracting]);

  // Extract design system from screens using LLM vision
  const extractDesignSystem = useCallback(async () => {
    setIsExtracting(true);
    setExtractionProgress(0);
    setExtractionMessage('Starting extraction...');

    try {
      // Collect ALL screens with HTML content
      const screensWithHtml = screens.filter((s) => s.editedHtml);

      if (screensWithHtml.length === 0) {
        showError('No screens with HTML content found');
        setIsExtracting(false);
        return;
      }

      // Check if LLM extraction is available
      const useLLM = await isLLMExtractionAvailable();

      if (useLLM) {
        // LLM-based extraction with screenshots
        setExtractionMessage('Capturing screenshots...');
        setExtractionProgress(5);

        // Capture screenshot from first screen for visual context
        const firstScreen = screensWithHtml[0];
        let screenshotBase64: string | undefined;

        try {
          const screenshot = await captureHtmlScreenshot(firstScreen.editedHtml!, {
            maxWidth: 1280,
            maxHeight: 900,
            quality: 0.85,
          });

          if (screenshot) {
            // Compress if needed
            const compressed = await compressScreenshot(screenshot.base64, 1024 * 1024);
            screenshotBase64 = compressed || screenshot.base64;
            console.log('[DesignSystem] Screenshot captured:', Math.round((screenshotBase64?.length || 0) / 1024), 'KB');
          }
        } catch (err) {
          console.warn('[DesignSystem] Screenshot capture failed, continuing without:', err);
        }

        if (!screenshotBase64) {
          showError('Failed to capture screenshot for AI analysis. Using basic extraction.');
          // Fall back to basic extraction
          const screenInputs = screensWithHtml.map(s => ({
            id: s.id,
            name: s.name,
            html: s.editedHtml!,
          }));
          await extractTokensFromScreens(screenInputs);
        } else {
          // Use LLM extraction
          const screenInputs = screensWithHtml.map(s => ({
            id: s.id,
            name: s.name,
            html: s.editedHtml!,
            screenshotBase64: s.id === firstScreen.id ? screenshotBase64 : undefined,
          }));

          await extractTokensWithLLM(screenInputs, (progress, message) => {
            setExtractionProgress(progress);
            setExtractionMessage(message);
          });
        }
      } else {
        // Basic extraction without LLM (fallback)
        setExtractionMessage('Analyzing HTML patterns...');

        const htmlStrings = screensWithHtml.map((s) => s.editedHtml!);
        extractDesignTokens(htmlStrings, (progress, message) => {
          setExtractionProgress(progress);
          setExtractionMessage(message);
        });

        const screenInputs = screensWithHtml.map(s => ({
          id: s.id,
          name: s.name,
          html: s.editedHtml!,
        }));
        await extractTokensFromScreens(screenInputs);
      }

      // Clear local designSystem so it gets rebuilt from store tokens
      setDesignSystem(null);
      showSuccess(`Design system extracted from ${screensWithHtml.length} screens and saved`);
    } catch (error) {
      console.error('Extraction error:', error);
      showError('Failed to extract design system');
    } finally {
      setIsExtracting(false);
    }
  }, [screens, showSuccess, showError, extractTokensFromScreens, extractTokensWithLLM]);

  // Generate AI labels for colors and fonts
  const handleGenerateAILabels = async () => {
    if (!designSystem) return;

    setIsLabeling(true);
    try {
      // Label colors
      const colorInputs = designSystem.colors.map((c) => ({
        hex: c.hex,
        usage: c.usage,
      }));
      const labeledColors = await labelColorsWithLLM(colorInputs);

      // Label fonts
      const fontInputs = designSystem.fonts.map((f) => ({
        family: f.family,
        weights: f.weights,
      }));
      const labeledFonts = await labelFontsWithLLM(fontInputs);

      // Update design system with new labels
      setDesignSystem({
        ...designSystem,
        colors: designSystem.colors.map((c) => {
          const labeled = labeledColors.find((lc) => lc.hex.toLowerCase() === c.hex.toLowerCase());
          return labeled ? { ...c, label: labeled.label } : c;
        }),
        fonts: designSystem.fonts.map((f) => {
          const labeled = labeledFonts.find((lf) => lf.family.toLowerCase() === f.family.toLowerCase());
          return labeled ? { ...f, label: labeled.label } : f;
        }),
      });

      showSuccess('AI labels generated successfully');
    } catch (error) {
      console.error('AI labeling error:', error);
      showError('Failed to generate AI labels');
    } finally {
      setIsLabeling(false);
    }
  };

  // Handle actions
  const handleCopyToken = (value: string) => {
    showSuccess(`Copied: ${value}`);
  };

  const handleApproveColor = async (id: string) => {
    if (!designSystem) return;
    const color = designSystem.colors.find(c => c.id === id);
    if (!color) return;

    const newStatus = color.approved ? 'pending' : 'approved';

    // Update in store (persists to Supabase)
    await updateToken(id, { status: newStatus as 'pending' | 'approved' });

    // Update local state
    setDesignSystem({
      ...designSystem,
      colors: designSystem.colors.map((c) =>
        c.id === id ? { ...c, approved: !c.approved } : c
      ),
    });
  };

  const handleEditColor = (id: string, label: string) => {
    if (!designSystem) return;
    setDesignSystem({
      ...designSystem,
      colors: designSystem.colors.map((c) =>
        c.id === id ? { ...c, label } : c
      ),
    });
    showSuccess('Color label updated');
  };

  const handleDeleteColor = async (id: string) => {
    if (!designSystem) return;

    // Delete from store (persists to Supabase)
    await deleteTokens([id]);

    // Update local state
    setDesignSystem({
      ...designSystem,
      colors: designSystem.colors.filter((c) => c.id !== id),
    });
    showSuccess('Color removed');
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const handleApproveFont = async (id: string) => {
    if (!designSystem) return;
    const font = designSystem.fonts.find(f => f.id === id);
    if (!font) return;

    const newStatus = font.approved ? 'pending' : 'approved';

    // Update in store (persists to Supabase)
    await updateToken(id, { status: newStatus as 'pending' | 'approved' });

    // Update local state
    setDesignSystem({
      ...designSystem,
      fonts: designSystem.fonts.map((f) =>
        f.id === id ? { ...f, approved: !f.approved } : f
      ),
    });
  };

  const handleEditFont = (id: string, label: string) => {
    if (!designSystem) return;
    setDesignSystem({
      ...designSystem,
      fonts: designSystem.fonts.map((f) =>
        f.id === id ? { ...f, label } : f
      ),
    });
    showSuccess('Font label updated');
  };

  const handleDeleteFont = async (id: string) => {
    if (!designSystem) return;

    // Delete from store (persists to Supabase)
    await deleteTokens([id]);

    // Update local state
    setDesignSystem({
      ...designSystem,
      fonts: designSystem.fonts.filter((f) => f.id !== id),
    });
    showSuccess('Font removed');
    setDeleteDialogOpen(false);
    setDeleteTarget(null);
  };

  const openDeleteDialog = (type: 'color' | 'font' | 'spacing', id: string) => {
    setDeleteTarget({ type, id });
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'color') {
      await handleDeleteColor(deleteTarget.id);
    } else if (deleteTarget.type === 'font') {
      await handleDeleteFont(deleteTarget.id);
    }
  };

  // Batch selection handlers for colors
  const handleToggleColorSelection = (id: string) => {
    toggleTokenSelection(id);
  };

  const handleSelectAllColors = () => {
    if (!designSystem) return;
    const colorIds = designSystem.colors.map(c => c.id);
    const allSelected = colorIds.every(id => selectedIds.includes(id));
    if (allSelected) {
      clearSelection();
    } else {
      selectAllTokens(colorIds);
    }
  };

  const handleBatchApproveColors = async () => {
    await approveSelectedTokens();
    // Update local state
    if (designSystem) {
      setDesignSystem({
        ...designSystem,
        colors: designSystem.colors.map(c =>
          selectedIds.includes(c.id) ? { ...c, approved: true } : c
        ),
      });
    }
    showSuccess(`Approved ${selectedIds.length} colors`);
  };

  const handleBatchDeleteColors = async () => {
    const count = selectedIds.length;
    await deleteSelectedTokens();
    // Update local state
    if (designSystem) {
      setDesignSystem({
        ...designSystem,
        colors: designSystem.colors.filter(c => !selectedIds.includes(c.id)),
      });
    }
    showSuccess(`Deleted ${count} colors`);
  };

  const approvedColorsCount = designSystem?.colors.filter((c) => c.approved).length || 0;
  const approvedFontsCount = designSystem?.fonts.filter((f) => f.approved).length || 0;

  // Only Colors and Typography tabs (removed Components)
  const tabs = [
    { label: 'Colors', icon: <Palette size={18} />, badge: approvedColorsCount > 0 ? approvedColorsCount : undefined },
    { label: 'Typography', icon: <TextT size={18} />, badge: approvedFontsCount > 0 ? approvedFontsCount : undefined },
    { label: 'Spacing', icon: <ArrowsOutCardinal size={18} /> },
  ];

  return (
    <Box>
      {/* Header */}
      <PageHeader
        title="Design System"
        subtitle={`Auto-generated from ${screens.filter(s => s.editedHtml).length} captured screens${designSystem?.lastUpdated ? ` · Last updated: ${new Date(designSystem.lastUpdated).toLocaleString()}` : ''}`}
        actions={
          <>
            {llmAvailable && designSystem && (
              <Tooltip title="Use AI to generate semantic labels for colors and fonts">
                <Button
                  variant="outlined"
                  startIcon={<Robot size={18} />}
                  onClick={handleGenerateAILabels}
                  disabled={isLabeling || isExtracting}
                  sx={{
                    transition: 'all 0.2s ease',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    },
                  }}
                >
                  {isLabeling ? 'Labeling...' : 'AI Labels'}
                </Button>
              </Tooltip>
            )}
            <Button
              variant="contained"
              startIcon={<ArrowClockwise size={18} />}
              onClick={extractDesignSystem}
              disabled={isExtracting || screens.length === 0}
              sx={{
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            >
              Re-extract
            </Button>
          </>
        }
      />

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.label}
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {tab.label}
                {tab.badge && (
                  <Chip
                    label={tab.badge}
                    size="small"
                    color="success"
                    sx={{ height: 18, fontSize: '0.65rem', minWidth: 20 }}
                  />
                )}
              </Box>
            }
            icon={tab.icon}
            iconPosition="start"
            sx={{ textTransform: 'none', minHeight: 48 }}
          />
        ))}
      </Tabs>

      {/* Content */}
      {/* Loading state while tokens are being fetched from Supabase */}
      {(isLoadingTokens || !isTokensInitialized) && !isExtracting && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Sparkle size={48} weight="duotone" style={{ color: config.colors.textSecondary, marginBottom: 16, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <Typography color="text.secondary">
            Loading design system...
          </Typography>
        </Box>
      )}

      {/* Empty state - no screens captured */}
      {isTokensInitialized && !isLoadingTokens && !designSystem && screens.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <MagnifyingGlass size={48} weight="light" style={{ color: config.colors.textSecondary, marginBottom: 16 }} />
          <Typography color="text.secondary">
            No screens captured yet. Import screens to generate a design system.
          </Typography>
        </Box>
      )}

      {/* Empty state - screens exist but no tokens extracted yet */}
      {isTokensInitialized && !isLoadingTokens && designSystem &&
       designSystem.colors.length === 0 && designSystem.fonts.length === 0 &&
       screens.length > 0 && !isExtracting && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Palette size={48} weight="light" style={{ color: config.colors.textSecondary, marginBottom: 16 }} />
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            No design tokens extracted yet. Click the button below to analyze your {screens.filter(s => s.editedHtml).length} captured screens.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Sparkle size={18} />}
            onClick={extractDesignSystem}
            sx={{
              transition: 'all 0.2s ease',
              '&:hover': {
                transform: 'translateY(-2px)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              },
            }}
          >
            Extract Design System
          </Button>
        </Box>
      )}

      {isExtracting && (
        <ExtractionLoader progress={extractionProgress} message={extractionMessage} />
      )}

      {isTokensInitialized && designSystem && (designSystem.colors.length > 0 || designSystem.fonts.length > 0) && !isExtracting && (
        <>
          {/* Colors Tab */}
          {activeTab === 0 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Extracted Colors ({designSystem.colors.length})
                </Typography>
                {approvedColorsCount > 0 && (
                  <Chip
                    icon={<CheckCircle size={14} />}
                    label={`${approvedColorsCount} approved`}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                )}
              </Box>
              <Grid container spacing={2}>
                {designSystem.colors.map((color) => (
                  <Grid item xs={6} sm={4} md={3} lg={2} key={color.id}>
                    <ColorSwatch
                      color={color}
                      onCopy={handleCopyToken}
                      onApprove={handleApproveColor}
                      onEdit={handleEditColor}
                      onDelete={(id) => openDeleteDialog('color', id)}
                      isSelected={selectedIds.includes(color.id)}
                      onSelect={handleToggleColorSelection}
                    />
                  </Grid>
                ))}
              </Grid>
              {designSystem.colors.length === 0 && (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No colors extracted. Make sure screens have inline styles.
                </Typography>
              )}
            </Box>
          )}

          {/* Typography Tab */}
          {activeTab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Font Families ({designSystem.fonts.length})
                </Typography>
                {approvedFontsCount > 0 && (
                  <Chip
                    icon={<CheckCircle size={14} />}
                    label={`${approvedFontsCount} approved`}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                )}
              </Box>
              <Grid container spacing={2}>
                {designSystem.fonts.map((font) => (
                  <Grid item xs={12} sm={6} md={4} key={font.id}>
                    <FontCard
                      font={font}
                      onApprove={handleApproveFont}
                      onEdit={handleEditFont}
                      onDelete={(id) => openDeleteDialog('font', id)}
                    />
                  </Grid>
                ))}
              </Grid>
              {designSystem.fonts.length === 0 && (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No fonts extracted. Typography is detected from font-family styles.
                </Typography>
              )}
            </Box>
          )}

          {/* Spacing Tab */}
          {activeTab === 2 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
                Spacing Values ({designSystem.spacing.length})
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                {designSystem.spacing.map((sp) => (
                  <Card key={sp.id} variant="outlined" sx={{ minWidth: 120 }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                        {sp.value}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {sp.context} ({sp.count}×)
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>

              {designSystem.borderRadius.length > 0 && (
                <>
                  <Divider sx={{ my: 3 }} />
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 2 }}>
                    Border Radius ({designSystem.borderRadius.length})
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {designSystem.borderRadius.map((radius, i) => (
                      <Card key={i} variant="outlined" sx={{ width: 80, height: 80 }}>
                        <Box
                          sx={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column',
                          }}
                        >
                          <Box
                            sx={{
                              width: 40,
                              height: 40,
                              bgcolor: config.colors.primary,
                              borderRadius: radius,
                              mb: 0.5,
                            }}
                          />
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
                            {radius}
                          </Typography>
                        </Box>
                      </Card>
                    ))}
                  </Box>
                </>
              )}
            </Box>
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Confirm Delete</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to remove this {deleteTarget?.type} from the design system?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Batch Selection Bar */}
      <BatchSelectionBar
        selectedCount={selectedIds.length}
        totalCount={activeTab === 0 ? (designSystem?.colors.length || 0) : (designSystem?.fonts.length || 0)}
        onSelectAll={handleSelectAllColors}
        onClearSelection={clearSelection}
        actions={[
          {
            label: 'Approve',
            icon: <CheckCircleIcon size={18} />,
            onClick: handleBatchApproveColors,
            color: 'success',
            tooltip: 'Approve selected items',
          },
          {
            label: 'Delete',
            icon: <TrashIcon size={18} />,
            onClick: handleBatchDeleteColors,
            color: 'error',
            tooltip: 'Delete selected items',
          },
        ]}
      />
    </Box>
  );
};

export default DesignSystem;
