import {
    BadRequestException,
    Injectable,
    InternalServerErrorException
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AnalysisService } from 'src/analysis/analysis.service'
import { AddWorkspaceDto } from 'src/common/dto/add-workspace.dto'
import { PaginateDto } from 'src/common/dto/paginate.dto'
import { PREvent, PRState } from 'src/common/enums/pr.enum'
import { HttpService } from 'src/common/http/http.service'
import { StructuredPRData } from 'src/common/interfaces/pr.interface'
import {
    PullRequestResponse,
    Repository
} from 'src/common/interfaces/repository.interface'
import { DatabaseService } from 'src/database/database.service'
import { Workspace } from 'src/database/schemas/workspace.schema'
import { GetPRGitLabDto, PRReviewDto } from 'src/github/dto/install-repo.dto'
import { GitlabEventsService } from 'src/gitlab/gitlab-events.service'
import { RepositoryDto } from 'src/workspace/dto/make-subscription.dto'
import { GitlabApiService } from './gitlab-api.service'

@Injectable()
export class GitlabService {
    constructor(
        private readonly dataService: DatabaseService,
        private readonly configService: ConfigService,
        private readonly gitlabApiService: GitlabApiService,
        private readonly httpService: HttpService,
        private readonly gitlabEventsService: GitlabEventsService,
        private readonly analysisService: AnalysisService
    ) {}

    async getAllRepositories(
        user: any,
        filter?: string
    ): Promise<Repository[]> {
        const userData = await this.dataService.users
            .findOne({ _id: user.sub }, 'accessToken currentWorkspace')
            .populate('currentWorkspace', 'slug type')
        if (!userData?.accessToken || !userData?.currentWorkspace) {
            throw new BadRequestException(
                'Access token is required or workspace not set'
            )
        }

        const allRepositories = await this.gitlabApiService.getAllRepositories(
            userData.accessToken,
            userData.currentWorkspace['slug'],
            userData.currentWorkspace['type']
        )

        // Filter repositories based on the filter parameter
        if (filter === 'available') {
            // Get repositories that are already added to the current workspace
            const addedRepos = await this.dataService.repositories.find({
                workspace: userData.currentWorkspace['_id'],
                provider: 'gitlab'
            })

            // Get the repository IDs that are already added
            const addedRepoIds = addedRepos.map((repo) => repo.id.toString())

            // Filter out repositories that are already added
            return allRepositories.filter(
                (repo) => !addedRepoIds.includes(repo.id.toString())
            )
        }

        return allRepositories
    }

    async listOrganizationSpecificRepositories(
        user: any,
        paginate: PaginateDto
    ) {
        const userData = await this.dataService.users
            .findOne({ _id: user.sub, provider: user.provider })
            .populate('currentWorkspace')
        if (!userData || !userData?.currentWorkspace) {
            throw new Error('User or current workspace not found')
        }
        if (!userData?.accessToken) {
            throw new BadRequestException('Access token is required')
        }

        const workspace = await this.dataService.workspaces
            .findOne({ _id: userData.currentWorkspace })
            .select('slug id type')
            .lean()

        if (!workspace) {
            throw new BadRequestException('Workspace not found')
        }
        const repositories =
            await this.gitlabApiService.getWorkspaceRepositoriesPaginated(
                userData.accessToken,
                workspace.slug,
                workspace.type == 'User' ? 'user' : 'organization',
                paginate
            )

        const { page, pagelen } = repositories

        return {
            repositories: repositories.values || [],
            pagination: {
                page: page || paginate.page,
                perPage: pagelen || paginate.limit,
                totalCount: repositories.totalCount || null,
                hasNext: repositories.hasNext || false
            }
        }
    }

    async getAllGroups(user: any) {
        const userData = await this.dataService.users.findOne(
            { _id: user.sub },
            'accessToken _id workspaces currentWorkspace'
        )
        if (!userData?.accessToken) {
            throw new BadRequestException('Access token is required')
        }
        return await this.gitlabApiService.getAllGroups(userData?.accessToken)
    }

    async addWorkspace(
        user: any,
        addWorkspaceDto: AddWorkspaceDto
    ): Promise<Workspace> {
        const userData = await this.dataService.users.findOne(
            { _id: user.sub },
            'accessToken _id'
        )

        if (!userData?.accessToken) {
            throw new BadRequestException('Access token is required')
        }

        const workspace = await this.gitlabApiService.getSingleWorkspace(
            userData?.accessToken,
            addWorkspaceDto.slug,
            addWorkspaceDto.type
        )

        let existingWorkspace = await this.dataService.workspaces.findOne({
            id: workspace.id,
            slug: workspace.slug,
            provider: 'gitlab'
        })

        if (!existingWorkspace) {
            existingWorkspace = await this.dataService.workspaces.create({
                ...workspace,
                ownerId: userData._id
            })
        }

        if (!existingWorkspace) {
            throw new InternalServerErrorException(
                'Failed to create or update workspace'
            )
        }

        await this.dataService.users.updateOne(
            { _id: userData._id },
            {
                $set: {
                    currentWorkspace: existingWorkspace._id
                },
                $addToSet: {
                    workspaces: existingWorkspace._id
                }
            }
        )
        return existingWorkspace
    }

    async getUserRepositories(
        userId: string,
        user: any
    ): Promise<Repository[]> {
        const userData = await this.dataService.users.findOne(
            { _id: user.sub },
            'accessToken'
        )
        if (!userData?.accessToken) {
            throw new BadRequestException('Access token is required')
        }

        if (!userId) {
            throw new BadRequestException('User ID is required')
        }
        return await this.gitlabApiService.getUserRepositories(
            userData.accessToken,
            userId
        )
    }

    async addWebhook(userData: any, repository: RepositoryDto): Promise<any> {
        const webhookUrl = `${this.configService.get('BASE_URL')}/v1/gitlab/events`
        const events = [
            'push',
            'merge_requests',
            'issues',
            'note',
            'tag_push',
            'wiki_page',
            'deployment',
            'job',
            'pipeline',
            'release'
        ]

        const webhook = await this.gitlabApiService.addWebhook(
            userData?.accessToken,
            repository.id,
            webhookUrl,
            events
        )

        return {
            ...repository,
            webhookToken: webhook.id
        }
    }

    async handleOAuthCallback(code: string): Promise<any> {
        if (!code) {
            throw new BadRequestException('Authorization code is required')
        }

        try {
            const userData =
                await this.gitlabApiService.exchangeCodeForToken(code)
            return userData
        } catch (error) {
            console.error('Error in GitlabService.handleOAuthCallback:', error)
            throw error
        }
    }

    async getPullRequests(
        user: any,
        getPRDto: GetPRGitLabDto
    ): Promise<PullRequestResponse[]> {
        const userData = await this.dataService.users
            .findOne({ _id: user.sub }, 'accessToken currentWorkspace')
            .populate('currentWorkspace', 'slug type')
        if (!userData?.accessToken || !userData?.currentWorkspace) {
            throw new BadRequestException(
                'Access token is required or workspace not set'
            )
        }

        return await this.gitlabApiService.getPrList(
            userData.accessToken,
            getPRDto.repo,
            getPRDto.status,
            +getPRDto.limit
        )
    }

    async processGitlabEvent(event: any, payload: any) {
        console.log('event name', event)
        console.log('payload', payload)
        const providerId =
            payload.user_id || payload.object_attributes.author_id
        let isApplicable
        let pullRequestFormattedData: StructuredPRData | boolean = false
        let prEvent

        switch (event) {
            case 'Merge Request Hook':
                if (
                    ['open', 'update'].includes(
                        payload.object_attributes.action
                    )
                ) {
                    isApplicable =
                        await this.analysisService.checkApplicableForAnalysis(
                            payload.project.path_with_namespace,
                            payload.project.namespace.path ||
                                payload.project.path_with_namespace.split(
                                    '/'
                                )[0],
                            'gitlab',
                            providerId.toString()
                        )
                    if (!isApplicable) {
                        return {}
                    }
                    prEvent =
                        payload.object_attributes.action == 'open'
                            ? PREvent.CREATED
                            : PREvent.UPDATED
                    pullRequestFormattedData =
                        await this.gitlabEventsService.handleGitlabMergeRequest(
                            payload,
                            prEvent
                        )
                } else if (
                    ['merge', 'close'].includes(
                        payload.object_attributes.action
                    )
                ) {
                    await this.analysisService.updatedPRState(
                        {
                            repo: payload.project.path_with_namespace,
                            prNumber: payload.object_attributes.iid.toString(),
                            owner:
                                payload.project.namespace.path ||
                                payload.project.path_with_namespace.split(
                                    '/'
                                )[0],
                            provider: 'gitlab'
                        },
                        {
                            prState:
                                payload.object_attributes.action == 'merge'
                                    ? PRState.MERGED
                                    : PRState.DECLINED
                        }
                    )
                }
                break
            default:
                pullRequestFormattedData = false
        }
        if (pullRequestFormattedData) {
            this.analysisService.makeAnalysis(
                pullRequestFormattedData,
                prEvent,
                isApplicable.workspaceMember.workspace,
                isApplicable.repository
            )
        }
        return {}
    }

    async makePRReview(user: any, prReviewDto: PRReviewDto) {
        const existingAnalysis =
            await this.analysisService.getExistingPullRequestAndAnalysis(
                prReviewDto,
                'gitlab'
            )
        if (existingAnalysis) {
            return existingAnalysis
        }
        const userData = await this.dataService.users
            .findOne({ _id: user.sub })
            .populate('currentWorkspace')

        if (!userData || !userData?.currentWorkspace) {
            throw new BadRequestException(
                'User or current workspace not found or installation ID missing'
            )
        }
        const PrAndRepo = await this.gitlabApiService.getPRAndRepo(
            userData.accessToken as string,
            userData?.currentWorkspace['slug'] as string,
            prReviewDto.repo,
            +prReviewDto.prNumber
        )
        const pullRequestFormattedData: StructuredPRData =
            await this.gitlabEventsService.handleGitlabMergeRequest(
                PrAndRepo,
                PREvent.CREATED
            )

        if (!pullRequestFormattedData) {
            throw new InternalServerErrorException(
                'Failed to fetch pull request data'
            )
        }
        return await this.analysisService.makeAnalysis(
            pullRequestFormattedData,
            PREvent.CREATED,
            userData.currentWorkspace._id
        )
    }

    async getOrgMembers(user: any, query: any) {
        const userData =
            await this.analysisService.getUserDataWithWorkspace(user)

        const members = await this.gitlabApiService.getOrgMembers(userData)
        const savedMembers = await this.dataService.workspaceMembers.find({
            workspace: userData.currentWorkspace?._id
        })

        // Create a Map for O(1) lookup instead of O(n) for each member
        const savedMembersMap = new Map(
            savedMembers.map((saved: any) => [saved.providerId, saved])
        )

        // Update member list with saved member information
        const updatedMembers = members.map((member: any) => {
            const savedMember = savedMembersMap.get(member.providerId)

            // Remove the member from map after getting the data
            if (savedMember) {
                savedMembersMap.delete(member.providerId)
            }

            return {
                ...member,
                _id: savedMember?._id ?? null,
                role: savedMember?.role
                    ? savedMember.role
                    : userData.providerId == member.providerId
                      ? 'owner'
                      : 'member',
                isActive: Boolean(savedMember?.isActive),
                joinedAt: savedMember?.joinedAt
            }
        })

        // Set isActive to false for remaining members in savedMembersMap
        // These are members that exist in database but not in the current API response
        if (savedMembersMap.size > 0) {
            const remainingMemberIds = Array.from(savedMembersMap.values()).map(
                (member) => member._id
            )
            await this.dataService.workspaceMembers.updateMany(
                { _id: { $in: remainingMemberIds } },
                { $set: { isActive: false } }
            )
        }

        // Apply filter if requested
        if (query.isActive !== undefined) {
            const isActiveFilter = query.isActive === 'true'
            return updatedMembers.filter(
                (member) => member.isActive === isActiveFilter
            )
        }
        return updatedMembers
    }

    async removeWebhook(
        accessToken: string,
        repoSlug: string,
        webhookId: string
    ) {
        return await this.gitlabApiService.removeWebhook(
            accessToken,
            repoSlug, // For GitLab, this would be the project ID
            webhookId
        )
    }
}
