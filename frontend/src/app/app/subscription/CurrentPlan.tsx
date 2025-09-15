"use client";

import { useUserQuery } from "@/api/queries/auth";
import { useCancelPlanMutation } from "@/api/queries/subscription";
import MoreToken from "@/app/subscription-plans/MoreToken";
import Badge from "@/components/reusable/Badge";
import Button from "@/components/reusable/Button";
import CircularProgress from "@/components/reusable/CircularProgress";
import ConfirmDialog from "@/components/reusable/ConfirmDialog";
import { CheckIcon } from "@/components/reusable/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ROUTE_CONSTANTS } from "@/lib/constants";
import { formatDate, getRemainingDays } from "@/lib/dayjs";
import showToast from "@/lib/toast";
import { numToHip } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import {
    AlertCircle,
    Calendar,
    CreditCard,
    Loader,
    Users,
    Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FC, useEffect, useState } from "react";
import PurchaseHistory from "./PurchaseHistory";

const CurrentPlan = () => {
    const [showConfirm, setShowConfirm] = useState(false);
    const [showProcessing, setShowProcessing] = useState(false);
    const { selectedWorkspace } = useAuthStore();
    const { mutateAsync: cancelPlan } = useCancelPlanMutation();

    const { refetch, isFetching } = useUserQuery({
        isEnabled: false,
    });

    const searchParams = useSearchParams();
    const router = useRouter();

    const activePlan = selectedWorkspace?.currentPlan;
    const isTrialPlan = activePlan?.plan?.isDefault;
    const isFreeOrTrialPlan = activePlan?.plan?.isFree === true || isTrialPlan;
    const isPaidPlan = activePlan?.plan?.isFree === false && !isTrialPlan;

    const handleCancelPlan = async () => {
        await cancelPlan().then(() => {
            showToast.success("Subscription cancelled successfully");
        });
    };

    useEffect(() => {
        const service = searchParams.get("service");
        const paymentStatus = searchParams.get("paymentStatus");
        if (paymentStatus == "paid") {
            setShowProcessing(true);
            setTimeout(async () => {
                await refetch();
                setShowProcessing(false);
                // Clean up the URL parameter immediately to prevent showing again
                const url = new URL(window.location.href);
                url.searchParams.delete("paymentStatus");
                url.searchParams.delete("service");
                router.replace(url.pathname + url.search);
            }, 5000);
        }
    }, [searchParams]);

    return (
        <div className="space-y-6">
            {/* Your current plan header */}
            <div className="flex flex-col md:flex-row xl:items-center justify-between gap-3">
                <div className="mr-7">
                    <h2 className="text-xl font-semibold ">
                        Your current plan
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        View more about your active plan.
                    </p>
                </div>
                <MoreToken className="w-full sm:w-auto ml-auto mb-2 lg:mb-0 cursor-pointer border px-4 py-2 rounded-md text-sm hover:bg-accent/50 transition-colors flex items-center gap-2">
                    Buy More Token
                </MoreToken>
                <Link
                    href={ROUTE_CONSTANTS.APP_SUBSCRIPTION_PLANS}
                    className=""
                >
                    <Button className="w-full">
                        {isFreeOrTrialPlan ? "Upgrade Plan" : "Change Plan"}
                    </Button>
                </Link>
                
                <Button
                    variant="outline"
                    onClick={() => setShowConfirm(true)}
                >
                    Cancel Subscription
                </Button>
            </div>
            {/* Plan details card */}
            <Card className="border-0">
                <CardContent className="px-5 py-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                        <div className="border rounded-2xl p-4">
                            <p className="text-sm text-gray-400 mb-1">Plan</p>
                            <div className="flex justify-between">
                                <p className="text-2xl font-bold ">
                                    {activePlan?.plan?.title || "Free"}
                                </p>
                                <div className="flex items-baseline mt-1">
                                    {isFreeOrTrialPlan ? (
                                        <span className="text-xl font-semibold text-green-600">
                                            {isTrialPlan ? "Trial" : "Free"}
                                        </span>
                                    ) : (
                                        <>
                                            <span className="text-xl font-semibold ">
                                                $
                                                {activePlan?.plan
                                                    ?.pricePerDev || "0"}
                                            </span>
                                            <span className="text-sm text-gray-500 ml-1">
                                                /dev
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="border rounded-2xl p-4">
                            <p className="text-sm text-gray-400 mb-1">Pay</p>
                            <p className="text-2xl font-bold capitalize">
                                {isFreeOrTrialPlan
                                    ? "-"
                                    : activePlan?.billingCycle}
                            </p>
                        </div>

                        <div className="border rounded-2xl p-4">
                            <p className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                                {isTrialPlan
                                    ? "Trial Ends"
                                    : isFreeOrTrialPlan
                                    ? "Plan Status"
                                    : "Renews at"}
                            </p>
                            <p className="text-2xl font-bold ">
                                {isFreeOrTrialPlan && !isTrialPlan
                                    ? "No expiration"
                                    : activePlan?.periodEnd
                                    ? formatDate(activePlan?.periodEnd)
                                    : "-"}
                            </p>
                        </div>
                        {!isFreeOrTrialPlan && (
                            <>
                                <div className="border rounded-2xl p-4">
                                    <p className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                                        Total {activePlan?.billingCycle} cost
                                    </p>
                                    <div className="flex justify-between">
                                        <p className="text-2xl font-bold ">
                                            $
                                            {activePlan?.numOfSeat
                                                ? activePlan?.numOfSeat *
                                                  (activePlan?.plan
                                                      ?.pricePerDev ?? 0)
                                                : "-"}
                                        </p>
                                    </div>
                                </div>
                                <div className="border rounded-2xl p-4">
                                    <p className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                                        Total Seats
                                    </p>
                                    <div className="flex justify-between">
                                        <p className="text-2xl font-bold ">
                                            {activePlan?.numOfSeat || "-"}
                                        </p>
                                    </div>
                                </div>
                                <div className="border rounded-2xl p-4">
                                    <p className="text-sm text-gray-400 mb-1 flex items-center gap-1">
                                        Tokens per Seat
                                    </p>
                                    <div className="flex justify-between">
                                        <p className="text-2xl font-bold ">
                                            {activePlan?.plan?.tokenLimitPerDev
                                                ? numToHip(
                                                      activePlan?.plan
                                                          ?.tokenLimitPerDev,
                                                      0
                                                  )
                                                : "-"}
                                        </p>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </CardContent>
            </Card>
            {!isTrialPlan && (
            <div className="flex flex-col lg:flex-row gap-8">
                {/* Include section */}
                {(activePlan?.plan?.features?.length || 0) > 0 && (
                    <div className="space-y-4 max-w-[400px]">
                        <div>
                            <h3 className="text-lg font-semibold ">Include</h3>
                            <p className="text-sm text-gray-400 mt-1">
                                See everything included in your plan.
                            </p>
                        </div>

                        <Card className="border">
                            <CardContent className="p-6">
                                <h4 className="text-sm font-medium text-gray-400 mb-4">
                                    Features
                                </h4>
                                <ul className="space-y-2 divide-y">
                                    {activePlan?.plan?.features?.map(
                                        (feature, index) => (
                                            <li
                                                key={index}
                                                className="flex items-start gap-2 text-sm py-3"
                                            >
                                                <CheckIcon className="mt-3" />
                                                <div>
                                                    <div>{feature?.title}</div>
                                                    <div className="text-neutral-500">
                                                        {feature?.description}
                                                    </div>
                                                </div>
                                            </li>
                                        )
                                    )}
                                </ul>
                            </CardContent>
                        </Card>
                    </div>
                )}
                <div className="flex-1 space-y-4">
                    <div>
                        <h3 className="text-lg font-semibold ">Purchase History</h3>
                        <p className="text-sm text-gray-400 mt-1">
                            See your past transactions.
                        </p>
                    </div>
                    <Card className="border">
                        <CardContent className="px-3">
                            <PurchaseHistory />
                        </CardContent>
                    </Card>
                </div>
            </div>
            )}
            {/* Alerts for trial/subscription ending */}
            {isTrialPlan &&
                getRemainingDays(activePlan?.periodEnd || "") <= 7 && (
                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-primary mt-0.5" />
                            <div>
                                <p className="font-medium text-primary">
                                    Trial Ending Soon
                                </p>
                                <p className="text-sm text-primary/80">
                                    Your trial period ends on{" "}
                                    {formatDate(activePlan?.periodEnd || "")}.{" "}
                                    <Link
                                        href={
                                            ROUTE_CONSTANTS.APP_SUBSCRIPTION_PLANS
                                        }
                                        className="underline font-medium"
                                    >
                                        Upgrade now
                                    </Link>{" "}
                                    to continue using premium features.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            {/* Cancel Plan Dialog */}
            <ConfirmDialog
                open={showConfirm}
                onOpenChange={setShowConfirm}
                title="Cancel Subscription"
                description="Are you sure you want to cancel your subscription? You will retain access to your current plan until the end of your billing period."
                onConfirm={handleCancelPlan}
                confirmText="Cancel Subscription"
                variant="destructive"
            />

            {showProcessing && (
                <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-100">
                    <Loader className="animate-spin" />
                </div>
            )}
        </div>
    );
};

export default CurrentPlan;
