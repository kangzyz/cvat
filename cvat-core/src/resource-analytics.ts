// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

export type ResourceAnalyticsType = 'project' | 'task' | 'job';
export type ResourceAnalyticsBucket = 'auto' | 'hour' | 'day' | 'week' | 'month';
export type ResourceAnalyticsResolvedBucket = Exclude<ResourceAnalyticsBucket, 'auto'>;

export interface ResourceAnalyticsActivityFilter {
    from?: string;
    to?: string;
    bucket?: ResourceAnalyticsBucket;
    userId?: number;
    refresh?: boolean;
}

export interface ResourceAnalyticsEventsFilter extends Omit<ResourceAnalyticsActivityFilter, 'refresh'> {
    page?: number;
    pageSize?: number;
}

export interface ResourceAnalyticsExportFilter {
    from?: string;
    to?: string;
    userId?: number;
    filename?: string;
}

export interface ResourceAnalyticsResource {
    type: ResourceAnalyticsType;
    id: number;
    name: string;
    projectId: number | null;
    taskId: number | null;
    owner: string | null;
    assignee: string | null;
    organizationId: number | null;
    createdDate: string;
    updatedDate: string;
}

export interface ResourceAnalyticsInventory {
    frames: number;
    logicalObjects: number;
    shapes: number;
    tracks: number;
    tags: number;
    intervals: number;
    keyframes: number;
    interpolatedFrames: number;
}

export interface ResourceAnalyticsJobProgress {
    total: number;
    completed: number;
    percent: number;
    byStage: Record<string, number>;
    byState: Record<string, number>;
}

export interface ResourceAnalyticsProgress {
    mode: 'jobs' | 'workflow';
    annotationJobs: ResourceAnalyticsJobProgress | null;
    groundTruthJobs: number;
    consensusJobs: number;
    job: {
        type: string;
        stage: string;
        state: string;
    } | null;
}

export interface ResourceAnalyticsQuality {
    available: boolean;
    reportId: number | null;
    accuracy: number | null;
    precision: number | null;
    recall: number | null;
    conflicts: number;
    errors: number;
    warnings: number;
    validationFrames: number;
    totalFrames: number;
    validationFrameShare: number | null;
    createdDate: string | null;
    targetLastUpdated: string | null;
    stale: boolean;
}

export interface ResourceAnalyticsChild {
    resourceType: 'task' | 'job' | 'frame';
    id: number;
    name: string;
    projectId: number | null;
    taskId: number | null;
    jobId: number | null;
    jobType: string | null;
    stage: string | null;
    state: string | null;
    assignee: string | null;
    frames: number;
    annotationJobsTotal: number;
    annotationJobsCompleted: number;
    completionPercent: number | null;
    logicalObjects: number;
    openIssues: number;
    qualityAccuracy: number | null;
    issueCount: number;
    conflictCount: number;
    updatedDate: string | null;
}

export interface ResourceAnalyticsOverview {
    resource: ResourceAnalyticsResource;
    freshness: {
        snapshotAt: string;
        qualityAt: string | null;
        qualityStale: boolean;
        activityConfigured: boolean;
    };
    progress: ResourceAnalyticsProgress;
    inventory: ResourceAnalyticsInventory;
    issues: {
        total: number;
        open: number;
        resolved: number;
    };
    quality: ResourceAnalyticsQuality;
    risks: {
        unassignedJobs: number;
        inactiveAgeSeconds: number;
        stageBacklog: Record<string, number>;
        openIssues: number;
        rejectedJobs: number;
        qualityAccuracy: number | null;
    };
    childrenCount: number;
    children: ResourceAnalyticsChild[];
}

export interface ResourceAnalyticsAnnotations {
    snapshotAt: string;
    totals: ResourceAnalyticsInventory;
    byLabel: Array<{
        labelId: number;
        label: string;
        shapes: number;
        tracks: number;
        tags: number;
        intervals: number;
        keyframes: number;
        interpolatedFrames: number;
        total: number;
    }>;
    byType: Array<{ name: string; count: number }>;
    bySource: Array<{ name: string; count: number }>;
    frameDensity: Array<{
        jobId: number;
        taskId: number;
        startFrame: number;
        stopFrame: number;
        objectCount: number;
        issueCount: number;
        conflictCount: number;
    }>;
}

export interface ResourceAnalyticsAvailability {
    available: boolean;
    reason: string | null;
    queriedAt: string;
    maxEventAt: string | null;
}

export interface ResourceAnalyticsRange {
    startDate: string;
    endDate: string;
    bucket: ResourceAnalyticsResolvedBucket;
    timezone: 'UTC' | string;
}

export interface ResourceAnalyticsContributorScope {
    mode: 'all' | 'self' | 'filtered';
    userId: number | null;
}

export interface ResourceAnalyticsActivitySummary {
    workingTimeMs: number;
    createdObjects: number;
    updatedObjects: number;
    deletedObjects: number;
    netObjects: number;
    objectsPerActiveHour: number | null;
    reviewRejections: number;
    activeContributors: number;
}

export interface ResourceAnalyticsActivity {
    availability: ResourceAnalyticsAvailability;
    range: ResourceAnalyticsRange;
    contributorScope: ResourceAnalyticsContributorScope;
    summary: ResourceAnalyticsActivitySummary;
    series: Array<ResourceAnalyticsActivitySummary & { bucketStart: string }>;
    contributors: Array<ResourceAnalyticsActivitySummary & {
        userId: number | null;
        userName: string | null;
        lastActivityAt: string | null;
    }>;
    workflow: {
        transitions: Array<{
            jobId: number | null;
            field: 'stage' | 'state' | 'assignee';
            oldValue: string | null;
            newValue: string | null;
            timestamp: string;
            userId: number | null;
            userName: string | null;
        }>;
        dwellTimeByStage: Record<string, number>;
        dwellTimeByState: Record<string, number>;
        firstActivityAt: string | null;
        lastActivityAt: string | null;
    };
}

export interface ResourceAnalyticsEvent {
    scope: string;
    objName: string | null;
    objId: number | null;
    objVal: string | null;
    timestamp: string;
    endTimestamp: string;
    count: number | null;
    duration: number;
    workingTimeMs: number;
    createdObjects: number;
    updatedObjects: number;
    deletedObjects: number;
    projectId: number | null;
    taskId: number | null;
    jobId: number | null;
    userId: number | null;
    userName: string | null;
    jobType: string | null;
    assignee: string | null;
    stage: string | null;
    state: string | null;
    payload: unknown;
    resourceExists: boolean;
    resourceName: string | null;
}

export interface ResourceAnalyticsEvents {
    availability: ResourceAnalyticsAvailability;
    range: ResourceAnalyticsRange;
    contributorScope: ResourceAnalyticsContributorScope;
    count: number;
    page: number;
    pageSize: number;
    results: ResourceAnalyticsEvent[];
}

export interface APIResourceAnalyticsFilter {
    from?: string;
    to?: string;
    bucket?: ResourceAnalyticsBucket;
    user_id?: number;
    refresh?: boolean;
    page?: number;
    page_size?: number;
    filename?: string;
}

function camelizeKey(key: string): string {
    return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function camelizeResourceAnalytics<T>(value: unknown): T {
    if (Array.isArray(value)) {
        return value.map((item) => camelizeResourceAnalytics(item)) as T;
    }

    if (value !== null && typeof value === 'object') {
        const converted = Object.fromEntries(Object.entries(value).map(([key, item]) => [
            camelizeKey(key),
            key === 'payload' ? item : camelizeResourceAnalytics(item),
        ]));
        return converted as T;
    }

    return value as T;
}
