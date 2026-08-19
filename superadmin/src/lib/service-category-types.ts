export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export type CreateServiceCategoryInput = Omit<
  ServiceCategory,
  "id" | "createdAt" | "updatedAt"
>;
export type UpdateServiceCategoryInput = Partial<CreateServiceCategoryInput>;
