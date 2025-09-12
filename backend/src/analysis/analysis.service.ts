import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Types } from 'mongoose'
import { PullRequestAnalysisCommentsDto } from 'src/analysis/dto/post-analysis-comments.dto'
import { PullRequestAnalysisDto } from 'src/analysis/dto/post-analysis.dto'
import { BitbucketEventsService } from 'src/bitbucket/bitbucket-events.service'
import { PREvent } from 'src/common/enums/pr.enum'
import { getTimePeriod } from 'src/common/helpers/coversion.helper'
import { HttpService } from 'src/common/http/http.service'
import { StructuredPRData } from 'src/common/interfaces/pr.interface'
import { DatabaseService } from 'src/database/database.service'
import { PaymentStatus } from 'src/database/enums/status.enum'
import { BillingCycle } from 'src/database/schemas/plan.schema'
import { Status } from 'src/database/schemas/pull-request-analysis.schema'
import { PRReviewDto } from 'src/github/dto/install-repo.dto'
import { GithubEventService } from 'src/github/github-events.service'
import { GitlabEventsService } from 'src/gitlab/gitlab-events.service'

@Injectable()
export class AnalysisService {
    constructor(
        private readonly dataService: DatabaseService,
        private readonly githubEventService: GithubEventService,
        private readonly bitbucketEventsService: BitbucketEventsService,
        private readonly gitlabEventsService: GitlabEventsService,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService
    ) {}

    async getUserDataWithWorkspace(user: any) {
        const userData = await this.dataService.users
            .findOne({ _id: user.sub })
            .populate('currentWorkspace')
        if (!userData || !userData?.currentWorkspace) {
            throw new Error('User or current workspace not found')
        }
        return userData
    }

    async checkApplicableForAnalysis(
        repositorySlug: string,
        workspaceSlug: string,
        provider: string,
        providerId: string
    ) {
        console.log(
            'Checking if analysis is applicable for repository:',
            repositorySlug,
            'in workspace:',
            workspaceSlug,
            'with provider:',
            provider,
            'and providerId:',
            providerId
        )
        const repository = await this.dataService.repositories
            .findOne({
                slug: repositorySlug,
                'author.username': workspaceSlug,
                provider: provider,
                isActive: true
            })
            .populate('workspace')
        if (!repository) {
            console.log('Repository not found or inactive')
            return false
        }
        const workspaceMember = await this.dataService.workspaceMembers.findOne(
            {
                provider: provider,
                providerId: providerId,
                workspace: repository.workspace!['_id'],
                isActive: true
            }
        )
        if (!workspaceMember) {
            console.log(
                'No active workspace member found for providerId:',
                providerId
            )
            return false
        }
        if (!(await this.checkAvailableToken(repository.workspace!['_id']))) {
            return false
        }
        return {
            repository,
            workspaceMember
        }
    }

    async checkAvailableToken(workspaceId: any) {
        const workspace: any = await this.dataService.workspaces
            .findOne({
                _id: workspaceId
            })
            .populate('currentPlan currentPack')

        let flag = true
        if (
            workspace?.currentPlan?.periodEnd &&
            new Date() > new Date(workspace.currentPlan.periodEnd)
        ) {
            if (
                workspace.currentPlan.isFree &&
                workspace.currentPlan.billingCycle == BillingCycle.MONTHLY
            ) {
                workspace.planRemainingToken = await this.assignPlanToWorkspace(
                    workspaceId,
                    workspace.currentPlan.numOfSeat,
                    workspace.currentPlan.plan
                )
            } else {
                flag = false
            }
        }

        if (
            flag &&
            (workspace?.planRemainingToken > 0 ||
                workspace?.packRemainingToken > 0)
        ) {
            return true
        } else {
            return false
        }
    }

    async assignPlanToWorkspace(
        workspaceId: any,
        noOfSeat: number,
        planId: string
    ) {
        const planData = await this.dataService.plans.findOne({
            _id: planId
        })
        if (!planData) {
            throw new NotFoundException('No free plan found')
        }
        let totalToken = planData.tokenLimitPerDev * noOfSeat
        let remainingToken = totalToken
        const period = getTimePeriod(planData.billingCycle)
        const purchasedPlan = await this.dataService.purchasedPlans.create({
            workspace: workspaceId,
            plan: planData._id,
            amount: 0,
            totalToken: totalToken,
            numOfSeat: noOfSeat,
            billingCycle: planData.billingCycle,
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            paymentStatus: PaymentStatus.PAID,
            status: 'active',
            title: planData.title,
            pricePerDev: planData.pricePerDev,
            tokenLimitPerDev: planData.tokenLimitPerDev,
            isFree: planData.isFree,
            isDefault: planData.isDefault
        })
        await this.dataService.workspaces.updateOne(
            { _id: workspaceId },
            {
                $set: {
                    currentPlan: purchasedPlan._id,
                    planTotalToken: totalToken,
                    planRemainingToken: remainingToken
                }
            }
        )
        return remainingToken
    }

    async updateTokenUsage(workspaceId: any, tokenUsage: number) {
        const workspace: any = await this.dataService.workspaces
            .findOne({
                _id: workspaceId
            })
            .populate('currentPlan currentPack')

        let remainingTokenUsage = tokenUsage

        // First, try to deduct from currentPlan if available
        if (workspace?.planRemainingToken && remainingTokenUsage > 0) {
            const planTokensToDeduct = Math.min(
                workspace.planRemainingToken,
                remainingTokenUsage
            )
            workspace.planRemainingToken = Math.max(
                0,
                workspace.planRemainingToken - planTokensToDeduct
            )
            remainingTokenUsage -= planTokensToDeduct
        }

        // Then, deduct remaining tokens from currentPack if available
        if (workspace?.packRemainingToken && remainingTokenUsage > 0) {
            const packTokensToDeduct = Math.min(
                workspace.packRemainingToken,
                remainingTokenUsage
            )
            workspace.packRemainingToken = Math.max(
                0,
                workspace.packRemainingToken - packTokensToDeduct
            )
            remainingTokenUsage -= packTokensToDeduct
        }
        await workspace.save()
        return tokenUsage - remainingTokenUsage
    }

    async getAndSavePullRequestFormattedData(
        pullRequestFormattedData: StructuredPRData,
        event: PREvent
    ) {
        if (event == PREvent.UPDATED) {
            const newPR = pullRequestFormattedData.pullRequest
            const existingPR = await this.dataService.pullRequests.findOne({
                provider: newPR.provider,
                prNumber: newPR.prNumber,
                owner: newPR.owner,
                repo: newPR.repo
            })
            if (!existingPR) {
                const pullRequest = await this.dataService.pullRequests.create({
                    ...pullRequestFormattedData.pullRequest
                })
                return pullRequest?.toObject()
            }
            console.log('existing pr', existingPR)
            console.log('newPR', newPR)
            const prFiles = newPR.prFiles
                .map((file) => {
                    if (!existingPR?.prFiles) return file // If no existing files, include all new files

                    // Check if file doesn't exist in existing PR
                    const existingFile = existingPR.prFiles.find(
                        (f) => f.prFileName === file.prFileName
                    )

                    if (!existingFile) return file // New file - return with all hunks

                    // Compare prFileDiffHunks and filter only changed/added hunks
                    const existingHunks = existingFile.prFileDiffHunks || []
                    const newHunks = file.prFileDiffHunks || []

                    // Find hunks that are new or changed
                    const changedHunks = newHunks.filter(
                        (newHunk) => !existingHunks.includes(newHunk)
                    )

                    // If there are changed hunks, return file with only changed hunks
                    if (changedHunks.length > 0) {
                        return {
                            ...file,
                            prFileDiffHunks: changedHunks
                        }
                    }

                    // No changes in hunks, exclude this file
                    return null
                })
                .filter((file) => file !== null) // Remove null entries

            const savedPullRequestFormattedData =
                await this.dataService.pullRequests.findOneAndUpdate(
                    {
                        _id: existingPR._id
                    },
                    {
                        $set: {
                            ...newPR
                        }
                    },
                    { new: true }
                )

            return {
                ...(savedPullRequestFormattedData?.toObject() || {}),
                prFiles: prFiles
            }
        }
        const pullRequest = await this.dataService.pullRequests.create({
            ...pullRequestFormattedData.pullRequest
        })
        return pullRequest?.toObject()
    }

    async updatedPRState(query: any, data: any) {
        console.log('Updating PR state with data:', data)
        console.log('For PR with query:', query)
        return await this.dataService.pullRequests.updateOne(query, {
            $set: data
        })
    }

    async makeAnalysis(
        pullRequestFormattedData: StructuredPRData,
        event: PREvent,
        workspace: any,
        repository?: any
    ) {
        console.log('Making analysis for PR event:', event)
        const savedPullRequestFormattedData =
            await this.getAndSavePullRequestFormattedData(
                pullRequestFormattedData,
                event
            )
        const pullRequestAnalysis =
            await this.dataService.pullRequestAnalysis.create({
                prId: savedPullRequestFormattedData.prId,
                provider: savedPullRequestFormattedData.provider,
                prUser: savedPullRequestFormattedData.prUser,
                workspaceSlug: savedPullRequestFormattedData.owner,
                repositorySlug: savedPullRequestFormattedData.repo,
                prNumber: savedPullRequestFormattedData.prNumber,
                installationId: savedPullRequestFormattedData.installationId,
                prState: savedPullRequestFormattedData.prState,
                status: Status.INPROGRESS,
                startedAt: new Date(),
                pullRequest: savedPullRequestFormattedData._id,
                workspace
            })
        await this.dataService.pullRequests.updateOne(
            { _id: savedPullRequestFormattedData._id },
            {
                $addToSet: {
                    pullRequestAnalysis: pullRequestAnalysis[
                        '_id'
                    ] as Types.ObjectId
                }
            }
        )
        console.log('Created pullRequestAnalysis:', pullRequestAnalysis)
        try {
            const requestBody = {
                pullRequest: {
                    ...savedPullRequestFormattedData,
                    pullRequestAnalysisId: pullRequestAnalysis['_id'],
                    apiKey: repository?.workspace?.workspaceSetting?.apiKey,
                    modelName:
                        repository?.workspace?.workspaceSetting?.modelName,
                    minSeverity: repository?.minSeverity,
                    ignore: repository?.ignore
                }
            }
            console.log(
                'Sending data to AI agent:',
                this.configService.get('AI_AGENT_PR_POST_URL'),
                requestBody
            )
            requestBody?.pullRequest?.prFiles?.map((file) => {
                console.log('PR File:', file.prFileName, file.prFileDiffHunks)
            })
            await this.httpService.post(
                this.configService.get('AI_AGENT_PR_POST_URL') as string,
                requestBody,
                {
                    timeout: 1000 // 1 second timeout
                }
            )
        } catch (error) {
            console.error('Error sending data to AI agent:', error.message)
        }
        return {
            pullRequestAnalysisId: pullRequestAnalysis['_id'],
            pullRequest: savedPullRequestFormattedData
        }
    }

    async addPRReviewComments(postReviewDto: PullRequestAnalysisCommentsDto) {
        let analysis
        if (postReviewDto.completed) {
            analysis =
                await this.dataService.pullRequestAnalysis.findOneAndUpdate(
                    {
                        _id: postReviewDto.pullRequestAnalysisId
                    },
                    {
                        $set: {
                            status: Status.COMPLETED,
                            completedAt: new Date(),
                            prReviewModelInfo: postReviewDto.modelInfo,
                            prReviewUsageInfo: postReviewDto.usageInfo
                        }
                    },
                    { new: true }
                )
            await this.updateTokenUsage(
                analysis.workspace,
                postReviewDto.usageInfo.input_tokens +
                    postReviewDto.usageInfo.output_tokens || 0
            )
        } else {
            analysis = await this.dataService.pullRequestAnalysis.findOne({
                _id: postReviewDto.pullRequestAnalysisId
            })
        }

        if (!analysis) {
            throw new Error('Pull request analysis not found')
        }

        // Create all comments in parallel
        const createdComments = await Promise.all(
            postReviewDto.comments.map(async (comment) => {
                return await this.dataService.pullRequestAnalysisComments.create(
                    {
                        ...comment,
                        pullRequestAnalysisId:
                            Types.ObjectId.createFromHexString(
                                postReviewDto.pullRequestAnalysisId
                            ),
                        repositorySlug: analysis.repositorySlug,
                        pullRequest: analysis.pullRequest,
                        workspace: analysis.workspace
                    }
                )
            })
        )

        switch (analysis.provider) {
            case 'github':
                await this.githubEventService.addPRReviewComments(
                    analysis,
                    createdComments
                )
                break
            case 'bitbucket':
                await this.bitbucketEventsService.addPRReviewComments(
                    analysis,
                    createdComments
                )
                break
            case 'gitlab':
                await this.gitlabEventsService.addPRReviewComments(
                    analysis,
                    createdComments
                )
                break
            default:
                throw new Error('Unsupported provider')
        }

        if (postReviewDto.completed) {
            const issueCount =
                await this.dataService.pullRequestAnalysisComments.countDocuments(
                    {
                        pullRequest: analysis.pullRequest
                    }
                )
            if (issueCount) {
                await this.dataService.pullRequests.updateOne(
                    { _id: analysis.pullRequest },
                    { $set: { issueCount: issueCount } }
                )
            }
        }
        return {}
    }

    async addPRSummery(postSummery: PullRequestAnalysisDto) {
        const updateBody: any = {
            summary: postSummery.summary,
            modelInfo: postSummery.modelInfo,
            usageInfo: postSummery.usageInfo,
            estimatedCodeReviewEffort:
                postSummery?.summary_info?.estimated_code_review_time,
            potentialIssueCount:
                postSummery?.summary_info?.potential_issue_count
        }
        if (!postSummery.summary) {
            updateBody.status = Status.COMPLETED
            updateBody.completedAt = new Date()
        }
        const analysis =
            await this.dataService.pullRequestAnalysis.findOneAndUpdate(
                {
                    _id: postSummery.pullRequestAnalysisId
                },
                {
                    $set: updateBody
                },
                { new: true }
            )

        if (!analysis) {
            throw new Error('Pull request analysis not found')
        }
        if (postSummery.summary) {
            switch (analysis.provider) {
                case 'github':
                    await this.githubEventService.addPRSummery(analysis)
                    break
                case 'bitbucket':
                    await this.bitbucketEventsService.addPRSummery(analysis)
                    break
                case 'gitlab':
                    await this.gitlabEventsService.addPRSummery(analysis)
                    break
                default:
                    throw new Error('Unsupported provider')
            }
        }
        await this.updateTokenUsage(
            analysis.workspace,
            postSummery.usageInfo.input_tokens +
                postSummery.usageInfo.output_tokens || 0
        )
        return {}
    }

    async getExistingPullRequestAndAnalysis(
        prReviewDto: PRReviewDto,
        provider: string
    ) {
        const pullRequestAnalysis =
            await this.dataService.pullRequestAnalysis.findOne({
                repositorySlug: prReviewDto.repo,
                prNumber: prReviewDto.prNumber,
                provider: provider
            })
        if (!pullRequestAnalysis) {
            return false
        }
        return {
            pullRequestAnalysisId: pullRequestAnalysis['_id'],
            pullRequest: await this.dataService.pullRequests.findOne({
                _id: pullRequestAnalysis.pullRequest
            }),
            pullRequestAnalysis: {
                ...pullRequestAnalysis.toObject(),
                comments:
                    await this.dataService.pullRequestAnalysisComments.find({
                        pullRequestAnalysisId: pullRequestAnalysis['_id']
                    })
            }
        }
    }

    async getPRAnalysisData(pullRequestAnalysisId: string) {
        const analysis = await this.dataService.pullRequestAnalysis.findOne({
            _id: pullRequestAnalysisId
        })
        if (!analysis) {
            throw new Error('Pull request analysis not found')
        }
        return {
            ...analysis.toObject(),
            comments: await this.dataService.pullRequestAnalysisComments.find({
                pullRequestAnalysisId: Types.ObjectId.createFromHexString(
                    pullRequestAnalysisId
                )
            })
        }
    }
}
