import { Router } from 'express';
import { getCityAreas, createCityArea, deleteCityArea, updateCityArea } from '../lib/city-areas-db';
import { getCityById } from '../lib/cities-db';
import { CreateCityAreaInput, UpdateCityAreaInput } from '../lib/types';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const cityId = req.query.city_id;

    const areas = await getCityAreas(cityId ? String(cityId) : undefined);

    // Fall back to areas stored as JSON in the cities.pinCode column
    if (areas.length === 0 && cityId) {
      const city = await getCityById(String(cityId));
      if (city?.pinCode) {
        try {
          const parsed = JSON.parse(city.pinCode);
          if (Array.isArray(parsed)) {
            return res.status(200).json({
              data: parsed.map((a: any, idx: number) => ({
                id: `legacy-${idx}`,
                cityId: city.id,
                areaName: a.areaName || a.area,
                pincode: a.pinCode || a.pincode || '',
                status: 'active',
                createdAt: city.createdAt,
                updatedAt: city.updatedAt,
              })),
            });
          }
        } catch {
          // pinCode is not JSON; ignore fallback
        }
      }
    }

    return res.status(200).json({ data: areas });
  } catch (err) {
    console.error('[GET /api/city-areas]', err);
    return res.status(500).json({ error: 'Failed to fetch city areas.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body: CreateCityAreaInput = req.body;
    if (!body.cityId?.trim() || !body.areaName?.trim()) {
      return res.status(400).json({ error: 'City ID and area name are required.' });
    }

    const area = await createCityArea({
      cityId: body.cityId.trim(),
      areaName: body.areaName.trim(),
      pincode: body.pincode?.trim(),
      status: body.status || 'active',
    });
    return res.status(201).json({ data: area });
  } catch (err) {
    console.error('[POST /api/city-areas]', err);
    return res.status(500).json({ error: 'Failed to create city area.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const body: UpdateCityAreaInput = req.body;
    if (body.areaName !== undefined && !body.areaName.trim()) {
      return res.status(400).json({ error: 'Area name cannot be empty.' });
    }

    const area = await updateCityArea(req.params.id, {
      areaName: body.areaName?.trim(),
      pincode: body.pincode?.trim(),
      status: body.status,
    });
    if (!area) {
      return res.status(404).json({ error: 'City area not found.' });
    }

    return res.status(200).json({ data: area });
  } catch (err) {
    console.error('[PUT /api/city-areas/[id]]', err);
    return res.status(500).json({ error: 'Failed to update city area.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteCityArea(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'City area not found.' });
    }

    return res.status(200).json({ message: 'City area deleted successfully.' });
  } catch (err) {
    console.error('[DELETE /api/city-areas/[id]]', err);
    return res.status(500).json({ error: 'Failed to delete city area.' });
  }
});

export default router;
