import { useUserQuery } from "@/api/queries/auth";
import { usePurchasePlanMutation } from "@/api/queries/subscription";
import Badge from "@/components/reusable/Badge";
import Button from "@/components/reusable/Button";
import { ConfirmDialog } from "@/components/reusable/Dialog";
import { CheckIcon } from "@/components/reusable/icons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUTE_CONSTANTS } from "@/lib/constants";
import { getRemainingDays } from "@/lib/dayjs";
import showToast from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { Plan } from "@/types/plan";
import { redirect } from "next/navigation";
import { useRouter } from "next/navigation";
import { FC, useRef, useState, useEffect } from "react";

interface PricingTableProps {
    isLoading: boolean;
    plans: Plan[];
    seats: number;
}

// Shimmer animation component
const Shimmer = ({ className = "" }) => (
    <div
        className={`animate-pulse bg-gradient-to-r from-muted/50 via-muted to-muted/50 bg-[length:200%_100%] rounded-md ${className}`}
        style={{
            animation: "shimmer 2s infinite linear",
            backgroundSize: "200% 100%",
        }}
    />
);

// Add shimmer keyframes to the component
const shimmerStyles = `
@keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}
`;

// Pricing card skeleton
const PricingCardSkeleton = () => (
    <Card className="relative pt-18 rounded-4xl border">
        {/* Popular badge skeleton */}
        <div className="absolute top-8 left-6">
            <Shimmer className="h-6 w-20 rounded-full" />
        </div>

        <CardHeader className="pb-4 h-[200px]">
            <div className="space-y-4">
                {/* Title */}
                <Shimmer className="h-7 w-32" />

                {/* Description */}
                <div className="space-y-2">
                    <Shimmer className="h-4 w-full" />
                    <Shimmer className="h-4 w-3/4" />
                </div>

                {/* Price */}
                <div className="mt-auto pt-6">
                    <div className="flex items-baseline gap-1">
                        <Shimmer className="h-6 w-4" />
                        <Shimmer className="h-12 w-20" />
                        <Shimmer className="h-5 w-10" />
                    </div>
                </div>
            </div>
        </CardHeader>

        <CardContent className="space-y-6">
            {/* Subscribe button */}
            <Shimmer className="h-14 w-full rounded-lg" />

            {/* Features list */}
            <div className="space-y-4">
                {[...Array(5)].map((_, index) => (
                    <div
                        key={index}
                        className="flex items-start gap-3 py-2 border-t first:border-t-0"
                    >
                        <Shimmer className="h-4 w-4 rounded-full mt-2 flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                            <Shimmer
                                className={`h-4 ${
                                    index % 2 === 0 ? "w-full" : "w-4/5"
                                }`}
                            />
                            <Shimmer
                                className={`h-3 ${
                                    index % 3 === 0 ? "w-3/4" : "w-2/3"
                                }`}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </CardContent>
    </Card>
);

const enterprisePlanFeatures = [
    {
        title: "Usage:",
        description: "Unlimited PR tokens(custom contract)",
    },
    {
        title: "Seats:",
        description: "25+ developers",
    },
    {
        title: "Features:",
        description: "All Pro features + custom retention",
    },
    {
        title: "Security:",
        description: "SOC2, SSO/SAML, DPA/SLA, VPC/air‑gapped runners",
    },
    {
        title: "Dashboard:",
        description: "Trends (30‑day retention), repo & team filters",
    },
    {
        title: "Integrations:",
        description: "Slack / Discord alerts",
    },
    {
        title: "Governance:",
        description:
            "Soft policy gates (warn on severity/size; never block merges)",
    },
    {
        title: "Support:",
        description: "Dedicated CSM + premium onboarding",
    },
];

const SinglePlanCard: FC<{
    className?: string;
    plan: Plan;
    seats: number;
    isSelected: boolean;
}> = ({ className, plan, seats, isSelected: isCurrentPlan }) => {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [subscribingPlanId, setSubscribingPlanId] = useState<string | null>(
        null
    );
    const { selectedWorkspace } = useAuthStore();

    const { mutateAsync, isPending } = usePurchasePlanMutation();
    const { refetch, isFetching } = useUserQuery({
        isEnabled: false,
    });

    const handleSubscribe = async (plan: Plan, skipFreeCheck = false) => {
        // Handle subscription logic here
        // if (plan?.isFree && !skipFreeCheck) {
        if (!skipFreeCheck) {
            setIsOpen(true);
            return;
        }

        setSubscribingPlanId(plan._id); // Track which plan is being subscribed to

        await mutateAsync({
            gateway: "stripe",
            planId: plan._id,
            noOfSeat: seats,
        })
            .then(async (res) => {
                if (res?.data?.url) {
                    window.location.href = res.data.url;
                } else {
                    await refetch();
                    showToast.success("New Plan Activated");
                    router.push(ROUTE_CONSTANTS.APP_SUBSCRIPTION);
                }
            })
            .catch((error) => {
                showToast.error(
                    error?.response?.data?.error ||
                        "Failed to initiate subscription"
                );
                setSubscribingPlanId(null); // Reset on error
            });
    };
    const handleFreePlanSubscription = async (plan: Plan) => {
        handleSubscribe(plan, true);
    };

    // Reset subscribing state when refetch completes and workspace is updated
    useEffect(() => {
        if (
            !isFetching &&
            subscribingPlanId &&
            selectedWorkspace?.currentPlan?.plan?._id === subscribingPlanId
        ) {
            setSubscribingPlanId(null);
        }
    }, [
        isFetching,
        subscribingPlanId,
        selectedWorkspace?.currentPlan?.plan?._id,
    ]);

    const remainingDays = getRemainingDays(
        selectedWorkspace?.currentPlan?.periodEnd || ""
    );
    const isSameSelectedSeats =
        selectedWorkspace?.currentPlan?.numOfSeat === seats;
    const isSubscribedDisabled =
        (remainingDays > 0 &&
            isCurrentPlan &&
            selectedWorkspace?.currentPlan?.isFree) ||
        (isCurrentPlan &&
            !selectedWorkspace?.currentPlan?.isFree &&
            isSameSelectedSeats);

    return (
        <>
            <ConfirmDialog
                open={isOpen}
                onOpenChange={setIsOpen}
                isLoading={isPending || isFetching}
                title={
                    plan?.isFree
                        ? "Confirm Free Plan"
                        : "Are you sure you want to update your plan?"
                }
                description={
                    plan?.isFree
                        ? "Are you sure you want to subscribe to this plan? All other members except workspace owner will be disabled."
                        : "Your token & seat count will be updated based on the new plan & seats you've selected."
                }
                confirmVariant="default"
                onConfirm={() => handleFreePlanSubscription(plan)}
            />
            <Card
                key={plan._id}
                className={cn(
                    `relative pt-18 rounded-4xl`,
                    {
                        "border-white border-2": plan.highlight,
                        "border-0": !plan.highlight,
                    },
                    className
                )}
            >
                {plan.highlight && (
                    <Badge className="bg-white absolute top-8 left-6">
                        {plan.highlight}
                    </Badge>
                )}

                <CardHeader className="pb-4 h-[250px]">
                    <CardTitle className="text-xl">{plan.title}</CardTitle>
                    <p className="text-muted-foreground text-sm mb-8">
                        {plan.description}
                    </p>
                    {plan?.externalUrl ? (
                        <div className=" mt-auto">
                            <span className="text-xl font-semibold">
                                Custom Pricing
                            </span>
                        </div>
                    ) : (
                        <>
                            <div className="mt-auto flex items-center">
                                <div className="flex-1 ">
                                    <span className="text-3xl font-semibold">
                                        $
                                    </span>
                                    <span className="text-5xl font-bold">
                                        {plan.billingCycle == "yearly"
                                            ? (plan.pricePerDev / 12).toFixed(2)
                                            : plan.pricePerDev}
                                    </span>
                                    {/* {plan.billingCycle === "yearly" && (
                                        <span className="text-md">
                                            .
                                            {Math.floor(
                                                ((plan.pricePerDev / 12) % 1) *
                                                    100
                                            )}
                                        </span>
                                    )} */}
                                    {!plan.isFree ? (
                                        <div className="text-md font-semibold text-muted-foreground">
                                            / dev per month
                                        </div>
                                    ) : (
                                        <div className="text-md font-semibold text-muted-foreground">
                                            / org
                                        </div>
                                    )}
                                </div>
                                {isCurrentPlan && (
                                    <Badge className="bg-white">
                                        Current Plan
                                    </Badge>
                                )}
                            </div>
                            {!plan.isFree && (
                                <span className="text-xs text-muted-foreground">
                                    Billed{" "}
                                    {plan.billingCycle === "monthly"
                                        ? "Monthly"
                                        : "Yearly"}
                                </span>
                            )}
                        </>
                    )}
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-center gap-2 text-lg font-semibold">
                        <Zap className="w-5 h-5" />
                        {(
                            plan.tokenLimitPerDev * seats
                        ).toLocaleString()}{" "}
                        tokens/month
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                        {plan.tokenLimitPerDev.toLocaleString()}{" "}
                        tokens per user
                    </p>
                </div> */}
                    {plan?.externalUrl ? (
                        <a
                            href={plan.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Button
                                className={`w-full font-semibold h-[56px]`}
                                size="lg"
                            >
                                Contact Sales
                            </Button>
                        </a>
                    ) : (
                        <Button
                            className={`w-full font-semibold h-[56px]`}
                            size="lg"
                            onClick={() => handleSubscribe(plan)}
                            disabled={isSubscribedDisabled}
                            isLoading={
                                isPending ||
                                subscribingPlanId === plan._id ||
                                (isFetching && subscribingPlanId === plan._id)
                            }
                        >
                            Subscribe
                        </Button>
                    )}

                    <div>
                        <ul className="space-y-2 divide-y">
                            {plan.features.map((feature, index) => (
                                <li
                                    key={index}
                                    className="flex items-start gap-2 text-sm py-3"
                                >
                                    <CheckIcon className="mt-1 flex-shrink-0" />
                                    <div>
                                        <div>{feature?.title}</div>
                                        <div className="text-neutral-500">
                                            {feature?.description}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </CardContent>
            </Card>
        </>
    );
};

interface PricingTableProps {
    className?: string;
    isLoading: boolean;
    plans: Plan[];
    seats: number;
}

const PricingTable: FC<PricingTableProps> = ({
    className,
    isLoading,
    plans,
    seats,
}) => {
    const { selectedWorkspace } = useAuthStore();

    return (
        <>
            <style>{shimmerStyles}</style>
            {isLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-7 max-w-8xl mx-auto mb-20">
                    {[...Array(4)].map((_, index) => (
                        <PricingCardSkeleton key={index} />
                    ))}
                </div>
            ) : (
                <div
                    className={cn(
                        "flex flex-wrap xl:flex-nowrap gap-7 max-w-8xl mx-auto mb-20 justify-center"
                        // {
                        //     "lg:grid-cols-3": plans?.length == 2,
                        //     "lg:grid-cols-4": plans?.length != 2,
                        // }
                    )}
                >
                    {plans?.map((plan: Plan, index) => {
                        const isSelected =
                            selectedWorkspace?.currentPlan?.plan?._id ===
                            plan._id;
                        return (
                            <SinglePlanCard
                                className="min-w-[250px] max-w-[360px] flex-1"
                                key={plan._id}
                                plan={plan}
                                seats={seats}
                                isSelected={isSelected}
                            />
                        );
                    })}
                    {/* <Card
                        className={`relative pt-18 rounded-4xl border-0`}
                    >
                        <CardHeader className="pb-4 h-[200px]">
                            <CardTitle className="text-xl">
                                Enterprise Plan
                            </CardTitle>
                            <p className="text-muted-foreground text-sm mb-8">
                                For enterprises with strict compliance & scale
                                needs
                            </p>
                            <div className=" mt-auto">
                                <span className="text-xl font-semibold">
                                    Custom Pricing
                                </span>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-6">

                            <Button
                                className={`w-full font-semibold h-[56px]`}
                                size="lg"
                            >
                                Contact sales
                            </Button>

                            <div>
                                <ul className="space-y-2 divide-y">
                                    {enterprisePlanFeatures.map(
                                        (feature, index) => (
                                            <li
                                                key={index}
                                                className="flex items-start gap-2 text-sm py-3"
                                            >
                                                <CheckIcon className="mt-1 flex-shrink-0" />
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
                            </div>
                        </CardContent>
                    </Card> */}
                </div>
            )}
        </>
    );
};

export default PricingTable;
