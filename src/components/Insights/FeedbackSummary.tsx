import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { Sparkle, ArrowClockwise, CheckCircle, Warning, TrendUp } from '@phosphor-icons/react';
import { Button, Chip } from '@/components/ui';
import { useThemeStore } from '@/store/themeStore';

export interface FeedbackSummaryData {
  summary: string;
  keyThemes: string[];
  actionItems: string[];
  sentimentScore: number; // -1 to 1 scale
}

interface FeedbackSummaryProps {
  data: FeedbackSummaryData | null;
  isLoading?: boolean;
  onRegenerate?: () => void;
  commentCount: number;
}

export function FeedbackSummary({
  data,
  isLoading = false,
  onRegenerate,
  commentCount,
}: FeedbackSummaryProps) {
  const { config } = useThemeStore();
  const [showActionItems, setShowActionItems] = useState(false);

  // Get sentiment color and label
  const getSentimentInfo = (score: number) => {
    if (score >= 0.3) {
      return { color: config.colors.success, label: 'Positive', icon: TrendUp };
    }
    if (score <= -0.3) {
      return { color: config.colors.error, label: 'Critical', icon: Warning };
    }
    return { color: config.colors.warning || '#f59e0b', label: 'Mixed', icon: CheckCircle };
  };

  // No data state
  if (!data && !isLoading) {
    return (
      <Box sx={{ textAlign: 'center', py: 2 }}>
        <Sparkle size={24} color={config.colors.textSecondary} />
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5, fontSize: '0.7rem' }}>
          {commentCount > 0
            ? 'Generate an AI summary of feedback'
            : 'No feedback to summarize yet'}
        </Typography>
        {commentCount > 0 && onRegenerate && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<Sparkle size={12} />}
            onClick={onRegenerate}
            sx={{ mt: 1.5, fontSize: '0.7rem', py: 0.5 }}
          >
            Generate summary
          </Button>
        )}
      </Box>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
        <CircularProgress size={18} />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
          Analyzing feedback...
        </Typography>
      </Box>
    );
  }

  if (!data) return null;

  const sentimentInfo = getSentimentInfo(data.sentimentScore);
  const SentimentIcon = sentimentInfo.icon;

  return (
    <Box>
      {/* Header with sentiment indicator */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Sparkle size={14} color={config.colors.primary} weight="fill" />
          <Typography variant="caption" fontWeight={600} sx={{ fontSize: '0.7rem' }}>
            AI Summary
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Chip
            size="small"
            label={sentimentInfo.label}
            icon={<SentimentIcon size={10} />}
            sx={{
              height: 20,
              fontSize: '0.6rem',
              backgroundColor: `${sentimentInfo.color}15`,
              color: sentimentInfo.color,
              fontWeight: 500,
              '& .MuiChip-icon': {
                color: sentimentInfo.color,
              },
            }}
          />
          {onRegenerate && (
            <IconButton
              size="small"
              onClick={onRegenerate}
              sx={{ p: 0.25 }}
            >
              <ArrowClockwise size={12} />
            </IconButton>
          )}
        </Box>
      </Box>

      {/* Summary text */}
      <Typography
        variant="body2"
        sx={{
          color: config.colors.textPrimary,
          fontSize: '0.75rem',
          lineHeight: 1.6,
          mb: 1.5,
        }}
      >
        {data.summary}
      </Typography>

      {/* Key themes */}
      {data.keyThemes.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography
            variant="caption"
            sx={{
              color: config.colors.textSecondary,
              fontWeight: 600,
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              display: 'block',
              mb: 0.5,
            }}
          >
            Key themes
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {data.keyThemes.map((theme, idx) => (
              <Chip
                key={idx}
                size="small"
                label={theme}
                variant="outlined"
                sx={{
                  fontSize: '0.6rem',
                  height: 20,
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Action items (collapsible) */}
      {data.actionItems.length > 0 && (
        <Box>
          <Button
            size="small"
            variant="text"
            onClick={() => setShowActionItems(!showActionItems)}
            sx={{
              p: 0,
              fontSize: '0.65rem',
              color: config.colors.primary,
              fontWeight: 500,
              minWidth: 'auto',
            }}
          >
            {showActionItems ? 'Hide' : 'Show'} {data.actionItems.length} suggested improvements
          </Button>
          {showActionItems && (
            <Box
              sx={{
                mt: 1,
                pl: 1.5,
                borderLeft: `2px solid ${config.colors.primary}`,
              }}
            >
              {data.actionItems.map((item, idx) => (
                <Box key={idx} sx={{ display: 'flex', gap: 0.75, mb: 0.5 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: config.colors.primary,
                      fontWeight: 600,
                      fontSize: '0.65rem',
                      minWidth: 14,
                    }}
                  >
                    {idx + 1}.
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: config.colors.textSecondary,
                      fontSize: '0.7rem',
                      lineHeight: 1.4,
                    }}
                  >
                    {item}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
