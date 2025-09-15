"use client";

import React from "react";
import { useAuthStore } from "@/store/authStore";
import { AlertTriangle, Clock, Crown, Users } from "lucide-react";
import { ROUTE_CONSTANTS } from "@/lib/constants";
import { useRouter } from "next/navigation";
import Button from "@/components/reusable/Button";

const PlanExpiredPage = () => {
    const { selectedWorkspace, user } = useAuthStore();
    const router = useRouter();

    // Check user role - assume admin if user is workspace owner
    const isAdmin = React.useMemo(() => {
        if (!user || !selectedWorkspace) return false;
        
        // Check if user is workspace owner
        return selectedWorkspace.ownerId === user._id;
    }, [user, selectedWorkspace]);

    // Check if plan is expired
    const isPlanExpired = React.useMemo(() => {
        if (!selectedWorkspace?.currentPlan) return false;

        const currentDate = new Date();
        const periodEnd = new Date(selectedWorkspace.currentPlan.periodEnd);

        return currentDate > periodEnd;
    }, [selectedWorkspace]);

    // Check if there's no current plan
    const hasNoPlan = React.useMemo(() => {
        return !selectedWorkspace?.currentPlan;
    }, [selectedWorkspace]);

    // Check if it's a trial that has expired
    const isTrialPlan = React.useMemo(() => {
        if (!selectedWorkspace?.currentPlan) return false;
        return selectedWorkspace?.currentPlan?.isDefault === true;
    }, [selectedWorkspace]);

    const handleUpgrade = () => {
        router.push(ROUTE_CONSTANTS.APP_SUBSCRIPTION_PLANS);
    };

    const handleBackToDashboard = () => {
        router.push(ROUTE_CONSTANTS.APP_DASHBOARD);
    };

    const getTitle = () => {
        if (hasNoPlan) return "No Active Plan";
        if (isTrialPlan) return "Trial Expired";
        return "Plan Expired";
    };

    const getDescription = () => {
        if (isAdmin) {
            if (hasNoPlan) {
                return "Your workspace doesn't have an active plan. Subscribe to continue using PullSight.";
            }
            if (isTrialPlan) {
                return "Your free trial has ended. Upgrade to continue using PullSight.";
            }
            return "Your subscription has expired. Please renew to continue using PullSight.";
        } else {
            if (hasNoPlan) {
                return "This workspace doesn't have an active plan. Please contact your workspace admin to subscribe.";
            }
            if (isTrialPlan) {
                return "The workspace trial has ended. Please contact your workspace admin to upgrade the plan.";
            }
            return "The workspace subscription has expired. Please contact your workspace admin to renew the plan.";
        }
    };

    const getDetailedMessage = () => {
        if (isAdmin) {
            if (hasNoPlan) {
                return "You don't have an active subscription plan. Subscribe to access all PullSight features and start analyzing your pull requests.";
            }
            if (isTrialPlan) {
                return "Your 14-day free trial has ended. Upgrade to a paid plan to continue accessing all features and analyzing your pull requests.";
            }
            return "Your subscription has expired. Please renew your plan to continue using PullSight and maintain access to your data.";
        } else {
            if (hasNoPlan) {
                return "This workspace doesn't have an active subscription. Please reach out to your workspace administrator to set up a subscription plan.";
            }
            if (isTrialPlan) {
                return "The workspace's 14-day free trial has ended. Please contact your workspace administrator to upgrade to a paid plan.";
            }
            return "The workspace subscription has expired. Please contact your workspace administrator to renew the plan and restore access.";
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-4 h-full">
            <div className="max-w-lg w-full bg-white dark:bg-card rounded-lg shadow-lg p-8 text-center">
                {/* Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                        {isAdmin ? (
                            hasNoPlan ? (
                                <AlertTriangle className="w-10 h-10 text-red-600" />
                            ) : isTrialPlan ? (
                                <Clock className="w-10 h-10 text-red-600" />
                            ) : (
                                <AlertTriangle className="w-10 h-10 text-red-600" />
                            )
                        ) : (
                            <Users className="w-10 h-10 text-red-600" />
                        )}
                    </div>
                </div>

                {/* Title */}
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                    {getTitle()}
                </h1>

                {/* Description */}
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                    {getDescription()}
                </p>

                {/* Detailed Message */}
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-4 mb-6 text-left">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        {getDetailedMessage()}
                    </p>
                </div>

                {/* Plan Details */}
                {selectedWorkspace?.currentPlan && (
                    <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-4 mb-6 text-left">
                        <h4 className="font-medium text-gray-900 dark:text-white mb-2">Plan Details</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">Plan:</span>
                                <span className="font-medium text-gray-900 dark:text-white">
                                    {selectedWorkspace.currentPlan.title}
                                </span>
                            </div>
                            {selectedWorkspace.currentPlan.periodEnd && (
                                <div className="flex justify-between">
                                    <span className="text-gray-600 dark:text-gray-400">
                                        {isPlanExpired ? "Expired On:" : "Expires On:"}
                                    </span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {new Date(selectedWorkspace.currentPlan.periodEnd).toLocaleDateString()}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Workspace Info */}
                <div className="bg-blue-50 dark:bg-neutral-800 rounded-lg p-4 mb-6 text-left">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Workspace Info</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span className="">Name:</span>
                            <span className="font-medium text-blue-900 dark:text-blue-100">
                                {selectedWorkspace?.name}
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="">Slug:</span>
                            <span className="font-medium text-blue-900 dark:text-blue-100">
                                {selectedWorkspace?.slug}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-3">
                    {isAdmin ? (
                        <Button
                            onClick={handleUpgrade}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {hasNoPlan
                                ? "Subscribe Now"
                                : isTrialPlan
                                ? "Upgrade Now"
                                : "Renew Plan"}
                        </Button>
                    ) : (
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                            <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-2">
                                <strong>Contact Admin:</strong>
                            </p>
                            <p className="text-xs text-yellow-700 dark:text-yellow-300">
                                Please reach out to your workspace administrator to resolve this issue.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PlanExpiredPage;