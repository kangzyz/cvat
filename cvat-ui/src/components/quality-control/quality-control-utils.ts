// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import {
    Job,
    JobStage,
    JobState,
    JobType,
    QualityConflict,
    QualityReport,
    QualitySettings,
    Task,
} from 'cvat-core-wrapper';

export type QualityVerdict = 'met' | 'missed' | 'insufficient';
export type QualityRiskStatus =
    'unconfigured' | 'missing' | 'stale' | 'insufficient' | 'excluded' | 'custom' | 'below' | 'healthy';

export interface ReportRule {
    metric: 'accuracy' | 'precision' | 'recall' | null;
    threshold: number | null;
    inherited: boolean;
    legacy: boolean;
}

export function formatPercent(value: number | null | undefined): string {
    return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
}

export function metricTranslationKey(metric: string | null | undefined): string {
    if (metric === 'precision') return 'quality.metrics.precision';
    if (metric === 'recall') return 'quality.metrics.recall';
    if (metric === 'accuracy') return 'quality.metrics.accuracy';
    return 'quality.fields.targetMetric';
}

export function getReportRule(
    report: QualityReport | null,
    settings: QualitySettings | null,
): ReportRule {
    const reportMetric = report?.parameters.targetMetric;
    const reportThreshold = report?.parameters.targetMetricThreshold;
    const legacy = Boolean(report && (reportMetric === null || reportThreshold === null));

    return {
        metric: reportMetric || settings?.targetMetric || null,
        threshold: reportThreshold ?? settings?.targetMetricThreshold ?? null,
        inherited: report?.parameters.inherited ?? settings?.inherit ?? false,
        legacy,
    };
}

export function getMetricScore(
    report: QualityReport | null,
    metric: ReportRule['metric'],
): number | null {
    if (!report || !metric) return null;
    const score = report.summary[metric];
    return typeof score === 'number' && Number.isFinite(score) ? score : null;
}

export function getVerdict(report: QualityReport | null, rule: ReportRule): QualityVerdict {
    const score = getMetricScore(report, rule.metric);
    const hasEvidence = Boolean(report && report.summary.validationFrames > 0);
    if (!hasEvidence || score === null || rule.threshold === null) return 'insufficient';
    return score >= rule.threshold ? 'met' : 'missed';
}

export function isDateAfter(candidate?: string | null, baseline?: string | null): boolean {
    if (!candidate || !baseline) return false;
    return Date.parse(candidate) > Date.parse(baseline);
}

export function getTaskStaleReasons(
    task: Task,
    report: QualityReport,
    settings: QualitySettings | null,
    gtJob: Job | null,
    includedJobs: Job[] = [],
): string[] {
    const reasons: string[] = [];
    if (isDateAfter(task.updatedDate, report.targetLastUpdated)) reasons.push('task');
    if (isDateAfter(settings?.updatedDate, report.createdDate)) reasons.push('settings');
    if (isDateAfter(gtJob?.updatedDate, report.gtLastUpdated)) reasons.push('groundTruth');
    if (includedJobs.some((job) => isDateAfter(job.updatedDate, report.targetLastUpdated))) {
        reasons.push('jobs');
    }
    return reasons;
}

export function getProjectStaleReasons(
    updatedDate: string,
    report: QualityReport,
    settings: QualitySettings | null,
    includedTaskRisks: Array<{ status: QualityRiskStatus }>,
): string[] {
    const reasons: string[] = [];
    if (isDateAfter(updatedDate, report.targetLastUpdated)) reasons.push('project');
    if (isDateAfter(settings?.updatedDate, report.createdDate)) reasons.push('settings');
    if (includedTaskRisks.some(({ status }) => status === 'stale')) reasons.push('tasks');
    return reasons;
}

export function isGroundTruthReady(job: Job | null | undefined): boolean {
    return Boolean(
        job && job.type === JobType.GROUND_TRUTH &&
        job.stage === JobStage.ACCEPTANCE && job.state === JobState.COMPLETED,
    );
}

export function deriveTaskRisk(
    task: Task,
    jobs: Job[],
    report: QualityReport | null,
    settings: QualitySettings | null,
    parentSettings: QualitySettings | null = null,
    includedJobReports: QualityReport[] = [],
): { status: QualityRiskStatus; score: number | null; rule: ReportRule; staleReasons: string[] } {
    const taskJobs = jobs.filter((job) => job.taskId === task.id);
    const gtJob = taskJobs.find((job) => job.type === JobType.GROUND_TRUTH) || null;
    const effectiveSettings = settings?.inherit && parentSettings ? parentSettings : settings;
    const rule = getReportRule(report, effectiveSettings);
    const score = getMetricScore(report, rule.metric);

    if (!isGroundTruthReady(gtJob) && !report) {
        return {
            status: 'unconfigured', score, rule, staleReasons: [],
        };
    }
    if (!report) {
        return {
            status: 'missing', score, rule, staleReasons: [],
        };
    }

    const staleReasons = getTaskStaleReasons(
        task,
        report,
        effectiveSettings,
        gtJob,
        taskJobs.filter((job) => (
            job.type !== JobType.GROUND_TRUTH &&
            includedJobReports.some(({ jobID }) => jobID === job.id)
        )),
    );
    if (staleReasons.length) {
        return {
            status: 'stale', score, rule, staleReasons,
        };
    }
    if (report.summary.validationFrames <= 0) {
        return {
            status: 'insufficient', score, rule, staleReasons,
        };
    }
    if (report.summary.jobs && report.summary.jobs.included <= 0) {
        return {
            status: 'excluded', score, rule, staleReasons,
        };
    }
    if (settings && !settings.inherit) {
        return {
            status: 'custom', score, rule, staleReasons,
        };
    }
    if (getVerdict(report, rule) === 'missed') {
        return {
            status: 'below', score, rule, staleReasons,
        };
    }
    return {
        status: 'healthy', score, rule, staleReasons,
    };
}

export function deriveJobRisk(
    job: Job,
    report: QualityReport | null,
    parentRule: ReportRule,
    gtJob: Job | null,
): { status: QualityRiskStatus; score: number | null; rule: ReportRule } {
    if (!report) return { status: 'missing', score: null, rule: parentRule };
    const explicitRule = getReportRule(report, null);
    const rule = explicitRule.metric && explicitRule.threshold !== null ? explicitRule : parentRule;
    const score = getMetricScore(report, rule.metric);
    if (
        isDateAfter(job.updatedDate, report.targetLastUpdated) ||
        isDateAfter(gtJob?.updatedDate, report.gtLastUpdated)
    ) {
        return { status: 'stale', score, rule };
    }
    if (report.summary.validationFrames <= 0) return { status: 'insufficient', score, rule };
    if (getVerdict(report, rule) === 'missed') return { status: 'below', score, rule };
    return { status: 'healthy', score, rule };
}

export function makeReviewURL(
    taskID: number,
    jobID: number,
    frame: number,
    conflict?: QualityConflict,
): string {
    const params = new URLSearchParams({
        frame: String(frame),
        defaultWorkspace: 'review',
    });
    const annotation = conflict?.annotationConflicts.find(({ jobID: annotationJobID }) => (
        annotationJobID === jobID
    ));
    if (annotation) {
        params.set('serverID', String(annotation.serverID));
        params.set('type', annotation.type);
    }
    return `/tasks/${taskID}/jobs/${jobID}?${params.toString()}`;
}
