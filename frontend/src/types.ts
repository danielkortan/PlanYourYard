export interface Plant {
  id: string;
  commonName: string;
  scientificName: string;
  family: string;
  type: 'tree' | 'shrub' | 'perennial' | 'annual' | 'grass' | 'fern' | 'vine' | 'groundcover';
  nativeRange: string[];
  height: { min: number; max: number };
  spread: { min: number; max: number };
  growthRate: 'slow' | 'medium' | 'fast';
  sunRequirements: string[];
  waterRequirements: string;
  soilType: string[];
  hardinessZone: { min: number; max: number };
  bloomTime: string[];
  bloomColor: string[];
  fallColor: string[];
  wildlifeValue: {
    pollinators: boolean;
    birds: boolean;
    butterflies: boolean;
    deer: 'resistant' | 'occasionally' | 'frequently';
    mammals: boolean;
  };
  features: string[];
  careTips: string;
  landscapeUses: string[];
  description: string;
}

export interface PlantSearchFilters {
  q?: string;
  type?: string;
  sun?: string;
  water?: string;
  zone?: number;
  native?: string;
}

export interface SunPathData {
  location: { lat: number; lng: number };
  date: string;
  sunTimes: {
    sunrise?: string;
    sunset?: string;
    solarNoon?: string;
  };
  sunPath: Array<{ time: string; azimuth: number; altitude: number; hour: number }>;
  seasonalPaths: {
    summer: Array<{ hour: number; azimuth: number; altitude: number }>;
    winter: Array<{ hour: number; azimuth: number; altitude: number }>;
    equinox: Array<{ hour: number; azimuth: number; altitude: number }>;
  };
  sunExposure: {
    hoursOfSun: number;
    classification: 'full-sun' | 'part-shade' | 'full-shade';
    maxAltitude: number;
  };
  houseOrientation: number;
}

export interface YardZone {
  id: string;
  name: string;
  type: 'lawn' | 'bed' | 'patio' | 'structure' | 'water';
  sunExposure: 'full-sun' | 'part-shade' | 'full-shade' | 'unknown';
  coordinates: [number, number][];
  color: string;
  plants: PlacedPlant[];
  notes: string;
}

export interface PlacedPlant {
  id: string;
  plantId: string;
  commonName: string;
  scientificName: string;
  position: [number, number];
  plantedDate?: string;
  notes?: string;
}

export interface YardProject {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  houseOrientation: number;
  zones: YardZone[];
  uploadedImages: UploadedImage[];
  createdAt: string;
  updatedAt: string;
}

export interface UploadedImage {
  id: string;
  name: string;
  dataUrl: string;
  type: 'aerial' | 'front' | 'back' | 'side' | 'other';
  bounds?: [[number, number], [number, number]];
}
