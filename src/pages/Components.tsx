import { useState, useMemo, useEffect } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import InputAdornment from '@mui/material/InputAdornment';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Tooltip from '@mui/material/Tooltip';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import Fade from '@mui/material/Fade';
import {
  MagnifyingGlass,
  GridFour,
  List,
  Sparkle,
  X,
  Lightning,
  Trash,
  CheckCircle,
  XCircle,
  Wrench,
} from '@phosphor-icons/react';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CodeOutlinedIcon from '@mui/icons-material/CodeOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import {
  Button,
  Card,
  CardContent,
  CardActions,
  TextField,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
} from '@/components/ui';
import { EmptyState, PageHeader, BatchSelectionBar } from '@/components';
import { useSnackbar } from '@/components/SnackbarProvider';
import {
  useComponentsStore,
  getCategories,
  getAllTags,
  type ExtractedComponent,
} from '@/store/componentsStore';
import { useScreensStore } from '@/store/screensStore';
import { useThemeStore } from '@/store/themeStore';

// Component preview renderer
function ComponentPreview({
  component,
  variantName,
}: {
  component: ExtractedComponent;
  variantName?: string | null;
}) {
  // Get the appropriate HTML/CSS based on variant selection
  let html = component.html;
  let css = component.css;

  if (variantName && component.variants) {
    const variant = component.variants.find((v) => v.name === variantName);
    if (variant) {
      html = variant.html;
      css = variant.css;
    }
  }

  const combinedCode = `
    <style>${css}</style>
    <div style="padding: 20px; display: flex; align-items: center; justify-content: center; min-height: 100%;">
      ${html}
    </div>
  `;

  return (
    <iframe
      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}</style></head><body>${combinedCode}</body></html>`}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: 'white',
      }}
      title={component.name}
      sandbox="allow-scripts allow-same-origin"
    />
  );
}

// Code block with copy
function CodeBlock({ code, language }: { code: string; language: string }) {
  const { showSuccess } = useSnackbar();

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    showSuccess(`${language.toUpperCase()} copied to clipboard`);
  };

  return (
    <Box sx={{ position: 'relative' }}>
      <Button
        startIcon={<ContentCopyOutlinedIcon />}
        size="small"
        onClick={copyCode}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 1,
        }}
      >
        Copy
      </Button>
      <Box
        component="pre"
        sx={{
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          p: 2,
          borderRadius: 2,
          overflow: 'auto',
          maxHeight: 400,
          fontSize: 13,
          lineHeight: 1.5,
          m: 0,
        }}
      >
        <code>{code}</code>
      </Box>
    </Box>
  );
}

// Status color mapping
const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  approved: { bg: 'success.100', text: 'success.700', label: 'Approved' },
  rejected: { bg: 'error.100', text: 'error.700', label: 'Rejected' },
  'needs-fix': { bg: 'warning.100', text: 'warning.700', label: 'Needs Fix' },
  pending: { bg: 'grey.100', text: 'grey.600', label: 'Pending' },
};

// Component card
function ComponentCard({
  component,
  onClick,
  isSelected,
  onToggleSelect,
}: {
  component: ExtractedComponent;
  onClick: () => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { showSuccess } = useSnackbar();
  const [isHovered, setIsHovered] = useState(false);

  // Show checkbox on hover or when selected
  const showCheckbox = isHovered || isSelected;

  const copyHTML = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(component.html);
    showSuccess('HTML copied');
  };

  const copyCSS = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(component.css);
    showSuccess('CSS copied');
  };

  const copyBoth = (e: React.MouseEvent) => {
    e.stopPropagation();
    const combined = `/* CSS */\n${component.css}\n\n<!-- HTML -->\n${component.html}`;
    navigator.clipboard.writeText(combined);
    showSuccess('HTML + CSS copied');
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelect?.();
  };

  const variantCount = component.variants?.length || 0;
  const status = component.status || 'pending';
  const statusInfo = STATUS_COLORS[status] || STATUS_COLORS.pending;

  return (
    <Card
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        height: '100%',
        cursor: 'pointer',
        '&:hover': { boxShadow: 3 },
        border: isSelected ? '2px solid' : '1px solid',
        borderColor: isSelected ? 'primary.main' : 'divider',
        backgroundColor: isSelected ? 'primary.50' : 'background.paper',
      }}
      onClick={onClick}
    >
      <Box
        sx={{
          height: 160,
          backgroundColor: 'grey.100',
          borderBottom: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <ComponentPreview component={component} />

        {/* Selection checkbox - visible on hover or when selected */}
        <Fade in={showCheckbox} timeout={200}>
          <Checkbox
            checked={isSelected}
            onClick={handleCheckboxClick}
            sx={{
              position: 'absolute',
              top: 4,
              left: 4,
              backgroundColor: 'white',
              borderRadius: 1,
              p: 0.25,
              '&:hover': { backgroundColor: 'grey.100' },
            }}
          />
        </Fade>

        {/* Status badge */}
        {status !== 'pending' && (
          <Chip
            label={statusInfo.label}
            size="small"
            sx={{
              position: 'absolute',
              top: 8,
              left: showCheckbox ? 40 : 8,
              backgroundColor: statusInfo.bg,
              color: statusInfo.text,
              fontSize: '0.65rem',
              height: 20,
              transition: 'left 0.2s ease',
            }}
          />
        )}

        {/* AI badge */}
        {component.generatedBy === 'llm' && (
          <Tooltip title="AI-generated component">
            <Box
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                backgroundColor: 'primary.main',
                borderRadius: '50%',
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AutoAwesomeIcon sx={{ fontSize: 14, color: 'white' }} />
            </Box>
          </Tooltip>
        )}
      </Box>
      <CardContent sx={{ py: 1.5 }}>
        <Typography variant="subtitle2" fontWeight={600} noWrap>
          {component.name}
        </Typography>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            textTransform: 'capitalize',
            display: 'block',
            mb: 0.5,
          }}
        >
          {component.category}
        </Typography>
        {component.description && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.3,
            }}
          >
            {component.description}
          </Typography>
        )}
        <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {variantCount > 0 && (
            <Chip
              label={`${variantCount} variant${variantCount > 1 ? 's' : ''}`}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          {component.tags.slice(0, 2).map((tag) => (
            <Chip key={tag} label={tag} size="small" variant="outlined" />
          ))}
        </Box>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 1.5, pt: 0 }}>
        <Tooltip title="Copy HTML">
          <Button size="small" startIcon={<CodeOutlinedIcon />} onClick={copyHTML}>
            HTML
          </Button>
        </Tooltip>
        <Tooltip title="Copy CSS">
          <Button size="small" startIcon={<CodeOutlinedIcon />} onClick={copyCSS}>
            CSS
          </Button>
        </Tooltip>
        <Tooltip title="Copy Both">
          <Button size="small" startIcon={<ContentCopyOutlinedIcon />} onClick={copyBoth}>
            All
          </Button>
        </Tooltip>
      </CardActions>
    </Card>
  );
}

// Detail modal with variant selector
function ComponentDetailModal({
  component,
  open,
  onClose,
}: {
  component: ExtractedComponent | null;
  open: boolean;
  onClose: () => void;
}) {
  const { showSuccess } = useSnackbar();
  const [tabValue, setTabValue] = useState(0);
  const { selectedVariant, selectVariant } = useComponentsStore();

  // Reset variant when component changes
  useEffect(() => {
    if (component) {
      selectVariant(null);
    }
  }, [component?.id]);

  if (!component) return null;

  // Get current HTML/CSS based on variant selection
  let currentHtml = component.html;
  let currentCss = component.css;

  if (selectedVariant && component.variants) {
    const variant = component.variants.find((v) => v.name === selectedVariant);
    if (variant) {
      currentHtml = variant.html;
      currentCss = variant.css;
    }
  }

  const copyAll = () => {
    const combined = `/* CSS */\n${currentCss}\n\n<!-- HTML -->\n${currentHtml}`;
    navigator.clipboard.writeText(combined);
    showSuccess('Component code copied to clipboard');
  };

  const hasVariants = component.variants && component.variants.length > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6">{component.name}</Typography>
          <Chip
            label={component.category}
            size="small"
            sx={{ textTransform: 'capitalize' }}
          />
          {component.generatedBy === 'llm' && (
            <Chip
              icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
              label="AI Generated"
              size="small"
              color="primary"
            />
          )}
        </Box>
      </DialogTitle>
      <DialogContent>
        {component.description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {component.description}
          </Typography>
        )}

        <Box sx={{ mb: 2, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {component.tags.map((tag) => (
            <Chip
              key={tag}
              label={tag}
              size="small"
              color="primary"
              variant="outlined"
            />
          ))}
        </Box>

        {/* Variant selector */}
        {hasVariants && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Variants
            </Typography>
            <ToggleButtonGroup
              value={selectedVariant || 'default'}
              exclusive
              onChange={(_, value) => selectVariant(value === 'default' ? null : value)}
              size="small"
            >
              <ToggleButton value="default">Default</ToggleButton>
              {component.variants!.map((variant) => (
                <ToggleButton key={variant.name} value={variant.name}>
                  {variant.name}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        )}

        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ mb: 2 }}>
          <Tab icon={<VisibilityOutlinedIcon />} label="Preview" iconPosition="start" />
          <Tab icon={<CodeOutlinedIcon />} label="HTML" iconPosition="start" />
          <Tab icon={<CodeOutlinedIcon />} label="CSS" iconPosition="start" />
        </Tabs>

        {tabValue === 0 && (
          <Box
            sx={{
              height: 300,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              overflow: 'hidden',
              backgroundColor: 'grey.100',
            }}
          >
            <ComponentPreview component={component} variantName={selectedVariant} />
          </Box>
        )}
        {tabValue === 1 && <CodeBlock code={currentHtml} language="html" />}
        {tabValue === 2 && <CodeBlock code={currentCss} language="css" />}

        {/* Props info */}
        {component.props && component.props.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Customizable properties: {component.props.join(', ')}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="contained" startIcon={<ContentCopyOutlinedIcon />} onClick={copyAll}>
          Copy All Code
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Format milliseconds to human-readable string
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// Extraction progress display with parallel processing support
function ExtractionProgressDisplay() {
  const { extractionProgress, components } = useComponentsStore();

  if (!extractionProgress) return null;

  // Calculate progress based on completed screens
  const progress = (extractionProgress.screensCompleted / extractionProgress.totalScreens) * 100;

  // Determine if processing in parallel
  const isParallel = extractionProgress.stepDetail?.includes('slots active');

  return (
    <Box
      sx={{
        mb: 3,
        p: 2,
        borderRadius: 2,
        backgroundColor: extractionProgress.status === 'error' ? 'error.50' : 'primary.50',
        border: '1px solid',
        borderColor: extractionProgress.status === 'error' ? 'error.200' : 'primary.200',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Sparkle size={20} weight="fill" />
          <Typography variant="subtitle2">
            AI Component Extraction {isParallel ? '(Parallel Processing)' : ''}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {isParallel && (
            <Chip
              size="small"
              label="3x faster"
              color="success"
              variant="outlined"
              sx={{ fontSize: '0.7rem' }}
            />
          )}
          {components.length > 0 && (
            <Chip
              size="small"
              label={`${components.length} found`}
              color="primary"
              variant="filled"
            />
          )}
        </Box>
      </Box>

      {/* Current action */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {extractionProgress.message}
      </Typography>

      {/* Parallel processing indicator */}
      {isParallel && extractionProgress.status !== 'complete' && (
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {[1, 2, 3].map((slot) => (
              <Box
                key={slot}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: extractionProgress.stepDetail?.includes(`${slot} of`) ||
                    (parseInt(extractionProgress.stepDetail?.split(' ')[0] || '0') >= slot)
                    ? 'primary.main'
                    : 'action.disabled',
                  animation: 'pulse 1.5s infinite',
                  animationDelay: `${slot * 0.2}s`,
                  '@keyframes pulse': {
                    '0%, 100%': { opacity: 0.4 },
                    '50%': { opacity: 1 },
                  },
                }}
              />
            ))}
          </Box>
          <Typography variant="caption" color="text.secondary">
            {extractionProgress.stepDetail}
          </Typography>
        </Box>
      )}

      {/* Progress bar */}
      <LinearProgress
        variant="determinate"
        value={progress}
        color={extractionProgress.status === 'error' ? 'error' : 'primary'}
        sx={{ height: 8, borderRadius: 4, mb: 1 }}
      />

      {/* Footer stats */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="caption" color="text.secondary">
          {extractionProgress.screensCompleted} of {extractionProgress.totalScreens} screens completed
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {extractionProgress.elapsedMs > 0 && (
            <Typography variant="caption" color="text.secondary">
              Elapsed: {formatDuration(extractionProgress.elapsedMs)}
            </Typography>
          )}
          {extractionProgress.estimatedRemainingMs !== undefined &&
            extractionProgress.estimatedRemainingMs > 0 && (
              <Typography variant="caption" color="primary.main" fontWeight="medium">
                ~{formatDuration(extractionProgress.estimatedRemainingMs)} remaining
              </Typography>
            )}
        </Box>
      </Box>

      {/* Step detail */}
      {extractionProgress.stepDetail && (
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}
        >
          {extractionProgress.stepDetail}
        </Typography>
      )}
    </Box>
  );
}

export function Components() {
  const {
    components,
    searchQuery,
    selectedCategory,
    selectedTags,
    setSearchQuery,
    setSelectedCategory,
    toggleTag,
    clearFilters,
    selectedComponent,
    selectComponent,
    extractWithLLM,
    isExtracting,
    extractionProgress,
    // Batch selection
    selectedIds,
    toggleComponentSelection,
    selectAllComponents,
    clearSelection,
    deleteSelectedComponents,
    approveSelectedComponents,
    rejectSelectedComponents,
    markSelectedAsNeedsFix,
  } = useComponentsStore();

  const { screens, initializeScreens } = useScreensStore();
  const { showSuccess, showError } = useSnackbar();

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Initialize screens if not loaded
  useEffect(() => {
    if (screens.length === 0) {
      initializeScreens();
    }
  }, []);

  // Handle LLM extraction
  const handleExtract = async () => {
    try {
      const result = await extractWithLLM(screens);

      if (!result) {
        showError('Extraction failed - no result returned');
        return;
      }

      if (result.failedScreens === result.totalScreens && result.totalScreens > 0) {
        // All screens failed
        const errorMsg = result.errors[0]?.error || 'Unknown error';
        showError(
          `Failed to extract components: ${errorMsg}. Check your API key configuration in Settings.`
        );
      } else if (result.failedScreens > 0) {
        // Some screens failed
        showSuccess(
          `Extracted ${result.extractedCount} components from ${result.totalScreens - result.failedScreens}/${result.totalScreens} screens (${result.failedScreens} failed)`
        );
      } else {
        // All succeeded
        showSuccess(
          `Extracted ${result.extractedCount} components from ${result.totalScreens} screens`
        );
      }
    } catch (error) {
      showError(
        error instanceof Error ? error.message : 'Failed to extract components'
      );
    }
  };

  const categories = useMemo(() => getCategories(components), [components]);
  const allTags = useMemo(() => getAllTags(components), [components]);

  const filteredComponents = useMemo(() => {
    return components.filter((comp) => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = comp.name.toLowerCase().includes(query);
        const matchesDescription = comp.description?.toLowerCase().includes(query);
        const matchesTags = comp.tags.some((tag) => tag.toLowerCase().includes(query));
        const matchesCategory = comp.category.toLowerCase().includes(query);
        if (!matchesName && !matchesDescription && !matchesTags && !matchesCategory) {
          return false;
        }
      }

      if (selectedCategory && comp.category !== selectedCategory) {
        return false;
      }

      if (selectedTags.length > 0) {
        const hasAllTags = selectedTags.every((tag) => comp.tags.includes(tag));
        if (!hasAllTags) {
          return false;
        }
      }

      return true;
    });
  }, [components, searchQuery, selectedCategory, selectedTags]);

  const hasFilters = searchQuery || selectedCategory || selectedTags.length > 0;
  const { config } = useThemeStore();
  const screensWithHtml = screens.filter((s) => s.editedHtml);

  return (
    <Box>
      {/* Header */}
      <PageHeader
        title="Component Library"
        actions={
          <>
            <TextField
              placeholder="Search components..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="small"
              sx={{
                width: 220,
                '& .MuiOutlinedInput-root': {
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  },
                  '&.Mui-focused': {
                    boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
                  },
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <MagnifyingGlass size={18} color={config.colors.textSecondary} />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <Select
                value={selectedCategory || ''}
                displayEmpty
                onChange={(e) => setSelectedCategory(e.target.value || null)}
                sx={{ fontSize: '0.875rem' }}
              >
                <MenuItem value="">All Categories</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat} value={cat} sx={{ textTransform: 'capitalize' }}>
                    {cat}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, v) => v && setViewMode(v)}
              size="small"
              sx={{
                '& .MuiToggleButton-root': {
                  transition: 'all 0.2s ease',
                },
              }}
            >
              <ToggleButton value="grid">
                <GridFour size={18} />
              </ToggleButton>
              <ToggleButton value="list">
                <List size={18} />
              </ToggleButton>
            </ToggleButtonGroup>
            <Button
              variant="contained"
              startIcon={
                isExtracting ? (
                  <CircularProgress size={18} color="inherit" />
                ) : (
                  <Lightning size={18} weight="fill" />
                )
              }
              onClick={handleExtract}
              disabled={isExtracting || screensWithHtml.length === 0}
              sx={{
                transition: 'all 0.2s ease',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                },
              }}
            >
              {isExtracting ? 'Extracting...' : 'Extract with AI'}
            </Button>
          </>
        }
      />

      {/* Extraction progress */}
      {isExtracting && extractionProgress && <ExtractionProgressDisplay />}

      {/* No screens warning */}
      {screensWithHtml.length === 0 && !isExtracting && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Upload some screens first to extract components. Go to the Screens page to upload HTML files.
        </Alert>
      )}

      {/* Tag filters - inline below header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          {filteredComponents.length} of {components.length} components
        </Typography>

        {allTags.length > 0 && (
          <>
            <Box sx={{ width: 1, height: 16, bgcolor: 'divider', mx: 1 }} />
            {allTags.slice(0, 8).map((tag) => (
              <Chip
                key={tag}
                label={tag}
                size="small"
                color={selectedTags.includes(tag) ? 'primary' : 'default'}
                variant={selectedTags.includes(tag) ? 'filled' : 'outlined'}
                onClick={() => toggleTag(tag)}
                sx={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
              />
            ))}
          </>
        )}
        {hasFilters && (
          <Button size="small" startIcon={<X size={14} />} onClick={clearFilters} sx={{ ml: 1 }}>
            Clear
          </Button>
        )}
      </Box>

      {/* Components Grid */}
      {filteredComponents.length === 0 ? (
        <EmptyState
          title={
            hasFilters
              ? 'No components match your filters'
              : 'No components extracted yet'
          }
          description={
            hasFilters
              ? 'Try adjusting your filters'
              : 'Click "Extract with AI" to analyze your screens and generate reusable components'
          }
          action={hasFilters ? { label: 'Clear Filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <Grid container spacing={2}>
          {filteredComponents.map((component) => (
            <Grid
              item
              key={component.id}
              xs={12}
              sm={6}
              md={viewMode === 'grid' ? 4 : 6}
              lg={viewMode === 'grid' ? 3 : 4}
            >
              <ComponentCard
                component={component}
                onClick={() => selectComponent(component)}
                isSelected={selectedIds.includes(component.id)}
                onToggleSelect={() => toggleComponentSelection(component.id)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Detail Modal */}
      <ComponentDetailModal
        component={selectedComponent}
        open={!!selectedComponent}
        onClose={() => selectComponent(null)}
      />

      {/* Floating Batch Selection Bar */}
      <BatchSelectionBar
        selectedCount={selectedIds.length}
        totalCount={filteredComponents.length}
        onSelectAll={() => {
          if (selectedIds.length === filteredComponents.length) {
            clearSelection();
          } else {
            selectAllComponents(filteredComponents.map((c) => c.id));
          }
        }}
        onClearSelection={clearSelection}
        actions={[
          {
            label: 'Approve',
            icon: <CheckCircle size={18} weight="fill" />,
            color: 'success',
            onClick: () => {
              const count = selectedIds.length;
              approveSelectedComponents();
              showSuccess(`Approved ${count} components`);
            },
          },
          {
            label: 'Reject',
            icon: <XCircle size={18} weight="fill" />,
            color: 'error',
            onClick: () => {
              const count = selectedIds.length;
              rejectSelectedComponents();
              showSuccess(`Rejected ${count} components`);
            },
          },
          {
            label: 'Needs Fix',
            icon: <Wrench size={18} weight="fill" />,
            color: 'warning',
            onClick: () => {
              const count = selectedIds.length;
              markSelectedAsNeedsFix();
              showSuccess(`Marked ${count} components as needs fix`);
            },
          },
          {
            label: 'Delete',
            icon: <Trash size={18} weight="fill" />,
            color: 'error',
            onClick: () => {
              const count = selectedIds.length;
              deleteSelectedComponents();
              showSuccess(`Deleted ${count} components`);
            },
          },
        ]}
      />
    </Box>
  );
}
