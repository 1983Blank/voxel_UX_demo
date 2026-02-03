import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useThemeStore } from '@/store/themeStore';

export interface FlowStage {
  label: string;
  count: number;
  percent: number;
  icon: React.ReactNode;
}

interface FlowNodeProps {
  stage: FlowStage;
  index: number;
  total: number;
}

function FlowNode({ stage, index, total }: FlowNodeProps) {
  const { config } = useThemeStore();

  // Color progression from primary to success based on position
  const getNodeColor = () => {
    if (index === 0) return config.colors.primary;
    if (index === total - 1) return config.colors.success;
    // Interpolate for middle stages
    return config.colors.textSecondary;
  };

  const nodeColor = getNodeColor();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 80,
        flex: 1,
      }}
    >
      {/* Icon circle */}
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          backgroundColor: `${nodeColor}15`,
          border: `2px solid ${nodeColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: nodeColor,
          mb: 1,
          transition: 'all 0.2s ease',
          '&:hover': {
            transform: 'scale(1.1)',
            backgroundColor: `${nodeColor}25`,
          },
        }}
      >
        {stage.icon}
      </Box>

      {/* Label */}
      <Typography
        variant="caption"
        sx={{
          fontWeight: 500,
          color: config.colors.textPrimary,
          textAlign: 'center',
          fontSize: '0.7rem',
        }}
      >
        {stage.label}
      </Typography>

      {/* Count & Percentage */}
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
          color: nodeColor,
          mt: 0.5,
        }}
      >
        {stage.count}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: config.colors.textSecondary,
          fontSize: '0.65rem',
        }}
      >
        {stage.percent}%
      </Typography>
    </Box>
  );
}

interface FlowConnectorProps {
  fromPercent: number;
  toPercent: number;
}

function FlowConnector({ fromPercent, toPercent }: FlowConnectorProps) {
  const { config } = useThemeStore();
  const dropoff = fromPercent - toPercent;

  // Color based on dropoff - higher dropoff = more red/warning
  const getConnectorColor = () => {
    if (dropoff > 50) return config.colors.error;
    if (dropoff > 30) return config.colors.warning || '#f59e0b';
    return config.colors.textSecondary;
  };

  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        minWidth: 40,
        height: 48, // Match node height
      }}
    >
      {/* Curved connector using SVG */}
      <svg
        width="100%"
        height="48"
        viewBox="0 0 60 48"
        fill="none"
        style={{ overflow: 'visible' }}
      >
        {/* Curved path */}
        <path
          d="M 0 24 Q 20 8 30 24 Q 40 40 60 24"
          stroke={getConnectorColor()}
          strokeWidth="2"
          strokeDasharray="4 2"
          fill="none"
          opacity={0.5}
        />
        {/* Arrow at end */}
        <polygon
          points="55,20 60,24 55,28"
          fill={getConnectorColor()}
          opacity={0.7}
        />
      </svg>

      {/* Dropoff indicator */}
      {dropoff > 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            backgroundColor: config.colors.bgSecondary,
            px: 0.5,
            borderRadius: 0.5,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontSize: '0.6rem',
              color: getConnectorColor(),
              fontWeight: 500,
            }}
          >
            -{dropoff}%
          </Typography>
        </Box>
      )}
    </Box>
  );
}

interface UserFlowDiagramProps {
  stages: FlowStage[];
}

export function UserFlowDiagram({ stages }: UserFlowDiagramProps) {
  const { config } = useThemeStore();

  if (stages.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 3 }}>
        <Typography variant="body2" color="text.secondary">
          No flow data available
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        py: 2,
        px: 1,
        backgroundColor: config.colors.bgSecondary,
        borderRadius: 2,
        overflow: 'auto',
      }}
    >
      {stages.map((stage, index) => (
        <Box
          key={stage.label}
          sx={{
            display: 'flex',
            alignItems: 'center',
            flex: index < stages.length - 1 ? 'none' : 1,
          }}
        >
          <FlowNode stage={stage} index={index} total={stages.length} />
          {index < stages.length - 1 && (
            <FlowConnector
              fromPercent={stage.percent}
              toPercent={stages[index + 1].percent}
            />
          )}
        </Box>
      ))}
    </Box>
  );
}
