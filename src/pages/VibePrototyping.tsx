/**
 * VibePrototyping Page - Full implementation with dynamic phases and resizable chat
 *
 * Features:
 * - Dynamic text per AI phase (Understanding, Planning, Building, Summary)
 * - Resizable chat panel (25% default, draggable)
 * - Consolidated toolbar with action groups
 * - File attachments support (images, video, audio, URLs)
 * - Context-aware chat (product context + prototype context)
 * - Streaming/progressive loading for variants
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CardActionArea from '@mui/material/CardActionArea';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Grid from '@mui/material/Grid';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import Divider from '@mui/material/Divider';
import Fade from '@mui/material/Fade';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import RadioGroup from '@mui/material/RadioGroup';
import Radio from '@mui/material/Radio';
import Select from '@mui/material/Select';
import InputLabel from '@mui/material/InputLabel';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import {
  Button,
  TextField,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@/components/ui';
import {
  Code,
  Cursor,
  PencilSimple,
  ArrowCounterClockwise,
  ArrowClockwise,
  ArrowsClockwise,
  Lightning,
  Paperclip,
  ShareNetwork,
  Microphone,
  Warning,
  CaretDown,
  CaretRight,
  Image as ImageIcon,
  VideoCamera,
  LinkSimple,
  FilePdf,
  File,
  Check,
  Copy,
  Download,
  Brain,
  Info,
  X,
  Robot,
  DeviceMobile,
  DeviceTablet,
  Desktop,
  DotsSixVertical,
  ClockCounterClockwise,
  Shuffle,
  Timer,
  Lightbulb,
  ListChecks,
  PencilLine,
  Cube,
  UsersThree,
  Plus,
  SquaresFour,
  Play,
} from '@phosphor-icons/react';

import { useSnackbar } from '@/components/SnackbarProvider';
import { LLMDebugPanel, LLMDebugButton } from '@/components/DebugPanel';
import { useScreensStore } from '@/store/screensStore';
import { useVibeStore, type ChatMessage } from '@/store/vibeStore';
import { useContextStore } from '@/store/contextStore';
import { useThemeStore } from '@/store/themeStore';
import { getContextFiles, type ContextFile } from '@/services/contextFilesService';

import { supabase } from '@/services/supabase';
import {
  analyzeScreen,
  getCachedMetadata,
  type UIMetadata,
} from '@/services/screenAnalyzerService';
import {
  createVibeSession,
  generateVariantPlan,
  getVibeSession,
  getVariantPlans,
  approvePlan,
} from '@/services/variantPlanService';
import {
  getVariants,
  saveVariantEditedHtml,
  saveVariantPartialHtml,
  getPartialHtmlForSession,
  GenerationError,
} from '@/services/variantCodeService';
import {
  generateVisualWireframes,
  getVisualWireframesForSession,
  type VisualWireframeResult,
} from '@/services/wireframeService';
import {
  getApiKeys,
  PROVIDER_INFO,
  type LLMProvider,
  type ApiKeyConfig,
} from '@/services/apiKeysService';
import {
  iterateOnVariant,
  getIterationHistory,
  revertToIteration,
  type VibeIteration,
} from '@/services/iterationService';
import {
  generateVariantsFromEdits,
} from '@/services/variantEditsService';
import {
  generateInteractivePrototypesWithAgent,
  shouldUseServerOrchestration,
} from '@/services/interactivePrototypeService';
import {
  type StartServerGenerationParams,
} from '@/services/serverGenerationService';
import { useServerGeneration } from '@/hooks/useServerGeneration';
import type { AgentProgress } from '@/types/agentTypes';
import { usePrototypeStore } from '@/store/prototypeStore';
import {
  generateUnderstanding,
  approveUnderstanding as approveUnderstandingService,
  clarifyRequest,
} from '@/services/understandingService';
import {
  createShareLink,
  type ShareType,
  type ShareLink,
} from '@/services/sharingService';
import DualModeEditor from '@/components/DualModeEditor';
import WYSIWYGEditor from '@/components/WYSIWYGEditor';
import { InteractiveVariantView } from '@/components/Vibe/InteractiveVariantView';
import { captureHtmlScreenshot, compressScreenshot } from '@/services/screenshotService';
import { quickEnhance, enhancePrototype, type EnhanceResult } from '@/services/injectionService';

// ============== Types ==============

// Pipeline steps for visual stepper
type PipelineStep = 'understanding' | 'planning' | 'wireframing' | 'prototyping' | 'sharing';

const PIPELINE_STEPS: { key: PipelineStep; label: string; description: string; icon: React.ReactNode }[] = [
  { key: 'understanding', label: 'Understanding', description: 'Analyzing your request', icon: <Lightbulb size={16} /> },
  { key: 'planning', label: 'Planning', description: 'Designing 4 approaches', icon: <ListChecks size={16} /> },
  { key: 'wireframing', label: 'Wireframing', description: 'Creating visual sketches', icon: <PencilLine size={16} /> },
  { key: 'prototyping', label: 'Prototyping', description: 'Building HTML variants', icon: <Cube size={16} /> },
  { key: 'sharing', label: 'Sharing', description: 'Ready to collect feedback', icon: <UsersThree size={16} /> },
];

interface AttachedFile {
  id: string;
  type: 'image' | 'video' | 'audio' | 'pdf' | 'url' | 'figma' | 'file';
  name: string;
  url?: string;
  file?: File;
  preview?: string;
}

type EditMode = 'cursor' | 'code' | 'wysiwyg';
type PreviewSize = 'desktop' | 'tablet' | 'mobile';

const PREVIEW_SIZES: Record<PreviewSize, { width: number; label: string; icon: React.ReactNode }> = {
  desktop: { width: 1280, label: 'Desktop', icon: <Desktop size={16} /> },
  tablet: { width: 768, label: 'Tablet', icon: <DeviceTablet size={16} /> },
  mobile: { width: 375, label: 'Mobile', icon: <DeviceMobile size={16} /> },
};

// ============== Interactivity Enhancement Hook ==============

/**
 * Custom hook for async LLM-powered interactivity enhancement
 * Falls back to quick enhance if LLM fails or is disabled
 */
function useEnhancedHtml(
  rawHtml: string | null | undefined,
  enableInteractivity: boolean,
  useLLM: boolean = true
): { enhancedHtml: string | null; isEnhancing: boolean; enhanceResult: EnhanceResult | null } {
  const [enhancedHtml, setEnhancedHtml] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhanceResult, setEnhanceResult] = useState<EnhanceResult | null>(null);
  const enhanceCache = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!rawHtml || !enableInteractivity) {
      setEnhancedHtml(rawHtml || null);
      setEnhanceResult(null);
      return;
    }

    // Check cache first
    const cacheKey = `${rawHtml.slice(0, 100)}-${useLLM}`;
    if (enhanceCache.current.has(cacheKey)) {
      setEnhancedHtml(enhanceCache.current.get(cacheKey)!);
      return;
    }

    if (useLLM) {
      // Try LLM enhancement with fallback
      setIsEnhancing(true);
      enhancePrototype(rawHtml, { useLLM: true, enableAnalytics: true })
        .then((result) => {
          console.log('[useEnhancedHtml] LLM enhancement successful:', {
            injectionsCount: result.injections.length,
            summary: result.summary,
          });
          setEnhancedHtml(result.html);
          setEnhanceResult(result);
          enhanceCache.current.set(cacheKey, result.html);
        })
        .catch((error) => {
          console.warn('[useEnhancedHtml] LLM enhancement failed, using quick enhance:', error);
          // Fallback to quick enhance
          const quickHtml = quickEnhance(rawHtml);
          setEnhancedHtml(quickHtml);
          enhanceCache.current.set(cacheKey, quickHtml);
        })
        .finally(() => {
          setIsEnhancing(false);
        });
    } else {
      // Use quick enhance (synchronous)
      const quickHtml = quickEnhance(rawHtml);
      setEnhancedHtml(quickHtml);
      enhanceCache.current.set(cacheKey, quickHtml);
    }
  }, [rawHtml, enableInteractivity, useLLM]);

  return { enhancedHtml, isEnhancing, enhanceResult };
}

// ============== Helper Components ==============

// Not found component
function NotFoundResult({ onBack }: { onBack: () => void }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '80vh',
        textAlign: 'center',
      }}
    >
      <Warning size={64} weight="light" style={{ color: '#faad14', marginBottom: 16 }} />
      <Typography variant="h5" gutterBottom>
        Screen Not Found
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        The screen you're looking for doesn't exist.
      </Typography>
      <Button variant="contained" onClick={onBack}>
        Go to Screens
      </Button>
    </Box>
  );
}

// Dynamic AI Phase component with streaming text effect
function AIPhase({
  label,
  content,
  isActive = false,
  isComplete = false,
  isCollapsible = false,
  defaultCollapsed = false,
  onClick,
}: {
  label: string;
  content: string;
  isActive?: boolean;
  isComplete?: boolean;
  isCollapsible?: boolean;
  defaultCollapsed?: boolean;
  onClick?: () => void;
}) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (isActive && content) {
      setIsStreaming(true);
      setDisplayedContent('');
      setIsCollapsed(false); // Auto-expand when active
      let index = 0;
      const interval = setInterval(() => {
        if (index < content.length) {
          setDisplayedContent(content.slice(0, index + 1));
          index++;
        } else {
          setIsStreaming(false);
          clearInterval(interval);
        }
      }, 15);
      return () => clearInterval(interval);
    } else if (isComplete) {
      setDisplayedContent(content);
    }
  }, [content, isActive, isComplete]);

  const canCollapse = isCollapsible && isComplete && !isActive;
  const isClickable = canCollapse || (onClick && isComplete);

  const handleClick = () => {
    if (onClick && isComplete) {
      onClick();
    }
    if (canCollapse) {
      setIsCollapsed(!isCollapsed);
    }
  };

  return (
    <Box sx={{ mb: 2.5, animation: 'fadeIn 0.3s ease', '@keyframes fadeIn': { from: { opacity: 0 }, to: { opacity: 1 } } }}>
      <Typography
        onClick={isClickable ? handleClick : undefined}
        sx={{
          color: '#26a69a',
          fontSize: 14,
          fontWeight: 600,
          mb: isCollapsed ? 0 : 0.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          cursor: isClickable ? 'pointer' : 'default',
          userSelect: 'none',
          transition: 'all 0.2s ease',
          '&:hover': isClickable ? { color: '#1a8a7f' } : {},
        }}
      >
        {canCollapse && (
          <CaretRight
            size={14}
            weight="bold"
            style={{
              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
              transition: 'transform 0.2s ease',
            }}
          />
        )}
        {label}
        {isActive && !isComplete && (
          <CircularProgress size={12} sx={{ color: '#26a69a' }} />
        )}
        {isComplete && <Check size={14} weight="bold" />}
      </Typography>
      <Box
        sx={{
          overflow: 'hidden',
          maxHeight: isCollapsed ? 0 : 500,
          opacity: isCollapsed ? 0 : 1,
          transition: 'all 0.3s ease',
        }}
      >
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ lineHeight: 1.6, minHeight: isCollapsed ? 0 : 40 }}
        >
          {displayedContent}
          {isStreaming && <span style={{ opacity: 0.5 }}>|</span>}
        </Typography>
      </Box>
    </Box>
  );
}

// Debug log entry type
interface DebugLogEntry {
  timestamp: Date;
  type: 'request' | 'response' | 'error';
  endpoint: string;
  data: unknown;
}

// Debug Panel Component
function DebugPanel({
  isOpen,
  onClose,
  status,
  progress,
  error,
  currentSession,
  understanding,
  plan,
  variants,
  sourceMetadata,
  currentPrompt,
  debugLogs,
}: {
  isOpen: boolean;
  onClose: () => void;
  status: string;
  progress: { stage: string; message: string; percent: number } | null;
  error: string | null;
  currentSession: { id: string; prompt: string; screen_id: string } | null;
  understanding: { text: string; model: string; provider: string; approved: boolean } | null;
  plan: { plans: { title: string; description: string }[]; model: string; provider: string } | null;
  variants: { variant_index: number; status: string; html_url?: string }[];
  sourceMetadata: UIMetadata | null;
  currentPrompt: string;
  debugLogs: DebugLogEntry[];
}) {
  const { config } = useThemeStore();
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});

  if (!isOpen) return null;

  const getStatusColor = (s: string) => {
    if (s.includes('ready') || s === 'complete') return config.colors.success;
    if (s.includes('error') || s === 'failed') return config.colors.error;
    if (s === 'idle') return config.colors.textSecondary;
    return config.colors.primary;
  };

  const getLogColor = (type: DebugLogEntry['type']) => {
    switch (type) {
      case 'request': return '#2196f3';
      case 'response': return '#4caf50';
      case 'error': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const toggleLog = (index: number) => {
    setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const formatData = (data: unknown): string => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 450,
        maxHeight: '70vh',
        bgcolor: 'background.paper',
        borderRadius: 2,
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
        border: `1px solid ${config.colors.border}`,
        zIndex: 9999,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 1.5,
          bgcolor: config.colors.bgDark,
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Code size={16} /> Debug Panel
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: 'white' }}>
          <X size={16} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2, overflow: 'auto', flex: 1, fontSize: '0.75rem', fontFamily: 'monospace' }}>
        {/* Status */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>STATUS</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getStatusColor(status) }} />
            <Typography sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600 }}>{status}</Typography>
          </Box>
          {progress && (
            <Box sx={{ mt: 1 }}>
              <LinearProgress variant="determinate" value={progress.percent} sx={{ height: 4, borderRadius: 2 }} />
              <Typography variant="caption" color="text.secondary">{progress.message} ({progress.percent}%)</Typography>
            </Box>
          )}
          {error && (
            <Box sx={{ mt: 1, p: 1, bgcolor: '#ffebee', borderRadius: 1, border: '1px solid #ffcdd2' }}>
              <Typography sx={{ color: '#c62828', fontSize: '0.75rem', fontWeight: 500 }}>Error: {error}</Typography>
            </Box>
          )}
        </Box>

        {/* Session */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>SESSION</Typography>
          <Box sx={{ mt: 0.5, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.7rem' }}>
            <div>ID: {currentSession?.id || 'None'}</div>
            <div>Screen: {currentSession?.screen_id || 'None'}</div>
          </Box>
        </Box>

        {/* Prompt */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>PROMPT</Typography>
          <Box sx={{ mt: 0.5, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.7rem', maxHeight: 80, overflow: 'auto' }}>
            {currentPrompt || currentSession?.prompt || 'No prompt yet'}
          </Box>
        </Box>

        {/* API Logs - Inputs/Outputs */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            API LOGS ({debugLogs.length})
          </Typography>
          <Box sx={{ mt: 0.5, maxHeight: 200, overflow: 'auto' }}>
            {debugLogs.length === 0 ? (
              <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontStyle: 'italic' }}>
                No API calls yet
              </Typography>
            ) : (
              debugLogs.map((log, index) => (
                <Box
                  key={index}
                  sx={{
                    mb: 1,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    onClick={() => toggleLog(index)}
                    sx={{
                      p: 0.75,
                      bgcolor: 'grey.50',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      cursor: 'pointer',
                      '&:hover': { bgcolor: 'grey.100' },
                    }}
                  >
                    <Box
                      sx={{
                        px: 0.5,
                        py: 0.25,
                        borderRadius: 0.5,
                        bgcolor: getLogColor(log.type),
                        color: 'white',
                        fontSize: '0.6rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                      }}
                    >
                      {log.type}
                    </Box>
                    <Typography sx={{ fontSize: '0.7rem', flex: 1, fontWeight: 500 }}>
                      {log.endpoint}
                    </Typography>
                    <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                      {log.timestamp.toLocaleTimeString()}
                    </Typography>
                    <CaretRight
                      size={12}
                      style={{
                        transform: expandedLogs[index] ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    />
                  </Box>
                  {expandedLogs[index] && (
                    <Box
                      sx={{
                        p: 1,
                        bgcolor: log.type === 'error' ? '#fff3f3' : '#f5f5f5',
                        maxHeight: 150,
                        overflow: 'auto',
                      }}
                    >
                      <pre style={{ margin: 0, fontSize: '0.65rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {formatData(log.data)}
                      </pre>
                    </Box>
                  )}
                </Box>
              ))
            )}
          </Box>
        </Box>

        {/* Understanding */}
        {understanding && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              UNDERSTANDING ({understanding.provider}/{understanding.model})
            </Typography>
            <Box sx={{ mt: 0.5, p: 1, bgcolor: understanding.approved ? 'success.50' : 'grey.100', borderRadius: 1, fontSize: '0.7rem', maxHeight: 80, overflow: 'auto' }}>
              {understanding.text?.slice(0, 200)}...
            </Box>
          </Box>
        )}

        {/* Plan */}
        {plan && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              PLAN ({plan.plans.length} variants - {plan.provider}/{plan.model})
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              {plan.plans.map((p, i) => (
                <Box key={i} sx={{ p: 0.5, bgcolor: 'grey.100', borderRadius: 1, mb: 0.5, fontSize: '0.65rem' }}>
                  {i + 1}. {p.title}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Variants */}
        {variants.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
              VARIANTS ({variants.length})
            </Typography>
            <Box sx={{ mt: 0.5 }}>
              {variants.map((v, i) => (
                <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.7rem' }}>
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: v.status === 'complete' ? config.colors.success : 'grey.400' }} />
                  Variant {v.variant_index}: {v.status} {v.html_url ? '✓' : ''}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Metadata */}
        {sourceMetadata && (
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>METADATA</Typography>
            <Box sx={{ mt: 0.5, p: 1, bgcolor: 'grey.100', borderRadius: 1, fontSize: '0.65rem', maxHeight: 100, overflow: 'auto' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(sourceMetadata, null, 2).slice(0, 500)}...
              </pre>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// Visual Stepper Component - Compact icon-based version
function PipelineStepper({
  status,
  onStepClick,
}: {
  status: string;
  onStepClick?: (step: PipelineStep) => void;
}) {
  const { config } = useThemeStore();

  // Map status to step
  const getStepState = (step: PipelineStep): 'completed' | 'active' | 'pending' => {
    const statusMap: Record<string, PipelineStep[]> = {
      idle: [],
      analyzing: ['understanding'],
      understanding: ['understanding'],
      understanding_ready: ['understanding'],
      planning: ['understanding', 'planning'],
      plan_ready: ['understanding', 'planning'],
      wireframing: ['understanding', 'planning', 'wireframing'],
      wireframe_ready: ['understanding', 'planning', 'wireframing'],
      generating: ['understanding', 'planning', 'wireframing', 'prototyping'],
      complete: ['understanding', 'planning', 'wireframing', 'prototyping', 'sharing'],
    };

    const activeSteps = statusMap[status] || [];
    const lastActiveIndex = activeSteps.length - 1;
    const stepIndex = PIPELINE_STEPS.findIndex(s => s.key === step);
    const lastStepIndex = PIPELINE_STEPS.findIndex(s => s.key === activeSteps[lastActiveIndex]);

    if (stepIndex < lastStepIndex) return 'completed';
    if (stepIndex === lastStepIndex) return 'active';
    return 'pending';
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.5,
        py: 1,
        px: 1,
        bgcolor: 'rgba(0,0,0,0.02)',
        borderBottom: `1px solid ${config.colors.border}`,
      }}
    >
      {PIPELINE_STEPS.map((step, index) => {
        const state = getStepState(step.key);
        const isLast = index === PIPELINE_STEPS.length - 1;

        const isClickable = state === 'completed' && onStepClick;
        return (
          <React.Fragment key={step.key}>
            <Tooltip
              title={isClickable ? `Go back to ${step.label}` : `${step.label}: ${step.description}`}
              placement="top"
              arrow
            >
              <Box
                onClick={isClickable ? () => onStepClick(step.key) : undefined}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: state === 'completed'
                    ? config.colors.success
                    : state === 'active'
                      ? config.colors.primary
                      : 'grey.200',
                  color: state === 'pending' ? 'grey.500' : 'white',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  cursor: isClickable ? 'pointer' : 'default',
                  '&:hover': isClickable ? {
                    transform: 'scale(1.1)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  } : {},
                }}
              >
                {state === 'completed' ? <Check size={14} weight="bold" /> : step.icon}
                {/* Don't show spinner for 'sharing' step - it's user-initiated, not a processing step */}
                {state === 'active' && step.key !== 'sharing' && (
                  <CircularProgress
                    size={32}
                    thickness={2}
                    sx={{
                      color: config.colors.primary,
                      position: 'absolute',
                      top: -2,
                      left: -2,
                    }}
                  />
                )}
              </Box>
            </Tooltip>
            {!isLast && (
              <Box
                sx={{
                  width: 16,
                  height: 2,
                  bgcolor: state === 'completed' ? config.colors.success : 'grey.300',
                  borderRadius: 1,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}

// Variant Card in the left panel with agent progress support
function VariantCard({
  title,
  description,
  wireframeUrl,
  variantIndex: _variantIndex,
  isSelected = false,
  isChecked = true,
  isBuilding = false,
  isComplete = false,
  isQueued = false,
  progress = 0,
  progressMessage,
  elapsedTime,
  showCheckbox = false,
  onToggleCheck,
  onClick,
  agentSteps,
}: {
  title: string;
  description: string;
  wireframeUrl?: string;
  variantIndex?: number;
  isSelected?: boolean;
  isChecked?: boolean;
  isBuilding?: boolean;
  isComplete?: boolean;
  isQueued?: boolean;
  progress?: number;
  progressMessage?: string;
  elapsedTime?: string;
  showCheckbox?: boolean;
  onToggleCheck?: () => void;
  onClick?: () => void;
  /** Agent progress steps for granular display */
  agentSteps?: Array<{ stepKey: string; label: string; status: 'pending' | 'in_progress' | 'completed' | 'failed' }>;
}) {
  const { config } = useThemeStore();
  const [showWireframe, setShowWireframe] = useState(false);

  return (
    <Card
      variant="outlined"
      sx={{
        mb: 1.5,
        cursor: onClick ? 'pointer' : 'default',
        border: isComplete && onClick
          ? `2px solid ${config.colors.success}`
          : isSelected
            ? `2px solid ${config.colors.primary}`
            : '1px solid #e0e0e0',
        backgroundColor: isComplete && onClick ? '#f0fdf4' : isChecked ? 'white' : 'grey.50',
        transition: 'all 0.2s ease',
        opacity: isBuilding ? 0.9 : isChecked ? 1 : 0.6,
        '&:hover': onClick ? {
          borderColor: isComplete ? config.colors.success : config.colors.primary,
          transform: 'translateX(4px)',
          boxShadow: isComplete ? '0 2px 8px rgba(34, 197, 94, 0.2)' : undefined,
        } : {},
      }}
      onClick={onClick}
    >
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {showCheckbox && (
              <Box
                component="span"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCheck?.();
                }}
                sx={{
                  width: 18,
                  height: 18,
                  borderRadius: '4px',
                  border: '2px solid',
                  borderColor: isChecked ? config.colors.primary : 'grey.400',
                  backgroundColor: isChecked ? config.colors.primary : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  '&:hover': {
                    borderColor: config.colors.primary,
                  },
                }}
              >
                {isChecked && <Check size={12} color="white" weight="bold" />}
              </Box>
            )}
            <Typography variant="subtitle2" fontWeight={600} sx={{ color: isChecked ? 'text.primary' : 'text.secondary' }}>
              {title}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {wireframeUrl && !isComplete && (
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWireframe(!showWireframe);
                }}
                sx={{ p: 0.25, color: showWireframe ? config.colors.primary : 'grey.500' }}
              >
                {showWireframe ? <CaretDown size={14} /> : <CaretRight size={14} />}
              </IconButton>
            )}
            {isComplete && (
              <Chip
                label="Preview"
                size="small"
                icon={<Play size={10} weight="fill" />}
                sx={{
                  height: 20,
                  fontSize: 10,
                  bgcolor: config.colors.success,
                  color: 'white',
                  '& .MuiChip-icon': { color: 'white', ml: 0.5 },
                  cursor: 'pointer',
                }}
              />
            )}
            {isBuilding && <CircularProgress size={14} />}
            {isQueued && (
              <Chip
                label="Queued"
                size="small"
                sx={{ height: 18, fontSize: 10, bgcolor: 'grey.200' }}
              />
            )}
          </Box>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 13, mb: (isBuilding || isQueued) ? 1 : 0 }}>
          {description}
        </Typography>

        {/* Visual wireframe preview in iframe - only show for non-complete variants */}
        {wireframeUrl && showWireframe && !isComplete && (
          <Box
            sx={{
              mt: 1.5,
              borderRadius: 1,
              overflow: 'hidden',
              border: '1px solid #e0e0e0',
              bgcolor: '#fafafa',
            }}
          >
            <FetchedHtmlIframe
              url={wireframeUrl}
              title="Wireframe Preview"
              style={{
                width: '100%',
                height: 200,
                border: 'none',
                display: 'block',
              }}
            />
          </Box>
        )}

        {/* Detailed building progress with agent steps - show for building AND completed */}
        {(isBuilding || (isComplete && agentSteps && agentSteps.length > 0)) && (
          <Box sx={{ mt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: isComplete ? 'success.main' : 'primary.main', fontWeight: 500, fontSize: 11 }}>
                {isComplete ? 'Completed' : (progressMessage || 'Generating...')}
              </Typography>
              {elapsedTime && (
                <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>
                  {elapsedTime}
                </Typography>
              )}
            </Box>

            {/* Agent progress steps */}
            {agentSteps && agentSteps.length > 0 ? (
              <Box sx={{ mt: 0.5, mb: 0.5 }}>
                {agentSteps.map((step) => (
                  <Box
                    key={step.stepKey}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      py: 0.25,
                      fontSize: 10,
                    }}
                  >
                    {step.status === 'completed' && (
                      <Check size={10} weight="bold" style={{ color: '#22c55e' }} />
                    )}
                    {step.status === 'in_progress' && (
                      <CircularProgress size={10} thickness={6} />
                    )}
                    {step.status === 'pending' && (
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', border: '1px solid #e0e0e0' }} />
                    )}
                    {step.status === 'failed' && (
                      <X size={10} weight="bold" style={{ color: '#ef4444' }} />
                    )}
                    <Typography
                      variant="caption"
                      sx={{
                        fontSize: 10,
                        color: step.status === 'in_progress' ? 'primary.main' :
                               step.status === 'completed' ? 'success.main' :
                               step.status === 'failed' ? 'error.main' : 'text.secondary',
                        fontWeight: step.status === 'in_progress' ? 500 : 400,
                      }}
                    >
                      {step.label}
                    </Typography>
                  </Box>
                ))}
              </Box>
            ) : (
              !isComplete && (
                <>
                  <LinearProgress
                    variant="determinate"
                    value={progress}
                    sx={{ height: 4, borderRadius: 2 }}
                  />
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10, mt: 0.25, display: 'block' }}>
                    {Math.round(progress)}% complete
                  </Typography>
                </>
              )
            )}
          </Box>
        )}

        {/* Queued state */}
        {isQueued && !isBuilding && (
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'grey.400' }} />
            <Typography variant="caption" color="text.secondary">
              Waiting in queue...
            </Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

// Reusable iframe component that fetches HTML and uses srcDoc to bypass CSP restrictions
function FetchedHtmlIframe({
  url,
  fallbackHtml,
  title,
  style,
  enableInteractivity = false,
  useLLMEnhancement = true,
}: {
  url?: string | null;
  fallbackHtml?: string | null;
  title: string;
  style?: React.CSSProperties;
  enableInteractivity?: boolean;
  useLLMEnhancement?: boolean;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    if (url) {
      setHtml(null);
      setIsFetching(true);
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(content => {
          setHtml(content);
          setIsFetching(false);
        })
        .catch(() => {
          setIsFetching(false);
        });
    } else {
      setHtml(null);
      setIsFetching(false);
    }
  }, [url]);

  const rawHtml = html || fallbackHtml;
  // Use LLM-powered enhancement hook for interactivity
  const { enhancedHtml, isEnhancing } = useEnhancedHtml(rawHtml, enableInteractivity, useLLMEnhancement);

  if (enhancedHtml) {
    return (
      <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
        <iframe
          srcDoc={enhancedHtml}
          title={title}
          style={style}
        />
        {isEnhancing && (
          <Box
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              bgcolor: 'rgba(0,0,0,0.6)',
              color: 'white',
              px: 1,
              py: 0.5,
              borderRadius: 1,
              fontSize: 11,
            }}
          >
            <CircularProgress size={12} sx={{ color: 'white' }} />
            Enhancing...
          </Box>
        )}
      </Box>
    );
  }

  if (isFetching || isEnhancing) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#fafafa',
        }}
      >
        <CircularProgress size={24} />
      </Box>
    );
  }

  return null;
}

// Canvas variant preview card (in 2x2 grid)
function CanvasVariantCard({
  label,
  isLoading = false,
  htmlUrl,
  wireframeUrl,
  wireframeHtml,
  streamingHtml,
  progress = 0,
  onClick,
  viewMode = 'prototypes',
  enableInteractivity = false,
  useLLMEnhancement = true,
}: {
  label: string;
  isLoading?: boolean;
  htmlUrl?: string | null;
  wireframeUrl?: string | null;
  wireframeHtml?: string | null;
  streamingHtml?: string | null;
  progress?: number;
  onClick?: () => void;
  viewMode?: 'wireframes' | 'prototypes';
  enableInteractivity?: boolean;
  useLLMEnhancement?: boolean;
}) {
  // Show streaming preview if available during loading
  const showStreamingPreview = isLoading && streamingHtml && streamingHtml.length > 100;
  // In wireframe mode, always show wireframe if available (even if prototype exists)
  // In prototype mode, show prototype if available, fall back to wireframe
  const forceWireframeView = viewMode === 'wireframes' && (wireframeUrl || wireframeHtml);
  const showWireframePreview = forceWireframeView || (!htmlUrl && !isLoading && (wireframeUrl || wireframeHtml));
  // Show prototype only if in prototype mode and available
  const showPrototypePreview = viewMode === 'prototypes' && htmlUrl && !isLoading;

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': onClick ? {
          borderColor: '#764ba2',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          transform: 'translateY(-2px)',
        } : {},
      }}
    >
      <CardActionArea
        sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}
        onClick={onClick}
        disabled={!onClick}
      >
        <Box
          sx={{
            flex: 1,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#fafafa',
            position: 'relative',
            minHeight: 200,
          }}
        >
          {isLoading && !showStreamingPreview ? (
            <Box sx={{ textAlign: 'center', p: 2 }}>
              <CircularProgress size={32} sx={{ mb: 1.5 }} />
              <Typography variant="body2" color="text.secondary" fontWeight={500}>
                Building {label}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {Math.round(progress)}% complete
              </Typography>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ mt: 1.5, width: 120, height: 4, borderRadius: 2 }}
              />
            </Box>
          ) : showStreamingPreview ? (
            // Streaming preview with progress overlay
            <Box
              sx={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <iframe
                srcDoc={streamingHtml!}
                title={`${label} (streaming)`}
                style={{
                  width: '200%',
                  height: '200%',
                  border: 'none',
                  transform: 'scale(0.5)',
                  transformOrigin: 'top left',
                  pointerEvents: 'none',
                  opacity: 0.7,
                }}
              />
              {/* Streaming progress overlay */}
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.3))',
                }}
              >
                <Box sx={{ textAlign: 'center', p: 1, bgcolor: 'rgba(0,0,0,0.6)', borderRadius: 2 }}>
                  <CircularProgress size={20} sx={{ color: '#4fc3f7', mb: 0.5 }} />
                  <Typography variant="caption" sx={{ color: 'white', display: 'block' }}>
                    {Math.round(progress)}% - Live Preview
                  </Typography>
                </Box>
              </Box>
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  px: 1.5,
                  py: 0.5,
                  bgcolor: 'rgba(79, 195, 247, 0.9)',
                  borderRadius: 1,
                }}
              >
                <Typography variant="caption" sx={{ color: 'white', fontWeight: 500 }}>
                  {label} (streaming)
                </Typography>
              </Box>
            </Box>
          ) : showPrototypePreview ? (
            <Box
              sx={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <FetchedHtmlIframe
                url={htmlUrl!}
                title={label}
                enableInteractivity={enableInteractivity}
                useLLMEnhancement={useLLMEnhancement}
                style={{
                  width: '200%',
                  height: '200%',
                  border: 'none',
                  transform: 'scale(0.5)',
                  transformOrigin: 'top left',
                  pointerEvents: enableInteractivity ? 'auto' : 'none',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  px: 1.5,
                  py: 0.5,
                  bgcolor: 'rgba(0,0,0,0.7)',
                  borderRadius: 1,
                }}
              >
                <Typography variant="caption" sx={{ color: 'white', fontWeight: 500 }}>
                  {label}
                </Typography>
              </Box>
            </Box>
          ) : showWireframePreview ? (
            // Wireframe preview (sketch style)
            // Fetch URL content to bypass CSP restrictions
            <Box
              sx={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <FetchedHtmlIframe
                url={wireframeUrl}
                fallbackHtml={wireframeHtml}
                title={`${label} (wireframe)`}
                style={{
                  width: '200%',
                  height: '200%',
                  border: 'none',
                  transform: 'scale(0.5)',
                  transformOrigin: 'top left',
                  pointerEvents: 'none',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  px: 1.5,
                  py: 0.5,
                  bgcolor: 'rgba(255, 193, 7, 0.9)',
                  borderRadius: 1,
                }}
              >
                <Typography variant="caption" sx={{ color: '#333', fontWeight: 500 }}>
                  {label} (wireframe)
                </Typography>
              </Box>
            </Box>
          ) : (
            <Typography color="text.secondary">{label}</Typography>
          )}
        </Box>
      </CardActionArea>
    </Card>
  );
}

// Inline Expansion Grid - shows focused variant large with thumbnails on side
function InlineExpansionGrid({
  wireframes,
  focusedIndex,
  onEditClick,
  onIterateClick,
  getVariantByIndex,
  viewMode = 'prototypes',
  enableInteractivity = false,
  useLLMEnhancement = true,
}: {
  wireframes: Array<{ variantIndex: number; wireframeUrl: string; wireframeHtml?: string }>;
  focusedIndex: number;
  onEditClick?: () => void;
  onIterateClick?: () => void;
  getVariantByIndex: (index: number) => { html_url?: string; status: string; iteration_count?: number } | undefined;
  viewMode?: 'wireframes' | 'prototypes';
  enableInteractivity?: boolean;
  useLLMEnhancement?: boolean;
}) {
  const { config } = useThemeStore();
  const labels = ['Variant A', 'Variant B', 'Variant C', 'Variant D'];
  const focusedVariant = getVariantByIndex(focusedIndex);
  const focusedWireframe = wireframes.find(w => w.variantIndex === focusedIndex);
  // In wireframe mode, prioritize wireframe; in prototype mode, prioritize prototype
  const focusedUrl = viewMode === 'wireframes'
    ? (focusedWireframe?.wireframeUrl || focusedVariant?.html_url)
    : (focusedVariant?.html_url || focusedWireframe?.wireframeUrl);
  const focusedHtml = focusedWireframe?.wireframeHtml;
  const isWireframe = viewMode === 'wireframes' || (!focusedVariant?.html_url && (focusedWireframe?.wireframeHtml || focusedWireframe?.wireframeUrl));
  const isComplete = focusedVariant?.status === 'complete';

  // Fetch HTML content to use srcDoc (bypasses Supabase CSP restrictions)
  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Debug logging
  console.log('[InlineExpansionGrid] Render:', {
    focusedIndex,
    focusedVariant: focusedVariant ? { html_url: focusedVariant.html_url, status: focusedVariant.status } : null,
    focusedWireframe: focusedWireframe ? { wireframeUrl: focusedWireframe.wireframeUrl, hasHtml: !!focusedWireframe.wireframeHtml } : null,
    focusedUrl,
    hasFocusedHtml: !!focusedHtml,
    isWireframe,
    isComplete,
    hasFetchedHtml: !!fetchedHtml,
    isFetching,
  });

  // Always fetch HTML content to use srcDoc (bypasses Supabase CSP restrictions)
  useEffect(() => {
    if (focusedUrl) {
      setFetchedHtml(null);
      setIsFetching(true);

      // Fetch content to use as srcDoc (avoids Supabase Storage CSP issues)
      fetch(focusedUrl)
        .then(res => {
          console.log('[InlineExpansionGrid] URL fetch result:', {
            url: focusedUrl,
            ok: res.ok,
            status: res.status,
            contentType: res.headers.get('content-type'),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then(html => {
          setFetchedHtml(html);
          setIsFetching(false);
          console.log('[InlineExpansionGrid] Fetched HTML length:', html.length);
        })
        .catch(err => {
          console.error('[InlineExpansionGrid] URL fetch failed:', err);
          setIsFetching(false);
        });
    } else {
      setIsFetching(false);
    }
  }, [focusedUrl]);

  // Always use srcDoc to bypass Supabase Storage's CSP headers that block scripts
  // Priority: fetched HTML > wireframe HTML body > null
  const rawHtml = fetchedHtml || focusedHtml;
  // Use LLM-powered enhancement for interactivity (only for prototypes, not wireframes)
  const shouldEnhance = enableInteractivity && !isWireframe;
  const { enhancedHtml, isEnhancing, enhanceResult } = useEnhancedHtml(
    rawHtml,
    shouldEnhance,
    useLLMEnhancement
  );
  const effectiveHtml = shouldEnhance ? enhancedHtml : rawHtml;

  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', p: 2, minHeight: 0 }}>
      {/* Header toolbar with status and actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        {/* Left: Status chips */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isWireframe && (
            <Chip
              size="small"
              label="Wireframe"
              sx={{
                bgcolor: 'rgba(255, 193, 7, 0.2)',
                color: '#f57c00',
                fontSize: 11,
                height: 22,
              }}
            />
          )}
          {focusedVariant?.iteration_count && focusedVariant.iteration_count > 0 && (
            <Chip
              size="small"
              label={`${focusedVariant.iteration_count} iteration${focusedVariant.iteration_count > 1 ? 's' : ''}`}
              sx={{ fontSize: 11, height: 22 }}
            />
          )}
        </Box>

        {/* Right: Action buttons for complete variants */}
        {isComplete && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {onIterateClick && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<ArrowsClockwise size={16} />}
                onClick={onIterateClick}
                sx={{
                  borderColor: '#764ba2',
                  color: '#764ba2',
                  '&:hover': {
                    borderColor: '#667eea',
                    bgcolor: 'rgba(118, 75, 162, 0.04)',
                  },
                }}
              >
                Iterate
              </Button>
            )}
            {onEditClick && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<Code size={16} />}
                onClick={onEditClick}
                sx={{
                  borderColor: 'grey.400',
                  color: 'text.secondary',
                  '&:hover': {
                    borderColor: 'grey.600',
                    bgcolor: 'grey.50',
                  },
                }}
              >
                Edit Code
              </Button>
            )}
          </Box>
        )}
      </Box>

      {/* Full screen preview */}
      <Card
        variant="outlined"
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          borderRadius: 2,
          border: `2px solid ${config.colors.primary}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        {effectiveHtml ? (
          <Box sx={{ position: 'relative', width: '100%', height: '100%' }}>
            <iframe
              key={`html-${focusedIndex}-${effectiveHtml.length}`}
              srcDoc={effectiveHtml}
              title={labels[focusedIndex - 1]}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
            {isEnhancing && (
              <Box
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  bgcolor: 'rgba(0,0,0,0.7)',
                  color: 'white',
                  px: 1.5,
                  py: 0.75,
                  borderRadius: 2,
                  fontSize: 12,
                }}
              >
                <CircularProgress size={14} sx={{ color: 'white' }} />
                Adding interactivity...
              </Box>
            )}
            {enhanceResult && !isEnhancing && shouldEnhance && (
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  right: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  bgcolor: 'rgba(16, 185, 129, 0.9)',
                  color: 'white',
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  fontSize: 11,
                }}
              >
                <Lightning size={12} weight="fill" />
                {enhanceResult.injections.length} interactions
              </Box>
            )}
          </Box>
        ) : isFetching || isEnhancing ? (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#fafafa',
            }}
          >
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#fafafa',
            }}
          >
            <Typography color="text.secondary">No preview available</Typography>
          </Box>
        )}
      </Card>
    </Box>
  );
}

// File attachment chip
function AttachmentChip({
  file,
  onRemove,
}: {
  file: AttachedFile;
  onRemove: () => void;
}) {
  const getIcon = () => {
    switch (file.type) {
      case 'image': return <ImageIcon size={14} />;
      case 'video': return <VideoCamera size={14} />;
      case 'url':
      case 'figma': return <LinkSimple size={14} />;
      case 'pdf': return <FilePdf size={14} />;
      default: return <File size={14} />;
    }
  };

  return (
    <Chip
      icon={getIcon()}
      label={file.name}
      size="small"
      onDelete={onRemove}
      sx={{
        maxWidth: 150,
        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
      }}
    />
  );
}

// ============== Main Component ==============

export const VibePrototyping: React.FC = () => {
  const { screenId, sessionId } = useParams<{ screenId: string; sessionId?: string }>();
  const navigate = useNavigate();
  const { showSuccess, showError } = useSnackbar();
  const { config } = useThemeStore();

  // External stores
  const { getScreenById, initializeScreens, screens, updateScreen } = useScreensStore();
  const { contexts } = useContextStore();

  // Vibe store
  const {
    currentSession,
    sourceMetadata,
    understanding,
    plan,
    variants,
    selectedVariants,
    status,
    progress,
    initSession,
    setSession,
    clearSession,
    setSourceMetadata,
    setAnalyzing,
    setUnderstanding,
    approveUnderstanding: storeApproveUnderstanding,
    toggleVariantSelection,
    setPlan,
    approvePlan: storeApprovePlan,
    setVariants,
    setStatus,
    setProgress,
    error,
    setError,
    addMessage,
    getPlanByIndex,
    getVariantByIndex,
    prototypeMode,
    setPrototypeMode,
  } = useVibeStore();

  // Local state
  const [isLoading, setIsLoading] = useState(true);
  const [screen, setScreen] = useState<ReturnType<typeof getScreenById> | null>(null);
  const [screenScreenshot, setScreenScreenshot] = useState<string | null>(null); // Base64 screenshot for LLM vision
  const [promptValue, setPromptValue] = useState('');
  const [focusedVariantIndex, setFocusedVariantIndex] = useState<number | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('cursor');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareType, setShareType] = useState<ShareType>('random');
  const [shareVariantIndex, setShareVariantIndex] = useState<number>(1);
  const [shareExpiration, setShareExpiration] = useState<number | null>(null); // null = never
  const [shareWireframes, setShareWireframes] = useState(false); // Share wireframes vs prototypes
  const [isCreatingShare, setIsCreatingShare] = useState(false);
  const [viewMode, setViewMode] = useState<'wireframes' | 'prototypes'>('prototypes'); // Toggle between views
  const [createdShare, setCreatedShare] = useState<ShareLink | null>(null);
  const [pagesAnchorEl, setPagesAnchorEl] = useState<null | HTMLElement>(null);
  const [breadcrumbAnchorEl, setBreadcrumbAnchorEl] = useState<null | HTMLElement>(null);
  const [previewSize, setPreviewSize] = useState<PreviewSize>('desktop');
  const [interactivityEnabled, setInteractivityEnabled] = useState(false); // Enable prototype interactivity
  const [useLLMEnhancement, setUseLLMEnhancement] = useState(true); // Use LLM for smart interactivity (vs quick/default)
  const [shouldBuildAfterSkip, setShouldBuildAfterSkip] = useState(false); // Trigger build after skipping wireframes

  // Screen name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');

  // Resizable panel state - persist to localStorage
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem('voxel-chat-panel-width');
    return saved ? parseFloat(saved) : 25;
  });
  const [isResizing, setIsResizing] = useState(false);

  // Persist panel width to localStorage when it changes (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      localStorage.setItem('voxel-chat-panel-width', String(panelWidth));
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [panelWidth]);
  const resizeRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const variantEditDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partialHtmlSaveRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lastSavedLengthRef = useRef<Record<number, number>>({});
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // Dynamic phase content based on user prompt
  const [phaseContent, setPhaseContent] = useState({
    understanding: '',
    planning: '',
    summary: '',
  });

  // Current prompt for context
  const [currentPrompt, setCurrentPrompt] = useState('');

  // Track completed variants locally to prevent progress reset
  const [completedVariantIndices, setCompletedVariantIndices] = useState<Set<number>>(new Set());

  // Track variant building state for detailed progress
  const [variantStartTimes, setVariantStartTimes] = useState<Record<number, number>>({});

  // Agent progress for multi-stage generation
  const [agentProgress, setAgentProgress] = useState<AgentProgress[]>([]);
  const [variantProgressMessages, setVariantProgressMessages] = useState<Record<number, string>>({});
  const [elapsedTimes, setElapsedTimes] = useState<Record<number, string>>({});

  // Server generation hook (for server-persistent generation with streaming)
  const serverGeneration = useServerGeneration(currentSession?.id || null);

  // Store generated visual wireframes
  const [wireframes, setWireframes] = useState<VisualWireframeResult[]>([]);

  // Processing state for immediate visual feedback
  const [isProcessingPrompt, setIsProcessingPrompt] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);

  // Fetched HTML content for code view (variants store only URLs)
  const [fetchedVariantHtml, setFetchedVariantHtml] = useState<string | null>(null);
  const [isFetchingHtml, setIsFetchingHtml] = useState(false);
  const [isSavingVariantEdit, setIsSavingVariantEdit] = useState(false);
  const [hasUnsavedVariantChanges, setHasUnsavedVariantChanges] = useState(false);

  // Debounced save for variant HTML edits (1 second delay)
  const debouncedSaveVariantHtml = useCallback((variantId: string, html: string) => {
    // Clear existing timer
    if (variantEditDebounceRef.current) {
      clearTimeout(variantEditDebounceRef.current);
    }

    setHasUnsavedVariantChanges(true);

    // Set new timer
    variantEditDebounceRef.current = setTimeout(async () => {
      setIsSavingVariantEdit(true);
      try {
        const success = await saveVariantEditedHtml(variantId, html);
        if (success) {
          setHasUnsavedVariantChanges(false);
          // Update the variant in the store with edited_html
          const updatedVariants = variants.map(v =>
            v.id === variantId
              ? { ...v, edited_html: html, edited_at: new Date().toISOString() }
              : v
          );
          setVariants(updatedVariants);
          console.log('[VibePrototyping] Variant HTML saved successfully');
        } else {
          console.error('[VibePrototyping] Failed to save variant HTML');
        }
      } catch (error) {
        console.error('[VibePrototyping] Error saving variant HTML:', error);
      } finally {
        setIsSavingVariantEdit(false);
      }
    }, 1000);
  }, [variants, setVariants]);

  // Debounced save for partial HTML during streaming (3 second delay, min 5KB change)
  const debouncedSavePartialHtml = useCallback((
    sessionId: string,
    variantIndex: number,
    html: string
  ) => {
    // Clear existing timer for this variant
    if (partialHtmlSaveRef.current[variantIndex]) {
      clearTimeout(partialHtmlSaveRef.current[variantIndex]);
    }

    // Only save if significant new content (at least 5KB since last save)
    const lastLength = lastSavedLengthRef.current[variantIndex] || 0;
    const minSaveThreshold = 5000; // 5KB minimum change
    if (html.length - lastLength < minSaveThreshold && lastLength > 0) {
      return;
    }

    // Set new timer
    partialHtmlSaveRef.current[variantIndex] = setTimeout(async () => {
      try {
        await saveVariantPartialHtml(sessionId, variantIndex, html);
        lastSavedLengthRef.current[variantIndex] = html.length;
        console.log(`[VibePrototyping] Partial HTML saved for variant ${variantIndex} (${html.length} bytes)`);
      } catch (error) {
        console.error(`[VibePrototyping] Error saving partial HTML for variant ${variantIndex}:`, error);
      }
    }, 3000); // Save every 3 seconds
  }, []);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (variantEditDebounceRef.current) {
        clearTimeout(variantEditDebounceRef.current);
      }
      // Clear all partial HTML save timers
      Object.values(partialHtmlSaveRef.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  // Sync server generation progress to local state
  useEffect(() => {
    if (serverGeneration.agentProgress.length > 0) {
      // Update local agent progress from server
      setAgentProgress(serverGeneration.agentProgress);
      usePrototypeStore.getState().setAgentProgress(serverGeneration.agentProgress);

      // Update variant start times based on server progress
      serverGeneration.agentProgress.forEach(progress => {
        if (progress.startedAt && !variantStartTimes[progress.variantIndex]) {
          setVariantStartTimes(prev => ({
            ...prev,
            [progress.variantIndex]: progress.startedAt!,
          }));
        }
        if (progress.phase === 'complete') {
          setCompletedVariantIndices(prev => new Set([...prev, progress.variantIndex]));
        }
      });

      // Update progress display
      const activeProgress = serverGeneration.agentProgress.find(
        p => p.phase !== 'queued' && p.phase !== 'complete'
      );
      if (activeProgress) {
        const totalSteps = serverGeneration.agentProgress.reduce((sum, p) => sum + p.totalSteps, 0);
        const completedSteps = serverGeneration.agentProgress.reduce((sum, p) => sum + p.completedSteps, 0);
        const percent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

        setProgress({
          stage: 'generating',
          message: activeProgress.currentStep || 'Processing...',
          percent: Math.min(95, 10 + percent * 0.85),
          variantIndex: activeProgress.variantIndex,
        });
      }
    }

    // Handle completion
    if (!serverGeneration.isGenerating && serverGeneration.session?.status === 'completed') {
      setProgress({
        stage: 'complete',
        message: 'Generation complete',
        percent: 100,
      });
      usePrototypeStore.getState().completeServerGeneration();
    }

    // Handle errors
    if (serverGeneration.error) {
      setError(serverGeneration.error);
      usePrototypeStore.getState().failServerGeneration(serverGeneration.error);
    }
  }, [
    serverGeneration.agentProgress,
    serverGeneration.isGenerating,
    serverGeneration.session,
    serverGeneration.error,
    variantStartTimes,
    setProgress,
    setError,
  ]);

  // Debug mode - toggle with keyboard shortcut (Ctrl+Shift+D)
  const [debugMode, setDebugMode] = useState(false);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);

  // Helper to add debug log entries
  const addDebugLog = useCallback((type: DebugLogEntry['type'], endpoint: string, data: unknown) => {
    setDebugLogs(prev => [...prev.slice(-19), { timestamp: new Date(), type, endpoint, data }]);
  }, []);

  // Debug mode keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setDebugMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Streaming HTML for live preview during generation
  const [streamingHtml, setStreamingHtml] = useState<Record<number, string>>({});

  // V2 edit-based generation is always used for UI consistency
  // This preserves the original design system while applying targeted changes

  // Update elapsed times every second during generation
  useEffect(() => {
    const generating = status === 'generating';
    if (!generating || Object.keys(variantStartTimes).length === 0) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const newElapsedTimes: Record<number, string> = {};

      Object.entries(variantStartTimes).forEach(([index, startTime]) => {
        const idx = parseInt(index);
        if (!completedVariantIndices.has(idx)) {
          const elapsed = Math.floor((now - startTime) / 1000);
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          newElapsedTimes[idx] = mins > 0
            ? `${mins}m ${secs}s`
            : `${secs}s`;
        }
      });

      setElapsedTimes(newElapsedTimes);
    }, 1000);

    return () => clearInterval(interval);
  }, [status, variantStartTimes, completedVariantIndices]);

  // Iteration state
  const [iterationDialogOpen, setIterationDialogOpen] = useState(false);
  const [iterationPrompt, setIterationPrompt] = useState('');
  const [isIterating, setIsIterating] = useState(false);
  const [iterationHistory, setIterationHistory] = useState<VibeIteration[]>([]);
  const [showIterationHistory, setShowIterationHistory] = useState(false);

  // Generation error state (for retry dialog)
  const [generationError, setGenerationError] = useState<{
    message: string;
    code?: string;
    provider?: string;
  } | null>(null);

  // Product context files
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);

  // LLM model selector
  const [availableKeys, setAvailableKeys] = useState<ApiKeyConfig[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [llmMenuAnchorEl, setLlmMenuAnchorEl] = useState<null | HTMLElement>(null);

  // Load context files and API keys on mount
  useEffect(() => {
    getContextFiles().then(setContextFiles).catch(console.error);
    getApiKeys().then((keys) => {
      setAvailableKeys(keys);
      // Set default to first active key
      const activeKey = keys.find(k => k.isActive) || keys[0];
      if (activeKey) {
        setSelectedProvider(activeKey.provider);
        setSelectedModel(activeKey.model || PROVIDER_INFO[activeKey.provider].defaultModel);
      }
    }).catch(console.error);
  }, []);

  // Initialize screen data
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);

      if (screens.length === 0) {
        await initializeScreens();
      }

      if (screenId) {
        const s = getScreenById(screenId);
        setScreen(s);

        if (s?.editedHtml) {
          const cached = await getCachedMetadata(screenId);
          if (cached) {
            setSourceMetadata(cached as unknown as UIMetadata);
          }

          // Capture screenshot for LLM vision
          // Helper to validate and set screenshot
          const validateAndSetScreenshot = async (base64: string | undefined, source: string) => {
            if (!base64 || base64.length < 100) {
              console.warn(`[VibePrototyping] Invalid screenshot from ${source}: too small or empty`);
              return false;
            }
            // Basic validation: check for valid base64 characters
            const sample = base64.slice(0, 100) + base64.slice(-100);
            if (!/^[A-Za-z0-9+/=]+$/.test(sample.replace(/\s/g, ''))) {
              console.warn(`[VibePrototyping] Invalid screenshot from ${source}: invalid base64 characters`);
              return false;
            }
            try {
              const compressed = await compressScreenshot(base64, 400);
              setScreenScreenshot(compressed);
              console.log(`[VibePrototyping] Screenshot from ${source}, size: ${Math.round(compressed.length / 1024)}KB`);
              return true;
            } catch (err) {
              console.warn(`[VibePrototyping] Failed to compress screenshot from ${source}:`, err);
              return false;
            }
          };

          // Try to use existing thumbnail URL first, otherwise capture from HTML
          let screenshotSet = false;
          if (s.thumbnail && s.thumbnail.startsWith('http')) {
            // Fetch thumbnail URL and convert to base64
            try {
              const response = await fetch(s.thumbnail);
              const blob = await response.blob();
              const reader = new FileReader();
              reader.onloadend = async () => {
                const dataUrl = reader.result as string;
                const base64 = dataUrl?.includes(',') ? dataUrl.split(',')[1] : undefined;
                const success = await validateAndSetScreenshot(base64, 'thumbnail');
                if (!success && s.editedHtml) {
                  // Fallback to HTML capture
                  const result = await captureHtmlScreenshot(s.editedHtml, { maxWidth: 1280, maxHeight: 800, quality: 0.7 });
                  if (result) {
                    await validateAndSetScreenshot(result.base64, 'HTML fallback');
                  }
                }
              };
              reader.readAsDataURL(blob);
              screenshotSet = true; // async, will be set in callback
            } catch (err) {
              console.warn('[VibePrototyping] Failed to load thumbnail:', err);
            }
          }

          if (!screenshotSet) {
            // No thumbnail URL or failed, capture from HTML
            const result = await captureHtmlScreenshot(s.editedHtml, { maxWidth: 1280, maxHeight: 800, quality: 0.7 });
            if (result) {
              await validateAndSetScreenshot(result.base64, 'HTML capture');
            }
          }

          if (sessionId) {
            const session = await getVibeSession(sessionId);
            if (session) {
              initSession(session, s.editedHtml);
              setCurrentPrompt(session.prompt || '');

              // Load plans without changing status (status already set from session)
              const plans = await getVariantPlans(sessionId);
              if (plans.length > 0) {
                setPlan({ plans, model: '', provider: '' }, true); // skipStatusUpdate
              }

              // Load variants and sync status if variants are complete
              const existingVariants = await getVariants(sessionId);
              if (existingVariants.length > 0) {
                setVariants(existingVariants, true); // skipStatusUpdate initially

                // If all variants are complete but status isn't 'complete', sync it
                const allComplete = existingVariants.length === 4 &&
                  existingVariants.every(v => v.status === 'complete');
                if (allComplete && session.status !== 'complete') {
                  console.log('[VibePrototyping] Syncing status to complete (variants are ready)');
                  setStatus('complete');
                  // Also update the database
                  supabase.from('vibe_sessions').update({ status: 'complete' }).eq('id', sessionId);
                }
              }

              // Load wireframes if they exist
              const existingWireframes = await getVisualWireframesForSession(sessionId);
              if (existingWireframes.length > 0) {
                setWireframes(existingWireframes);
              }

              // Load partial HTML for variants that were generating (interrupted by refresh)
              const partialHtml = await getPartialHtmlForSession(sessionId);
              if (Object.keys(partialHtml).length > 0) {
                setStreamingHtml(partialHtml);
                console.log('[VibePrototyping] Restored partial HTML for variants:', Object.keys(partialHtml));
              }

              // Detect failed/interrupted generation: has plans + wireframes but variants not complete
              // This handles cases where generation was interrupted or failed
              const hasPlans = plans.length > 0;
              const hasWireframes = existingWireframes.length > 0;
              const allVariantsComplete = existingVariants.length === 4 &&
                existingVariants.every(v => v.status === 'complete');
              const isStuckInGenerating = session.status === 'generating' ||
                (hasPlans && hasWireframes && !allVariantsComplete && session.status !== 'wireframe_ready' && session.status !== 'complete');

              if (isStuckInGenerating) {
                console.log('[VibePrototyping] Detected failed/interrupted generation, setting to wireframe_ready');
                setStatus('wireframe_ready');
                if (session.error_message) {
                  setError(session.error_message);
                }
                // Update database to persist the corrected status
                supabase.from('vibe_sessions').update({ status: 'wireframe_ready' }).eq('id', sessionId);
              }

              // Also generate phase content for loaded sessions
              if (session.prompt && s.name) {
                generatePhaseContent(session.prompt, s.name);
              }
            }
          } else {
            clearSession();
          }
        }
      }

      setIsLoading(false);
    };

    init();
  }, [screenId, sessionId]);

  // Generate dynamic phase content based on prompt
  const generatePhaseContent = useCallback((prompt: string, screenName: string) => {
    const shortPrompt = prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt;

    setPhaseContent({
      understanding: `I understand you want to "${prompt}". I'll analyze the current "${screenName}" design and identify the best areas to implement this feature while maintaining design consistency and user experience best practices.`,
      planning: `Based on my analysis, I'm creating 4 distinct approaches to implement "${shortPrompt}". Each variant will explore a different UX pattern and visual treatment to give you options that range from conservative to innovative solutions.`,
      summary: `I've generated 4 variants for "${shortPrompt}". Each takes a unique approach: Variant A uses a minimal inline approach, Variant B adds a prominent modal flow, Variant C integrates it into the existing navigation, and Variant D explores a completely new interaction pattern. Click on any variant to see it in full screen.`,
    });
  }, []);

  // Handle panel resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      // Constrain between 15% and 50%
      setPanelWidth(Math.min(50, Math.max(15, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Auto-scroll chat area when status changes to states requiring user action
  useEffect(() => {
    const actionRequiredStates = ['understanding_ready', 'plan_ready', 'wireframe_ready', 'complete'];
    if (actionRequiredStates.includes(status) && chatAreaRef.current) {
      // Small delay to allow content to render
      setTimeout(() => {
        chatAreaRef.current?.scrollTo({
          top: chatAreaRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [status]);

  // Add chat message helper
  const addChatMessage = useCallback(
    (
      role: ChatMessage['role'],
      content: string,
      msgStatus?: ChatMessage['status'],
      metadata?: ChatMessage['metadata']
    ) => {
      return addMessage({ role, content, status: msgStatus, metadata });
    },
    [addMessage]
  );

  // Handle Build button click - starts with understanding phase
  const handleBuild = useCallback(async () => {
    if (!screen?.editedHtml || !screenId || !promptValue.trim()) return;

    const prompt = promptValue.trim();

    // Debug logging
    console.log('[VibePrototyping] Starting build...');
    console.log('[VibePrototyping] Screen ID:', screenId);
    console.log('[VibePrototyping] HTML length:', screen.editedHtml?.length || 0);
    console.log('[VibePrototyping] Prompt:', prompt);

    setPromptValue('');
    setCurrentPrompt(prompt);

    // Immediately show processing state for visual feedback
    setIsProcessingPrompt(true);
    setPendingPrompt(prompt);

    generatePhaseContent(prompt, screen.name || 'screen');

    try {
      addChatMessage('user', prompt);

      const sessionName = `Vibe: ${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}`;
      const session = await createVibeSession(screenId, sessionName, prompt);

      if (!session) {
        throw new Error('Failed to create session');
      }

      initSession(session, screen.editedHtml);
      // Update URL without causing a re-render/reload
      window.history.replaceState(null, '', `/prototypes/${screenId}/${session.id}`);

      // Analyzing phase - extract UI metadata
      setAnalyzing(true, 'Analyzing screen design...');

      let metadata = sourceMetadata;
      if (!metadata) {
        const result = await analyzeScreen(screenId, screen.editedHtml, (p) => {
          setProgress({
            stage: 'analyzing',
            message: p.message,
            percent: p.percent,
          });
        });
        metadata = result.metadata;
        setSourceMetadata(metadata);
      }

      // Understanding phase - LLM interprets the request
      setStatus('understanding');
      setProgress({
        stage: 'understanding',
        message: 'AI is interpreting your request...',
        percent: 20,
      });

      // Log the request being sent
      const understandingRequest = {
        sessionId: session.id,
        prompt,
        htmlLength: screen.editedHtml?.length || 0,
        hasMetadata: !!metadata,
        metadataComponents: metadata?.components?.length || 0,
      };
      addDebugLog('request', 'understand-request', understandingRequest);

      const understandingResult = await generateUnderstanding(
        session.id,
        prompt,
        screen.editedHtml,
        metadata,
        undefined, // productContext
        selectedProvider || undefined, // provider - use selected from dropdown
        selectedModel || undefined, // model - use selected from dropdown
        (p: { message: string; percent: number }) => {
          setProgress({
            stage: 'understanding',
            message: p.message,
            percent: 10 + p.percent * 0.15,
          });
        }
      );

      // Log the response received
      addDebugLog('response', 'understand-request', {
        success: true,
        model: understandingResult.model,
        provider: understandingResult.provider,
        goalsCount: understandingResult.understanding?.goals?.length || 0,
        durationMs: understandingResult.durationMs,
      });

      // Store understanding in state
      setUnderstanding({
        response: understandingResult.understanding,
        text: understandingResult.understandingText,
        model: understandingResult.model,
        provider: understandingResult.provider,
        approved: false,
      });

      // Stop at understanding_ready - user must approve understanding before planning
      setStatus('understanding_ready');
      setProgress(null);

      // Clear processing state
      setIsProcessingPrompt(false);
      setPendingPrompt(null);

      addChatMessage('assistant', `Here's my understanding of your request. Please review and confirm, or provide additional clarification if needed.`);
    } catch (err) {
      console.error('Error generating understanding:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to analyze request';

      // Log the error
      addDebugLog('error', 'understand-request', {
        error: errorMsg,
        stack: err instanceof Error ? err.stack : undefined,
      });

      setError(errorMsg);
      showError('Failed to analyze your request');

      // Clear processing state on error
      setIsProcessingPrompt(false);
      setPendingPrompt(null);
    }
  }, [screen, screenId, promptValue, sourceMetadata, contexts, generatePhaseContent, addDebugLog]);

  // Handle understanding approval - proceeds to planning phase
  const handleApproveUnderstanding = useCallback(async () => {
    if (!currentSession || !screen?.editedHtml) return;

    console.log('[VibePrototyping] Approving understanding, proceeding to planning...');

    try {
      // Approve understanding in store and service
      storeApproveUnderstanding();
      await approveUnderstandingService(currentSession.id);

      // Planning phase
      setStatus('planning');
      setProgress({
        stage: 'planning',
        message: 'AI is designing 4 distinct solutions...',
        percent: 30,
      });

      addChatMessage('assistant', 'Great! Now generating 4 unique design approaches based on your request...');

      const result = await generateVariantPlan(
        currentSession.id,
        currentSession.prompt,
        screen.editedHtml,
        sourceMetadata || undefined,
        undefined,
        (p) => {
          setProgress({
            stage: 'planning',
            message: p.message,
            percent: 30 + p.percent * 0.4,
          });
        },
        screenScreenshot || undefined, // screenshot for LLM vision
        selectedProvider || undefined, // provider from dropdown
        selectedModel || undefined // model from dropdown
      );

      setPlan({
        plans: result.plans,
        model: result.model,
        provider: result.provider,
      });

      setSession(result.session);

      // Stop at plan_ready - user must approve paradigms before wireframing
      setStatus('plan_ready');
      setProgress(null);

      addChatMessage('assistant', `I've created 4 unique paradigms to explore. Review each approach below, select which ones you want to proceed with, then click "Create Wireframes".`);
    } catch (err) {
      console.error('Error generating plan:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate plan';
      setError(errorMsg);
      showError('Failed to generate variant plan');
    }
  }, [currentSession, screen, sourceMetadata, screenScreenshot, selectedProvider, selectedModel, storeApproveUnderstanding]);

  // Handle clarification - user wants to elaborate on their request
  const [clarificationInput, setClarificationInput] = useState('');
  const [isClarifying, setIsClarifying] = useState(false);

  const handleClarify = useCallback(async () => {
    if (!currentSession || !screen?.editedHtml || !clarificationInput.trim()) return;

    console.log('[VibePrototyping] User clarifying request...');
    setIsClarifying(true);

    try {
      addChatMessage('user', `Clarification: ${clarificationInput.trim()}`);

      setStatus('understanding');
      setProgress({
        stage: 'understanding',
        message: 'Re-analyzing with your clarification...',
        percent: 20,
      });

      const understandingResult = await clarifyRequest(
        currentSession.id,
        currentSession.prompt,
        clarificationInput.trim(),
        screen.editedHtml,
        sourceMetadata || undefined,
        undefined, // productContext
        selectedProvider || undefined, // provider - use selected from dropdown
        selectedModel || undefined, // model - use selected from dropdown
        (p: { message: string; percent: number }) => {
          setProgress({
            stage: 'understanding',
            message: p.message,
            percent: 10 + p.percent * 0.15,
          });
        }
      );

      // Update understanding
      setUnderstanding({
        response: understandingResult.understanding,
        text: understandingResult.understandingText,
        model: understandingResult.model,
        provider: understandingResult.provider,
        approved: false,
      });

      setStatus('understanding_ready');
      setProgress(null);
      setClarificationInput('');

      addChatMessage('assistant', `I've updated my understanding based on your clarification. Please review again.`);
    } catch (err) {
      console.error('Error clarifying:', err);
      showError('Failed to process clarification');
    } finally {
      setIsClarifying(false);
    }
  }, [screen, screenId, promptValue, sourceMetadata, contexts, generatePhaseContent]);

  // Handle Create Wireframes button - transitions from plan_ready to wireframing
  const [isCreatingWireframes, setIsCreatingWireframes] = useState(false);

  const handleCreateWireframes = useCallback(async () => {
    if (!currentSession || !plan || !screen?.editedHtml || isCreatingWireframes) return;

    setIsCreatingWireframes(true);
    console.log('[VibePrototyping] Starting visual wireframe generation...');
    console.log('[VibePrototyping] Session ID:', currentSession.id);
    console.log('[VibePrototyping] Plans count:', plan.plans?.length);
    console.log('[VibePrototyping] Selected variants:', selectedVariants);

    try {
      addChatMessage('assistant', 'Creating visual wireframe sketches for each paradigm using AI...');

      // Approve the plan and start wireframing
      const approvedSession = await approvePlan(currentSession.id);
      if (approvedSession) {
        storeApprovePlan();
      }

      // Generate visual wireframes using LLM
      setStatus('wireframing');

      const wireframeResult = await generateVisualWireframes(
        currentSession.id,
        plan.plans,
        screen.editedHtml,
        sourceMetadata || undefined,
        selectedVariants, // Pass selected variants to only generate those
        (p) => {
          setProgress({
            stage: 'wireframing',
            message: p.message,
            percent: p.percent,
          });
        },
        screenScreenshot || undefined, // screenshot for LLM vision
        selectedProvider || undefined, // provider from dropdown
        selectedModel || undefined // model from dropdown
      );

      console.log('[VibePrototyping] Visual wireframes generated:', wireframeResult.wireframes?.length);

      // Store wireframes in local state for display
      setWireframes(wireframeResult.wireframes || []);

      // Transition to wireframe_ready
      setStatus('wireframe_ready');
      setProgress(null);

      addChatMessage('assistant', `Visual wireframe sketches are ready! I've created hand-drawn style wireframes showing the layout for each variant. Click the expand button on each card to preview the wireframe. When you're happy with the direction, click "Build High-Fidelity" to generate polished prototypes.`);
    } catch (err) {
      console.error('Error creating visual wireframes:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to create wireframes';
      showError(errorMsg);
      setError(errorMsg);
    } finally {
      setIsCreatingWireframes(false);
    }
  }, [currentSession, plan, screen, sourceMetadata, screenScreenshot, selectedProvider, selectedModel, selectedVariants, addChatMessage, storeApprovePlan, isCreatingWireframes]);

  // Handle Skip to Build button - skips wireframing and goes directly to building
  const handleSkipToBuilding = useCallback(async () => {
    if (!currentSession || !plan || selectedVariants.length === 0) return;

    console.log('[VibePrototyping] Skipping wireframes, going directly to building...');
    console.log('[VibePrototyping] Session ID:', currentSession.id);
    console.log('[VibePrototyping] Selected variants:', selectedVariants);

    try {
      addChatMessage('assistant', 'Skipping wireframes and going directly to high-fidelity prototypes...');

      // Approve the plan first
      const approvedSession = await approvePlan(currentSession.id);
      if (approvedSession) {
        storeApprovePlan();
      }

      // Transition directly to wireframe_ready (skipping wireframing)
      // This allows handleBuildHighFidelity to proceed
      setStatus('wireframe_ready');
      setWireframes([]); // No wireframes generated

      // Set flag to trigger build via useEffect (avoids circular dependency)
      setShouldBuildAfterSkip(true);
    } catch (err) {
      console.error('Error skipping to build:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to skip to build';
      showError(errorMsg);
      setError(errorMsg);
    }
  }, [currentSession, plan, selectedVariants, addChatMessage, storeApprovePlan, setStatus, showError, setError]);

  // Handle Build High-Fidelity button - transitions from wireframe_ready to generating
  const handleBuildHighFidelity = useCallback(async () => {
    if (!currentSession || !plan) return;

    // VISION-FIRST: Screenshot is required - capture on-demand if missing
    let screenshot = screenScreenshot;
    if (!screenshot && screen?.editedHtml) {
      console.log('[VibePrototyping] Screenshot missing, capturing on-demand...');
      try {
        const result = await captureHtmlScreenshot(screen.editedHtml, { maxWidth: 1280, maxHeight: 800, quality: 0.7 });
        if (result?.base64) {
          screenshot = await compressScreenshot(result.base64, 400);
          setScreenScreenshot(screenshot);
          console.log('[VibePrototyping] On-demand screenshot captured:', Math.round(screenshot.length / 1024), 'KB');
        }
      } catch (err) {
        console.error('[VibePrototyping] Failed to capture screenshot on-demand:', err);
      }
    }

    if (!screenshot) {
      showError('Screenshot is required for generation. Please wait for the screen to load.');
      return;
    }

    // Debug logging - VERSION 3: Vision-first approach
    console.log('[VibePrototyping] ========== BUILD VERSION 3 (VISION-FIRST) ==========');
    console.log('[VibePrototyping] Starting high-fidelity generation...');
    console.log('[VibePrototyping] Session ID:', currentSession.id);
    console.log('[VibePrototyping] Plans count:', plan.plans?.length);
    console.log('[VibePrototyping] Screenshot:', `${Math.round(screenshot.length / 1024)}KB`);
    console.log('[VibePrototyping] Has metadata (design tokens):', !!sourceMetadata);
    console.log('[VibePrototyping] Wireframes available:', wireframes.length);
    console.log('[VibePrototyping] Generation method: V2 edit-based (UI-preserving)');
    console.log('[VibePrototyping] Provider:', selectedProvider, 'Model:', selectedModel);

    try {
      addChatMessage('assistant', 'Starting UI-preserving prototype generation...');

      // Use the store's approveWireframes to transition to generating
      const { approveWireframes } = useVibeStore.getState();
      approveWireframes();

      // Reset completed tracking and streaming state for new build
      setCompletedVariantIndices(new Set());
      setStreamingHtml({});
      setVariantStartTimes({});
      setVariantProgressMessages({});
      setElapsedTimes({});

      // Build design tokens from UI metadata for consistency
      const designTokens = sourceMetadata ? {
        colors: sourceMetadata.colors,
        typography: {
          fontFamilies: sourceMetadata.typography?.fontFamilies || [],
          fontSizes: sourceMetadata.typography?.fontSizes || [],
          fontWeights: sourceMetadata.typography?.fontWeights || [],
        },
        layout: {
          containerWidths: sourceMetadata.layout?.containerWidths || [],
          spacing: sourceMetadata.layout?.spacing || [],
        },
        components: sourceMetadata.components?.map(c => ({ type: c.type, count: c.count })) || [],
      } : undefined;

      console.log('[VibePrototyping] Design tokens:', designTokens);

      // Build wireframe text map from available wireframes
      const wireframeTexts: Record<number, string> = {};
      for (const wf of wireframes) {
        // Use the plan description as wireframe context if no explicit wireframe text
        const planForVariant = plan.plans.find(p => p.variant_index === wf.variantIndex);
        wireframeTexts[wf.variantIndex] = planForVariant
          ? `Layout: ${planForVariant.description}\nKey changes: ${planForVariant.key_changes.join(', ')}`
          : '';
      }

      console.log('[VibePrototyping] Wireframe texts:', Object.keys(wireframeTexts).length);

      let generatedVariants;

      // V2 EDIT-BASED generation: Always use this approach for UI consistency
      // This preserves the original HTML structure and only modifies specific elements
      if (!screen?.editedHtml) {
        showError('Screen HTML not available. Please ensure the screen has been captured properly.');
        console.error('[VibePrototyping] Missing editedHtml for screen:', screen?.id);
        return;
      }

      // Check prototype mode to determine generation approach
      const currentPrototypeMode = useVibeStore.getState().prototypeMode;

      if (currentPrototypeMode === 'interactive') {
        // Interactive Mode: Use multi-stage agent architecture for file-based Web Components
        console.log('[VibePrototyping] Using Interactive Mode with Multi-Stage Agent');

        // Check if server orchestration is enabled (for server-persistent generation)
        const useServerOrchestration = shouldUseServerOrchestration();

        if (useServerOrchestration) {
          // Server-orchestrated generation: survives page refresh, streams progress via Realtime
          console.log('[VibePrototyping] Using SERVER orchestration for generation');
          addChatMessage('assistant', 'Generating interactive prototypes on the server. Generation will continue even if you refresh the page. Progress streams in real-time.');

          // Reset agent progress
          setAgentProgress([]);
          usePrototypeStore.getState().startServerGeneration();

          try {
            const params: StartServerGenerationParams = {
              vibeSessionId: currentSession.id,
              sourceHtml: screen.editedHtml,
              screenshotBase64: screenshot,
              designTokens: [], // Server generation extracts tokens from sourceHtml
              plans: plan.plans,
            };

            await serverGeneration.startGeneration(params);

            // Progress is now handled by the useServerGeneration hook via Realtime
            // The hook updates serverGeneration.agentProgress which we can sync
            setProgress({
              stage: 'generating',
              message: 'Server generation in progress...',
              percent: 10,
            });
          } catch (error) {
            console.error('[VibePrototyping] Server generation failed:', error);
            usePrototypeStore.getState().failServerGeneration(
              error instanceof Error ? error.message : 'Server generation failed'
            );
            throw error;
          }
        } else {
          // Client-orchestrated generation: original behavior
          console.log('[VibePrototyping] Using CLIENT orchestration for generation');
          addChatMessage('assistant', 'Generating interactive prototypes with Web Components using multi-stage architecture. You\'ll see granular progress for each step.');

          // Reset agent progress
          setAgentProgress([]);

          await generateInteractivePrototypesWithAgent(
            currentSession.id,
            plan.plans,
            screen.editedHtml,
            // Basic progress callback (backwards compatibility)
            (p) => {
              // Map the stage to vibeStore compatible stage
              const stageMap: Record<string, 'analyzing' | 'generating' | 'complete'> = {
                'preparing': 'analyzing',
                'analyzing': 'analyzing',
                'generating': 'generating',
                'complete': 'complete',
                'failed': 'generating',
              };
              setProgress({
                stage: stageMap[p.stage] || 'generating',
                message: p.message,
                percent: p.percent,
                variantIndex: p.variantIndex,
              });

              if (p.variantIndex) {
                setVariantStartTimes((prev) => {
                  if (!prev[p.variantIndex!]) {
                    return { ...prev, [p.variantIndex!]: Date.now() };
                  }
                  return prev;
                });
              }
            },
            // Agent progress callback (granular step-by-step)
            (progressList) => {
              setAgentProgress(progressList);
              // Also update prototype store for persistence
              usePrototypeStore.getState().setAgentProgress(progressList);
            },
            // Variant complete callback
            (result) => {
              setCompletedVariantIndices((prev) => new Set([...prev, result.variantIndex]));
            },
            screenshot
          );
        }

        // For interactive mode, we still fetch from database for UI consistency
        // The VirtualFS instances are stored in prototypeStore
        generatedVariants = await getVariants(currentSession.id);
      } else {
        // Classic Mode: Use V2 edit-based generation
        console.log('[VibePrototyping] Using Classic Mode (V2 edit-based generation)');
        addChatMessage('assistant', 'Generating variants using targeted edits to preserve your original design system. This ensures UI consistency across all prototypes.');

        await generateVariantsFromEdits(
          currentSession.id,
          plan.plans,
          screen.editedHtml,
          (p) => {
            setProgress({
              stage: 'generating',
              message: p.message,
              percent: p.percent,
              variantIndex: p.variantIndex,
            });

            if (p.variantIndex) {
              setVariantStartTimes((prev) => {
                if (!prev[p.variantIndex!]) {
                  return { ...prev, [p.variantIndex!]: Date.now() };
                }
                return prev;
              });
            }
          },
          (variantIndex, html) => {
            // Variant completed - update preview
            setStreamingHtml((prev) => ({
              ...prev,
              [variantIndex]: html,
            }));
            setCompletedVariantIndices((prev) => new Set([...prev, variantIndex]));
          },
          screenshot,
          selectedProvider || undefined,
          selectedModel || undefined
        );

        // Fetch final variants from database
        generatedVariants = await getVariants(currentSession.id);
      }

      setVariants(generatedVariants);
      setStatus('complete');
      setProgress(null);
      setStreamingHtml({}); // Clear streaming state
      lastSavedLengthRef.current = {}; // Reset saved length tracking

      showSuccess('All variants generated successfully!');
    } catch (err) {
      console.error('[VibePrototyping] Error generating variants:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[VibePrototyping] Error details:', errorMessage);

      // Check if this is an API key error - show retry dialog
      if (err instanceof GenerationError && err.code === 'API_KEY_MISSING') {
        setGenerationError({
          message: errorMessage,
          code: err.code,
          provider: err.provider,
        });
      }

      // Reset status to wireframe_ready so user can use Rebuild button
      setStatus('wireframe_ready');
      setProgress(null);
      setError(errorMessage);
      showError(`Failed to generate prototypes: ${errorMessage}`);

      // Also update the database status so it persists on reload
      if (currentSession?.id) {
        supabase.from('vibe_sessions').update({
          status: 'wireframe_ready',
          error_message: errorMessage
        }).eq('id', currentSession.id);
      }
    }
  }, [currentSession, plan, sourceMetadata, screenScreenshot, wireframes, contextFiles, selectedProvider, selectedModel, addChatMessage, setVariants, setStatus, setProgress, setError, debouncedSavePartialHtml, showError, showSuccess, screen]);

  // Handle Rebuild - re-run V2 generation for projects that already have wireframes/plans
  const [isRebuilding, setIsRebuilding] = useState(false);

  const handleRebuild = useCallback(async () => {
    if (!currentSession || !plan || isRebuilding) return;

    setIsRebuilding(true);
    console.log('[VibePrototyping] Starting rebuild...');

    try {
      addChatMessage('assistant', 'Rebuilding prototypes from existing wireframes and plans...');

      // Clear any previous error
      setError(null);

      // Reset to wireframe_ready state so the generation flow works correctly
      setStatus('wireframe_ready');

      // Clear existing variants to show fresh progress
      setVariants([]);
      setCompletedVariantIndices(new Set());
      setStreamingHtml({});
      setVariantStartTimes({});
      setVariantProgressMessages({});
      setElapsedTimes({});

      // Small delay to ensure state updates propagate
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now call the build function
      await handleBuildHighFidelity();
    } catch (err) {
      console.error('[VibePrototyping] Rebuild error:', err);
      showError('Failed to rebuild prototypes');
    } finally {
      setIsRebuilding(false);
    }
  }, [currentSession, plan, isRebuilding, addChatMessage, setStatus, setError, setVariants, handleBuildHighFidelity, showError]);

  // Effect to trigger build after skipping wireframes
  useEffect(() => {
    if (shouldBuildAfterSkip && status === 'wireframe_ready') {
      setShouldBuildAfterSkip(false);
      // Small delay to ensure UI updates
      setTimeout(() => {
        handleBuildHighFidelity();
      }, 100);
    }
  }, [shouldBuildAfterSkip, status, handleBuildHighFidelity]);

  // Handle iteration on a variant
  const handleIterate = useCallback(async () => {
    if (!currentSession || !focusedVariantIndex || !fetchedVariantHtml || !iterationPrompt.trim()) {
      return;
    }

    const focusedVariant = getVariantByIndex(focusedVariantIndex);
    if (!focusedVariant) {
      showError('Variant not found');
      return;
    }

    setIsIterating(true);
    setIterationDialogOpen(false);

    try {
      addChatMessage('user', `Iterate on Variant ${String.fromCharCode(64 + focusedVariantIndex)}: ${iterationPrompt}`);
      addChatMessage('assistant', 'Applying your changes to the variant...');

      const result = await iterateOnVariant(
        currentSession.id,
        focusedVariant.id,
        focusedVariantIndex,
        fetchedVariantHtml,
        iterationPrompt,
        (progress) => {
          if (progress.stage === 'generating') {
            // Could show progress in chat
          }
        }
      );

      if (result.success && result.htmlUrl) {
        // Refresh variants to get updated URL
        const updatedVariants = await getVariants(currentSession.id);
        setVariants(updatedVariants);

        // Fetch the new HTML for the code view
        const response = await fetch(result.htmlUrl);
        const newHtml = await response.text();
        setFetchedVariantHtml(newHtml);

        // Refresh iteration history
        const history = await getIterationHistory(focusedVariant.id);
        setIterationHistory(history);

        addChatMessage('assistant', `Iteration ${result.iterationNumber} complete! The variant has been updated.`);
        showSuccess('Variant updated successfully!');
      } else {
        addChatMessage('assistant', `Iteration failed: ${result.error}`);
        showError(result.error || 'Failed to iterate');
      }
    } catch (err) {
      console.error('Error iterating variant:', err);
      showError('Failed to iterate on variant');
    } finally {
      setIsIterating(false);
      setIterationPrompt('');
    }
  }, [currentSession, focusedVariantIndex, fetchedVariantHtml, iterationPrompt, getVariantByIndex, addChatMessage, setVariants]);

  // Handle revert to previous iteration
  const handleRevertIteration = useCallback(async (iterationId: string) => {
    if (!focusedVariantIndex) return;

    const focusedVariant = getVariantByIndex(focusedVariantIndex);
    if (!focusedVariant) return;

    try {
      const result = await revertToIteration(focusedVariant.id, iterationId);
      if (result.success && result.htmlUrl) {
        // Refresh variants
        if (currentSession) {
          const updatedVariants = await getVariants(currentSession.id);
          setVariants(updatedVariants);
        }

        // Fetch reverted HTML
        const response = await fetch(result.htmlUrl);
        const revertedHtml = await response.text();
        setFetchedVariantHtml(revertedHtml);

        showSuccess('Reverted to previous version');
      } else {
        showError(result.error || 'Failed to revert');
      }
    } catch (err) {
      console.error('Error reverting iteration:', err);
      showError('Failed to revert');
    }
  }, [focusedVariantIndex, getVariantByIndex, currentSession, setVariants]);

  // Load iteration history when focusing on a variant
  useEffect(() => {
    if (focusedVariantIndex) {
      const focusedVariant = getVariantByIndex(focusedVariantIndex);
      if (focusedVariant?.id) {
        getIterationHistory(focusedVariant.id).then(setIterationHistory);
      }
    } else {
      setIterationHistory([]);
    }
  }, [focusedVariantIndex, getVariantByIndex]);

  // Toggle to wireframe view (keeps prototypes accessible)
  const handleViewWireframes = useCallback(() => {
    setViewMode('wireframes');
    showSuccess('Viewing wireframes');
  }, [showSuccess]);

  // Toggle to prototype view
  const handleViewPrototypes = useCallback(() => {
    setViewMode('prototypes');
    showSuccess('Viewing prototypes');
  }, [showSuccess]);

  // Handle clicking on a pipeline step to switch views
  const handleStepClick = useCallback((step: PipelineStep) => {
    if (step === 'wireframing') {
      handleViewWireframes();
    } else if (step === 'prototyping' || step === 'sharing') {
      handleViewPrototypes();
    }
  }, [handleViewWireframes, handleViewPrototypes]);

  // Handle reprompting wireframes (regenerate one or all)
  const handleRepromptWireframes = useCallback(async (variantIndex?: number) => {
    if (!currentSession || !plan) return;

    // VISION-FIRST: Screenshot is required - capture on-demand if missing
    let screenshot = screenScreenshot;
    if (!screenshot && screen?.editedHtml) {
      console.log('[VibePrototyping] Screenshot missing, capturing on-demand...');
      try {
        const result = await captureHtmlScreenshot(screen.editedHtml, { maxWidth: 1280, maxHeight: 800, quality: 0.7 });
        if (result?.base64) {
          screenshot = await compressScreenshot(result.base64, 400);
          setScreenScreenshot(screenshot);
          console.log('[VibePrototyping] On-demand screenshot captured:', Math.round(screenshot.length / 1024), 'KB');
        }
      } catch (err) {
        console.error('[VibePrototyping] Failed to capture screenshot on-demand:', err);
      }
    }

    if (!screenshot) {
      showError('Screenshot is required for wireframe generation. Please wait for the screen to load.');
      return;
    }

    try {
      if (variantIndex) {
        addChatMessage('assistant', `Regenerating wireframe for Variant ${String.fromCharCode(64 + variantIndex)}...`);
      } else {
        addChatMessage('assistant', 'Regenerating all wireframes...');
      }

      setStatus('wireframing');
      setProgress({
        stage: 'wireframing',
        message: variantIndex
          ? `Regenerating wireframe for Variant ${String.fromCharCode(64 + variantIndex)}...`
          : 'Regenerating wireframes...',
        percent: 50,
      });

      // Filter plans to regenerate
      const plansToRegenerate = variantIndex
        ? plan.plans.filter(p => p.variant_index === variantIndex)
        : plan.plans;

      // Call wireframe generation
      const result = await generateVisualWireframes(
        currentSession.id,
        plansToRegenerate,
        screen?.editedHtml || '',
        sourceMetadata || undefined,
        selectedVariants,
        undefined, // onProgress
        screenshot,
        selectedProvider || undefined,
        selectedModel || undefined
      );

      // Update wireframes state
      if (variantIndex) {
        // Replace just the one wireframe
        setWireframes(prev => [
          ...prev.filter(w => w.variantIndex !== variantIndex),
          ...result.wireframes
        ].sort((a, b) => a.variantIndex - b.variantIndex));
      } else {
        // Replace all wireframes
        setWireframes(result.wireframes);
      }

      setStatus('wireframe_ready');
      setProgress(null);

      addChatMessage('assistant', variantIndex
        ? `Wireframe for Variant ${String.fromCharCode(64 + variantIndex)} has been regenerated.`
        : 'All wireframes have been regenerated. Review them and click "Build High-Fidelity" when ready.');
      showSuccess(variantIndex ? 'Wireframe regenerated!' : 'Wireframes regenerated!');

    } catch (err) {
      console.error('[VibePrototyping] Error reprompting wireframes:', err);
      setStatus('wireframe_ready');
      setProgress(null);
      showError('Failed to regenerate wireframes');
    }
  }, [currentSession, plan, screen, sourceMetadata, selectedVariants, screenScreenshot, selectedProvider, selectedModel, addChatMessage, setStatus, setProgress, showSuccess, showError]);

  // Handle file attachment
  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newAttachments: AttachedFile[] = [];

    Array.from(files).forEach((file) => {
      if (attachedFiles.length + newAttachments.length >= 20) return;

      let type: AttachedFile['type'] = 'file';
      if (file.type.startsWith('image/')) type = 'image';
      else if (file.type.startsWith('video/')) type = 'video';
      else if (file.type.startsWith('audio/')) type = 'audio';
      else if (file.type === 'application/pdf') type = 'pdf';

      const attachment: AttachedFile = {
        id: `file_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type,
        name: file.name,
        file,
        preview: type === 'image' ? URL.createObjectURL(file) : undefined,
      };

      newAttachments.push(attachment);
    });

    setAttachedFiles((prev) => [...prev, ...newAttachments]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [attachedFiles.length]);

  // Handle URL attachment (used by URL input dialog)
  const handleUrlAttach = (url: string) => {
    if (attachedFiles.length >= 20) return;

    const isFigma = url.includes('figma.com');
    const attachment: AttachedFile = {
      id: `url_${Date.now()}`,
      type: isFigma ? 'figma' : 'url',
      name: isFigma ? 'Figma Design' : new URL(url).hostname,
      url,
    };

    setAttachedFiles((prev) => [...prev, attachment]);
  };
  // Export for potential future use
  void handleUrlAttach;

  // Handle share dialog open
  const handleShare = useCallback(() => {
    // Reset share state when opening dialog
    setCreatedShare(null);
    setShareLink('');
    setShareType('random');
    setShareVariantIndex(focusedVariantIndex || 1);
    setShareExpiration(null);
    setShareDialogOpen(true);
  }, [focusedVariantIndex]);

  // Create a new share link
  const handleCreateShare = useCallback(async () => {
    if (!currentSession) return;

    setIsCreatingShare(true);
    try {
      const share = await createShareLink({
        sessionId: currentSession.id,
        shareType,
        variantIndex: shareType === 'specific' ? shareVariantIndex : undefined,
        expiresInDays: shareExpiration || undefined,
        shareWireframes,
      });

      setCreatedShare(share);
      setShareLink(share.shareUrl);
      showSuccess(`${shareWireframes ? 'Wireframe' : 'Prototype'} share link created!`);
    } catch (err) {
      console.error('Error creating share:', err);
      showError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setIsCreatingShare(false);
    }
  }, [currentSession, shareType, shareVariantIndex, shareExpiration, shareWireframes, showSuccess, showError]);

  const handleCopyShareLink = useCallback(() => {
    navigator.clipboard.writeText(shareLink);
    showSuccess('Link copied to clipboard');
  }, [shareLink, showSuccess]);

  // Handle variant selection
  const handleVariantClick = useCallback((index: number) => {
    setFocusedVariantIndex(index);
  }, []);

  const handleBackToGrid = useCallback(() => {
    setFocusedVariantIndex(null);
  }, []);

  // Handle screen name edit
  const handleStartEditName = useCallback(() => {
    setEditedName(screen?.name || '');
    setIsEditingName(true);
  }, [screen?.name]);

  const handleSaveName = useCallback(async () => {
    if (!screenId || !editedName.trim()) {
      setIsEditingName(false);
      return;
    }

    try {
      await updateScreen(screenId, { name: editedName.trim() });
      // Update local screen state
      setScreen((prev) => prev ? { ...prev, name: editedName.trim() } : prev);
      showSuccess('Screen name updated');
    } catch (error) {
      console.error('Failed to update screen name:', error);
      showError('Failed to update screen name');
    } finally {
      setIsEditingName(false);
    }
  }, [screenId, editedName, updateScreen, showSuccess, showError]);

  // Fetch HTML content when switching to code mode for a focused variant
  // Prefers edited_html (user's changes) over original html_url
  useEffect(() => {
    const fetchVariantHtml = async () => {
      if (editMode !== 'code' || !focusedVariantIndex) {
        setFetchedVariantHtml(null);
        setHasUnsavedVariantChanges(false);
        return;
      }

      const variant = getVariantByIndex(focusedVariantIndex);
      if (!variant) {
        setFetchedVariantHtml(null);
        setHasUnsavedVariantChanges(false);
        return;
      }

      // Prefer edited_html if available (user's saved changes)
      if (variant.edited_html) {
        setFetchedVariantHtml(variant.edited_html);
        setHasUnsavedVariantChanges(false);
        return;
      }

      // Otherwise fetch from original URL
      if (!variant.html_url) {
        setFetchedVariantHtml(null);
        return;
      }

      setIsFetchingHtml(true);
      try {
        const response = await fetch(variant.html_url);
        if (response.ok) {
          const html = await response.text();
          setFetchedVariantHtml(html);
        } else {
          console.error('Failed to fetch variant HTML:', response.status);
          setFetchedVariantHtml(null);
        }
      } catch (error) {
        console.error('Error fetching variant HTML:', error);
        setFetchedVariantHtml(null);
      } finally {
        setIsFetchingHtml(false);
      }
    };

    fetchVariantHtml();
  }, [editMode, focusedVariantIndex, getVariantByIndex]);

  // Computed values
  const isAnalyzing = status === 'analyzing';
  const isUnderstanding = status === 'understanding';
  const isUnderstandingReady = status === 'understanding_ready';
  const isPlanning = status === 'planning';
  const isPlanReady = status === 'plan_ready';
  const isWireframing = status === 'wireframing';
  const isWireframeReady = status === 'wireframe_ready';
  const isGenerating = status === 'generating';
  const isComplete = status === 'complete';
  const hasVariants = variants.length > 0;

  // Show plan cards when we have plans (any phase after planning)
  const showPlanCards = (isPlanning || isPlanReady || isWireframing || isWireframeReady || isGenerating || isComplete) && plan?.plans;

  const projectName = screen?.name || 'Untitled Project';
  const focusedVariant = focusedVariantIndex ? getVariantByIndex(focusedVariantIndex) : null;
  const focusedPlan = focusedVariantIndex ? getPlanByIndex(focusedVariantIndex) : null;

  // Get progress for each variant - calculate per-variant progress from overall
  const getVariantProgress = useCallback((index: number) => {
    // Check local completed set first (prevents race conditions)
    if (completedVariantIndices.has(index)) return 100;
    // Check store for completed status
    const variant = getVariantByIndex(index);
    if (variant?.status === 'complete') return 100;
    // If currently building this variant, calculate per-variant progress
    if (progress?.stage === 'generating' && progress.variantIndex === index) {
      // Calculate per-variant progress from overall progress
      // Each variant takes ~25% of total, so variant 1 is 0-25%, variant 2 is 25-50%, etc.
      const variantCount = selectedVariants.length || 4;
      const variantStartPercent = ((index - 1) / variantCount) * 100;
      const variantEndPercent = (index / variantCount) * 100;
      const variantRange = variantEndPercent - variantStartPercent;
      const currentProgress = Math.max(0, progress.percent - variantStartPercent);
      return Math.min(100, (currentProgress / variantRange) * 100);
    }
    return 0;
  }, [progress, getVariantByIndex, completedVariantIndices, selectedVariants]);

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress size={48} />
      </Box>
    );
  }

  // No screen found
  if (!screen) {
    return <NotFoundResult onBack={() => navigate('/repository/screens')} />;
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Main content area - Chat and Stage side by side */}
      <Box ref={containerRef} sx={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left Panel - Resizable Chat Panel */}
        <Box
          sx={{
            width: `${panelWidth}%`,
            minWidth: 200,
            maxWidth: '50%',
            bgcolor: '#f5f5f5',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            minHeight: 0,
          }}
        >
          {/* Pipeline Stepper - shows current phase (inside chat panel) */}
          {(status !== 'idle' || isProcessingPrompt) && (
            <PipelineStepper status={status} onStepClick={handleStepClick} />
          )}

          {/* AI Phases and Variant Cards */}
          <Box ref={chatAreaRef} sx={{ flex: 1, overflow: 'auto', p: 2, minHeight: 0 }}>
            {/* Initial empty state */}
            {status === 'idle' && !plan && !isProcessingPrompt && (
              <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary" textAlign="center">
                  Describe what you want to build
                </Typography>
              </Box>
            )}

            {/* Processing state - immediate feedback after clicking Build */}
            {isProcessingPrompt && status === 'idle' && (
              <Box sx={{ p: 2 }}>
                {/* User's prompt */}
                <Box
                  sx={{
                    mb: 3,
                    p: 2,
                    bgcolor: 'primary.50',
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: 'primary.200',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'primary.main',
                      fontWeight: 600,
                      display: 'block',
                      mb: 0.5,
                    }}
                  >
                    Your request
                  </Typography>
                  <Typography variant="body2" color="text.primary">
                    {pendingPrompt}
                  </Typography>
                </Box>

                {/* Processing indicator */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    py: 4,
                  }}
                >
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      bgcolor: 'primary.50',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      animation: 'pulse 2s infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { transform: 'scale(1)', opacity: 1 },
                        '50%': { transform: 'scale(1.05)', opacity: 0.8 },
                      },
                    }}
                  >
                    <Robot size={28} weight="fill" color={config.colors.primary} />
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography
                      variant="subtitle2"
                      sx={{ fontWeight: 600, color: 'text.primary', mb: 0.5 }}
                    >
                      Starting AI Analysis
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Initializing session and preparing context...
                    </Typography>
                  </Box>
                  <LinearProgress
                    sx={{
                      width: '60%',
                      height: 4,
                      borderRadius: 2,
                      bgcolor: 'grey.200',
                    }}
                  />
                </Box>
              </Box>
            )}

            {/* Analyzing phase */}
            {(isAnalyzing || isUnderstanding || isUnderstandingReady || isPlanning || isPlanReady || isWireframing || isWireframeReady || isGenerating || isComplete) && (
              <AIPhase
                label="Analyzing"
                content={`Extracting UI patterns and design elements from "${currentPrompt?.slice(0, 30) || 'screen'}..."...`}
                isActive={isAnalyzing}
                isComplete={!isAnalyzing}
                isCollapsible={true}
                defaultCollapsed={!isAnalyzing && (isPlanning || isPlanReady || isWireframing || isWireframeReady || isGenerating || isComplete)}
              />
            )}

            {/* Understanding phase */}
            {(isUnderstanding || isUnderstandingReady || isPlanning || isPlanReady || isWireframing || isWireframeReady || isGenerating || isComplete) && (
              <AIPhase
                label="Understanding"
                content={phaseContent.understanding || 'AI is interpreting your request and identifying key goals...'}
                isActive={isUnderstanding}
                isComplete={!isUnderstanding && !isUnderstandingReady}
                isCollapsible={true}
                defaultCollapsed={!isUnderstanding && !isUnderstandingReady && (isWireframing || isWireframeReady || isGenerating || isComplete)}
              />
            )}

            {/* Understanding Ready - show LLM's interpretation for approval */}
            {isUnderstandingReady && understanding && (
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  bgcolor: 'background.paper',
                  borderRadius: 2,
                  border: '2px solid',
                  borderColor: 'primary.main',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5, color: 'primary.main' }}>
                  Here's my understanding:
                </Typography>

                {/* Summary */}
                <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6 }}>
                  {understanding.response.summary}
                </Typography>

                {/* Goals */}
                {understanding.response.goals.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                      Key Goals:
                    </Typography>
                    {understanding.response.goals.map((goal, i) => (
                      <Typography key={i} variant="body2" sx={{ pl: 2, mb: 0.5, fontSize: '0.85rem' }}>
                        {i + 1}. {goal}
                      </Typography>
                    ))}
                  </Box>
                )}

                {/* Scope */}
                <Box sx={{ mb: 2 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                    Scope:
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                    {understanding.response.scope}
                  </Typography>
                </Box>

                {/* Assumptions */}
                {understanding.response.assumptions.length > 0 && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
                      Assumptions:
                    </Typography>
                    {understanding.response.assumptions.map((assumption, i) => (
                      <Typography key={i} variant="body2" sx={{ pl: 2, mb: 0.5, fontSize: '0.85rem', color: 'text.secondary' }}>
                        • {assumption}
                      </Typography>
                    ))}
                  </Box>
                )}

                {/* Clarifying Questions */}
                {understanding.response.clarifyingQuestions && understanding.response.clarifyingQuestions.length > 0 && (
                  <Box sx={{ mb: 2, p: 1.5, bgcolor: 'warning.50', borderRadius: 1 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'warning.dark', display: 'block', mb: 0.5 }}>
                      Questions for you:
                    </Typography>
                    {understanding.response.clarifyingQuestions.map((q, i) => (
                      <Typography key={i} variant="body2" sx={{ mb: 0.5, fontSize: '0.85rem', color: 'warning.dark' }}>
                        • {q}
                      </Typography>
                    ))}
                  </Box>
                )}

                {/* Clarification input */}
                <Box sx={{ mb: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    multiline
                    rows={2}
                    placeholder="Add clarification or additional context (optional)..."
                    value={clarificationInput}
                    onChange={(e) => setClarificationInput(e.target.value)}
                    sx={{ mb: 1 }}
                  />
                </Box>

                {/* Action hint - actual buttons are in fixed action bar */}
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'right' }}>
                  Use the action bar below to proceed →
                </Typography>
              </Box>
            )}

            {/* Planning phase */}
            {(isPlanning || isPlanReady || isWireframing || isWireframeReady || isGenerating || isComplete) && (
              <AIPhase
                label="Planning"
                content={phaseContent.planning || 'Creating 4 unique approaches to solve this design challenge...'}
                isActive={isPlanning}
                isComplete={!isPlanning}
                isCollapsible={true}
                defaultCollapsed={!isPlanning && !isPlanReady && (isGenerating || isComplete)}
              />
            )}

            {/* Wireframing phase - clickable to switch to wireframe view when complete */}
            {(isWireframing || isWireframeReady || isGenerating || isComplete) && (
              <AIPhase
                label={isComplete ? "Wireframing (click to view)" : "Wireframing"}
                content="Creating quick layout sketches for each paradigm to visualize the structure before building..."
                isActive={isWireframing}
                isComplete={!isWireframing && (isWireframeReady || isGenerating || isComplete)}
                isCollapsible={true}
                defaultCollapsed={!isWireframing && !isWireframeReady && isComplete}
                onClick={isComplete ? handleViewWireframes : undefined}
              />
            )}

            {/* Building phase - clickable to switch to prototype view when complete */}
            {(isGenerating || isComplete) && (
              <AIPhase
                label={isComplete ? "Building (click to view)" : "Building"}
                content="Generating high-fidelity prototypes with full styling and interactivity for each variant..."
                isActive={isGenerating}
                isComplete={isComplete}
                isCollapsible={true}
                defaultCollapsed={false}
                onClick={isComplete ? handleViewPrototypes : undefined}
              />
            )}

            {/* Variant cards during planning/wireframing/generating */}
            {showPlanCards && (
              <Box sx={{ mt: 2 }}>
                {plan!.plans.map((p, idx) => {
                  const variantIndex = idx + 1;
                  const variantProgress = getVariantProgress(variantIndex);
                  const variant = getVariantByIndex(variantIndex);
                  const isThisBuilding = isGenerating && progress?.variantIndex === variantIndex;
                  // Check if this variant is queued (not yet started but will be built)
                  const isQueued = isGenerating && selectedVariants.includes(variantIndex) &&
                    !variantStartTimes[variantIndex] && variant?.status !== 'complete';
                  // Find wireframe for this variant
                  const wireframe = wireframes.find(w => w.variantIndex === variantIndex);

                  // Get agent progress steps for this variant
                  const variantAgentProgress = agentProgress.find(ap => ap.variantIndex === variantIndex);
                  const agentSteps = variantAgentProgress?.steps;

                  return (
                    <VariantCard
                      key={p.id || idx}
                      title={p.title || `Variant ${String.fromCharCode(65 + idx)}`}
                      description={p.description || 'Generating design approach...'}
                      wireframeUrl={wireframe?.wireframeUrl}
                      variantIndex={variantIndex}
                      isSelected={focusedVariantIndex === variantIndex}
                      isChecked={selectedVariants.includes(variantIndex)}
                      showCheckbox={isPlanReady}
                      onToggleCheck={() => toggleVariantSelection(variantIndex)}
                      isBuilding={isThisBuilding}
                      isQueued={isQueued}
                      isComplete={variant?.status === 'complete'}
                      progress={variantProgress}
                      progressMessage={variantAgentProgress?.currentStep || variantProgressMessages[variantIndex]}
                      elapsedTime={elapsedTimes[variantIndex]}
                      onClick={variant?.status === 'complete' ? () => handleVariantClick(variantIndex) : undefined}
                      agentSteps={(isThisBuilding || variant?.status === 'complete') ? agentSteps : undefined}
                    />
                  );
                })}

                {/* Action hint based on phase - actual buttons are in fixed action bar */}
                {isPlanReady && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'right' }}>
                    Select variants above, then use the action bar below →
                  </Typography>
                )}

                {isWireframing && (
                  <Box sx={{ mt: 2, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                      Creating wireframe sketches...
                    </Typography>
                  </Box>
                )}

                {isWireframeReady && (
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block', textAlign: 'right' }}>
                    Review wireframes above, then use the action bar below →
                  </Typography>
                )}
              </Box>
            )}

            {/* Summary phase when complete */}
            {isComplete && (
              <AIPhase
                label="Summary"
                content={phaseContent.summary || 'All 4 variants are ready! Click on any variant to explore it in full screen.'}
                isComplete
              />
            )}
          </Box>

          {/* Fixed Action Bar - Shows primary CTA based on current state */}
          {(isUnderstandingReady || isPlanReady || isWireframeReady || isComplete) && (
            <Box
              sx={{
                p: 1.5,
                borderTop: '1px solid',
                borderColor: 'divider',
                bgcolor: 'background.paper',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 1,
                flexShrink: 0,
              }}
            >
              {isUnderstandingReady && (
                <>
                  {clarificationInput.trim() && (
                    <Button
                      variant="outlined"
                      onClick={handleClarify}
                      disabled={isClarifying}
                      size="small"
                    >
                      {isClarifying ? <CircularProgress size={14} /> : 'Update'}
                    </Button>
                  )}
                  <Button
                    variant="contained"
                    onClick={handleApproveUnderstanding}
                    disabled={isClarifying}
                    size="small"
                    startIcon={<Check size={14} />}
                    sx={{ background: config.gradients?.primary || config.colors.primary }}
                  >
                    Proceed to Planning
                  </Button>
                </>
              )}
              {isPlanReady && (
                <>
                  <Typography variant="caption" color="text.secondary">
                    {selectedVariants.length}/4 selected
                  </Typography>
                  {/* Mode toggle: Classic vs Interactive */}
                  <ToggleButtonGroup
                    value={prototypeMode}
                    exclusive
                    onChange={(_, value) => value && setPrototypeMode(value)}
                    size="small"
                  >
                    <ToggleButton value="classic">
                      <Tooltip title="Classic Mode - Standard HTML prototypes">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <SquaresFour size={16} />
                        </span>
                      </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="interactive">
                      <Tooltip title="Interactive Mode - File-based prototypes with state & debugging">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Play size={16} />
                        </span>
                      </Tooltip>
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <Button
                    variant="outlined"
                    onClick={handleSkipToBuilding}
                    disabled={selectedVariants.length === 0 || isCreatingWireframes}
                    size="small"
                  >
                    Skip to Build
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleCreateWireframes}
                    disabled={selectedVariants.length === 0 || isCreatingWireframes}
                    size="small"
                    sx={{ background: config.gradients?.primary || config.colors.primary }}
                  >
                    {isCreatingWireframes ? 'Creating...' : 'Create Wireframes'}
                  </Button>
                </>
              )}
              {isWireframeReady && (
                <>
                  {error && (
                    <Chip
                      icon={<Warning size={14} />}
                      label="Build failed"
                      size="small"
                      color="error"
                      variant="outlined"
                      sx={{ mr: 1 }}
                    />
                  )}
                  {/* Mode toggle: Classic vs Interactive */}
                  <ToggleButtonGroup
                    value={prototypeMode}
                    exclusive
                    onChange={(_, value) => value && setPrototypeMode(value)}
                    size="small"
                    sx={{ mr: 1 }}
                  >
                    <ToggleButton value="classic">
                      <Tooltip title="Classic Mode - Standard HTML prototypes">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <SquaresFour size={16} />
                        </span>
                      </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="interactive">
                      <Tooltip title="Interactive Mode - File-based prototypes with state & debugging">
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Play size={16} />
                        </span>
                      </Tooltip>
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <Button
                    variant="outlined"
                    onClick={() => handleRepromptWireframes()}
                    size="small"
                    startIcon={<ArrowClockwise size={14} />}
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleBuildHighFidelity}
                    size="small"
                    startIcon={error ? <ArrowClockwise size={14} /> : undefined}
                    sx={{ background: config.gradients?.primary || config.colors.primary }}
                  >
                    {error ? 'Retry Build' : `Build ${prototypeMode === 'interactive' ? 'Interactive' : 'High-Fidelity'}`}
                  </Button>
                </>
              )}
              {isComplete && (
                <Button
                  variant="outlined"
                  onClick={handleRebuild}
                  disabled={isRebuilding}
                  size="small"
                  startIcon={<ArrowClockwise size={14} />}
                >
                  {isRebuilding ? 'Rebuilding...' : 'Rebuild Variants'}
                </Button>
              )}
              {/* View toggle removed - use chat section steps or pipeline stepper icons instead */}
            </Box>
          )}

          {/* Prompt Input at bottom */}
          <Box sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
            {/* Context indicator */}
            {contextFiles.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Tooltip
                  title={
                    <Box>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        Product Context Available
                      </Typography>
                      <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                        {contextFiles.length} files loaded from your product context.
                        The AI will use this context to provide more relevant suggestions.
                      </Typography>
                    </Box>
                  }
                >
                  <Chip
                    icon={<Brain size={14} />}
                    label={`${contextFiles.length} context files`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    onClick={() => setContextPanelOpen(!contextPanelOpen)}
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      '&:hover': { bgcolor: 'primary.50' },
                    }}
                  />
                </Tooltip>
                {contextPanelOpen && (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      bgcolor: 'white',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      maxHeight: 150,
                      overflow: 'auto',
                    }}
                  >
                    <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                      Available Context:
                    </Typography>
                    {contextFiles.slice(0, 5).map((file) => (
                      <Box
                        key={file.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1,
                          py: 0.5,
                        }}
                      >
                        <Info size={12} />
                        <Typography variant="caption" noWrap>
                          {file.title} ({file.category})
                        </Typography>
                      </Box>
                    ))}
                    {contextFiles.length > 5 && (
                      <Typography variant="caption" color="text.secondary">
                        +{contextFiles.length - 5} more files
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            )}

            {/* Attached files */}
            {attachedFiles.length > 0 && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
                {attachedFiles.map((file) => (
                  <AttachmentChip
                    key={file.id}
                    file={file}
                    onRemove={() => setAttachedFiles((prev) => prev.filter((f) => f.id !== file.id))}
                  />
                ))}
              </Box>
            )}

            <TextField
              fullWidth
              multiline
              minRows={2}
              maxRows={4}
              placeholder="What would you like to build? Describe your idea..."
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              disabled={isAnalyzing || isPlanning || isGenerating}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && promptValue.trim()) {
                  e.preventDefault();
                  handleBuild();
                }
              }}
              sx={{
                bgcolor: 'white',
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  fontFamily: config.fonts.body,
                  fontSize: '0.875rem',
                  transition: 'all 0.2s ease',
                  '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
                  '&.Mui-focused': { boxShadow: '0 2px 12px rgba(0,0,0,0.12)' },
                },
                '& .MuiOutlinedInput-input': {
                  fontFamily: config.fonts.body,
                  '&::placeholder': {
                    fontFamily: config.fonts.body,
                    opacity: 0.6,
                  },
                },
              }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {/* LLM Model Selector */}
                {availableKeys.length > 0 ? (
                  <>
                    <Tooltip title="Select AI Model">
                      <Button
                        size="small"
                        startIcon={<Robot size={16} />}
                        endIcon={<CaretDown size={12} />}
                        onClick={(e) => setLlmMenuAnchorEl(e.currentTarget)}
                        sx={{
                          textTransform: 'none',
                          fontSize: '0.75rem',
                          color: 'text.secondary',
                          border: '1px solid',
                          borderColor: 'divider',
                          borderRadius: 1,
                          px: 1,
                          minWidth: 0,
                        }}
                      >
                        {selectedProvider ? (
                          <Typography noWrap sx={{ maxWidth: 100, fontSize: 'inherit' }}>
                            {PROVIDER_INFO[selectedProvider]?.name}: {selectedModel?.split('-').slice(0, 2).join('-')}
                          </Typography>
                        ) : (
                          'Select Model'
                        )}
                      </Button>
                    </Tooltip>
                    <Menu
                      anchorEl={llmMenuAnchorEl}
                      open={Boolean(llmMenuAnchorEl)}
                      onClose={() => setLlmMenuAnchorEl(null)}
                      TransitionComponent={Fade}
                      slotProps={{
                        paper: {
                          sx: { maxHeight: 400, minWidth: 250 },
                        },
                      }}
                    >
                      {availableKeys.map((key) => {
                        // Only show the configured model for this key, not all models
                        const configuredModel = key.model || PROVIDER_INFO[key.provider]?.defaultModel;
                        return (
                          <MenuItem
                            key={key.provider}
                            selected={selectedProvider === key.provider}
                            onClick={() => {
                              setSelectedProvider(key.provider);
                              setSelectedModel(configuredModel);
                              setLlmMenuAnchorEl(null);
                            }}
                          >
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                              <Typography variant="body2" fontWeight={500}>
                                {PROVIDER_INFO[key.provider]?.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {configuredModel}
                              </Typography>
                            </Box>
                          </MenuItem>
                        );
                      })}
                    </Menu>
                  </>
                ) : (
                  <Tooltip title="Configure API keys in Settings">
                    <Chip
                      icon={<Warning size={14} />}
                      label="No API keys"
                      size="small"
                      color="warning"
                      variant="outlined"
                      onClick={() => navigate('/settings')}
                      sx={{ cursor: 'pointer', fontSize: '0.7rem' }}
                    />
                  </Tooltip>
                )}
                <Tooltip title="Voice input">
                  <IconButton size="small">
                    <Microphone size={18} />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {attachedFiles.length}/20 files
                </Typography>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  multiple
                  accept="image/*,video/*,audio/*,.pdf"
                  onChange={handleFileAttach}
                />
                <Tooltip title="Attach files (images, videos, PDFs)">
                  <IconButton size="small" onClick={() => fileInputRef.current?.click()}>
                    <Paperclip size={20} />
                  </IconButton>
                </Tooltip>
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleBuild}
                  disabled={!promptValue.trim() || isAnalyzing || isPlanning || isGenerating || availableKeys.length === 0}
                  sx={{
                    textTransform: 'none',
                    minWidth: 70,
                    bgcolor: 'grey.800',
                    transition: 'all 0.2s ease',
                    '&:hover': { bgcolor: 'grey.900', transform: 'translateY(-1px)' },
                  }}
                >
                  {isAnalyzing || isPlanning || isGenerating ? (
                    <CircularProgress size={16} color="inherit" />
                  ) : (
                    'Build'
                  )}
                </Button>
              </Box>
            </Box>
          </Box>

          {/* Resize handle */}
          <Box
            ref={resizeRef}
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
            sx={{
              position: 'absolute',
              right: -6,
              top: 0,
              bottom: 0,
              width: 12,
              cursor: 'col-resize',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              '&:hover .resize-indicator, &:active .resize-indicator': {
                opacity: 1,
                bgcolor: 'primary.main',
              },
            }}
          >
            <Box
              className="resize-indicator"
              sx={{
                width: 4,
                height: 48,
                bgcolor: isResizing ? 'primary.main' : 'grey.300',
                borderRadius: 2,
                opacity: isResizing ? 1 : 0.5,
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <DotsSixVertical
                size={12}
                weight="bold"
                style={{
                  color: isResizing ? 'white' : '#666',
                }}
              />
            </Box>
          </Box>
        </Box>

        {/* Right Panel - Stage with Toolbar */}
        <Box
          sx={{
            flex: 1,
            bgcolor: 'white',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          {/* Stage Toolbar */}
          <Box
            sx={{
              height: 48,
              px: 2,
              borderBottom: '1px solid',
              borderColor: 'divider',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              bgcolor: 'background.paper',
              flexShrink: 0,
            }}
          >
            {/* Left: Edit mode toggle + Project breadcrumb */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Edit mode group */}
              <Box
                sx={{
                  display: 'flex',
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  p: 0.25,
                }}
              >
                <Tooltip title="Preview Mode (V)">
                  <IconButton
                    size="small"
                    onClick={() => setEditMode('cursor')}
                    sx={{
                      bgcolor: editMode === 'cursor' ? 'background.paper' : 'transparent',
                      boxShadow: editMode === 'cursor' ? 1 : 0,
                    }}
                  >
                    <Cursor size={18} weight={editMode === 'cursor' ? 'fill' : 'regular'} />
                  </IconButton>
                </Tooltip>
                <Tooltip title={!isComplete && !variants.some(v => v.status === 'complete') ? 'Code Editor (available after variants are built)' : 'Code Editor'}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => setEditMode('code')}
                      disabled={!isComplete && !variants.some(v => v.status === 'complete')}
                      sx={{
                        bgcolor: editMode === 'code' ? 'background.paper' : 'transparent',
                        boxShadow: editMode === 'code' ? 1 : 0,
                        opacity: (!isComplete && !variants.some(v => v.status === 'complete')) ? 0.4 : 1,
                      }}
                    >
                      <Code size={18} weight={editMode === 'code' ? 'fill' : 'regular'} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={!isComplete && !variants.some(v => v.status === 'complete') ? 'WYSIWYG Editor (available after variants are built)' : 'WYSIWYG Editor'}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={() => setEditMode('wysiwyg')}
                      disabled={!isComplete && !variants.some(v => v.status === 'complete')}
                      sx={{
                        bgcolor: editMode === 'wysiwyg' ? 'background.paper' : 'transparent',
                        boxShadow: editMode === 'wysiwyg' ? 1 : 0,
                        opacity: (!isComplete && !variants.some(v => v.status === 'complete')) ? 0.4 : 1,
                      }}
                    >
                      <PencilSimple size={18} weight={editMode === 'wysiwyg' ? 'fill' : 'regular'} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>

              <Divider orientation="vertical" flexItem />

              {/* Project breadcrumb */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {isEditingName ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <TextField
                      size="small"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') setIsEditingName(false);
                      }}
                      autoFocus
                      sx={{
                        width: 180,
                        '& .MuiOutlinedInput-root': {
                          fontFamily: config.fonts.body,
                          fontSize: '0.875rem',
                        },
                        '& .MuiOutlinedInput-input': {
                          py: 0.5,
                          px: 1,
                        },
                      }}
                    />
                    <Tooltip title="Save">
                      <IconButton size="small" onClick={handleSaveName} color="primary">
                        <Check size={16} weight="bold" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Cancel">
                      <IconButton size="small" onClick={() => setIsEditingName(false)}>
                        <X size={16} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {/* Project name - always shown, click to rename when not focused */}
                    {focusedVariantIndex ? (
                      <Typography
                        variant="subtitle2"
                        sx={{
                          fontWeight: 500,
                          color: config.colors.primary,
                          cursor: 'pointer',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                        onClick={handleBackToGrid}
                      >
                        {projectName}
                      </Typography>
                    ) : (
                      <Tooltip title="Click to rename">
                        <Typography
                          variant="subtitle2"
                          sx={{
                            fontWeight: 500,
                            color: 'text.secondary',
                            cursor: 'pointer',
                          }}
                          onClick={handleStartEditName}
                        >
                          {projectName}
                        </Typography>
                      </Tooltip>
                    )}

                    {/* Variant dropdown - only when variants exist */}
                    {(hasVariants || plan) && (
                      <>
                        <CaretRight size={14} style={{ color: '#9e9e9e' }} />
                        <Button
                          size="small"
                          endIcon={<CaretDown size={14} />}
                          onClick={(e) => setBreadcrumbAnchorEl(e.currentTarget)}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                            color: 'text.primary',
                            minWidth: 'auto',
                            px: 1,
                            py: 0.25,
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          {focusedVariantIndex && focusedPlan
                            ? `Variant ${String.fromCharCode(64 + focusedVariantIndex)}`
                            : 'All Variants'}
                        </Button>
                        <Menu
                          anchorEl={breadcrumbAnchorEl}
                          open={Boolean(breadcrumbAnchorEl)}
                          onClose={() => setBreadcrumbAnchorEl(null)}
                          TransitionComponent={Fade}
                        >
                          <MenuItem
                            selected={!focusedVariantIndex}
                            onClick={() => {
                              handleBackToGrid();
                              setBreadcrumbAnchorEl(null);
                            }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box
                                sx={{
                                  width: 20,
                                  height: 20,
                                  borderRadius: 0.5,
                                  bgcolor: 'grey.200',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 10,
                                }}
                              >
                                4
                              </Box>
                              All Variants
                            </Box>
                          </MenuItem>
                          <Divider />
                          {plan?.plans.map((p, idx) => {
                            const variantIdx = idx + 1;
                            const variant = variants.find(v => v.variant_index === variantIdx);
                            const wireframe = wireframes.find(w => w.variantIndex === variantIdx);
                            const hasContent = variant?.html_url || wireframe?.wireframeUrl || wireframe?.wireframeHtml;
                            return (
                              <MenuItem
                                key={variantIdx}
                                selected={focusedVariantIndex === variantIdx}
                                disabled={!hasContent}
                                onClick={() => {
                                  setFocusedVariantIndex(variantIdx);
                                  setBreadcrumbAnchorEl(null);
                                }}
                                sx={{ opacity: hasContent ? 1 : 0.5 }}
                              >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box
                                    sx={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: 0.5,
                                      bgcolor: focusedVariantIndex === variantIdx ? config.colors.primary : 'grey.200',
                                      color: focusedVariantIndex === variantIdx ? 'white' : 'text.primary',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 11,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {String.fromCharCode(64 + variantIdx)}
                                  </Box>
                                  <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                    {p.title}
                                  </Typography>
                                </Box>
                              </MenuItem>
                            );
                          })}
                        </Menu>
                      </>
                    )}
                  </Box>
                )}
              </Box>
            </Box>

            {/* Center: Undo/Redo + Pages dropdown */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Undo/Redo */}
              <Tooltip title="Undo">
                <IconButton size="small">
                  <ArrowCounterClockwise size={18} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Redo">
                <IconButton size="small">
                  <ArrowClockwise size={18} />
                </IconButton>
              </Tooltip>

              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

              {/* Pages dropdown */}
              <Button
                size="small"
                endIcon={<CaretDown size={14} />}
                onClick={(e) => setPagesAnchorEl(e.currentTarget)}
                sx={{
                  textTransform: 'none',
                  px: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  maxWidth: 200,
                }}
              >
                <Typography noWrap sx={{ fontSize: 'inherit' }}>
                  {projectName}
                </Typography>
              </Button>
              <Menu
                anchorEl={pagesAnchorEl}
                open={Boolean(pagesAnchorEl)}
                onClose={() => setPagesAnchorEl(null)}
                TransitionComponent={Fade}
                slotProps={{
                  paper: {
                    sx: { maxHeight: 300, minWidth: 200 },
                  },
                }}
              >
                <MenuItem disabled sx={{ opacity: 0.6 }}>
                  <Typography variant="caption" fontWeight={600}>
                    All Screens
                  </Typography>
                </MenuItem>
                <Divider />
                {screens.map((s) => (
                  <MenuItem
                    key={s.id}
                    selected={s.id === screenId}
                    onClick={() => {
                      setPagesAnchorEl(null);
                      if (s.id !== screenId) {
                        navigate(`/prototypes/${s.id}`);
                      }
                    }}
                  >
                    <Typography noWrap sx={{ maxWidth: 180 }}>
                      {s.name}
                    </Typography>
                  </MenuItem>
                ))}
              </Menu>
            </Box>

            {/* Right: Generation method + Preview size + Share button */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {/* Generation Method Indicator - V2 only for UI consistency */}
              <Tooltip title="Edit-based generation: Applies targeted changes to preserve your original design system">
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1.5,
                    py: 0.5,
                    bgcolor: 'action.hover',
                    borderRadius: 1,
                    fontSize: '0.75rem',
                    color: 'text.secondary',
                  }}
                >
                  <Lightning size={14} />
                  <Typography variant="caption" sx={{ fontWeight: 500 }}>
                    UI-Preserving Edits
                  </Typography>
                </Box>
              </Tooltip>

              <Divider orientation="vertical" flexItem />

              {/* Preview Size Selector */}
              <Box
                sx={{
                  display: 'flex',
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  p: 0.25,
                }}
              >
                {(Object.keys(PREVIEW_SIZES) as PreviewSize[]).map((size) => (
                  <Tooltip key={size} title={PREVIEW_SIZES[size].label}>
                    <IconButton
                      size="small"
                      onClick={() => setPreviewSize(size)}
                      sx={{
                        bgcolor: previewSize === size ? 'background.paper' : 'transparent',
                        boxShadow: previewSize === size ? 1 : 0,
                      }}
                    >
                      {PREVIEW_SIZES[size].icon}
                    </IconButton>
                  </Tooltip>
                ))}
              </Box>

              <Divider orientation="vertical" flexItem />

              {/* Interactivity Toggle with LLM option */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Tooltip title={interactivityEnabled ? 'Disable Interactivity' : 'Enable Interactivity (buttons, forms, modals)'}>
                  <IconButton
                    size="small"
                    onClick={() => setInteractivityEnabled(!interactivityEnabled)}
                    sx={{
                      bgcolor: interactivityEnabled ? 'primary.main' : 'transparent',
                      color: interactivityEnabled ? 'white' : 'inherit',
                      '&:hover': {
                        bgcolor: interactivityEnabled ? 'primary.dark' : 'action.hover',
                      },
                    }}
                  >
                    <Lightning size={18} weight={interactivityEnabled ? 'fill' : 'regular'} />
                  </IconButton>
                </Tooltip>
                {interactivityEnabled && (
                  <Tooltip title={useLLMEnhancement ? 'Using AI-powered smart interactions' : 'Using basic interactions (click to enable AI)'}>
                    <Chip
                      label={useLLMEnhancement ? 'AI' : 'Basic'}
                      size="small"
                      onClick={() => setUseLLMEnhancement(!useLLMEnhancement)}
                      sx={{
                        height: 22,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        bgcolor: useLLMEnhancement ? 'rgba(118, 75, 162, 0.15)' : 'grey.200',
                        color: useLLMEnhancement ? '#764ba2' : 'text.secondary',
                        '&:hover': {
                          bgcolor: useLLMEnhancement ? 'rgba(118, 75, 162, 0.25)' : 'grey.300',
                        },
                      }}
                    />
                  </Tooltip>
                )}
              </Box>

              <Divider orientation="vertical" flexItem />

              <Button
                variant="contained"
                size="small"
                startIcon={<ShareNetwork size={16} />}
                onClick={handleShare}
                sx={{
                  textTransform: 'none',
                  transition: 'all 0.2s ease',
                  '&:hover': { transform: 'translateY(-1px)' },
                }}
              >
                Share
              </Button>
            </Box>
          </Box>

          {/* Initial/Understanding state - show the selected screen with edit mode support */}
          {(status === 'idle' || isAnalyzing || isUnderstanding || isUnderstandingReady) && !hasVariants && (
            <Box
              sx={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                p: 2,
                minHeight: 0, // Prevent flex item from growing beyond container
              }}
            >
              {screen?.editedHtml ? (
                <Card
                  variant="outlined"
                  sx={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 2,
                    overflow: 'hidden',
                    minHeight: 0,
                  }}
                >
                  <Box
                    sx={{
                      flex: 1,
                      position: 'relative',
                      backgroundColor: editMode === 'code' ? '#1e1e1e' : '#fafafa',
                      minHeight: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: previewSize !== 'desktop' ? 'flex-start' : 'stretch',
                      pt: previewSize !== 'desktop' ? 2 : 0,
                    }}
                  >
                    {/* Preview Mode (cursor) */}
                    {editMode === 'cursor' && (
                      <Box
                        sx={{
                          width: previewSize === 'desktop' ? '100%' : PREVIEW_SIZES[previewSize].width,
                          maxWidth: '100%',
                          height: previewSize === 'desktop' ? '100%' : 'calc(100% - 16px)',
                          border: previewSize !== 'desktop' ? '1px solid' : 'none',
                          borderColor: 'divider',
                          borderRadius: previewSize !== 'desktop' ? 2 : 0,
                          overflow: 'hidden',
                          boxShadow: previewSize !== 'desktop' ? 3 : 0,
                          transition: 'all 0.3s ease',
                        }}
                      >
                        <iframe
                          srcDoc={screen.editedHtml}
                          title={screen.name || 'Screen Preview'}
                          style={{
                            width: '100%',
                            height: '100%',
                            border: 'none',
                          }}
                        />
                      </Box>
                    )}

                    {/* Code Editor Mode - Dual Mode (Tree + Monaco) */}
                    {editMode === 'code' && (
                      <DualModeEditor
                        html={screen.editedHtml}
                        onHtmlChange={(newHtml) => {
                          updateScreen(screenId!, { editedHtml: newHtml });
                        }}
                        height="100%"
                      />
                    )}

                    {/* WYSIWYG Editor Mode - Respects preview size */}
                    {editMode === 'wysiwyg' && (
                      <Box
                        sx={{
                          width: previewSize === 'desktop' ? '100%' : PREVIEW_SIZES[previewSize].width,
                          maxWidth: '100%',
                          height: previewSize === 'desktop' ? '100%' : 'calc(100% - 16px)',
                          border: previewSize !== 'desktop' ? '1px solid' : 'none',
                          borderColor: 'divider',
                          borderRadius: previewSize !== 'desktop' ? 2 : 0,
                          overflow: 'hidden',
                          boxShadow: previewSize !== 'desktop' ? 3 : 0,
                          transition: 'all 0.3s ease',
                        }}
                      >
                        <WYSIWYGEditor
                          html={screen.editedHtml}
                          onHtmlChange={(newHtml) => {
                            updateScreen(screenId!, { editedHtml: newHtml });
                          }}
                        />
                      </Box>
                    )}
                  </Box>
                </Card>
              ) : (
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">
                    Describe what you want to build to get started
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {/* Loading/Planning/Wireframing state - 2x2 grid with loading indicators or wireframes */}
          {(isPlanning || isPlanReady || isWireframing || isWireframeReady) && !focusedVariantIndex && (
            <Box sx={{ flex: 1, p: 2, overflow: 'auto', minHeight: 0 }}>
              <Grid container spacing={2} sx={{ height: '100%', minHeight: 0 }}>
                {['Variant A', 'Variant B', 'Variant C', 'Variant D'].map((label, idx) => {
                  const variant = variants.find((v) => v.variant_index === idx + 1);
                  const variantProgress = getVariantProgress(idx + 1);
                  const variantStreamingHtml = streamingHtml[idx + 1];
                  const wireframe = wireframes.find(w => w.variantIndex === idx + 1);

                  // Allow clicking when: variant complete OR wireframe ready with wireframe available
                  const canClick = variant?.status === 'complete' || (isWireframeReady && wireframe?.wireframeUrl);

                  return (
                    <Grid item xs={6} key={label} sx={{ height: '50%' }}>
                      <CanvasVariantCard
                        label={label}
                        isLoading={isGenerating && (!variant || variant.status !== 'complete')}
                        htmlUrl={variant?.html_url}
                        wireframeUrl={wireframe?.wireframeUrl}
                        wireframeHtml={wireframe?.wireframeHtml}
                        streamingHtml={variantStreamingHtml}
                        progress={variantProgress}
                        onClick={canClick ? () => handleVariantClick(idx + 1) : undefined}
                        viewMode={viewMode}
                        enableInteractivity={interactivityEnabled}
                        useLLMEnhancement={useLLMEnhancement}
                      />
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
          )}

          {/* Generating state - show original screen with progress overlay (variant cards in chat panel show progress) */}
          {isGenerating && !focusedVariantIndex && screen?.editedHtml && (
            <Box sx={{ flex: 1, p: 2, overflow: 'hidden', position: 'relative' }}>
              <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Header with progress info */}
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 2,
                  py: 1.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  bgcolor: 'grey.50'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={16} />
                    <Typography variant="subtitle2" fontWeight={600}>
                      Building Prototypes
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {completedVariantIndices.size}/{selectedVariants.length} variants complete
                  </Typography>
                </Box>
                {/* Original screen preview */}
                <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                  <iframe
                    srcDoc={screen.editedHtml}
                    title="Original Screen"
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      opacity: 0.5,
                    }}
                  />
                  {/* Progress overlay */}
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      bgcolor: 'rgba(255,255,255,0.7)',
                      backdropFilter: 'blur(2px)',
                    }}
                  >
                    <Box sx={{ textAlign: 'center' }}>
                      <CircularProgress size={48} sx={{ mb: 2 }} />
                      <Typography variant="body1" fontWeight={600} sx={{ mb: 0.5 }}>
                        Generating {prototypeMode === 'interactive' ? 'Interactive' : 'High-Fidelity'} Prototypes
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {progress?.message || 'Building variants...'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Click a completed variant card on the left to preview it
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              </Card>
            </Box>
          )}

          {/* Wireframe ready with focus - inline expansion view */}
          {isWireframeReady && focusedVariantIndex && (
            <InlineExpansionGrid
              wireframes={wireframes}
              focusedIndex={focusedVariantIndex}
              getVariantByIndex={getVariantByIndex}
              viewMode={viewMode}
              enableInteractivity={interactivityEnabled}
                        useLLMEnhancement={useLLMEnhancement}
            />
          )}

          {/* Complete state - 2x2 grid with variants (no focus) */}
          {isComplete && !focusedVariantIndex && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
              {/* Header with mode toggle and Rebuild button */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pt: 2, pb: 1 }}>
                <Typography variant="subtitle1" fontWeight={600}>
                  All Variants Ready
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {/* Mode toggle: Classic vs Interactive */}
                  <ToggleButtonGroup
                    value={prototypeMode}
                    exclusive
                    onChange={(_, value) => value && setPrototypeMode(value)}
                    size="small"
                  >
                    <ToggleButton value="classic">
                      <Tooltip title="Classic View (Grid)">
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          <SquaresFour size={16} />
                        </span>
                      </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="interactive">
                      <Tooltip title="Interactive View (with debugging)">
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          <Play size={16} />
                        </span>
                      </Tooltip>
                    </ToggleButton>
                  </ToggleButtonGroup>
                  <Button
                    variant="outlined"
                    onClick={handleRebuild}
                    disabled={isRebuilding}
                    size="small"
                    startIcon={<ArrowClockwise size={14} />}
                  >
                    {isRebuilding ? 'Rebuilding...' : 'Rebuild Variants'}
                  </Button>
                </Box>
              </Box>

              {/* Interactive mode - show InteractiveVariantView */}
              {prototypeMode === 'interactive' ? (
                <Card sx={{ flex: 1, mx: 2, mb: 2, overflow: 'hidden' }}>
                  <InteractiveVariantView
                    plans={plan?.plans || []}
                    variants={variants}
                    selectedVariantIndex={focusedVariantIndex}
                    onSelectVariant={handleVariantClick}
                  />
                </Card>
              ) : (
                /* Classic mode - existing 2x2 grid */
                <Grid container spacing={2} sx={{ flex: 1, px: 2, pb: 2, minHeight: 0, overflow: 'auto' }}>
                  {['Variant A', 'Variant B', 'Variant C', 'Variant D'].map((label, idx) => {
                    const variant = getVariantByIndex(idx + 1);
                    const wireframe = wireframes.find(w => w.variantIndex === idx + 1);
                    return (
                      <Grid item xs={6} key={label} sx={{ height: '50%' }}>
                        <CanvasVariantCard
                          label={label}
                          htmlUrl={variant?.html_url}
                          wireframeUrl={wireframe?.wireframeUrl}
                          wireframeHtml={wireframe?.wireframeHtml}
                          onClick={() => handleVariantClick(idx + 1)}
                          viewMode={viewMode}
                          enableInteractivity={interactivityEnabled}
                          useLLMEnhancement={useLLMEnhancement}
                        />
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Box>
          )}

          {/* Complete or Generating state with focus - inline expansion view (preview mode) */}
          {/* Allow exploring completed variants while others are still generating */}
          {(isComplete || (isGenerating && focusedVariant?.status === 'complete')) && focusedVariantIndex && editMode === 'cursor' && (
            <InlineExpansionGrid
              wireframes={wireframes}
              focusedIndex={focusedVariantIndex}
              onEditClick={() => setEditMode('code')}
              onIterateClick={() => setIterationDialogOpen(true)}
              getVariantByIndex={getVariantByIndex}
              viewMode={viewMode}
              enableInteractivity={interactivityEnabled}
                        useLLMEnhancement={useLLMEnhancement}
            />
          )}

          {/* Focused variant with edit mode (code or wysiwyg) - single full preview with code/wysiwyg editor */}
          {/* Also works during generation if the focused variant is complete */}
          {focusedVariantIndex && focusedVariant && (focusedVariant.status === 'complete' || isComplete) && editMode !== 'cursor' && (
            <Box sx={{ flex: 1, p: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {/* Variant action bar */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                  px: 1,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    Variant {String.fromCharCode(64 + focusedVariantIndex)}
                  </Typography>
                  {focusedVariant.iteration_count > 0 && (
                    <Chip
                      size="small"
                      label={`${focusedVariant.iteration_count} iteration${focusedVariant.iteration_count > 1 ? 's' : ''}`}
                      sx={{ fontSize: 11 }}
                    />
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {iterationHistory.length > 0 && (
                    <Tooltip title="View iteration history">
                      <IconButton
                        size="small"
                        onClick={() => setShowIterationHistory(true)}
                        sx={{ color: 'text.secondary' }}
                      >
                        <ClockCounterClockwise size={18} />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={isIterating ? <CircularProgress size={14} /> : <ArrowsClockwise size={16} />}
                    onClick={() => setIterationDialogOpen(true)}
                    disabled={isIterating || !fetchedVariantHtml}
                    sx={{
                      borderColor: '#764ba2',
                      color: '#764ba2',
                      '&:hover': {
                        borderColor: '#667eea',
                        bgcolor: 'rgba(118, 75, 162, 0.04)',
                      },
                    }}
                  >
                    {isIterating ? 'Iterating...' : 'Iterate'}
                  </Button>
                </Box>
              </Box>

              <Card
                variant="outlined"
                sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    flex: 1,
                    position: 'relative',
                    backgroundColor: editMode === 'code' ? '#1e1e1e' : '#fafafa',
                    overflow: 'hidden',
                  }}
                >
                  {/* Code Editor Mode - HTML Tree View */}
                  {editMode === 'code' && (
                    isFetchingHtml ? (
                      <Box
                        sx={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 2,
                        }}
                      >
                        <CircularProgress size={32} sx={{ color: '#26a69a' }} />
                        <Typography color="text.secondary">
                          Loading code...
                        </Typography>
                      </Box>
                    ) : fetchedVariantHtml ? (
                      <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Toolbar for code view */}
                        <Box
                          sx={{
                            px: 2,
                            py: 1,
                            bgcolor: '#252526',
                            borderBottom: '1px solid #3c3c3c',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" sx={{ color: '#9cdcfe' }}>
                              Variant {String.fromCharCode(64 + focusedVariantIndex)} - HTML
                            </Typography>
                            {/* Save status indicator */}
                            {isSavingVariantEdit && (
                              <Chip
                                label="Saving..."
                                size="small"
                                sx={{
                                  bgcolor: 'transparent',
                                  color: '#ffd700',
                                  fontSize: '10px',
                                  height: 18,
                                  '& .MuiChip-label': { px: 1 },
                                }}
                              />
                            )}
                            {!isSavingVariantEdit && hasUnsavedVariantChanges && (
                              <Chip
                                label="Unsaved"
                                size="small"
                                sx={{
                                  bgcolor: 'transparent',
                                  color: '#ff9800',
                                  fontSize: '10px',
                                  height: 18,
                                  '& .MuiChip-label': { px: 1 },
                                }}
                              />
                            )}
                            {!isSavingVariantEdit && !hasUnsavedVariantChanges && focusedVariant?.edited_html && (
                              <Chip
                                icon={<Check size={10} />}
                                label="Saved"
                                size="small"
                                sx={{
                                  bgcolor: 'transparent',
                                  color: '#4caf50',
                                  fontSize: '10px',
                                  height: 18,
                                  '& .MuiChip-label': { px: 0.5 },
                                  '& .MuiChip-icon': { color: '#4caf50', ml: 0.5 },
                                }}
                              />
                            )}
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title="Open in new tab">
                              <IconButton
                                size="small"
                                onClick={() => window.open(focusedVariant.html_url!, '_blank')}
                                sx={{ color: '#cccccc', '&:hover': { color: '#ffffff' } }}
                              >
                                <LinkSimple size={16} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Download HTML">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  const link = document.createElement('a');
                                  link.href = focusedVariant.html_url!;
                                  link.download = `variant-${String.fromCharCode(96 + focusedVariantIndex)}.html`;
                                  link.click();
                                }}
                                sx={{ color: '#cccccc', '&:hover': { color: '#ffffff' } }}
                              >
                                <Download size={16} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Copy HTML">
                              <IconButton
                                size="small"
                                onClick={() => {
                                  navigator.clipboard.writeText(fetchedVariantHtml);
                                  showSuccess('HTML copied to clipboard');
                                }}
                                sx={{ color: '#cccccc', '&:hover': { color: '#ffffff' } }}
                              >
                                <Copy size={16} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                        {/* Dual Mode Editor (Tree + Monaco) */}
                        <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                          <DualModeEditor
                            html={fetchedVariantHtml}
                            onHtmlChange={(newHtml) => {
                              setFetchedVariantHtml(newHtml);
                              // Persist changes to database (debounced)
                              if (focusedVariant?.id) {
                                debouncedSaveVariantHtml(focusedVariant.id, newHtml);
                              }
                            }}
                            height="100%"
                          />
                        </Box>
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Typography color="text.secondary">
                          Code not available. Generate a variant first.
                        </Typography>
                      </Box>
                    )
                  )}

                  {/* WYSIWYG Editor Mode - prefers edited HTML over original URL */}
                  {editMode === 'wysiwyg' && (
                    (focusedVariant.edited_html || focusedVariant.html_url) ? (
                      <iframe
                        {...(focusedVariant.edited_html
                          ? { srcDoc: focusedVariant.edited_html }
                          : { src: focusedVariant.html_url }
                        )}
                        title={`Preview Variant ${focusedVariantIndex}`}
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                        }}
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
                        <Typography color="text.secondary">
                          No content to preview
                        </Typography>
                      </Box>
                    )
                  )}
                </Box>
              </Card>
            </Box>
          )}
        </Box>
      </Box>

      {/* Share Dialog */}
      <Dialog
        open={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
      >
        <DialogTitle sx={{ fontFamily: config.fonts.display }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ShareNetwork size={24} />
            Share Prototype
          </Box>
        </DialogTitle>
        <DialogContent>
          {!createdShare ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Create a shareable link for your designs.
              </Typography>

              {/* Content Type Selection (Wireframes vs Prototypes) */}
              <FormControl component="fieldset" sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  What to Share
                </Typography>
                <ToggleButtonGroup
                  value={shareWireframes ? 'wireframes' : 'prototypes'}
                  exclusive
                  onChange={(_, value) => value && setShareWireframes(value === 'wireframes')}
                  size="small"
                  sx={{ mb: 1 }}
                >
                  <ToggleButton value="prototypes" sx={{ px: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Code size={16} />
                      Prototypes
                    </Box>
                  </ToggleButton>
                  <ToggleButton value="wireframes" sx={{ px: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <PencilLine size={16} />
                      Wireframes
                    </Box>
                  </ToggleButton>
                </ToggleButtonGroup>
                <Typography variant="caption" color="text.secondary">
                  {shareWireframes
                    ? 'Share the wireframe sketches for early feedback'
                    : 'Share the high-fidelity interactive prototypes'}
                </Typography>
              </FormControl>

              {/* Share Type Selection */}
              <FormControl component="fieldset" sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Share Type
                </Typography>
                <RadioGroup
                  value={shareType}
                  onChange={(e) => setShareType(e.target.value as ShareType)}
                >
                  <FormControlLabel
                    value="random"
                    control={<Radio size="small" />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Shuffle size={16} />
                        <Box>
                          <Typography variant="body2" fontWeight={500}>Magic Random Link</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Each viewer sees a random variant for A/B testing
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                  <FormControlLabel
                    value="specific"
                    control={<Radio size="small" />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LinkSimple size={16} />
                        <Box>
                          <Typography variant="body2" fontWeight={500}>Specific Variant Link</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Share a specific variant directly
                          </Typography>
                        </Box>
                      </Box>
                    }
                  />
                </RadioGroup>
              </FormControl>

              {/* Variant Selection (for specific type) */}
              {shareType === 'specific' && (
                <FormControl fullWidth sx={{ mb: 3 }}>
                  <InputLabel>Select Variant</InputLabel>
                  <Select
                    value={shareVariantIndex}
                    label="Select Variant"
                    onChange={(e) => setShareVariantIndex(e.target.value as number)}
                  >
                    {[1, 2, 3, 4].map((idx) => {
                      const variant = getVariantByIndex(idx);
                      const planItem = getPlanByIndex(idx);
                      const isAvailable = variant?.status === 'complete';
                      return (
                        <MenuItem key={idx} value={idx} disabled={!isAvailable}>
                          Variant {String.fromCharCode(64 + idx)}: {planItem?.title || 'Not generated'}
                          {!isAvailable && ' (Not ready)'}
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              )}

              {/* Expiration */}
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Link Expiration</InputLabel>
                <Select
                  value={shareExpiration ?? ''}
                  label="Link Expiration"
                  onChange={(e) => setShareExpiration(e.target.value === '' ? null : e.target.value as number)}
                  startAdornment={<Timer size={16} style={{ marginRight: 8 }} />}
                >
                  <MenuItem value="">Never expires</MenuItem>
                  <MenuItem value={1}>1 day</MenuItem>
                  <MenuItem value={7}>7 days</MenuItem>
                  <MenuItem value={30}>30 days</MenuItem>
                  <MenuItem value={90}>90 days</MenuItem>
                </Select>
              </FormControl>
            </>
          ) : (
            <>
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'success.light',
                  borderRadius: 2,
                  mb: 3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                }}
              >
                <Check size={20} color="#2e7d32" weight="bold" />
                <Typography variant="body2" color="success.dark" fontWeight={500}>
                  Share link created successfully!
                </Typography>
              </Box>

              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Your share link:
              </Typography>
              <TextField
                fullWidth
                value={shareLink}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <IconButton onClick={handleCopyShareLink}>
                      <Copy size={20} />
                    </IconButton>
                  ),
                }}
                sx={{ mb: 2 }}
              />

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Chip
                  size="small"
                  icon={createdShare.shareWireframes ? <PencilLine size={14} /> : <Code size={14} />}
                  label={createdShare.shareWireframes ? 'Wireframes' : 'Prototypes'}
                  color={createdShare.shareWireframes ? 'warning' : 'primary'}
                />
                <Chip
                  size="small"
                  icon={createdShare.shareType === 'random' ? <Shuffle size={14} /> : <LinkSimple size={14} />}
                  label={createdShare.shareType === 'random' ? 'Random' : `Variant ${String.fromCharCode(64 + (createdShare.variantIndex || 1))}`}
                />
                <Chip
                  size="small"
                  icon={<Timer size={14} />}
                  label={createdShare.expiresAt ? `Expires ${new Date(createdShare.expiresAt).toLocaleDateString()}` : 'Never expires'}
                />
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShareDialogOpen(false)} variant="outlined">
            {createdShare ? 'Done' : 'Cancel'}
          </Button>
          {!createdShare ? (
            <Button
              variant="contained"
              onClick={handleCreateShare}
              disabled={isCreatingShare || !currentSession}
              startIcon={isCreatingShare ? <CircularProgress size={16} /> : <ShareNetwork size={18} />}
              sx={{
                background: config.gradients?.primary || config.colors.primary,
              }}
            >
              {isCreatingShare ? 'Creating...' : 'Create Share Link'}
            </Button>
          ) : (
            <>
              <Button
                variant="outlined"
                onClick={() => setCreatedShare(null)}
                startIcon={<Plus size={18} />}
              >
                Create Another
              </Button>
              <Button
                variant="contained"
                onClick={handleCopyShareLink}
                startIcon={<Copy size={18} />}
                sx={{
                  background: config.gradients?.primary || config.colors.primary,
                }}
              >
                Copy Link
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Iteration Dialog */}
      <Dialog
        open={iterationDialogOpen}
        onClose={() => setIterationDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontFamily: config.fonts.display }}>
          <ArrowsClockwise size={24} />
          Iterate on Variant {focusedVariantIndex ? String.fromCharCode(64 + focusedVariantIndex) : ''}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Describe what changes you want to make to this variant. The AI will modify the current design based on your request.
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            placeholder="e.g., Make the header larger and change the primary color to blue"
            value={iterationPrompt}
            onChange={(e) => setIterationPrompt(e.target.value)}
            autoFocus
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: config.fonts.body,
              },
            }}
          />
          {iterationHistory.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              This variant has {iterationHistory.length} previous iteration{iterationHistory.length > 1 ? 's' : ''}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIterationDialogOpen(false)} variant="outlined">
            Cancel
          </Button>
          <Button
            variant="contained"
            startIcon={<Lightning size={18} />}
            onClick={handleIterate}
            disabled={!iterationPrompt.trim() || isIterating}
            sx={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              '&:hover': {
                background: 'linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%)',
              },
            }}
          >
            {isIterating ? 'Iterating...' : 'Apply Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Iteration History Dialog */}
      <Dialog
        open={showIterationHistory}
        onClose={() => setShowIterationHistory(false)}
        maxWidth="md"
        fullWidth
        TransitionComponent={Fade}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontFamily: config.fonts.display }}>
          <ClockCounterClockwise size={24} />
          Iteration History - Variant {focusedVariantIndex ? String.fromCharCode(64 + focusedVariantIndex) : ''}
        </DialogTitle>
        <DialogContent>
          {iterationHistory.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
              No iterations yet. Click "Iterate" to make changes to this variant.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {iterationHistory.map((iteration, index) => (
                <Card key={iteration.id} variant="outlined" sx={{ p: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={600}>
                        Iteration {iteration.iteration_number}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(iteration.created_at).toLocaleString()}
                        {iteration.generation_model && ` • ${iteration.generation_model}`}
                        {iteration.generation_duration_ms && ` • ${(iteration.generation_duration_ms / 1000).toFixed(1)}s`}
                      </Typography>
                    </Box>
                    {index < iterationHistory.length - 1 && (
                      <Tooltip title="Revert to this version">
                        <IconButton
                          size="small"
                          onClick={() => handleRevertIteration(iteration.id)}
                          sx={{ color: 'text.secondary' }}
                        >
                          <ArrowCounterClockwise size={18} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                  <Typography
                    variant="body2"
                    sx={{
                      bgcolor: 'action.hover',
                      p: 1.5,
                      borderRadius: 1,
                      fontFamily: 'monospace',
                      fontSize: 13,
                    }}
                  >
                    "{iteration.prompt}"
                  </Typography>
                </Card>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowIterationHistory(false)} variant="outlined">
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Generation Error Dialog - allows retry with different model */}
      <Dialog
        open={!!generationError}
        onClose={() => setGenerationError(null)}
        maxWidth="sm"
        fullWidth
        TransitionComponent={Fade}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontFamily: config.fonts.display, color: 'error.main' }}>
          <Warning size={24} />
          Generation Failed
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {generationError?.message}
          </Typography>
          {generationError?.code === 'API_KEY_MISSING' && (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                You can either add an API key for {generationError.provider} in Settings, or try a different model below.
              </Typography>
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel id="retry-provider-label">Select Provider</InputLabel>
                <Select
                  labelId="retry-provider-label"
                  value={selectedProvider || ''}
                  label="Select Provider"
                  onChange={(e) => {
                    const provider = e.target.value as LLMProvider;
                    setSelectedProvider(provider);
                    // Set default model for provider
                    const providerInfo = PROVIDER_INFO[provider];
                    if (providerInfo?.models.length) {
                      setSelectedModel(providerInfo.models[0]);
                    }
                  }}
                >
                  {availableKeys.filter(k => k.provider !== generationError?.provider).map((key) => (
                    <MenuItem key={key.provider} value={key.provider}>
                      {PROVIDER_INFO[key.provider]?.name || key.provider}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {selectedProvider && PROVIDER_INFO[selectedProvider] && (
                <FormControl fullWidth>
                  <InputLabel id="retry-model-label">Select Model</InputLabel>
                  <Select
                    labelId="retry-model-label"
                    value={selectedModel}
                    label="Select Model"
                    onChange={(e) => setSelectedModel(e.target.value)}
                  >
                    {PROVIDER_INFO[selectedProvider].models.map((model) => (
                      <MenuItem key={model} value={model}>
                        {model}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setGenerationError(null);
              navigate('/settings');
            }}
            variant="outlined"
            startIcon={<LinkSimple size={18} />}
          >
            Go to Settings
          </Button>
          <Button onClick={() => setGenerationError(null)} variant="outlined">
            Cancel
          </Button>
          {generationError?.code === 'API_KEY_MISSING' && selectedProvider && selectedProvider !== generationError?.provider && (
            <Button
              variant="contained"
              startIcon={<ArrowsClockwise size={18} />}
              onClick={() => {
                setGenerationError(null);
                // Retry with new provider/model
                handleBuildHighFidelity();
              }}
              sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5a6fd6 0%, #6a4190 100%)',
                },
              }}
            >
              Retry with {PROVIDER_INFO[selectedProvider]?.name || selectedProvider}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Debug Panel - Toggle with Ctrl+Shift+D */}
      <DebugPanel
        isOpen={debugMode}
        onClose={() => setDebugMode(false)}
        status={status}
        progress={progress}
        error={error}
        currentSession={currentSession}
        understanding={understanding}
        plan={plan}
        variants={variants}
        sourceMetadata={sourceMetadata}
        currentPrompt={currentPrompt}
        debugLogs={debugLogs}
      />

      {/* Debug toggle hint */}
      {!debugMode && (
        <Tooltip title="Debug Mode (Ctrl+Shift+D)" placement="left">
          <IconButton
            onClick={() => setDebugMode(true)}
            sx={{
              position: 'fixed',
              bottom: 16,
              right: 16,
              bgcolor: 'background.paper',
              boxShadow: 1,
              opacity: 0.6,
              transition: 'opacity 0.2s',
              '&:hover': { bgcolor: 'grey.100', opacity: 1 },
            }}
          >
            <Code size={20} />
          </IconButton>
        </Tooltip>
      )}

      {/* LLM Debug Panel */}
      <LLMDebugPanel />
      <LLMDebugButton />
    </Box>
  );
};

export default VibePrototyping;
