"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Check, ArrowLeft, Users, Zap, X } from "lucide-react";
import Link from "next/link";
import { ROUTE_CONSTANTS } from "@/lib/constants";
import {
    useGetSubscriptionPlansQuery,
    usePurchasePlanMutation,
} from "@/api/queries/subscription";
import { Plan } from "@/types/plan";
import { CheckIcon } from "@/components/reusable/icons";
import PricingTable from "./PricingTable";
import MoreToken from "./MoreToken";
import Image from "next/image";
import FAQs from "./Faqs";
import Testimonial from "./Testimonial";
import { useAuthStore } from "@/store/authStore";
import Alert from "@/components/reusable/Alert";

const PricingPlansPage = () => {
    const { selectedWorkspace } = useAuthStore();
    let noOfActiveMembers = selectedWorkspace?.noOfActiveMembers || 1;
    noOfActiveMembers =
        typeof noOfActiveMembers === "number"
            ? noOfActiveMembers
            : parseInt(noOfActiveMembers);

    const [billingInterval, setBillingInterval] = useState<
        "monthly" | "yearly"
    >("monthly");
    const [seats, setSeats] = useState<number>(
        selectedWorkspace?.currentPlan?.numOfSeat || noOfActiveMembers || 1
    );

    const { data, isFetching } = useGetSubscriptionPlansQuery();

    let plans = data?.data?.filter(
        (plan: Plan) => plan.isActive && plan.isPublic
    );
    if (billingInterval === "yearly") {
        plans = plans?.filter(
            (plan: Plan) =>
                plan.billingCycle === "yearly" || plan.billingCycle == ""
        );
    } else {
        plans = plans?.filter(
            (plan: Plan) =>
                plan.billingCycle === "monthly" || plan.billingCycle == ""
        );
    }

    const getSavings = () => {
        const yearlyPlans = data?.data
            ?.filter((plan) => plan.billingCycle === "yearly")
            .find((plan) => !plan.isFree);
        const monthlyPlans = data?.data
            ?.filter(
                (plan) =>
                    plan.billingCycle === "monthly" || plan.billingCycle === ""
            )
            .find((plan) => !plan.isFree);
        console.log("fsf", yearlyPlans, monthlyPlans);

        // calculate bases on one monthly and one yearly plan
        const yearlyPrice = yearlyPlans?.pricePerDev || 0;
        const monthlyPrice = monthlyPlans?.pricePerDev || 0;

        const savings = monthlyPrice * 12 - yearlyPrice;
        // return %
        return savings > 0
            ? `${Math.round((savings / (monthlyPrice * 12)) * 100)}%`
            : null;
    };

    return (
        <div className="space-y-8 pt-15 bg-background relative">
            <div className="container mx-auto">
                <Link
                    href={ROUTE_CONSTANTS.APP_SUBSCRIPTION}
                    className="fixed right-5 top-18 z-10 xl:top-26 bg-white/50 lg:bg-white/10 w-12 h-12 inline-flex items-center justify-center rounded-full"
                >
                    <X />
                </Link>
                <div className="text-center space-y-4 max-w-[570px] mx-auto">
                    <h1 className="text-4xl font-bold">
                        Choose your team plan and discover instant AI code
                        insights
                    </h1>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        Simple, transparent pricing - pay only for what you
                        need.
                    </p>
                </div>

                <div className="grid grid-cols-12 max-w-8xl mx-auto items-center gap-6 my-12">
                    {/* Seats Selector */}
                    <div className="col-span-12 lg:col-span-4 xl:col-start-5">
                        <div className="space-y-4 flex flex-col">
                            <div className="mx-auto inline-flex items-baseline gap-2 justify-center bg-card rounded-xl p-3">
                                <span className="text-3xl font-semibold">
                                    {seats}
                                </span>
                                <label className="text-md font-medium flex items-center gap-2">
                                    Seats Total
                                </label>
                            </div>
                            <Slider
                                value={[seats]}
                                onValueChange={(value) =>
                                    noOfActiveMembers <= value[0] &&
                                    setSeats(value[0])
                                }
                                max={25}
                                min={1}
                                step={1}
                                className="w-full"
                            />
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>1 dev</span>
                                <span>25 devs</span>
                            </div>
                            {/* <Alert
                                variant="info"
                                title="Note"
                                description={`You've ${noOfActiveMembers} active member${
                                    noOfActiveMembers !== 1 ? "s" : ""
                                }. If you need to add more, please upgrade your plan.`}
                            /> */}
                        </div>
                    </div>

                    {/* Billing Toggle */}
                    <div className="flex justify-center lg:justify-end col-span-12 lg:col-span-3 lg:col-start-10">
                        <div className="flex items-center bg-card rounded-lg p-1">
                            <button
                                onClick={() => setBillingInterval("monthly")}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                    billingInterval === "monthly"
                                        ? "bg-white text-gray-900"
                                        : "text-muted-foreground hover:text-white"
                                }`}
                            >
                                Monthly
                            </button>
                            <button
                                onClick={() => setBillingInterval("yearly")}
                                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${
                                    billingInterval === "yearly"
                                        ? "bg-white text-gray-900"
                                        : "text-muted-foreground hover:text-white"
                                }`}
                            >
                                Yearly
                                {/* <Badge className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-1">
                                    Save {getSavings()}
                                </Badge> */}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Plans Grid */}
                <PricingTable
                    isLoading={isFetching}
                    plans={plans || []}
                    seats={seats}
                />

                <MoreToken />

                {/* Trust & Social Proof Section */}
                <div className="mx-auto max-w-8xl mb-28">
                    <div className="mb-8">
                        <Badge className="mb-4 bg-gradient-to-r from-blue-400 to-green-400 text-neutral-800 border-0 rounded-2xl h-7 px-4">
                            Trusted by
                        </Badge>
                        <h2 className="text-3xl font-bold mb-2">
                            Trusted by Engineering Teams Who Ship Faster
                        </h2>
                        <p className="text-muted-foreground">
                            SOC2 certified, open-source friendly, and proven to
                            cut review time in half.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-9 gap-6 mb-20">
                        <div className="p-8 bg-card rounded-xl col-span-1 lg:col-span-5">
                            <Image
                                className="mb-10"
                                src="/images/icons/lock.svg"
                                alt="lock icon"
                                width={41}
                                height={48}
                            />
                            <h3 className="font-semibold mb-2 text-xl">
                                SOC2 Type II Certified
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Zero code retention
                            </p>
                        </div>

                        <div className="p-8 bg-card rounded-xl col-span-1 lg:col-span-4">
                            <Image
                                className="mb-10"
                                src="/images/icons/thumbs-up.svg"
                                alt="thumbs up icon"
                                width={46}
                                height={48}
                            />
                            <h3 className="font-semibold mb-2 text-xl">
                                1M+ PRs reviewed
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Data across 17 enterprise teams, Q2 2024
                            </p>
                        </div>

                        <div className="p-8 bg-card rounded-xl col-span-1 lg:col-span-4">
                            <Image
                                className="mb-10"
                                src="/images/icons/clock.svg"
                                alt="clock icon"
                                width={41}
                                height={48}
                            />
                            <h3 className="font-semibold mb-2 text-xl">
                                50%+ reduction in review time
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Internal benchmark, 100-750k
                            </p>
                        </div>

                        <div className="p-8 bg-card rounded-xl col-span-1 lg:col-span-5">
                            <Image
                                className="mb-10"
                                src="/images/icons/bug.svg"
                                alt="bug icon"
                                width={46}
                                height={48}
                            />
                            <h3 className="font-semibold mb-2 text-xl">
                                60% fewer bugs reaching prod
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Avg. screened customers, Q3 2024
                            </p>
                        </div>
                    </div>

                    {/* Testimonial */}
                    <Testimonial />
                </div>

                <FAQs />
            </div>
        </div>
    );
};

export default PricingPlansPage;
