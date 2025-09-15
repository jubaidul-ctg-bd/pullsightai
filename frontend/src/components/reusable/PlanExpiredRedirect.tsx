"use client";

import React from "react";
import { useAuthStore } from "@/store/authStore";
import { ROUTE_CONSTANTS } from "@/lib/constants";
import { useRouter, usePathname } from "next/navigation";

const PlanExpiredRedirect = () => {
    const { selectedWorkspace } = useAuthStore();
    const router = useRouter();
    const pathname = usePathname();
    const [isRedirecting, setIsRedirecting] = React.useState(false);

    // Don't redirect if already on plan pages
    const isOnPlanPage = pathname?.includes(
        ROUTE_CONSTANTS.APP_SUBSCRIPTION_PLANS
    ) || pathname?.includes(ROUTE_CONSTANTS.APP_PLAN_EXPIRED);

    // Check if plan is expired
    const isPlanExpired = React.useMemo(() => {
        if (!selectedWorkspace?.currentPlan) return false;

        const currentDate = new Date();
        const periodEnd = new Date(selectedWorkspace.currentPlan.periodEnd);

        console.log({currentDate, periodEnd});
        // Check if plan has expired and is not active
        return currentDate > periodEnd;
    }, [selectedWorkspace]);

    // Check if there's no current plan (cancelled or never subscribed)
    const hasNoPlan = React.useMemo(() => {
        return !selectedWorkspace?.currentPlan;
    }, [selectedWorkspace]);

    // Effect to redirect to plan expired page immediately
    React.useEffect(() => {
        // Only redirect if plan is expired or user has no plan, and not already on plan pages
        if ((isPlanExpired || hasNoPlan) && !isOnPlanPage && !isRedirecting) {
            setIsRedirecting(true);
            // Use replace instead of push to avoid back button issues
            router.replace(ROUTE_CONSTANTS.APP_PLAN_EXPIRED);
        }
    }, [isPlanExpired, hasNoPlan, isOnPlanPage, router, isRedirecting]);

    // Show loading overlay if redirecting to prevent flash
    if ((isPlanExpired || hasNoPlan) && !isOnPlanPage) {
        return (
            <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-6 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-300">Redirecting...</p>
                </div>
            </div>
        );
    }

    // Don't render anything if plan is valid or already on plan pages
    return null;
};

export default PlanExpiredRedirect;
