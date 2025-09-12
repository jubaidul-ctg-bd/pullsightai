export interface Pack {
    _id: string;
    title: string;
    description: string;
    price: number;
    token: number;
    totalToken?: number;
    highlight?: string;
    isActive: boolean;
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
}
