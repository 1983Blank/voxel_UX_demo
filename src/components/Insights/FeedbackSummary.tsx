import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { Sparkle, ArrowClockwise, CheckCircle, Warning, TrendUp } from '@phosphor-icons/react';
import { Card, CardContent, Button, Chip } from '@/components/ui';
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
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ textAlign: 'center', py: 2 }}>
            <Sparkle size={32} color={config.colors.textSecondary} />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {commentCount > 0
                ? 'Generate an AI summary of feedback'
                : 'No feedback to summarize yet'}
            </Typography>
            {commentCount > 0 && onRegenerate && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<Sparkle size={14} />}
                onClick={onRegenerate}
                sx={{ mt: 2 }}
              >
                Generate summary
              </Button>
            )}
          </Box>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
            <CircularProgress size={24} />
            <Typography variant="body2" color="text.secondary">
              Analyzing feedback...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const sentimentInfo = getSentimentInfo(data.sentimentScore);
  const SentimentIcon = sentimentInfo.icon;

  return (
    <Card variant="outlined">
      <CardContent sx={{ p: 2.5 }}>
        {/* Header with sentiment indicator */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            mb: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Sparkle size={18} color={config.colors.primary} weight="fill" />
            <Typography variant="subtitle2" fontWeight={600}>
              AI Summary
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              size="small"
              label={sentimentInfo.label}
              icon={<SentimentIcon size={12} />}
              sx={{
                backgroundColor: `${sentimentInfo.color}15`,
                color: sentimentInfo.color,
                fontWeight: 500,
                '& .MuiChip-icon': {
                  color: sentimentInfo.color,
                },
              }}
            />
            {onRegenerate && (
              <Button
                size="small"
                variant="text"
                onClick={onRegenerate}
                sx={{ minWidth: 'auto', p: 0.5 }}
              >
                <ArrowClockwise size={16} />
              </Button>
            )}
          </Box>
        </Box>

        {/* Summary text */}
        <Typography
          variant="body2"
          sx={{
            color: config.colors.textPrimary,
            lineHeight: 1.7,
            mb: 2,
          }}
        >
          {data.summary}
        </Typography>

        {/* Key themes */}
        {data.keyThemes.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              sx={{
                color: config.colors.textSecondary,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'block',
                mb: 1,
              }}
            >
              Key themes
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {data.keyThemes.map((theme, idx) => (
                <Chip
                  key={idx}
                  size="small"
                  label={theme}
                  variant="outlined"
                  sx={{
                    fontSize: '0.7rem',
                    height: 24,
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
                fontSize: '0.75rem',
                color: config.colors.primary,
                fontWeight: 500,
              }}
            >
              {showActionItems ? 'Hide' : 'Show'} {data.actionItems.length} suggested improvements
            </Button>
            {showActionItems && (
              <Box
                sx={{
                  mt: 1.5,
                  pl: 2,
                  borderLeft: `2px solid ${config.colors.primary}`,
                }}
              >
                {data.actionItems.map((item, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: config.colors.primary,
                        fontWeight: 600,
                        minWidth: 16,
                      }}
                    >
                      {idx + 1}.
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: config.colors.textSecondary,
                        fontSize: '0.8rem',
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
      </CardContent>
    </Card>
  );
}
