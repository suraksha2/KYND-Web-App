export interface ServiceSubcategory {
  id: string;
  slug: string;
  category: string | null;
  label: string;
  title: string;
  image: string | null;
  sortOrder: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export type CreateServiceSubcategoryInput = Omit<
  ServiceSubcategory,
  "id" | "createdAt" | "updatedAt" | "tags"
> & {
  serviceIds: string[];
};

export interface SubcategoryServiceItem {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  image: string | null;
  duration: string | null;
  pricingFrom: string;
}

export interface ServiceSubcategoryDetail extends ServiceSubcategory {
  services: SubcategoryServiceItem[];
}

export type UpdateServiceSubcategoryInput = Partial<CreateServiceSubcategoryInput>;
