// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, {
    useCallback, useEffect, useMemo, useState,
} from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Empty from 'antd/lib/empty';
import Spin from 'antd/lib/spin';

import {
    DimensionType,
    JobType,
    Project,
    QualitySettings,
    RQStatus,
    Task,
} from 'cvat-core-wrapper';
import {
    calculateQualityReportAsync,
    loadQualityConflictsAsync,
    refreshQualityReportsAsync,
    selectQualityReportAsync,
} from 'actions/quality-control-actions';
import { CombinedState } from 'reducers';
import { shallowEqual, ThunkDispatch } from 'utils/redux';
import {
    deriveTaskRisk,
    getProjectStaleReasons,
    getTaskStaleReasons,
    isGroundTruthReady,
} from './quality-control-utils';
import QualityVerdict from './overview/quality-verdict';
import QualityMetrics from './overview/quality-metrics';
import QualityEvidence from './overview/quality-evidence';
import QualityRiskTable from './overview/quality-risk-table';
import QualityEvidenceDrawer from './overview/quality-evidence-drawer';
import QualitySetupChecklist from './overview/quality-setup-checklist';
import QualityHistory from './overview/quality-history';
import ManualIssuesSummary from './overview/manual-issues-summary';

interface Props {
    instance: Project | Task;
    qualitySettings: {
        settings: QualitySettings | null;
        childrenSettings: QualitySettings[] | null;
    };
}

interface DrawerState {
    open: boolean;
    reportID: number | null;
    context: string;
    filter: { severity?: 'error' | 'warning'; conflictType?: string };
}

function BuiltInQualityOverview(): JSX.Element {
    const { t } = useTranslation('qualityReviewModels');
    const dispatch = useDispatch<ThunkDispatch>();
    const state = useSelector((combined: CombinedState) => combined.qualityControl);
    const [drawer, setDrawer] = useState<DrawerState>({
        open: false,
        reportID: null,
        context: '',
        filter: {},
    });
    const {
        resourceKey,
        instance,
        tasks,
        jobs,
        gtJob,
        validationLayout,
        issues,
        settings,
        reports,
        calculation,
    } = state;
    const report = reports.history.find(({ id }) => id === reports.selectedID) || null;
    const latestReportID = reports.history[0]?.id || null;
    const details = report ? reports.detailsByID[report.id] : null;
    const effectiveSettings = instance instanceof Task && settings.current?.inherit ?
        settings.parent || settings.current : settings.current;
    const activeFrames = validationLayout ? Math.max(
        0, validationLayout.validationFrames.length - validationLayout.disabledFrames.length,
    ) : 0;
    const taskEligible = instance instanceof Task &&
        instance.dimension === DimensionType.DIMENSION_2D &&
        isGroundTruthReady(gtJob) && activeFrames > 0;
    const canCalculate = instance instanceof Project ? tasks.length > 0 : taskEligible;
    const calculating = calculation.submitting || Boolean(
        calculation.request && [RQStatus.QUEUED, RQStatus.STARTED].includes(calculation.request.status),
    );

    useEffect(() => {
        setDrawer({
            open: false,
            reportID: null,
            context: '',
            filter: {},
        });
    }, [resourceKey]);

    const projectTaskRisks = useMemo(() => {
        if (!(instance instanceof Project) || !details) return [];
        return tasks.map((task) => {
            const childReport = details.children.find(({ taskID }) => taskID === task.id) || null;
            const childSettings = settings.children.find(({ taskId }) => taskId === task.id) || null;
            return {
                ...deriveTaskRisk(
                    task,
                    jobs,
                    childReport,
                    childSettings,
                    settings.current,
                    details.jobReports,
                ),
                inherited: Boolean(childSettings?.inherit),
            };
        });
    }, [instance, details, tasks, jobs, settings.current, settings.children]);

    const staleReasons = useMemo(() => {
        if (!instance || !report) return [];
        if (instance instanceof Project) {
            return getProjectStaleReasons(
                instance.updatedDate,
                report,
                settings.current,
                projectTaskRisks.filter(({ inherited }) => inherited),
            );
        }
        return getTaskStaleReasons(
            instance,
            report,
            effectiveSettings,
            gtJob,
            jobs.filter((job) => (
                job.type !== JobType.GROUND_TRUTH &&
                Boolean(details?.jobReports.some(({ jobID }) => jobID === job.id))
            )),
        );
    }, [instance, report, settings.current, effectiveSettings, projectTaskRisks, gtJob, jobs, details]);

    const coverageFacts = useMemo(() => {
        if (!report) return [];
        if (instance instanceof Project && report.summary.tasks) {
            const {
                included, total, custom, notConfigured, excluded,
            } = report.summary.tasks;
            const result = [t('quality.overview.coverage.project', { included, total })];
            const attention = projectTaskRisks.filter(({ status }) => (
                !['healthy', 'custom'].includes(status)
            )).length;
            if (attention) result.push(t('quality.overview.coverage.projectAttention', { count: attention }));
            const partial = custom + notConfigured + excluded;
            if (partial) result.push(t('quality.overview.coverage.projectPartial', { count: partial }));
            return result;
        }
        const result = [t('quality.overview.coverage.task', {
            validation: report.summary.validationFrames,
            total: report.summary.totalFrames,
        })];
        if (report.summary.jobs && report.summary.jobs.included < report.summary.jobs.total) {
            result.push(t('quality.overview.coverage.jobsPartial', {
                included: report.summary.jobs.included,
                total: report.summary.jobs.total,
            }));
            if (report.summary.jobs.excluded) {
                result.push(t('quality.overview.coverage.jobsExcluded', {
                    count: report.summary.jobs.excluded,
                }));
            }
            if (report.summary.jobs.notCheckable) {
                result.push(t('quality.overview.coverage.jobsNotCheckable', {
                    count: report.summary.jobs.notCheckable,
                }));
            }
        }
        return result;
    }, [instance, report, projectTaskRisks, t]);

    const calculate = useCallback(() => {
        if (resourceKey) dispatch(calculateQualityReportAsync(resourceKey));
    }, [dispatch, resourceKey]);

    const openEvidence = useCallback((
        reportID: number,
        context: string,
        filter: DrawerState['filter'] = {},
    ) => {
        setDrawer({
            open: true, reportID, context, filter,
        });
        if (resourceKey) dispatch(loadQualityConflictsAsync(resourceKey, reportID));
    }, [dispatch, resourceKey]);

    if (!instance || !resourceKey) return <Empty />;

    const setup = instance instanceof Task ? (
        <QualitySetupChecklist
            task={instance}
            gtJob={gtJob}
            validationLayout={validationLayout}
            reportExists={Boolean(report)}
            calculating={calculating}
            calculationRequest={calculation.request}
            calculationError={calculation.error}
            onCalculate={calculate}
        />
    ) : null;
    const showWorkspace = Boolean(report) || instance instanceof Project;
    let calculateDisabledReason: string | undefined;
    if (!canCalculate) {
        calculateDisabledReason = instance instanceof Task ?
            t('quality.overview.actions.completeSetupFirst') :
            t('quality.overview.emptyProjectDescription');
    }
    let detailsContent: JSX.Element | null = null;
    if (report && details?.error) {
        detailsContent = (
            <Alert
                type='error'
                showIcon
                message={t('quality.overview.detailsFailed')}
                description={details.error.message}
                action={(
                    <Button onClick={() => dispatch(selectQualityReportAsync(resourceKey, report.id))}>
                        {t('quality.overview.actions.retry')}
                    </Button>
                )}
            />
        );
    } else if (details?.fetching) {
        detailsContent = <div className='cvat-quality-details-loading'><Spin /></div>;
    } else if (report && details) {
        detailsContent = (
            <QualityRiskTable
                instance={instance}
                tasks={tasks}
                jobs={jobs}
                report={report}
                childReports={details.children}
                jobReports={details.jobReports}
                settings={effectiveSettings}
                childrenSettings={settings.children}
                onOpenEvidence={(reportID, context) => openEvidence(reportID, context)}
            />
        );
    }

    return (
        <div className='cvat-quality-overview-tab'>
            {setup}

            {instance instanceof Project && tasks.length === 0 && (
                <Alert
                    className='cvat-quality-overview-alert'
                    type='info'
                    showIcon
                    message={t('quality.overview.emptyProjectTitle')}
                    description={t('quality.overview.emptyProjectDescription')}
                    action={(
                        <Link to={`/tasks/create?projectId=${instance.id}`}>
                            {t('quality.overview.actions.createTask')}
                        </Link>
                    )}
                />
            )}

            {reports.error && (
                <Alert
                    className='cvat-quality-overview-alert'
                    type='error'
                    showIcon
                    message={t('quality.overview.loadFailed')}
                    description={reports.error.message}
                    action={(
                        <Button onClick={() => dispatch(refreshQualityReportsAsync(resourceKey))}>
                            {t('quality.overview.actions.reload')}
                        </Button>
                    )}
                />
            )}

            {showWorkspace && (
                <>
                    <QualityVerdict
                        report={report}
                        latestReportID={latestReportID}
                        settings={effectiveSettings}
                        staleReasons={staleReasons}
                        coverageFacts={coverageFacts}
                        calculation={calculation}
                        canCalculate={canCalculate}
                        calculateDisabledReason={calculateDisabledReason}
                        onCalculate={calculate}
                        onReturnLatest={() => {
                            if (latestReportID) dispatch(selectQualityReportAsync(resourceKey, latestReportID));
                        }}
                    />

                    {report && (
                        <>
                            <QualityMetrics report={report} />
                            <QualityEvidence
                                report={report}
                                onOpenEvidence={(severity, conflictType) => openEvidence(
                                    report.id,
                                    instance.name,
                                    { severity, conflictType },
                                )}
                            />

                            {detailsContent}
                        </>
                    )}
                </>
            )}

            {instance instanceof Task && <ManualIssuesSummary task={instance} issues={issues} />}

            {reports.history.length > 0 && (
                <QualityHistory
                    history={reports.history}
                    selectedID={reports.selectedID}
                    settings={effectiveSettings}
                    onSelect={(reportID) => dispatch(selectQualityReportAsync(resourceKey, reportID))}
                />
            )}

            <QualityEvidenceDrawer
                open={drawer.open}
                context={drawer.context}
                reportID={drawer.reportID}
                filter={drawer.filter}
                conflictState={drawer.reportID ? reports.conflictsByReportID[drawer.reportID] : undefined}
                instance={instance}
                jobs={jobs}
                jobReports={details?.jobReports || []}
                onClose={() => setDrawer((current) => ({ ...current, open: false }))}
                onResetFilter={() => setDrawer((current) => ({ ...current, filter: {} }))}
                onRetry={() => {
                    if (drawer.reportID) dispatch(loadQualityConflictsAsync(resourceKey, drawer.reportID));
                }}
            />
        </div>
    );
}

function QualityOverviewTabWrap(props: Readonly<Props>): JSX.Element {
    const { instance } = props;
    const { taskOverrides, projectOverrides } = useSelector((state: CombinedState) => ({
        taskOverrides: state.plugins.overridableComponents.qualityControlPage.task.overviewTab,
        projectOverrides: state.plugins.overridableComponents.qualityControlPage.project.overviewTab,
    }), shallowEqual);

    if (instance instanceof Task && taskOverrides.length) {
        const [Component] = taskOverrides.slice(-1);
        return <Component {...props} instance={instance} />;
    }

    if (instance instanceof Project && projectOverrides.length) {
        const [Component] = projectOverrides.slice(-1);
        return <Component {...props} instance={instance} />;
    }

    return <BuiltInQualityOverview />;
}

export default React.memo(QualityOverviewTabWrap);
