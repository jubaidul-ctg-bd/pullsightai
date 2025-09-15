import AuthGuardClient from "@/components/auth/AuthGuardClient";
import { AuthGuardServer } from "@/components/auth/AuthGuardServer";
import AppTopBar from "../app/TopBar";
import { ReactNode } from "react";

const PlanExpiredLayout = ({ children }: { children: ReactNode }) => {
    return (
        <AuthGuardServer>
            <AuthGuardClient>
                <AppTopBar />
                <div
                    className={`min-h-[calc(100vh-88px)] xl:pt-[88px] pt-[60px] max-w-screen overflow-hidden `}
                >
                    {children}
                </div>
            </AuthGuardClient>
        </AuthGuardServer>
    );
};

export default PlanExpiredLayout;