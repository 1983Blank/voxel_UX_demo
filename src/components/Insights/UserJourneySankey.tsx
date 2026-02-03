import { useRef, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { Path, ArrowRight } from '@phosphor-icons/react';
import { useThemeStore } from '@/store/themeStore';

// Track if module is already loaded globally
let sankeyModuleLoaded = false;

export interface JourneyEvent {
  type: 'pageview' | 'scroll' | 'click';
  count: number;
  label?: string;
}

export interface JourneyStage {
  name: string;
  events: JourneyEvent[];
  users: number;
}

interface UserJourneySankeyProps {
  stages: JourneyStage[];
}

export function UserJourneySankey({ stages }: UserJourneySankeyProps) {
  const { config } = useThemeStore();
  const chartRef = useRef<HighchartsReact.RefObject>(null);
  const [isReady, setIsReady] = useState(sankeyModuleLoaded);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Dynamically load Sankey module
  useEffect(() => {
    if (sankeyModuleLoaded) {
      setIsReady(true);
      return;
    }

    import('highcharts/modules/sankey')
      .then((module) => {
        if (!sankeyModuleLoaded) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (module.default as any)(Highcharts);
          sankeyModuleLoaded = true;
        }
        setIsReady(true);
      })
      .catch((err) => {
        console.error('[UserJourneySankey] Failed to load Sankey module:', err);
        setLoadError('Failed to load chart module');
      });
  }, []);

  // Convert stages to Sankey data format
  const getSankeyData = (): Array<{ from: string; to: string; weight: number; color?: string }> => {
    if (stages.length < 2) return [];

    const data: Array<{ from: string; to: string; weight: number; color?: string }> = [];
    const dropColor = config.colors.error || '#ef4444';

    for (let i = 0; i < stages.length - 1; i++) {
      const from = stages[i];
      const to = stages[i + 1];

      // Users who continued to next stage
      const continued = to.users;
      if (continued > 0) {
        data.push({
          from: from.name,
          to: to.name,
          weight: continued,
        });
      }

      // Users who dropped off
      const dropped = from.users - to.users;
      if (dropped > 0) {
        data.push({
          from: from.name,
          to: `Drop-off`,
          weight: dropped,
          color: dropColor,
        });
      }
    }

    return data;
  };

  // Define nodes with colors
  const getNodes = () => {
    const primaryColor = config.colors.primary;
    const successColor = config.colors.success;
    const errorColor = config.colors.error || '#ef4444';

    const nodes = stages.map((stage, index) => {
      let color = primaryColor;
      if (index === stages.length - 1) {
        color = successColor;
      } else if (index > 0) {
        const blendRatio = index / (stages.length - 1);
        color = blendRatio > 0.5 ? successColor : primaryColor;
      }

      return {
        id: stage.name,
        color,
      };
    });

    // Add drop-off node
    nodes.push({
      id: 'Drop-off',
      color: errorColor,
    });

    return nodes;
  };

  // Empty state component
  const EmptyState = ({ message }: { message: string }) => (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 200,
        py: 4,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          opacity: 0.4,
        }}
      >
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            backgroundColor: config.colors.primary,
            opacity: 0.3,
          }}
        />
        <ArrowRight size={20} color={config.colors.textSecondary} />
        <Box
          sx={{
            width: 24,
            height: 24,
            borderRadius: 1,
            backgroundColor: config.colors.success,
            opacity: 0.3,
          }}
        />
        <ArrowRight size={20} color={config.colors.textSecondary} />
        <Box
          sx={{
            width: 16,
            height: 16,
            borderRadius: 1,
            backgroundColor: config.colors.textSecondary,
            opacity: 0.3,
          }}
        />
      </Box>
      <Path size={28} color={config.colors.textSecondary} style={{ opacity: 0.5, marginBottom: 8 }} />
      <Typography
        variant="body2"
        sx={{
          color: config.colors.textSecondary,
          fontSize: '0.8rem',
          textAlign: 'center',
        }}
      >
        {message}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          color: config.colors.textSecondary,
          fontSize: '0.7rem',
          opacity: 0.7,
          mt: 0.5,
        }}
      >
        User journey data will appear here
      </Typography>
    </Box>
  );

  // Error state
  if (loadError) {
    return <EmptyState message={loadError} />;
  }

  // No data state
  if (stages.length === 0) {
    return <EmptyState message="No journey data available" />;
  }

  // Not enough stages
  if (stages.length < 2) {
    return <EmptyState message="Need at least 2 stages to show flow" />;
  }

  // Loading state
  if (!isReady) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 200,
          py: 4,
        }}
      >
        <Box
          sx={{
            width: 24,
            height: 24,
            border: `2px solid ${config.colors.primary}`,
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            '@keyframes spin': {
              '0%': { transform: 'rotate(0deg)' },
              '100%': { transform: 'rotate(360deg)' },
            },
          }}
        />
        <Typography
          variant="caption"
          sx={{
            color: config.colors.textSecondary,
            fontSize: '0.75rem',
            mt: 1.5,
          }}
        >
          Loading chart...
        </Typography>
      </Box>
    );
  }

  const sankeyData = getSankeyData();
  const nodes = getNodes();

  // No flow data (all users dropped)
  if (sankeyData.length === 0) {
    return <EmptyState message="No user flow data to display" />;
  }

  const options: Highcharts.Options = {
    chart: {
      type: 'sankey',
      backgroundColor: 'transparent',
      height: 240,
      style: {
        fontFamily: 'inherit',
      },
    },
    title: {
      text: undefined,
    },
    credits: {
      enabled: false,
    },
    tooltip: {
      headerFormat: '',
      pointFormat: '{point.fromNode.name} → {point.toNode.name}: <b>{point.weight}</b> users',
      style: {
        fontSize: '12px',
      },
    },
    plotOptions: {
      sankey: {
        curveFactor: 0.5,
        linkOpacity: 0.5,
        nodeWidth: 15,
        nodePadding: 20,
        minLinkWidth: 3,
        dataLabels: {
          enabled: true,
          style: {
            fontSize: '11px',
            fontWeight: '500',
            textOutline: 'none',
            color: config.colors.textPrimary,
          },
          nodeFormat: '{point.name}',
        },
      },
    },
    series: [{
      type: 'sankey' as const,
      name: 'User Journey',
      data: sankeyData,
      nodes: nodes,
    } as Highcharts.SeriesSankeyOptions],
  };

  return (
    <Box sx={{ width: '100%', height: '100%', minHeight: 240 }}>
      <HighchartsReact
        ref={chartRef}
        highcharts={Highcharts}
        options={options}
        containerProps={{ style: { width: '100%', height: '100%' } }}
      />
    </Box>
  );
}
