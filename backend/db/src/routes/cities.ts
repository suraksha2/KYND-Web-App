import { Router } from 'express';
import pool from '../lib/mysql';
import { createCity, deleteCity, getCities, updateCity } from '../lib/cities-db';
import { getCityAreas } from '../lib/city-areas-db';
import { CreateCityInput, UpdateCityInput } from '../lib/types';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const cities = await getCities();
    // Fetch areas from city_areas table for each city, falling back to pinCode JSON
    const citiesWithAreas = await Promise.all(
      cities.map(async (city: any) => {
        const areas = await getCityAreas(city.id);
        const areaNames = areas.map((a: any) => a.areaName);

        let fallbackCount = 0;
        if (areaNames.length === 0 && city.pinCode) {
          try {
            const parsed = JSON.parse(city.pinCode);
            if (Array.isArray(parsed)) {
              fallbackCount = parsed.length;
            }
          } catch {
            // pinCode is not valid JSON; treat as a single area
            fallbackCount = city.pinCode ? 1 : 0;
          }
        }

        return {
          ...city,
          areas: areaNames.length > 0 ? areaNames : undefined,
          areaCount: areaNames.length > 0 ? areaNames.length : fallbackCount
        };
      })
    );
    return res.status(200).json({ data: citiesWithAreas });
  } catch (err) {
    console.error('[GET /api/cities]', err);
    return res.status(500).json({ error: 'Failed to fetch cities.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body: CreateCityInput = req.body;
    if (!body.cityName?.trim() || !body.pinCode?.trim()) {
      return res.status(400).json({ error: 'City name and pin code are required.' });
    }

    const city = await createCity({
      cityName: body.cityName.trim(),
      pinCode: body.pinCode.trim(),
      serviceCategoryId: body.serviceCategoryId,
    });
    return res.status(201).json({ data: city });
  } catch (err) {
    console.error('[POST /api/cities]', err);
    return res.status(500).json({ error: 'Failed to create city.' });
  }
});

router.get('/by-name/:name', async (req, res) => {
  try {
    const cityName = req.params.name;

    const [rows] = await pool.query<any[]>(
      'SELECT id, cityName, pinCode, serviceCategoryId, createdAt, updatedAt FROM cities WHERE cityName = ?',
      [cityName]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'City not found.' });
    }

    const city = rows[0];

    // Parse pinCode to get areas
    let areas: string[] = [];
    try {
      const parsed = JSON.parse(city.pinCode);
      if (Array.isArray(parsed)) {
        areas = parsed.map((a: any) => a.areaName);
      } else {
        areas = [city.pinCode];
      }
    } catch {
      areas = [city.pinCode];
    }

    return res.status(200).json({
      data: {
        id: city.id.toString(),
        name: city.cityName,
        slug: city.cityName.toLowerCase().replace(/\s+/g, '-'),
        tagline: `Professional home services in ${city.cityName}. Book trained, background-verified Pros for cleaning, laundry, kitchen and bathroom upkeep.`,
        img: `/images/cities/${city.cityName.toLowerCase()}.webp`,
        areas: areas,
        serviceCategoryId: city.serviceCategoryId,
      }
    });
  } catch (err) {
    console.error('[GET /api/cities/by-name]', err);
    return res.status(500).json({ error: 'Failed to fetch city.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const body: UpdateCityInput = req.body;
    if ((body.cityName !== undefined && !body.cityName.trim()) || (body.pinCode !== undefined && !body.pinCode.trim())) {
      return res.status(400).json({ error: 'City name and pin code cannot be empty.' });
    }

    const city = await updateCity(req.params.id, {
      cityName: body.cityName?.trim(),
      pinCode: body.pinCode?.trim(),
      serviceCategoryId: body.serviceCategoryId,
    });
    if (!city) {
      return res.status(404).json({ error: 'City not found.' });
    }

    return res.status(200).json({ data: city });
  } catch (err) {
    console.error('[PUT /api/cities/[id]]', err);
    return res.status(500).json({ error: 'Failed to update city.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteCity(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'City not found.' });
    }

    return res.status(200).json({ message: 'City deleted successfully.' });
  } catch (err) {
    console.error('[DELETE /api/cities/[id]]', err);
    return res.status(500).json({ error: 'Failed to delete city.' });
  }
});

export default router;
