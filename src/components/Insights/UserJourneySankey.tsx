import { useRef, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { useThemeStore } from '@/store/themeStore';

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
  const [sankeyLoaded, setSankeyLoaded] = useState(false);

  // Dynamically load Sankey module
  useEffect(() => {
    import('highcharts/modules/sankey').then((module) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (module.default as any)(Highcharts);
      setSankeyLoaded(true);
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
        // Blend colors based on position
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

  const sankeyData = getSankeyData();
  const nodes = getNodes();

  const options: Highcharts.Options = {
    chart: {
      type: 'sankey',
      backgroundColor: 'transparent',
      height: 260,
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

  if (stages.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No journey data available
        </Typography>
      </Box>
    );
  }

  if (stages.length < 2) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Need at least 2 stages to show journey flow
        </Typography>
      </Box>
    );
  }

  if (!sankeyLoaded) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.secondary">
          Loading chart...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%', height: '100%', minHeight: 260 }}>
      <HighchartsReact
        ref={chartRef}
        highcharts={Highcharts}
        options={options}
        containerProps={{ style: { width: '100%', height: '100%' } }}
      />
    </Box>
  );
}
