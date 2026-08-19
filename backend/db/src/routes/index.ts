import { Router } from 'express';

import analytics from './analytics';
import auth from './auth';
import bookings from './bookings';
import cities from './cities';
import cityAreas from './city-areas';
import cityServices from './city-services';
import clientCategories from './client-categories';
import clients from './clients';
import dashboard from './dashboard';
import images from './images';
import orders from './orders';
import payments from './payments';
import provider from './provider';
import reviews from './reviews';
import serviceCategories from './service-categories';
import serviceProviders from './service-providers';
import serviceSubcategories from './service-subcategories';
import services from './services';
import settings from './settings';
import waitlist from './waitlist';

const router = Router();

router.use('/analytics', analytics);
router.use('/auth', auth);
router.use('/bookings', bookings);
router.use('/cities', cities);
router.use('/city-areas', cityAreas);
router.use('/city-services', cityServices);
router.use('/client-categories', clientCategories);
router.use('/clients', clients);
router.use('/dashboard', dashboard);
router.use('/images', images);
router.use('/orders', orders);
router.use('/payments', payments);
router.use('/provider', provider);
router.use('/reviews', reviews);
router.use('/service-categories', serviceCategories);
router.use('/service-providers', serviceProviders);
router.use('/service-subcategories', serviceSubcategories);
router.use('/services', services);
router.use('/settings', settings);
router.use('/waitlist', waitlist);

export default router;
