export interface LinkItem { id: string; collectionId: string; title: string; url: string; description: string; version: number; updatedAt: string }
export interface LinkCollection { id: string; ownerId: string | null; title: string; description: string; version: number; canManage: boolean; items: LinkItem[] }
export interface LinkCollectionsData { collections: LinkCollection[]; canManageSchool: boolean }
