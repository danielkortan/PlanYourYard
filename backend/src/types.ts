export interface PlantSearchQuery {
  q?: string;
  type?: string;
  sun?: string;
  water?: string;
  zone?: number;
  native?: string;
  page?: number;
  limit?: number;
}

export interface SunPathRequest {
  lat: number;
  lng: number;
  date?: string;
  houseOrientation?: number;
}

export interface AIAnalyzeRequest {
  imageBase64: string;
  mimeType: string;
  plantName?: string;
  plantScientific?: string;
  location?: string;
  task: 'analyze' | 'visualize';
  growthStage?: string;
}

export interface PlantWildlife {
  pollinators: boolean;
  birds: boolean;
  butterflies: boolean;
  deer: 'resistant' | 'occasionally' | 'frequently';
  mammals: boolean;
}

export interface NativePlant {
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
  wildlifeValue: PlantWildlife;
  features: string[];
  careTips: string;
  landscapeUses: string[];
  description: string;
}
