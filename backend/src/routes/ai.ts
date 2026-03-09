import { Router, Request, Response } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
import { AIAnalyzeRequest } from '../types';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

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

  const { location, plantName, plantScientific } = req.body;
  const imageBase64 = req.file.buffer.toString('base64');
  const mimeType = req.file.mimetype as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

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
      : `You are a professional landscape architect. Analyze this photo of a yard/house exterior.

         Please provide:
         1. **Site Assessment**: Sun exposure (full sun/part shade/shade areas), existing vegetation, soil type indicators
         2. **Landscape Opportunities**: Best areas for new plantings and why
         3. **Current Plant Identification**: Identify any existing plants/trees you can see
         4. **Improvement Recommendations**: Top 5 native plant suggestions that would thrive here
         5. **Design Concepts**: One cohesive landscape design concept for this property

         Focus on practical, actionable advice for a homeowner.`;

    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
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
      analysis: textContent?.type === 'text' ? textContent.text : '',
      usage: response.usage,
    });
  } catch (error: any) {
    if (error.message === 'ANTHROPIC_API_KEY not configured') {
      return res.status(503).json({
        error: 'AI service not configured. Please add your ANTHROPIC_API_KEY to the backend .env file.',
        demo: true,
        analysis: generateDemoAnalysis(plantName, location),
      });
    }
    console.error('AI analyze error:', error);
    res.status(500).json({ error: 'AI analysis failed', details: error.message });
  }
});

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
      model: 'claude-opus-4-6',
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
