import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DatabaseService } from 'src/database/database.service'
import { PaymentStatus } from 'src/database/enums/status.enum'
import { Gateway } from 'src/database/enums/transaction.enum'
import { CreatePaymentDto } from 'src/payments/dto/create-payment.dto'
import { PaymentsService } from 'src/payments/payments.service'
import Stripe from 'stripe'

@Injectable()
export class StripeService {
    private stripe: Stripe

    constructor(
        @Inject(forwardRef(() => PaymentsService))
        private paymentsService: PaymentsService,
        private readonly configService: ConfigService,
        private readonly dataService: DatabaseService
    ) {
        this.stripe = new Stripe(
            this.configService.get('STRIPE_SECRET_KEY') as string,
            {
                // @ts-ignore
                apiVersion: '2025-03-31.basil'
            }
        )
    }

    async getCustomerId(userData: any) {
        const customer = await this.stripe.customers.create({
            email: userData.email,
            name: userData.displayName,
            metadata: {
                userId: (userData as any)._id.toString()
            }
        })
        return customer.id
    }

    async createCheckoutSession(createPaymentDto: CreatePaymentDto) {
        const SUCCESS_URL =
            this.configService.get<string>('CLIENT_URL') +
            `/app/subscription?service=${createPaymentDto.service}&paymentStatus=${PaymentStatus.PAID}`
        const CANCEL_URL =
            this.configService.get<string>('CLIENT_URL') +
            `/app/subscription?service=${createPaymentDto.service}&paymentStatus=${PaymentStatus.CANCELLED}`
        const session = await this.stripe.checkout.sessions.create({
            mode: 'subscription',
            customer: createPaymentDto.customerId, // must exist in Stripe
            line_items: [
                {
                    price: createPaymentDto.productId, // $12 per developer/month
                    quantity: createPaymentDto.noOfSeat
                }
            ],
            success_url: SUCCESS_URL,
            cancel_url: CANCEL_URL,
            subscription_data: {
                metadata: {
                    serviceBookingId:
                        createPaymentDto.serviceBookingId.toString(),
                    serviceBookingRef: createPaymentDto.serviceBookingRef
                }
            }
        })
        return {
            url: session.url,
            transactionId: session.id,
            paymentStatus: session.payment_status,
            storeAmount: Number(session.amount_total) / 100,
            amount: Number(session.amount_total) / 100,
            response: session
        }
    }

    async createOneTimeCheckout(createPaymentDto: CreatePaymentDto) {
        const SUCCESS_URL =
            this.configService.get<string>('CLIENT_URL') +
            `/app/subscription?service=${createPaymentDto.service}&paymentStatus=${PaymentStatus.PAID}`
        const CANCEL_URL =
            this.configService.get<string>('CLIENT_URL') +
            `/app/subscription?service=${createPaymentDto.service}&paymentStatus=${PaymentStatus.CANCELLED}`
        const session = await this.stripe.checkout.sessions.create({
            mode: 'payment',
            customer: createPaymentDto.customerId,
            line_items: [
                {
                    price: createPaymentDto.productId,
                    quantity: 1
                }
            ],
            success_url: SUCCESS_URL,
            cancel_url: CANCEL_URL,
            metadata: {
                serviceBookingId: createPaymentDto.serviceBookingId.toString(),
                serviceBookingRef: createPaymentDto.serviceBookingRef
            }
        })
        return {
            url: session.url,
            transactionId: session.id,
            paymentStatus: session.payment_status,
            storeAmount: Number(session.amount_total) / 100,
            amount: Number(session.amount_total) / 100,
            response: session
        }
    }

    async handleWebhook(sig: string, body: any) {
        switch (body.type) {
            case 'checkout.session.completed': {
                const session = body.data.object
                const invoiceId = session.invoice as string
                const subscriptionId = session.subscription as string
                await this.paymentsService.paymentCallback({
                    subscriptionId,
                    paymentStatus: session.payment_status,
                    transactionId: invoiceId,
                    trackingId: session.id,
                    response: session
                })
                break
            }
            case 'invoice.payment_succeeded': {
                const invoice = body.data.object as Stripe.Invoice
                if (invoice.billing_reason == 'subscription_cycle') {
                    const period = invoice.lines.data[0].period
                    const startDate = new Date(period.start * 1000)
                    const endDate = new Date(period.end * 1000)
                    await this.paymentsService.generateRecurringPayment({
                        transactionId: invoice.id as string,
                        paymentStatus: invoice.status as string,
                        amount: invoice.amount_paid / 100,
                        currency: invoice.currency,
                        gateway: Gateway.STRIPE,
                        storeAmount: invoice.amount_paid / 100,
                        periodEnd: endDate,
                        periodStart: startDate,
                        serviceBookingId:
                            invoice?.parent?.subscription_details?.metadata
                                ?.serviceBookingId,
                        serviceBookingRef:
                            invoice?.parent?.subscription_details?.metadata
                                ?.serviceBookingRef,
                        subscriptionId: invoice.parent?.subscription_details
                            ?.subscription as string,
                        response: invoice
                    })
                }
                break
            }
        }

        return { received: true }
    }

    async updateSubscriptions(createPaymentDto: CreatePaymentDto) {
        const subscriptionId = createPaymentDto.subscriptionId as string
        // 1. Retrieve subscription
        const subscription =
            await this.stripe.subscriptions.retrieve(subscriptionId)
        if (!subscription) throw new Error('Subscription not found')

        const itemId = subscription.items.data[0].id

        // 2. Update subscription with proration
        const updatedSub = await this.stripe.subscriptions.update(
            subscriptionId,
            {
                items: [
                    {
                        id: itemId,
                        price: createPaymentDto.productId,
                        quantity: createPaymentDto.noOfSeat
                    }
                ],
                proration_behavior: 'create_prorations',
                metadata: {
                    serviceBookingId:
                        createPaymentDto.serviceBookingId.toString(),
                    serviceBookingRef: createPaymentDto.serviceBookingRef
                }
            }
        )

        // 3. Create an invoice for the proration amount
        const invoice: any = await this.stripe.invoices.create({
            customer: updatedSub.customer as string,
            subscription: updatedSub.id,
            auto_advance: true // auto-finalize
        })

        // 4. Pay invoice immediately
        const paidInvoice = await this.stripe.invoices.pay(invoice.id)

        return {
            subscriptionId: updatedSub.id,
            invoiceId: paidInvoice.id,
            transactionId: paidInvoice.id,
            amount: paidInvoice.amount_paid / 100,
            currency: paidInvoice.currency,
            paymentStatus: paidInvoice.status,
            storeAmount: paidInvoice.amount_paid / 100
        }
    }

    async cancelSubscription(subscriptionId: string) {
        const deleted = await this.stripe.subscriptions.cancel(subscriptionId)
        return deleted
    }

    // async paymentCallback(sessionId: string) {
    //     const session = await this.stripe.checkout.sessions.retrieve(sessionId)
    //     return await this.paymentsService.paymentCallback({
    //         paymentStatus: session.payment_status,
    //         transactionId: session.id,
    //         response: session
    //     })
    // }
}
