import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { PushPin, CheckCircle, Sparkle } from '@phosphor-icons/react';
import { Card } from '@/components/ui';
import { useThemeStore } from '@/store/themeStore';
import type { FeedbackComment } from '@/services/feedbackInsightsService';

const formatRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
        borderRadius: 1.5,
        border: 1,
        borderColor: comment.resolved ? 'divider' : 'rgba(0,0,0,0.06)',
        backgroundColor: '#ffffff',
        opacity: comment.resolved ? 0.8 : 1,
        transition: 'all 0.15s ease',
        overflow: 'hidden',
        boxShadow: 'none',
        '&:hover': {
          borderColor: 'rgba(0,0,0,0.12)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        },
      }}
    >
      {/* Compact card content */}
      <Box sx={{ p: 1.25 }}>
        {/* Header row: avatar, name, time, icons */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mb: 0.75,
          }}
        >
          <Avatar
            sx={{
              width: 22,
              height: 22,
              fontSize: 9,
              fontWeight: 600,
              background: mode === 'modern' && config.gradients
                ? config.gradients.primary
                : config.colors.primary,
            }}
          >
            {getInitials(comment.userName)}
          </Avatar>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              fontSize: '0.7rem',
              color: config.colors.textPrimary,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {comment.userName}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.6rem',
              color: config.colors.textSecondary,
            }}
          >
            {formatRelativeTime(comment.createdAt)}
          </Typography>

          {/* Status icons */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, ml: 0.5 }}>
            {isPinned && (
              <Tooltip title="Pinned to screen" arrow>
                <PushPin size={12} color={config.colors.primary} weight="fill" />
              </Tooltip>
            )}
            {comment.resolved && (
              <Tooltip title="Resolved" arrow>
                <CheckCircle size={12} color={config.colors.success} weight="fill" />
              </Tooltip>
            )}
          </Box>
        </Box>

        {/* Comment content */}
        <Typography
          variant="body2"
          sx={{
            color: config.colors.textPrimary,
            fontSize: '0.75rem',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {comment.content}
        </Typography>

        {/* Footer: reply count + generate button */}
        {(comment.replyCount > 0 || (showGenerateButton && onGenerateVariant)) && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mt: 0.75,
              pt: 0.5,
              borderTop: 1,
              borderColor: 'rgba(0,0,0,0.04)',
            }}
          >
            {comment.replyCount > 0 ? (
              <Typography
                variant="caption"
                sx={{
                  color: config.colors.primary,
                  fontWeight: 500,
                  fontSize: '0.6rem',
                  cursor: 'pointer',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
              </Typography>
            ) : (
              <Box />
            )}

            {showGenerateButton && onGenerateVariant && (
              <Tooltip title="Generate variant from this feedback" arrow>
                <IconButton
                  size="small"
                  onClick={() => onGenerateVariant(comment.content)}
                  sx={{
                    p: 0.5,
                    color: config.colors.textSecondary,
                    '&:hover': {
                      color: config.colors.primary,
                      backgroundColor: `${config.colors.primary}08`,
                    },
                  }}
                >
                  <Sparkle size={14} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>
    </Card>
  );
}
