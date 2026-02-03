import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import { PushPin, CheckCircle, Sparkle } from '@phosphor-icons/react';
import { Button, Card, Chip } from '@/components/ui';
import { useThemeStore } from '@/store/themeStore';
import type { FeedbackComment } from '@/services/feedbackInsightsService';

const formatRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

interface CommentItemProps {
  comment: FeedbackComment;
  onGenerateVariant?: (content: string) => void;
  showGenerateButton?: boolean;
}

export function CommentItem({ comment, onGenerateVariant, showGenerateButton = true }: CommentItemProps) {
  const { config, mode } = useThemeStore();

  const isPinned = comment.positionX !== null && comment.positionY !== null;

  return (
    <Card
      sx={{
        p: 0,
        borderRadius: 2,
        border: 1,
        borderColor: comment.resolved ? 'divider' : `${config.colors.primary}30`,
        backgroundColor: config.colors.bgPrimary,
        opacity: comment.resolved ? 0.8 : 1,
        transition: 'all 0.2s ease',
        overflow: 'hidden',
        '&:hover': {
          borderColor: config.colors.primary,
          boxShadow: `0 2px 8px ${config.colors.primary}15`,
        },
      }}
    >
      {/* Card header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: 2,
          pb: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          backgroundColor: config.colors.bgSecondary,
        }}
      >
        {/* User info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            sx={{
              width: 36,
              height: 36,
              fontSize: 13,
              fontWeight: 600,
              background: mode === 'modern' && config.gradients
                ? config.gradients.primary
                : config.colors.primary,
            }}
          >
            {getInitials(comment.userName)}
          </Avatar>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {comment.userName}
              </Typography>
              {comment.resolved && (
                <Tooltip title="Resolved">
                  <CheckCircle size={16} color={config.colors.success} weight="fill" />
                </Tooltip>
              )}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              {formatRelativeTime(comment.createdAt)}
            </Typography>
          </Box>
        </Box>

        {/* Badges */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isPinned && (
            <Chip
              size="small"
              label="Pinned"
              icon={<PushPin size={10} />}
              color="primary"
              variant="outlined"
              sx={{
                height: 22,
                fontSize: '0.7rem',
                '& .MuiChip-icon': {
                  fontSize: 10,
                  ml: 0.5,
                },
              }}
            />
          )}
        </Box>
      </Box>

      {/* Comment content */}
      <Box sx={{ p: 2 }}>
        <Typography
          variant="body2"
          sx={{
            color: config.colors.textPrimary,
            lineHeight: 1.7,
            mb: 0,
          }}
        >
          {comment.content}
        </Typography>

        {/* Reply count */}
        {comment.replyCount > 0 && (
          <Typography
            variant="caption"
            sx={{
              color: config.colors.primary,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'block',
              mt: 1.5,
              '&:hover': { textDecoration: 'underline' },
            }}
          >
            {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
          </Typography>
        )}
      </Box>

      {/* Generate variant button - card footer */}
      {showGenerateButton && onGenerateVariant && (
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            px: 2,
            py: 1.5,
            borderTop: 1,
            borderColor: 'divider',
            backgroundColor: config.colors.bgSecondary,
          }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<Sparkle size={14} />}
            onClick={() => onGenerateVariant(comment.content)}
            sx={{
              fontSize: '0.75rem',
              borderColor: config.colors.border,
              color: config.colors.textSecondary,
              '&:hover': {
                borderColor: config.colors.primary,
                color: config.colors.primary,
                backgroundColor: `${config.colors.primary}08`,
              },
            }}
          >
            Generate variant
          </Button>
        </Box>
      )}
    </Card>
  );
}
