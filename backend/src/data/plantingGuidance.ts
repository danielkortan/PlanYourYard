import { NativePlant } from '../types';

type PlantType = NativePlant['type'];

export const PLANTING_SEASON_BY_TYPE: Record<PlantType, string> = {
  tree: 'Early spring or fall while dormant, when nurseries stock balled-and-burlapped or container trees.',
  shrub: 'Early spring or fall while dormant.',
  perennial: 'Spring after the last frost, or early fall to let roots establish before winter.',
  annual: 'After the last spring frost date for your hardiness zone.',
  grass: 'Spring, once soil has warmed, so roots establish before winter dormancy.',
  fern: 'Spring or early fall from potted nursery stock.',
  vine: 'Spring or fall while dormant.',
  groundcover: 'Spring or early fall from potted nursery stock.',
};

export const PLANTING_INSTRUCTIONS_BY_TYPE: Record<PlantType, string> = {
  tree: 'Dig a hole 2-3x the width of the root ball and no deeper than the root flare. Backfill with native soil, water deeply, and mulch 2-3 inches, keeping mulch off the trunk.',
  shrub: 'Dig a hole twice as wide as the root ball and the same depth. Backfill with native soil, water thoroughly, and mulch to retain moisture.',
  perennial: 'Loosen and amend soil with compost. Plant at the same depth as the container, space according to mature spread, and water in well.',
  annual: 'Plant at the same depth as the container after the danger of frost has passed; water in well.',
  grass: 'Plant at the same depth as the container in loosened soil, spaced according to mature spread, and water in well.',
  fern: 'Plant in loosened, humus-rich soil at the same depth as the crown; keep consistently moist until established.',
  vine: 'Plant at the base of a trellis, fence, or structure it can climb; loosen soil, backfill, and water deeply after planting.',
  groundcover: 'Space according to mature spread in loosened, amended soil; water in well and mulch lightly to suppress weeds while it fills in.',
};
