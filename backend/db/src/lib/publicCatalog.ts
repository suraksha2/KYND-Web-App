const SERVICE_FIELDS = [
  'id',
  'name',
  'description',
  'image',
  'duration',
  'worker_count',
  'rate_type',
  'status',
  'is_picker_option',
  'category_id',
  'category',
  'category_image',
  'subcategory_id',
  'subcategory',
  'subcategory_is_addon',
  'subcategory_image',
  'subcategory_hero_image',
  'subcategory_hero_image_focus',
  'subcategory_home_sizes',
  'subcategory_booking_behavior',
  'subcategory_office_pricing',
] as const;

export function publicCatalogServiceDto(
  service: Record<string, any>,
  customerPrice: number | null
) {
  const dto: Record<string, any> = {};
  for (const field of SERVICE_FIELDS) {
    if (field in service) dto[field] = service[field];
  }
  dto.customer_price = customerPrice;
  return dto;
}

export function publicCatalogAddonDto(addon: Record<string, any>) {
  const fields = ['key', 'source', 'id', 'name', 'customer_price', 'duration', 'worker_count', 'rate_type'];
  const dto: Record<string, any> = {};
  for (const field of fields) {
    if (field in addon) dto[field] = addon[field];
  }
  return dto;
}

export function publicQuoteDto({
  serviceId,
  customerPrice,
  duration,
  partySize,
  startTime,
  addons,
}: {
  serviceId: string | number;
  customerPrice: number | null;
  duration?: number;
  partySize?: number;
  startTime?: string;
  addons?: Array<{ id: number; name: string; customerPrice: number }>;
}) {
  return {
    service_id: serviceId,
    customer_price: customerPrice,
    ...(duration !== undefined ? { duration_hours: duration } : {}),
    ...(partySize !== undefined ? { party_size: partySize } : {}),
    ...(startTime !== undefined ? { start_time: startTime } : {}),
    ...(addons !== undefined
      ? {
          addons: addons.map((addon) => ({
            id: addon.id,
            name: addon.name,
            customer_price: addon.customerPrice,
          })),
        }
      : {}),
  };
}
