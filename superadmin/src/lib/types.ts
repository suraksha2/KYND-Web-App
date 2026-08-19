export type ServiceStatus = "Active" | "Pending" | "Suspended" | "Completed";

export type ServiceCategory =
  | "Water & Sanitation"
  | "Transportation"
  | "Electricity"
  | "Healthcare"
  | "Education"
  | "Waste Management"
  | "Public Safety"
  | "Parks & Recreation";

export interface CityService {
  id: string;
  cityId: string;
  name: string;
  category: ServiceCategory;
  description: string;
  status: ServiceStatus;
  provider: string;
  contactEmail: string;
  contactPhone: string;
  budget: number;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateCityServiceInput = Omit<
  CityService,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateCityServiceInput = Partial<CreateCityServiceInput>;


export interface CityRecord {
  id: string;
  cityName: string;
  pinCode: string;
  serviceCategoryId?: string;
  createdAt: string;
  updatedAt: string;
  areas?: string[];
  areaCount?: number;
}

export type CreateCityInput = Omit<CityRecord, "id" | "createdAt" | "updatedAt">;
export type UpdateCityInput = Partial<CreateCityInput>;

export type AreaStatus = "active" | "inactive";

export interface CityArea {
  id: string;
  cityId: string;
  areaName: string;
  pincode?: string;
  status: AreaStatus;
  createdAt: string;
  updatedAt: string;
}

export type CreateCityAreaInput = Omit<CityArea, "id" | "createdAt" | "updatedAt">;
export type UpdateCityAreaInput = Partial<CreateCityAreaInput>;
