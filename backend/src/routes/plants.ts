import { Router, Request, Response } from 'express';
import axios from 'axios';
import { NativePlant, PlantSearchQuery } from '../types';
import { nativePlantsData } from '../data/nativePlants';

const router = Router();

// Search local native plants database
router.get('/search', (req: Request, res: Response) => {
  const { q, type, sun, water, zone, native, page = '1', limit = '20' } = req.query as Record<string, string>;

  let results = [...nativePlantsData];

  if (q) {
    // Split into individual words so "oak tree" or "blue grass" each match independently
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    results = results.filter(p => {
      const searchText = [
        p.commonName,
        p.scientificName,
        p.family,
        p.type,
        p.description,
        p.waterRequirements,
        ...p.sunRequirements,
        ...p.features,
        ...p.landscapeUses,
        ...p.nativeRange,
        ...p.bloomColor,
      ].join(' ').toLowerCase();
      return words.every(word => searchText.includes(word));
    });
  }

  if (type) {
    results = results.filter(p => p.type === type);
  }

  if (sun) {
    results = results.filter(p => p.sunRequirements.includes(sun));
  }

  if (water) {
    results = results.filter(p => p.waterRequirements === water || p.waterRequirements === 'adaptable');
  }

  if (zone) {
    const z = parseInt(zone);
    results = results.filter(p => p.hardinessZone.min <= z && p.hardinessZone.max >= z);
  }

  if (native) {
    results = results.filter(p =>
      p.nativeRange.some(r => r.toLowerCase().includes(native.toLowerCase()))
    );
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const start = (pageNum - 1) * limitNum;
  const paginated = results.slice(start, start + limitNum);

  res.json({
    total: results.length,
    page: pageNum,
    limit: limitNum,
    results: paginated,
  });
});

// Get single plant by ID
router.get('/:id', (req: Request, res: Response) => {
  const plant = nativePlantsData.find(p => p.id === req.params.id);
  if (!plant) {
    return res.status(404).json({ error: 'Plant not found' });
  }
  res.json(plant);
});

// Search iNaturalist for additional plant data
router.get('/inaturalist/search', async (req: Request, res: Response) => {
  const { q, native_to = '46' } = req.query as Record<string, string>; // 46 = Virginia
  try {
    const response = await axios.get('https://api.inaturalist.org/v1/taxa', {
      params: {
        q,
        rank: 'species',
        iconic_taxa: 'Plantae',
        native_to: native_to,
        per_page: 20,
      },
      timeout: 10000,
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch from iNaturalist' });
  }
});

// Get plant details from iNaturalist
router.get('/inaturalist/:id', async (req: Request, res: Response) => {
  try {
    const response = await axios.get(`https://api.inaturalist.org/v1/taxa/${req.params.id}`, {
      timeout: 10000,
    });
    res.json(response.data.results[0] || null);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch plant details' });
  }
});

export default router;
