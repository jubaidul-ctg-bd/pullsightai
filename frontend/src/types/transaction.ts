import { Plan } from "./plan";
import { Pack } from "./pack";

export interface Transaction {
    _id: string;
    serviceId: string;
    service: string;
    serviceBookingId: Plan | Pack ;
    serviceBookingRef: string;
    amount: number;
    discount: number;
    paymentStatus: string;
    workspace: string;
    storeAmount: number;
    gateway: string;
    gatewayCommission: number;
    transactionId: string;
    subscriptionId: string;
    currency: string;
    createdAt: string;
    updatedAt: string;
}