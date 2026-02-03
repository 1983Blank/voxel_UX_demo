import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import { PushPin, CheckCircle, Sparkle } from '@phosphor-icons/react';
import { Button, Chip } from '@/components/ui';
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
    <Box
      sx={{
        p: 2,
        borderRadius: 1.5,
        backgroundColor: 'transparent',
        transition: 'all 0.2s ease',
        opacity: comment.resolved ? 0.7 : 1,
        '&:hover': {
          backgroundColor: config.colors.bgSecondary,
        },
      }}
    >
      {/* Header row */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 1,
        }}
      >
        {/* User info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            sx={{
              width: 32,
              height: 32,
              fontSize: 12,
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
              {isPinned && (
                <Chip
                  size="small"
                  label="Pinned"
                  icon={<PushPin size={10} />}
                  sx={{
                    height: 18,
                    fontSize: '0.65rem',
                    '& .MuiChip-icon': {
                      fontSize: 10,
                      ml: 0.5,
                    },
                  }}
                />
              )}
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
      </Box>

      {/* Comment content */}
      <Typography
        variant="body2"
        sx={{
          color: config.colors.textPrimary,
          lineHeight: 1.6,
          mb: comment.replyCount > 0 ? 1 : 0,
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
            '&:hover': { textDecoration: 'underline' },
          }}
        >
          {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
        </Typography>
      )}

      {/* Generate variant button */}
      {showGenerateButton && onGenerateVariant && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1.5 }}>
          <Button
            size="small"
            variant="text"
            startIcon={<Sparkle size={14} />}
            onClick={() => onGenerateVariant(comment.content)}
            sx={{
              fontSize: '0.75rem',
              color: config.colors.textSecondary,
              '&:hover': {
                color: config.colors.primary,
                backgroundColor: `${config.colors.primary}10`,
              },
            }}
          >
            Generate variant
          </Button>
        </Box>
      )}
    </Box>
  );
}
