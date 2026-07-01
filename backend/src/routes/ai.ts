import { Router, Request, Response } from 'express';
import multer from 'multer';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';
import { AIAnalyzeRequest, NativePlant } from '../types';
import { nativePlantsData } from '../data/nativePlants';
import { PLANTING_SEASON_BY_TYPE, PLANTING_INSTRUCTIONS_BY_TYPE } from '../data/plantingGuidance';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Every AI call costs real money (Claude vision/text generation), so every route in this
// file requires a logged-in user and is rate-limited per-user to prevent runaway spend
// from a single account (accidental loops, scripted abuse, etc).
router.use(requireAuth);

const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthRequest) => (req.user ? `user:${req.user.id}` : ipKeyGenerator(req.ip!)),
  message: { error: 'AI request limit reached (20 per hour). Please try again later.' },
});
router.use(aiRateLimiter);

// Plants actually native to the app's Mid-Atlantic / Virginia focus area — the
// only plants the AI is allowed to recommend, so every recommendation resolves
// to a full, real database record instead of an AI-invented one.
const recommendableCatalog = nativePlantsData.filter(
  p => p.nativeRange.includes('Virginia') && p.nativeRange.includes('Mid-Atlantic')
);

function buildCatalogPromptList(): string {
  return recommendableCatalog
    .map(p => `- id: "${p.id}" — ${p.commonName} (${p.scientificName}) | ${p.type} | sun: ${p.sunRequirements.join('/')} | height ${p.height.min}-${p.height.max}ft | soil: ${p.soilType.join('/')} | water: ${p.waterRequirements}`)
    .join('\n');
}

// Clamp an x coordinate to stay just inside the map's left/right edges
function clampX(n: any): number {
  const num = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(num)) return 50;
  return Math.min(96, Math.max(4, num));
}

// Clamp a y coordinate to the yard area — never inside the house band (y 0-15),
// since markers there would visually render on top of the house graphic
function clampY(n: any): number {
  const num = typeof n === 'number' ? n : parseFloat(n);
  if (!Number.isFinite(num)) return 55;
  return Math.min(96, Math.max(18, num));
}

function enrichRecommendation(rec: { plantId?: string; whyItWorks?: string; location?: string; x?: number; y?: number }): Record<string, any> | null {
  if (!rec?.plantId) return null;
  const plant = recommendableCatalog.find(p => p.id === rec.plantId);
  if (!plant) return null;
  return {
    plantId: plant.id,
    commonName: plant.commonName,
    scientificName: plant.scientificName,
    type: plant.type,
    height: plant.height,
    spread: plant.spread,
    sunRequirements: plant.sunRequirements,
    soilType: plant.soilType,
    waterRequirements: plant.waterRequirements,
    bloomTime: plant.bloomTime,
    bloomColor: plant.bloomColor,
    wildlifeValue: plant.wildlifeValue,
    whyItWorks: rec.whyItWorks || plant.description,
    location: rec.location || '',
    whenToBuy: PLANTING_SEASON_BY_TYPE[plant.type],
    howToPlant: PLANTING_INSTRUCTIONS_BY_TYPE[plant.type],
    care: plant.careTips,
    x: clampX(rec.x),
    y: clampY(rec.y),
  };
}

function enrichExistingPlant(item: { label?: string; x?: number; y?: number }): Record<string, any> | null {
  if (!item?.label) return null;
  return {
    label: item.label,
    x: clampX(item.x),
    y: clampY(item.y),
  };
}

// Validate the AI's estimate of how much of the map width the house spans,
// falling back to a generic centered house if the estimate is missing/invalid
function clampHouseBounds(houseXStart: any, houseXEnd: any): { xStart: number; xEnd: number } {
  let start = typeof houseXStart === 'number' ? houseXStart : parseFloat(houseXStart);
  let end = typeof houseXEnd === 'number' ? houseXEnd : parseFloat(houseXEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { xStart: 25, xEnd: 75 };
  }
  start = Math.min(90, Math.max(0, start));
  end = Math.min(100, Math.max(10, end));
  if (end - start < 20) {
    const mid = (start + end) / 2;
    start = Math.max(0, mid - 10);
    end = Math.min(100, mid + 10);
  }
  return { xStart: start, xEnd: end };
}

function enrichStructuredAnalysis(structured: Record<string, any> | null): Record<string, any> | null {
  if (!structured?.recommendations) return structured;
  const recommendations = structured.recommendations
    .map((r: any) => enrichRecommendation(r))
    .filter((r: any): r is Record<string, any> => r !== null);
  const existingPlantsMap = Array.isArray(structured.existingPlantsMap)
    ? structured.existingPlantsMap.map((i: any) => enrichExistingPlant(i)).filter((i: any): i is Record<string, any> => i !== null)
    : [];
  const house = clampHouseBounds(structured.houseXStart, structured.houseXEnd);
  return { ...structured, recommendations, existingPlantsMap, house };
}

const getClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  return new Anthropic({ apiKey });
};

// Analyze uploaded yard/house image
router.post('/analyze', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }

  const { location, plantName, plantScientific, sunClassification, sunHoursOfSun, yardStyles, adjustments } = req.body;
  const imageBase64 = req.file.buffer.toString('base64');
  const mimeType = req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  const sunContext = sunClassification
    ? `\n\nMEASURED SUN DATA (from the exact property address, calculated from real solar geometry — treat this as ground truth for the site's overall sun exposure classification): this property receives approximately ${sunHoursOfSun} hours of direct sun today and is classified as "${sunClassification}". Use the photo to identify localized shade from specific visible obstructions (trees, structures, fences), but do not contradict this measured overall classification unless the photo clearly shows a small shaded pocket within an otherwise sunny property.`
    : '';

  const styleContext = yardStyles
    ? `\n\nThe homeowner is going for the following yard style(s): ${yardStyles}. Prioritize your site assessment, design concept, and plant choices (from the catalog below) to support this goal. Note: the plant catalog contains native ornamental plants only, no food crops — if "Fruit / Vegetable" is among the styles, address it through placement guidance in landscapeOpportunities/designConcept (e.g., suggesting a sunny bed location and companion native pollinator plantings to support a food garden) rather than substituting edible crops into the "recommendations" list.`
    : '';

  const adjustmentContext = adjustments
    ? `\n\nThe homeowner reviewed a previous set of recommendations and asked for this adjustment: "${adjustments}". Factor this into your new site assessment, design concept, and plant choices while still following all other instructions and choosing only from the catalog below.`
    : '';

  try {
    const client = getClient();
    const prompt = plantName
      ? `You are a professional landscape architect and horticulturist. Analyze this photo of a yard/house exterior.
         The homeowner wants to plant: ${plantName} (${plantScientific || ''}) at their location${location ? ` in ${location}` : ''}.

         Please provide:
         1. **Current Landscape Assessment**: Describe what you see (sun exposure, existing plants, soil conditions, available space)
         2. **Planting Recommendations**: Best spots in this yard for ${plantName}, considering sun/shade, drainage, and space
         3. **Growth Visualization**: Describe in detail how ${plantName} will look in this yard at:
            - Year 1: First season appearance
            - Year 3: Establishing phase
            - Year 5: Maturing appearance
            - Year 10+: Mature/established look
         4. **Companion Plants**: 3-5 native plants that would complement ${plantName} in this setting
         5. **Care Timeline**: Key maintenance tasks for the first 3 years

         Be specific about placement, spacing, and visual impact.`
      : `You are a professional landscape architect. Analyze this photo of a yard/house exterior${location ? ` located in ${location}` : ''}.${sunContext}${styleContext}${adjustmentContext}

AVAILABLE NATIVE PLANTS — you must choose your 5 recommendations ONLY from this exact list, using the "id" value verbatim (do not invent plants or ids outside this list):
${buildCatalogPromptList()}

You will also produce a simple top-down map of the property using this coordinate convention:
- x ranges 0-100 (0 = left edge of the property, 100 = right edge)
- y ranges 18-100 (the house occupies y 0-17, a band across the top of the map, so y=18 is the ground immediately in front of/beside the house and y=100 is the street/front edge closest to the viewer) — NEVER use a y value below 18, since that would place a marker on top of the house itself
- Foundation plantings (right up against the house wall) should use y around 18-25; mid-yard plantings around y 30-65; plantings near the street/front edge around y 70-95
- Also estimate "houseXStart" and "houseXEnd" (both 0-100): how much of the property's width the house itself actually spans left-to-right as seen in the photo. A house that fills most of the frame should be wide (e.g. 8-92); a house that's a smaller portion of a wide lot should be narrower (e.g. 30-70). Get this right — it's used to draw the house at the correct width and position.
- Place each existing item and each recommendation at the (x, y) that best matches where it actually is (or should go) in the photo relative to the house and walkway

Be EXHAUSTIVE in "existingPlantsMap": include a separate entry for every visually distinct plant, shrub, or tree you can make out in the photo, not just one or two — a densely planted foundation bed might have 8-12+ distinct entries (e.g. separate entries for each different shrub type/cluster, not one combined entry for "shrubs"). Every plant or tree you mention in "currentPlants" text must also have a corresponding entry in "existingPlantsMap" — the two must describe the same set of plants, never mention something in the text without also placing it on the map.

Respond with ONLY a single valid JSON object (no markdown code fences, no commentary before or after) matching exactly this shape:

{
  "siteAssessment": "string - sun exposure (full sun/part shade/shade areas), existing vegetation, soil type indicators",
  "landscapeOpportunities": "string - best areas for new plantings and why",
  "currentPlants": "string - identification of any existing plants/trees visible, matching every entry in existingPlantsMap",
  "houseXStart": "number 0-100 - left edge of the house per the coordinate convention above",
  "houseXEnd": "number 0-100 - right edge of the house per the coordinate convention above",
  "existingPlantsMap": [
    {
      "label": "string - short specific name for one distinct existing plant/tree/shrub visible in the photo, e.g. 'Boxwood by Left Window' or 'Mature Oak Tree'",
      "x": "number 0-100 per the coordinate convention above",
      "y": "number 0-100 per the coordinate convention above"
    }
  ],
  "recommendations": [
    {
      "plantId": "string - must exactly match an id from the AVAILABLE NATIVE PLANTS list above",
      "whyItWorks": "string - why this specific plant suits this site's conditions",
      "location": "string - exactly where on this property to place it",
      "x": "number 0-100 per the coordinate convention above, matching the location description",
      "y": "number 0-100 per the coordinate convention above, matching the location description"
    }
  ],
  "designConcept": {
    "title": "string - short evocative name for the overall design",
    "description": "string - 1-2 sentence summary of the concept",
    "steps": ["string - ordered implementation steps"]
  }
}

Choose exactly 5 plants from the list above that best match this site's sun/shade, soil, and moisture conditions as seen in the photo. Include every distinct existing plant/tree/shrub you can identify in "existingPlantsMap" (it's fine to have anywhere from 1 to 6 items depending on what's visible). Be specific about "location" and "whyItWorks" — a homeowner should understand exactly why each plant was chosen and where to put it. Keep each field to 1-3 sentences so the full JSON object fits well within your response limit.`;

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: plantName ? 2000 : 5400,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    const rawText = textContent?.type === 'text' ? textContent.text : '';
    const structured = plantName ? null : enrichStructuredAnalysis(parseStructuredAnalysis(rawText));
    if (!plantName && !structured) {
      console.warn('AI analyze: failed to parse structured JSON', { stopReason: response.stop_reason, length: rawText.length });
    }
    res.json({
      analysis: rawText,
      structured,
      usage: response.usage,
    });
  } catch (error: any) {
    if (error.message === 'ANTHROPIC_API_KEY not configured') {
      return res.status(503).json({
        error: 'AI service not configured. Please add your ANTHROPIC_API_KEY to the backend .env file.',
        demo: true,
        analysis: generateDemoAnalysis(plantName, location),
        structured: plantName ? null : enrichStructuredAnalysis(generateDemoStructuredAnalysis()),
      });
    }
    console.error('AI analyze error:', error);
    res.status(500).json({ error: 'AI analysis failed', details: error.message });
  }
});

// Attempt to parse the yard-analysis JSON payload out of the model's text response
function parseStructuredAnalysis(text: string): Record<string, any> | null {
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '');
  const match = stripped.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// Visualize plant growth stages
router.post('/visualize', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }

  const { plantName, plantScientific, growthStage, height, spread } = req.body;
  const imageBase64 = req.file.buffer.toString('base64');
  const mimeType = req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

  try {
    const client = getClient();
    const stageDescriptions: Record<string, string> = {
      '1year': '1 year after planting (first growing season)',
      '3year': '3 years after planting (establishing)',
      '5year': '5 years after planting (maturing)',
      '10year': '10 years after planting',
      'mature': 'fully mature (at maximum size)',
    };

    const stageDesc = stageDescriptions[growthStage] || growthStage;
    const expectedHeight = growthStage === '1year' ? '1-2 ft' :
                          growthStage === '3year' ? '3-6 ft' :
                          growthStage === '5year' ? `${Math.round(parseInt(height) * 0.3)}-${Math.round(parseInt(height) * 0.5)} ft` :
                          growthStage === '10year' ? `${Math.round(parseInt(height) * 0.6)}-${Math.round(parseInt(height) * 0.8)} ft` :
                          `${height} ft (mature)`;

    const prompt = `You are a professional landscape visualization expert. I'm showing you a photo of a yard/property.

The homeowner wants to visualize planting ${plantName} (${plantScientific}) at the ${stageDesc}.
At this stage, the plant would be approximately ${expectedHeight} tall and ${spread} ft wide.

Please provide:

**Visual Description**: Paint a vivid, detailed picture of exactly how ${plantName} will look in THIS specific yard at ${stageDesc}. Describe:
- The plant's size relative to the house/structures visible
- Its overall shape and silhouette
- Seasonal appearance (spring flowers/berries, summer foliage, fall color, winter structure)
- How it fills the space and interacts with existing plants/structures

**Placement Visualization**: Where in this photo would the plant look best? Describe the exact spot using landmarks visible in the image.

**Before/After Mental Image**: Help the homeowner visualize the transformation from current state to ${stageDesc}.

**Key Visual Features at This Stage**:
- Height and spread details
- Bark/stem character
- Foliage density and color
- Any flowers, fruits, or berries expected

Make this description vivid and specific enough that the homeowner can clearly picture the transformation.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    });

    const textContent = response.content.find(c => c.type === 'text');
    res.json({
      visualization: textContent?.type === 'text' ? textContent.text : '',
      plantName,
      growthStage,
      usage: response.usage,
    });
  } catch (error: any) {
    if (error.message === 'ANTHROPIC_API_KEY not configured') {
      return res.status(503).json({
        error: 'AI service not configured',
        demo: true,
        visualization: generateDemoVisualization(plantName, growthStage, height, spread),
      });
    }
    console.error('AI visualize error:', error);
    res.status(500).json({ error: 'Visualization failed', details: error.message });
  }
});

// Street view simulation - text-only, no image required
router.post('/streetview', async (req: Request, res: Response) => {
  const { plants, address, viewType } = req.body as {
    plants: Array<{
      commonName: string;
      scientificName: string;
      yearPlanted: number;
      heightPlanted: number;
      currentEstimatedHeight: number;
      currentEstimatedSpread: number;
      growthRate: string;
      type: string;
      zoneName: string;
    }>;
    address?: string;
    viewType: 'aerial' | 'street';
  };

  if (!plants || plants.length === 0) {
    return res.status(400).json({ error: 'No plant data provided' });
  }

  const currentYear = new Date().getFullYear();

  const plantList = plants.map(p => {
    const age = currentYear - p.yearPlanted;
    return `- ${p.commonName} (${p.scientificName}): planted ${age} year${age !== 1 ? 's' : ''} ago at ${p.heightPlanted}ft, now estimated ${p.currentEstimatedHeight}ft tall × ${p.currentEstimatedSpread}ft wide (${p.growthRate} growth rate, ${p.type}, in "${p.zoneName}" zone)`;
  }).join('\n');

  const viewPrompt = viewType === 'street'
    ? `Describe in vivid detail what a visitor sees when arriving at this property from the street. Walk them from the curb up to the front door. Describe how tall each plant appears relative to a person or the house, how they frame the entrance, seasonal colors and textures, and the overall curb appeal and naturalistic feel of the landscape.`
    : `Describe the property as seen from directly above (aerial/bird's eye view). Explain the layout of plantings, how the green canopy areas look from above, the circular spread of each plant relative to lawn areas, and how the plant placement creates a cohesive garden design.`;

  const prompt = `You are a professional landscape architect providing a vivid ${viewType === 'street' ? 'street-level' : 'aerial'} visualization of a property's landscape based on plant data.

Property: ${address || 'Residential property'}
Current year: ${currentYear}

Plants in the landscape:
${plantList}

${viewPrompt}

Also include:
- **Seasonal Highlights**: What this yard looks like in each season
- **Wildlife Activity**: What birds, butterflies, and pollinators you'd expect to see
- **Overall Landscape Character**: The feel and aesthetic of this planting plan

Make the description specific, vivid, and inspirational so the homeowner can truly picture their future yard.`;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    res.json({
      visualization: textContent?.type === 'text' ? textContent.text : '',
      viewType,
      usage: response.usage,
    });
  } catch (error: any) {
    if (error.message === 'ANTHROPIC_API_KEY not configured') {
      return res.status(503).json({
        error: 'AI service not configured',
        demo: true,
        visualization: generateDemoStreetView(plants, viewType, currentYear, address),
      });
    }
    console.error('AI streetview error:', error);
    res.status(500).json({ error: 'Street view generation failed', details: error.message });
  }
});

function generateDemoStreetView(
  plants: Array<{ commonName: string; currentEstimatedHeight: number; currentEstimatedSpread: number; yearPlanted: number; zoneName: string }>,
  viewType: string,
  currentYear: number,
  address?: string
): string {
  const tallest = plants.reduce((a, b) => a.currentEstimatedHeight > b.currentEstimatedHeight ? a : b, plants[0]);
  return `## Demo Mode – ${viewType === 'street' ? 'Street-Level' : 'Aerial'} Visualization

**Note**: This is a demo response. Add your ANTHROPIC_API_KEY to enable real AI visualization.

### Your Landscape at a Glance (${currentYear})

You have **${plants.length} plant${plants.length !== 1 ? 's' : ''}** established in your landscape${address ? ` at ${address}` : ''}.

${viewType === 'street' ? `
**From the Street**
As you approach the property, the most prominent feature is the ${tallest.commonName}, now standing approximately ${tallest.currentEstimatedHeight} feet tall. The naturalistic plantings create a welcoming, layered look that stands out from typical turf-only lawns.

**Seasonal Highlights**
- **Spring**: Fresh foliage emerges alongside any early bloomers
- **Summer**: Full leafy canopy provides shade and texture
- **Fall**: Rich color display from foliage and seed heads
- **Winter**: Architectural structure and winter interest for birds
` : `
**From Above**
The aerial view reveals a thoughtful arrangement of plantings across the property. Green canopy circles dot the landscape, with the ${tallest.commonName} creating the largest overhead coverage at roughly ${tallest.currentEstimatedSpread} feet across.
`}

**Wildlife Potential**
With these native plants, expect visits from butterflies, native bees, and songbirds throughout the growing season. The layered planting structure provides nesting and foraging habitat.

**Overall Character**
This landscape showcases the beauty of native plantings — low maintenance, ecologically valuable, and seasonally dynamic.`;
}

function generateDemoAnalysis(plantName?: string, location?: string): string {
  if (plantName) {
    return `## Demo Mode - AI Analysis

**Note**: This is a demo response. Add your ANTHROPIC_API_KEY to enable real AI analysis.

### Current Landscape Assessment
The yard shows good potential for native plantings. The property appears to have a mix of sun and shade areas, with open lawn space suitable for new plantings.

### Planting Recommendations for ${plantName}
Based on typical yard conditions, ${plantName} would do well:
- **Front yard**: Near the foundation for privacy screening
- **Side yard**: As a specimen or in a naturalized grouping
- **Back yard**: As a focal point or wildlife habitat anchor

### Growth Visualization
- **Year 1**: Small transplant establishing roots, 1-3 ft tall
- **Year 3**: Visible presence, 4-8 ft, beginning to flower
- **Year 5**: Substantial presence, noticeable seasonal interest
- **Year 10+**: Mature specimen providing full landscape value

### Companion Plants
1. Wild columbine (Aquilegia canadensis)
2. Virginia bluebells (Mertensia virginica)
3. Eastern red columbine (Aquilegia canadensis)
4. Black-eyed Susan (Rudbeckia hirta)
5. Little bluestem (Schizachyrium scoparium)`;
  }
  return `## Demo Mode - Yard Analysis

**Note**: This is a demo response. Add your ANTHROPIC_API_KEY to enable real AI analysis.

### Site Assessment
The property shows typical suburban landscape conditions with open lawn areas and potential for improvement with native plantings.

### Top Native Plant Recommendations
1. **Eastern Redbud** - Excellent specimen tree for any yard
2. **Virginia Sweetspire** - Versatile native shrub for borders
3. **Black-eyed Susan** - Low-maintenance native perennial
4. **Wild Bergamot** - Pollinator magnet
5. **Little Bluestem** - Native grass for year-round interest`;
}

function generateDemoStructuredAnalysis(): Record<string, any> {
  return {
    siteAssessment: 'This demo response simulates a property with a mix of full sun near the front lawn and part-shade under mature trees toward the back. Soil appears to be typical clay-loam common to the Mid-Atlantic region, with decent drainage.',
    landscapeOpportunities: 'The foundation bed along the front of the house and the shaded area under the tree canopy are both underused and would benefit from layered native plantings instead of turf.',
    currentPlants: 'A mature shade tree in the back-left of the yard, and along the foundation: a row of overgrown boxwood shrubs left of the door, a clipped yew to the right of the door, and a smaller juniper near the right corner of the house.',
    houseXStart: 12,
    houseXEnd: 88,
    existingPlantsMap: [
      { label: 'Mature Shade Tree', x: 20, y: 45 },
      { label: 'Overgrown Boxwood (Left of Door)', x: 38, y: 20 },
      { label: 'Clipped Yew (Right of Door)', x: 58, y: 20 },
      { label: 'Juniper (Right Corner)', x: 80, y: 22 },
    ],
    recommendations: [
      {
        plantId: 'eastern-redbud',
        whyItWorks: 'Understory native that thrives in filtered light and adds spring color at a manageable scale for a front yard.',
        location: 'Offset to one side of the entry walkway for seasonal color without blocking the door.',
        x: 38,
        y: 25,
      },
      {
        plantId: 'oakleaf-hydrangea',
        whyItWorks: 'Shade-tolerant with four-season interest; makes an excellent foundation replacement for sheared non-native shrubs.',
        location: 'Foundation bed along the front of the house, spaced 4-5 feet apart.',
        x: 62,
        y: 18,
      },
      {
        plantId: 'christmas-fern',
        whyItWorks: 'Evergreen groundcover that handles dry shade under trees where grass struggles.',
        location: 'Underneath the mature shade tree canopy in the back yard.',
        x: 22,
        y: 52,
      },
      {
        plantId: 'foamflower',
        whyItWorks: 'Spreading shade groundcover with delicate spring flowers that fills bare mulch areas.',
        location: 'Along the shaded walkway border as a low edging groundcover.',
        x: 45,
        y: 35,
      },
      {
        plantId: 'virginia-sweetspire',
        whyItWorks: 'Handles moist soil, offers fragrant blooms and vivid red fall color.',
        location: 'Low-lying side yard area that collects moisture after rain.',
        x: 80,
        y: 55,
      },
    ],
    designConcept: {
      title: 'Woodland Edge Retreat',
      description: 'Embrace the property\'s natural forest setting rather than fighting it, layering native trees, shrubs, and groundcovers from the house out toward the tree line.',
      steps: [
        'Anchor the entry with an Eastern Redbud offset to one side for seasonal color and scale.',
        'Replace tired sheared shrubs with a naturalized foundation of Oakleaf Hydrangea and Virginia Sweetspire, allowing loose, organic forms.',
        'Underplant with a groundcover carpet of Christmas Fern and Foamflower to eliminate bare mulch and reduce weeding.',
        'Define the walkway with a low border of shade perennials for a welcoming approach.',
        'Convert struggling turf under tree canopies into naturalized woodland beds with native groundcovers and a leaf-mulch aesthetic.',
      ],
    },
  };
}

function generateDemoVisualization(plantName: string, growthStage: string, height: string, spread: string): string {
  const stageNames: Record<string, string> = {
    '1year': '1 Year',
    '3year': '3 Years',
    '5year': '5 Years',
    '10year': '10 Years',
    'mature': 'Maturity',
  };

  return `## Demo Mode - Growth Visualization

**Note**: This is a demo response. Add your ANTHROPIC_API_KEY to enable real AI visualization.

### ${plantName} at ${stageNames[growthStage] || growthStage}

**Visual Description**
At this stage, your ${plantName} would be a ${growthStage === '1year' ? 'small, newly planted' : growthStage === 'mature' ? 'full, majestic' : 'growing'} specimen.

**Size Context**
The plant would reach approximately ${height} ft tall and ${spread} ft wide at maturity. At the ${stageNames[growthStage] || growthStage} stage, expect it to be proportionally smaller but increasingly impactful in your landscape.

**Seasonal Character**
- **Spring**: Fresh foliage emergence, possible blooms
- **Summer**: Full leafy presence, providing shade and wildlife habitat
- **Fall**: Color display and seed/berry production for wildlife
- **Winter**: Structural interest with bare branches

**Landscape Impact**
This plant will become an increasingly valuable part of your landscape ecosystem, supporting local wildlife while adding seasonal beauty and reducing lawn maintenance needs.`;
}

export default router;
