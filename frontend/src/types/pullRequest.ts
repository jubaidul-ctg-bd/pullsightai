export interface PullRequest {
    _id?: string;
    provider: string;
    prId: number;
    prNumber: number;
    issueCount: number;
    prTitle: string;
    prState: string; //open | merged | declined
    prUser: string;
    prUserAvatar: string;
    prCreatedAt: string;
    prUpdatedAt: string;
    prClosedAt: string | null;
    prMergedAt: string | null;
    pullRequestAnalysis: {
        usageInfo: any
        prReviewUsageInfo: any
    }[],
    repo?: string;
    prUrl: string;
}
