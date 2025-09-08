"use client";

import { Switch } from "@/components/ui/switch";
import { ColumnDef } from "@tanstack/react-table";
import { Repository } from "@/types/repository";
import { PullRequest } from "@/types/pullRequest";
import Avatar from "@/components/reusable/Avatar";
import Badge from "@/components/reusable/Badge";
import { formatDate } from "@/lib/dayjs";
import PrStateBadge from "@/components/reusable/PrStateBadge";

export const columns: ColumnDef<PullRequest>[] = [
    {
        accessorKey: "prTitle",
        header: "PR Title",
        meta: {
            headerClassName: "min-w-64 flex-1",
            cellClassName: "min-w-64 flex-1",
        },
        cell: ({ row }) => (
            <div className="2xl:max-w-xl xl:max-w-md lg:max-w-sm max-w-sm">
                <span className="text-white mb-1 text-base text-wrap">
                    {row.getValue("prTitle")}
                </span>
                <div className="opacity-50">{row.original?.repo}</div>
            </div>
        ),
    },
    {
        accessorKey: "prUser",
        header: "Author",
        meta: {
            headerClassName: "w-60",
            cellClassName: "w-60",
        },
        cell: ({ row }) => {
            return (
                <Avatar
                    src={row.original?.prUserAvatar || ""}
                    name={row.getValue("prUser") || "Unknown"}
                    size="sm"
                />
            );
        },
    },
    {
        accessorKey: "prState",
        header: "PR Status",
        meta: {
            headerClassName: "w-28",
            cellClassName: "w-28",
        },
        cell: ({ row }) => (
            <PrStateBadge state={row.getValue("prState") as string} />
        ),
    },
    {
        accessorKey: "issueCount",
        header: "Issues",
        meta: {
            headerClassName: "w-28",
            cellClassName: "w-28",
        },
        cell: ({ row }) => {
            const issueCount = row.getValue("issueCount") as number | undefined;
            return (
                <span className="bg-white/5 text-gray-400 rounded-full px-2 py-1 inline-block">
                    {issueCount || 0}
                </span>
            );
        },
    },
    {
        accessorKey: "prUpdatedAt",
        header: "Updated",
        meta: {
            headerClassName: "w-28",
            cellClassName: "w-28",
        },
        cell: ({ row }) => {
            const updated = row.getValue("prUpdatedAt") as string | undefined;
            return (
                <span className="text-gray-400">
                    {formatDate(updated || "")}
                </span>
            );
        },
    },
];
