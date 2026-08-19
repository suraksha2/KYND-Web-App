import { Router } from 'express';
import {
  getCityServices,
  createCityService,
  getCityServiceById,
  updateCityService,
  deleteCityService,
  getCitiesByServiceName,
} from '../lib/city-services-db';
import { CreateCityServiceInput, UpdateCityServiceInput } from '../lib/types';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const services = await getCityServices();
    return res.status(200).json({ data: services });
  } catch (err) {
    console.error('[GET /api/city-services]', err);
    return res.status(500).json({ error: 'Failed to fetch city services.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const body: CreateCityServiceInput = req.body;

    // Basic validation
    const required: (keyof CreateCityServiceInput)[] = [
      'cityId',
      'name',
      'category',
      'description',
      'status',
      'provider',
      'contactEmail',
      'contactPhone',
      'budget',
      'startDate',
    ];
    for (const field of required) {
      if (body[field] === undefined || body[field] === '') {
        return res.status(400).json({ error: `Missing required field: ${field}` });
      }
    }

    if (typeof body.budget !== 'number' || body.budget < 0) {
      return res.status(400).json({ error: 'Budget must be a non-negative number.' });
    }

    const service = await createCityService(body);
    return res.status(201).json({ data: service });
  } catch (err) {
    console.error('[POST /api/city-services]', err);
    return res.status(500).json({ error: 'Failed to create city service.' });
  }
});

router.get('/by-service/:serviceId', async (req, res) => {
  try {
    const serviceName = req.params.serviceId;
    const cityServices = await getCitiesByServiceName(serviceName);

    return res.status(200).json({ data: cityServices });
  } catch (err) {
    console.error('[GET /api/city-services/by-service/[serviceId]]', err);
    return res.status(500).json({ error: 'Failed to fetch cities for service.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const service = await getCityServiceById(req.params.id);
    if (!service) {
      return res.status(404).json({ error: 'City service not found.' });
    }
    return res.status(200).json({ data: service });
  } catch (err) {
    console.error('[GET /api/city-services/[id]]', err);
    return res.status(500).json({ error: 'Failed to fetch city service.' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const body: UpdateCityServiceInput = req.body;

    if (body.budget !== undefined && (typeof body.budget !== 'number' || body.budget < 0)) {
      return res.status(400).json({ error: 'Budget must be a non-negative number.' });
    }

    const updated = await updateCityService(req.params.id, body);
    if (!updated) {
      return res.status(404).json({ error: 'City service not found.' });
    }
    return res.status(200).json({ data: updated });
  } catch (err) {
    console.error('[PUT /api/city-services/[id]]', err);
    return res.status(500).json({ error: 'Failed to update city service.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteCityService(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'City service not found.' });
    }
    return res.status(200).json({ message: 'City service deleted successfully.' });
  } catch (err) {
    console.error('[DELETE /api/city-services/[id]]', err);
    return res.status(500).json({ error: 'Failed to delete city service.' });
  }
});

export default router;
