import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PaginateDto } from 'src/common/dto/paginate.dto'
import { OrgType } from 'src/common/enums/org.enum'
import { HttpService } from 'src/common/http/http.service'
import {
    PullRequestResponse,
    Repository
} from 'src/common/interfaces/repository.interface'
import { Workspace } from 'src/database/schemas/workspace.schema'

@Injectable()
export class GitlabApiService {
    private readonly baseUrl = 'https://gitlab.com/api/v4'
    private readonly oauthBaseUrl = 'https://gitlab.com/oauth'

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService
    ) {}

    /**
     * Get authorization headers for GitLab API
     */
    private getAuthHeaders(accessToken: string) {
        return {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    }

    /**
     * Get all repositories for the authenticated user
     */
    async getAllRepositories(
        accessToken: string,
        slug: string,
        type: string
    ): Promise<Repository[]> {
        if (slug && type === OrgType.ORGANIZATION) {
            return await this.getGroupRepositories(accessToken, slug)
        } else if (slug && type === OrgType.USER) {
            return await this.getUserRepositories(accessToken, slug)
        } else {
            let allRepositories: Repository[] = []
            let page = 1
            const perPage = 100

            // Paginate through all repositories
            while (true) {
                const projects = await this.httpService.get(
                    `${this.baseUrl}/projects?membership=true&per_page=${perPage}&page=${page}&order_by=updated_at&sort=desc`,
                    {
                        headers: this.getAuthHeaders(accessToken)
                    }
                )

                // If no projects returned, we've reached the end
                if (
                    !projects ||
                    !Array.isArray(projects) ||
                    projects.length === 0
                ) {
                    break
                }

                // Map and add repositories from current page
                const repositories: Repository[] = projects.map(
                    (project: any) =>
                        ({
                            id: project.id.toString(),
                            name: project.name,
                            fullName: project.path_with_namespace,
                            slug: project.path_with_namespace,
                            createdOn: project.created_at,
                            updatedOn:
                                project.last_activity_at || project.updated_at,
                            author: {
                                username:
                                    project.owner?.username ||
                                    project.namespace?.name ||
                                    'unknown',
                                avatarUrl: project.owner?.avatar_url || null
                            },
                            private: project.visibility === 'private',
                            openIssues: project.open_issues_count
                        }) as Repository
                )

                allRepositories.push(...repositories)

                // If we got less than perPage items, we've reached the end
                if (projects.length < perPage) {
                    break
                }

                page++
            }

            return allRepositories
        }
    }

    /**
     * Get a specific repository
     */
    async getRepository(accessToken: string, projectId: string): Promise<any> {
        return await this.httpService.get(
            `${this.baseUrl}/projects/${encodeURIComponent(projectId)}`,
            {
                headers: this.getAuthHeaders(accessToken)
            }
        )
    }

    /**
     * Get user profile information
     */
    async getUserProfile(accessToken: string): Promise<any> {
        return await this.httpService.get(`${this.baseUrl}/user`, {
            headers: this.getAuthHeaders(accessToken)
        })
    }

    /**
     * Get all groups (equivalent to workspaces in Bitbucket)
     */
    async getAllGroups(accessToken: string): Promise<Workspace[]> {
        const userProfile = await this.getUserProfile(accessToken)
        const groups = await this.httpService.get(
            `${this.baseUrl}/groups?owned=true&per_page=100&order_by=name&sort=asc`,
            {
                headers: this.getAuthHeaders(accessToken)
            }
        )

        const transformedGroups = groups.map(
            (group: any) =>
                ({
                    id: group.id.toString(),
                    name: group.name,
                    slug: group.path,
                    provider: 'gitlab',
                    url: group.web_url,
                    reposUrl: `${this.baseUrl}/groups/${group.id}/projects`,
                    avatarUrl: group.avatar_url || null,
                    type: OrgType.ORGANIZATION,
                    nodeId: `GL_${group.id}`,
                    description: group.description || '',
                    isPrivate: group.visibility === 'private',
                    createdOn: group.created_at
                }) as Workspace
        )

        // Add user profile as the first organization (personal workspace)
        const personalWorkspace: Workspace = {
            id: userProfile.id.toString(),
            name: userProfile.name || userProfile.username,
            slug: userProfile.username,
            provider: 'gitlab',
            url: userProfile.web_url,
            reposUrl: `${this.baseUrl}/users/${userProfile.id}/projects`,
            avatarUrl: userProfile.avatar_url || null,
            type: OrgType.USER,
            nodeId: `GL_${userProfile.id}`,
            createdOn: userProfile.created_at,
            isPrivate: false
        }

        // Put personal workspace first, then all groups
        const finalGroups = [personalWorkspace, ...transformedGroups]

        return finalGroups
    }

    /**
     * Get a single workspace by slug
     * @param accessToken - The access token of the user
     * @param slug - The slug of the workspace to fetch
     */
    async getSingleWorkspace(
        accessToken: string,
        slug: string,
        type: string
    ): Promise<Workspace> {
        if (type == OrgType.ORGANIZATION) {
            const encodedId = encodeURIComponent(slug)
            const url = `${this.baseUrl}/groups/${encodedId}`
            const group = await this.httpService.get(url, {
                headers: this.getAuthHeaders(accessToken)
            })
            return {
                id: group.id.toString(),
                name: group.name,
                slug: group.path,
                provider: 'gitlab',
                url: group.web_url,
                reposUrl: `${this.baseUrl}/groups/${group.id}/projects`,
                avatarUrl: group.avatar_url || null,
                type: OrgType.ORGANIZATION,
                nodeId: `GL_${group.id}`,
                description: group.description || '',
                isPrivate: group.visibility === 'private',
                createdOn: group.created_at
            }
        } else {
            const userProfile = await this.getUserProfile(accessToken)
            return {
                id: userProfile.id.toString(),
                name: userProfile.name || userProfile.username,
                slug: userProfile.username,
                provider: 'gitlab',
                url: userProfile.web_url,
                reposUrl: `${this.baseUrl}/users/${userProfile.id}/projects`,
                avatarUrl: userProfile.avatar_url || null,
                type: OrgType.USER,
                nodeId: `GL_${userProfile.id}`,
                createdOn: userProfile.created_at,
                isPrivate: false
            }
        }
    }

    /**
     * Get repositories for a specific group
     */
    async getGroupRepositories(
        accessToken: string,
        groupId: string
    ): Promise<Repository[]> {
        let allRepositories: Repository[] = []
        let page = 1
        const perPage = 100

        // Paginate through all repositories
        while (true) {
            const projects = await this.httpService.get(
                `${this.baseUrl}/groups/${encodeURIComponent(groupId)}/projects?per_page=${perPage}&page=${page}&order_by=updated_at&sort=desc`,
                {
                    headers: this.getAuthHeaders(accessToken)
                }
            )

            // If no projects returned, we've reached the end
            if (
                !projects ||
                !Array.isArray(projects) ||
                projects.length === 0
            ) {
                break
            }

            // Map and add repositories from current page
            const repositories: Repository[] = projects.map(
                (project: any) =>
                    ({
                        id: project.id.toString(),
                        name: project.name,
                        fullName: project.path_with_namespace,
                        slug: project.path_with_namespace,
                        createdOn: project.created_at,
                        updatedOn:
                            project.last_activity_at || project.updated_at,
                        author: {
                            username: project.namespace?.path,
                            avatarUrl: project.namespace?.avatar_url
                        },
                        private: project.visibility === 'private',
                        openIssues: project.open_issues_count
                    }) as Repository
            )

            allRepositories.push(...repositories)

            // If we got less than perPage items, we've reached the end
            if (projects.length < perPage) {
                break
            }

            page++
        }

        return allRepositories
    }

    /**
     * Get repositories for a specific user (personal repositories)
     */
    async getUserRepositories(
        accessToken: string,
        userId: string
    ): Promise<Repository[]> {
        let allRepositories: Repository[] = []
        let page = 1
        const perPage = 100

        // Paginate through all repositories
        while (true) {
            const projects = await this.httpService.get(
                `${this.baseUrl}/users/${encodeURIComponent(userId)}/projects?per_page=${perPage}&page=${page}&order_by=updated_at&sort=desc`,
                {
                    headers: this.getAuthHeaders(accessToken)
                }
            )

            console.log(`Page ${page} Projects:`, projects?.length || 0)

            // If no projects returned, we've reached the end
            if (
                !projects ||
                !Array.isArray(projects) ||
                projects.length === 0
            ) {
                break
            }

            // Map and add repositories from current page
            const repositories: Repository[] = projects.map(
                (project: any) =>
                    ({
                        id: project.id.toString(),
                        name: project.name,
                        fullName: project.path_with_namespace,
                        slug: project.path_with_namespace,
                        createdOn: project.created_at,
                        updatedOn:
                            project.last_activity_at || project.updated_at,
                        author: {
                            username: project.namespace?.path,
                            avatarUrl: project.namespace?.avatar_url || null
                        },
                        private: project.visibility === 'private',
                        openIssues: project.open_issues_count
                    }) as Repository
            )

            allRepositories.push(...repositories)

            // If we got less than perPage items, we've reached the end
            if (projects.length < perPage) {
                break
            }

            page++
        }

        console.log('Total repositories found:', allRepositories.length)
        return allRepositories
    }

    /**
     * Get repositories for a specific workspace (group or user) with pagination
     */
    async getWorkspaceRepositoriesPaginated(
        accessToken: string,
        workspaceSlug: string,
        workspaceType: string, // 'organization' or 'user'
        paginate: PaginateDto
    ): Promise<any> {
        let url: string
        if (workspaceType === 'organization') {
            url = `${this.baseUrl}/groups/${encodeURIComponent(workspaceSlug)}/projects?per_page=${paginate.limit}&page=${paginate.page}&order_by=updated_at&sort=desc`
        } else {
            url = `${this.baseUrl}/users/${encodeURIComponent(workspaceSlug)}/projects?per_page=${paginate.limit}&page=${paginate.page}&order_by=updated_at&sort=desc`
        }

        const response = await this.httpService.get(url, {
            headers: this.getAuthHeaders(accessToken)
        })
        // Transform repositories to match the expected format
        const repositories: Repository[] = response.map(
            (project: any) =>
                ({
                    id: project.id.toString(),
                    name: project.name,
                    fullName: project.path_with_namespace,
                    slug: project.path_with_namespace,
                    createdOn: project.created_at,
                    updatedOn: project.last_activity_at || project.updated_at,
                    author: {
                        username: project.namespace?.path,
                        avatarUrl: project.namespace?.avatar_url || null
                    },
                    private: project.visibility === 'private',
                    openIssues: project.open_issues_count
                }) as Repository
        )

        return {
            values: repositories,
            totalCount: repositories.length,
            hasNext: repositories.length === paginate.limit
        }
    }
    /**
     * Add webhook to a repository
     */
    async addWebhook(
        accessToken: string,
        slug: string,
        webhookUrl: string,
        events: string[]
    ): Promise<any> {
        const gitlabEvents = {
            push_events:
                events.includes('push_events') ||
                events.includes('push') ||
                events.includes('repo:push'),
            merge_requests_events:
                events.includes('merge_requests_events') ||
                events.includes('merge_requests') ||
                events.includes('pullrequest:created') ||
                events.includes('pullrequest:updated'),
            issues_events:
                events.includes('issues_events') ||
                events.includes('issues') ||
                events.includes('issue:created') ||
                events.includes('issue:updated'),
            note_events:
                events.includes('note_events') ||
                events.includes('note') ||
                events.includes('issue:comment_created'),
            tag_push_events:
                events.includes('tag_push_events') ||
                events.includes('tag_push'),
            wiki_page_events:
                events.includes('wiki_page_events') ||
                events.includes('wiki_page'),
            deployment_events:
                events.includes('deployment_events') ||
                events.includes('deployment'),
            job_events: events.includes('job_events') || events.includes('job'),
            pipeline_events:
                events.includes('pipeline_events') ||
                events.includes('pipeline'),
            release_events:
                events.includes('release_events') || events.includes('release'),
            confidential_issues_events:
                events.includes('confidential_issues_events') ||
                events.includes('confidential_issues')
        }

        const webhookData = {
            url: webhookUrl,
            ...gitlabEvents,
            enable_ssl_verification: true
        }

        return await this.httpService.post(
            `${this.baseUrl}/projects/${encodeURIComponent(slug)}/hooks`,
            webhookData,
            {
                headers: this.getAuthHeaders(accessToken)
            }
        )
    }

    /**
     * Exchange authorization code for access token
     */
    async exchangeCodeForToken(code: string): Promise<any> {
        try {
            const clientId = this.configService.get('GITLAB_CLIENT_ID')
            const clientSecret = this.configService.get('GITLAB_CLIENT_SECRET')
            const redirectUri = this.configService.get('GITLAB_REDIRECT_URI')

            if (!clientId || !clientSecret || !redirectUri) {
                throw new HttpException(
                    'GitLab OAuth configuration is missing',
                    HttpStatus.INTERNAL_SERVER_ERROR
                )
            }

            const tokenData = {
                client_id: clientId,
                client_secret: clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri
            }

            const response = await this.httpService.post(
                `${this.oauthBaseUrl}/token`,
                tokenData,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        Accept: 'application/json'
                    }
                }
            )

            if (response.access_token) {
                // Get user profile with the access token
                const userProfile = await this.getUserProfile(
                    response.access_token
                )

                return {
                    accessToken: response.access_token,
                    refreshToken: response.access_token,
                    tokenType: response.access_token,
                    expiresIn: response.access_token,
                    scope: response.access_token,
                    user: userProfile
                }
            } else {
                throw new HttpException(
                    'Failed to exchange code for access token',
                    HttpStatus.BAD_REQUEST
                )
            }
        } catch (error) {
            console.error(
                'Error in GitlabApiService.exchangeCodeForToken:',
                error
            )
            throw error
        }
    }

    /**
     * Get merge requests (pull requests) for a repository
     */
    async getPrList(
        accessToken: string,
        slug: string,
        state?: string,
        limit?: number
    ): Promise<PullRequestResponse[]> {
        const params = new URLSearchParams()
        if (state) {
            params.append('state', state.toLowerCase())
        }
        if (limit) {
            params.append('per_page', limit.toString())
        }
        params.append('order_by', 'updated_at')
        params.append('sort', 'desc')

        const mergeRequests = await this.httpService.get(
            `${this.baseUrl}/projects/${encodeURIComponent(slug)}/merge_requests?${params.toString()}`,
            {
                headers: this.getAuthHeaders(accessToken)
            }
        )
        return mergeRequests.map(
            (mr: any) =>
                ({
                    provider: 'github',
                    prId: mr.id,
                    prNumber: mr.iid,
                    prTitle: mr.title,
                    prState: mr.state,
                    prUser: mr.author?.username || 'unknown',
                    prUserAvatar: mr.author?.avatar_url || '',
                    prCreatedAt: mr.created_at,
                    prUpdatedAt: mr.updated_at,
                    prClosedAt: mr.closed_at,
                    prMergedAt: mr.merged_at,
                    prUrl: mr.web_url
                }) as PullRequestResponse
        )
    }

    async refreshAccessToken(refreshToken: string): Promise<{
        access_token: string
        refresh_token?: string
        expires_in: number
    } | null> {
        const gitlabTokenUrl =
            this.configService.get('GITLAB_TOKEN_URL') ||
            'https://gitlab.com/oauth/token'
        const clientId = this.configService.get('GITLAB_CLIENT_ID')
        const clientSecret = this.configService.get('GITLAB_CLIENT_SECRET')

        if (!clientId || !clientSecret) {
            console.error('GitLab client credentials not configured')
            return null
        }

        const response = await this.httpService.post(
            gitlabTokenUrl,
            {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        )
        return response
    }

    /**
     *  Get pull request and repository details by ID
     *  @param accessToken - The access token of the user
     *  @param workspace - The workspace slug
     *  @param repo - The repository slug
     * @param prId - The pull request ID
     */
    async getPRAndRepo(
        accessToken: string,
        workspace: string,
        repo: string,
        prId: number
    ) {
        const object_attributes = await this.httpService.get(
            `${this.baseUrl}/projects/${encodeURIComponent(repo)}/merge_requests/${prId}`,
            {
                headers: this.getAuthHeaders(accessToken)
            }
        )
        const project = await this.httpService.get(
            `${this.baseUrl}/projects/${encodeURIComponent(repo)}`,
            {
                headers: this.getAuthHeaders(accessToken)
            }
        )
        return {
            object_attributes,
            project
        }
    }

    /**
     * Get group/project members for GitLab
     */
    async getOrgMembers(userData: any) {
        const { accessToken, currentWorkspace } = userData
        let allMembers: any[] = []

        // GitLab API endpoint differs for groups vs projects
        let url: string
        if (currentWorkspace.type == OrgType.USER) {
            return [
                {
                    provider: 'gitlab',
                    providerId: userData.providerId,
                    username: userData.username,
                    displayName: userData.displayName,
                    avatarUrl: userData.avatarUrl
                }
            ]
            // url = `${this.baseUrl}/projects/${encodeURIComponent(workspace.slug)}/members/all?per_page=100`
        } else {
            url = `${this.baseUrl}/groups/${encodeURIComponent(currentWorkspace.slug)}/members/all?per_page=100`
        }

        const response = await this.httpService.get(url, {
            headers: this.getAuthHeaders(accessToken)
        })

        if (Array.isArray(response)) {
            response.forEach((member) => {
                allMembers.push({
                    provider: 'gitlab',
                    providerId: member.id.toString(),
                    username: member.username,
                    displayName: member.name,
                    avatarUrl: member.avatar_url
                })
            })
        }
        return allMembers
    }

    /**
     * Remove webhook from a specific GitLab project
     */
    async removeWebhook(
        accessToken: string,
        projectId: string,
        webhookId: string
    ): Promise<any> {
        const apiEndpoint = `${this.baseUrl}/projects/${projectId}/hooks/${webhookId}`

        await this.httpService.delete(apiEndpoint, {
            headers: this.getAuthHeaders(accessToken)
        })
        return {
            message: 'Webhook successfully removed!',
            projectId,
            webhookId
        }
    }
}
