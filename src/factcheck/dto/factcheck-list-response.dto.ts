export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FactCheckListItem {
  id: string;
  title: string;
  preview: string;
  checkedCount: number;
  createdAt: string;
}

export interface FactCheckListResponse {
  items: FactCheckListItem[];
  meta: PaginationMeta;
}
