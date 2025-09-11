import { useMutation, useQuery } from "@tanstack/react-query";
import { subscriptionEndpoints } from "../endpoints/subscription";
import { Plan } from "@/types/plan";
import { useAuthStore } from "@/store/authStore";
import { queryClient } from "@/lib/tanstackQueryClient";

export const useGetSubscriptionPlansQuery = ({ isEnabled = true } = {}) => {
    return useQuery<{
        data: Plan[];
    }>({
        queryKey: ["subscriptionPlans"],
        queryFn: () => subscriptionEndpoints.getPlans(),
        enabled: isEnabled,
    });
};

export const usePurchasePlanMutation = () => {
    return useMutation({
        mutationKey: ["purchasePlan"],
        mutationFn: (payload: unknown) =>
            subscriptionEndpoints.purchasePlan(payload),
        onSuccess: () => {
            queryClient.refetchQueries({ queryKey: ["purchaseHistory"] });
        }
    });
};

export const useCancelPlanMutation = () => {
    const {
        selectedWorkspace,
        setSelectedWorkspace,
        workspaces,
        setWorkspaces,
    } = useAuthStore();
    return useMutation({
        mutationKey: ["user"],
        mutationFn: () => subscriptionEndpoints.cancelPlan(),
        onSuccess: (data) => {
            // console.log(data);
            if (selectedWorkspace) {
                setSelectedWorkspace({
                    ...selectedWorkspace,
                    currentPlan: undefined,
                });
            }
            setWorkspaces([
                ...(workspaces
                    ? workspaces?.map((ws) => {
                          if (ws._id === selectedWorkspace?._id) {
                              return {
                                  ...ws,
                                  currentPlan: undefined,
                              };
                          }
                          return ws;
                      })
                    : []),
            ]);
        },
    });
};

export const useGetPacksQuery = ({ isEnabled = true } = {}) => {
    return useQuery({
        queryKey: ["packs"],
        queryFn: () => subscriptionEndpoints.getPack(),
        enabled: isEnabled,
    });
};

export const usePurchasePackMutation = () => {
    return useMutation({
        mutationKey: ["purchasePack"],
        mutationFn: (payload: unknown) =>
            subscriptionEndpoints.purchasePack(payload),
        onSuccess: () => {
            queryClient.refetchQueries({ queryKey: ["purchaseHistory"] });
        }
    });
};

export const usePurchaseHistoryQuery = ({
    page = 1,
    limit = 10,
    isEnabled = true,
} = {}) => {
    return useQuery({
        queryKey: ["purchaseHistory", page, limit],
        queryFn: () => subscriptionEndpoints.purchaseHistory({ page, limit }),
        enabled: isEnabled,
    });
}