# PlanYourYard – Native Landscaping Planner

A full-stack web application for planning your yard with native plants, sun path analysis, and AI-powered growth visualization.

## Features

### 🗺️ Interactive Yard Planner
- **Satellite & Street Maps** — Load your property on ESRI World Imagery satellite tiles or OpenStreetMap
- **Upload Aerial Photos** — Import screenshots from Google Maps, Bing Maps, or any source
- **Draw Planting Zones** — Click to create polygon zones (beds, lawn, patio, structures, water)
- **Sun Exposure Tags** — Label zones as full sun, part shade, or full shade
- **Export Plans** — Download your yard plan as JSON

### ☀️ Sun Path Analysis
- **Address-Based Calculation** — Enter your address to geocode your location
- **House Orientation** — Specify which direction your house faces (N/NE/E/SE/S/SW/W/NW)
- **Seasonal Sun Paths** — Visualize summer solstice, winter solstice, and equinox sun arcs
- **Sun Hours & Classification** — Automatically calculates full sun / part shade / full shade for any date

### 🌿 Native Plant Library
- **30+ Native Plants** — Curated database including trees, shrubs, perennials, grasses, ferns, vines
- **Nova Natives Selections** — Plants sourced from Nova Natives and Mid-Atlantic native nurseries
- **Complete Plant Profiles** — Height, spread, sun, water, soil, hardiness zones, bloom time, fall color
- **Wildlife Value** — Pollinator value, bird habitat, butterfly host plants, deer resistance
- **Advanced Filtering** — Filter by type, sun, water, native region
- **External Links** — Direct links to Nova Natives, USDA Plants Database, and iNaturalist
- **Live iNaturalist Search** — Search the full iNaturalist taxa database

### 🤖 AI Growth Visualizer (Requires Anthropic API Key)
- **Yard Analysis** — Upload a house/yard photo and get AI landscape assessment
- **Plant Recommendations** — AI suggests native plants suited to your specific conditions
- **Growth Visualization** — See how any plant will look at 1, 3, 5, 10 years and maturity
- **Companion Plants** — AI recommends companion plants that work well together
- **Demo Mode** — Works without API key using sample responses

## Tech Stack

**Frontend**
- React 18 + TypeScript + Vite
- Tailwind CSS
- React Leaflet (interactive maps)
- SunCalc (sun position calculations)
- React Dropzone (image uploads)

**Backend**
- Node.js + Express + TypeScript
- Anthropic SDK (Claude claude-opus-4-6 Vision)
- SunCalc (sun path calculations)
- Multer (image upload handling)
- iNaturalist API integration

## Getting Started

### Prerequisites
- Node.js 18+
- npm 8+

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd PlanYourYard

# Install all dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..
```

### Configuration

```bash
# Copy the example environment file
cp backend/.env.example backend/.env

# Edit backend/.env and add your API key:
# ANTHROPIC_API_KEY=your_key_here
```

Get an Anthropic API key at [console.anthropic.com](https://console.anthropic.com)

> **Note**: The app runs without an API key in demo mode — all features work except real AI analysis.

### Development

```bash
# Run both backend and frontend simultaneously
npm run dev

# Or run individually:
cd backend && npm run dev    # Backend on :3001
cd frontend && npm run dev   # Frontend on :5173
```

Visit [http://localhost:5173](http://localhost:5173)

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
PlanYourYard/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Express server
│   │   ├── routes/
│   │   │   ├── plants.ts         # Plant search API
│   │   │   ├── ai.ts             # Claude AI analysis
│   │   │   └── sunpath.ts        # Sun path calculations
│   │   └── data/
│   │       └── nativePlants.ts   # Native plant database
│   └── package.json
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── pages/
    │   │   ├── HomePage.tsx      # Landing page
    │   │   ├── PlannerPage.tsx   # Map + zones + sun path
    │   │   ├── PlantsPage.tsx    # Plant library + search
    │   │   └── VisualizePage.tsx # AI visualizer
    │   └── components/
    │       ├── Header.tsx
    │       ├── PlantCard.tsx
    │       └── PlantDetailModal.tsx
    └── package.json
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plants/search` | GET | Search native plant database |
| `/api/plants/:id` | GET | Get plant by ID |
| `/api/plants/inaturalist/search` | GET | Search iNaturalist taxa |
| `/api/sunpath/calculate` | GET | Calculate sun path for location/date |
| `/api/ai/analyze` | POST | AI yard analysis (image upload) |
| `/api/ai/visualize` | POST | AI plant growth visualization |

## Plant Database

The plant library includes curated native species for the Mid-Atlantic / Eastern North America region:

**Trees**: Red Maple, Eastern Redbud, Serviceberry, White Oak, Black Gum, American Holly, Sweetbay Magnolia

**Shrubs**: Virginia Sweetspire, Buttonbush, Inkberry Holly, Witch Hazel, Spicebush, Oakleaf Hydrangea, Mountain Laurel

**Perennials**: Black-Eyed Susan, Wild Bergamot, Joe Pye Weed, Wild Columbine, Blue Wild Indigo

**Grasses**: Little Bluestem, Switchgrass

**Ferns**: Christmas Fern, Cinnamon Fern

**Groundcovers/Vines**: Virginia Creeper, Wild Ginger

## Resources

- [Nova Natives](https://novanatives.com) — Native plant nursery (Virginia/Mid-Atlantic)
- [USDA Plants Database](https://plants.usda.gov) — Comprehensive plant information
- [iNaturalist](https://www.inaturalist.org) — Native species observations
- [Virginia Native Plant Society](https://vnps.org)
- [Lady Bird Johnson Wildflower Center](https://www.wildflower.org)
