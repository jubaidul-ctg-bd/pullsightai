import { usePurchaseHistoryQuery } from "@/api/queries/subscription";
import DataTable from "@/components/reusable/DataTable";
import usePagination from "@/hooks/usePagination";
import { formatDate } from "@/lib/dayjs";
import { numToHip } from "@/lib/utils";
import { Transaction } from "@/types/transaction";
import { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

const columns:ColumnDef<Transaction>[]  = [
        {
        accessorKey: "serviceBookingId",
        header: "Details",
        meta: {
            headerClassName: "min-w-64 flex-1",
            cellClassName: "min-w-64 flex-1",
        },
        cell: ({ row }) => (
            <div>
                <div className="text-sm text-muted-foreground mb-0.5">
                    Purchased {row.original?.service}
                </div>
                <div>
                    {row.original?.serviceBookingId?.title} {" - "}
                    {row.original?.service == "Pack" ? (
                        <span className="">
                            { "totalToken" in (row.original?.serviceBookingId ?? {}) ? numToHip((row.original?.serviceBookingId as any).totalToken ?? 0) : 0} Tokens
                        </span>
                    ) : row.original?.service == "Plan" ? (
                        <span className="">
                            { (row.original?.serviceBookingId as any).billingCycle} Plan - {" "}
                            { (row.original?.serviceBookingId as any).numOfSeat } Seat(s)
                        </span>
                    ) : null}
                </div>
            </div>
        ),
    },
    {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => (
            <div className="flex gap-2">
                <span className="text-white mb-1 text-md">
                    ${row.getValue("amount")}
                </span>
            </div>
        ),
    },
    {
        accessorKey: "createdAt",
        header: "Date",
        cell: ({ row }) => (
            <div className="flex gap-2">
                <span className="text-white mb-1 text-md">
                    {formatDate(row.getValue("createdAt"))}
                </span>
            </div>
        ),
    }
]

const PurchaseHistory = ({

}) => {
    const [currentPage, setCurrentPage] = useState(1);
    const { data, isFetching } = usePurchaseHistoryQuery({
        page: currentPage,
        limit: 10,
    });

    const { Pagination } = usePagination({
        totalPages: data?.data?.totalPages || 1,
        currentPage,
        onPageChange: setCurrentPage,
    });
    return (
        <>
            <DataTable
                columns={columns}
                isLoading={isFetching}
                data={data?.data?.docs || []}
            />
            <Pagination />
        </>
    );
};

export default PurchaseHistory;