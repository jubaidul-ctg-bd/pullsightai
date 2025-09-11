export interface Pack {
    _id: string;
    title: string;
    description: string;
    price: number;
    token: number;
    totalToken?: number;
    isActive: boolean;
    isPublic: boolean;
    createdAt: string;
    updatedAt: string;
}
