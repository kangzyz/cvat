// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from 'antd/lib/alert';
import Progress from 'antd/lib/progress';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';

import { ResourceAnalyticsChild, ResourceAnalyticsOverview } from 'cvat-core-wrapper';
import CVATTable from 'components/common/cvat-table';
import {
    formatDate, formatNumber, formatPercent, formatSeconds, MetricItem, MetricStrip, SectionState,
} from './analytics-report-shared';

interface Props {
    data: ResourceAnalyticsOverview | null;
    fetching: boolean;
    error: string | null;
    onRetry(): void;
}

function childLink(child: ResourceAnalyticsChild): string | null {
    if (child.resourceType === 'task') return `/tasks/${child.taskId}/analytics`;
    if (child.resourceType === 'job') return `/tasks/${child.taskId}/jobs/${child.jobId}/analytics`;
    if (child.resourceType === 'frame') return `/tasks/${child.taskId}/jobs/${child.jobId}?frame=${child.id}`;
    return null;
}

function AnalyticsOverview(props: Props): JSX.Element {
    const {
        data, fetching, error, onRetry,
    } = props;
    const { t } = useTranslation('resources');

    if (!data) {
        return (
            <SectionState
                fetching={fetching}
                error={error}
                empty
                onRetry={onRetry}
                emptyDescription={t('analytics.empty.overview')}
            >
                {null}
            </SectionState>
        );
    }

    const { annotationJobs } = data.progress;
    const metrics: MetricItem[] = [
        annotationJobs ? {
            label: t('analytics.metrics.completion'),
            value: formatPercent(annotationJobs.percent),
            note: t('analytics.notes.ordinaryJobs', {
                completed: annotationJobs.completed,
                total: annotationJobs.total,
            }),
        } : {
            label: t('analytics.metrics.workflow'),
            value: t(`jobState.${data.progress.job?.state === 'in progress' ? 'inProgress' : data.progress.job?.state}`, {
                defaultValue: data.progress.job?.state || '—',
            }),
            note: `${data.progress.job?.stage || '—'} · ${data.progress.job?.type || '—'}`,
        },
        {
            label: t('analytics.metrics.frames'),
            value: formatNumber(data.inventory.frames),
            note: t('analytics.notes.resourceFrames'),
        },
        {
            label: t('analytics.metrics.logicalObjects'),
            value: formatNumber(data.inventory.logicalObjects),
            note: t('analytics.notes.logicalObjects'),
        },
        {
            label: t('analytics.metrics.openIssues'),
            value: formatNumber(data.issues.open),
            note: t('analytics.notes.resolvedIssues', { count: data.issues.resolved }),
        },
        {
            label: t('analytics.metrics.quality'),
            value: data.quality.available ? formatPercent(data.quality.accuracy, 'ratio') : '—',
            note: data.quality.available ?
                t('analytics.notes.qualityConflicts', { count: data.quality.conflicts }) :
                t('analytics.empty.noQuality'),
        },
        {
            label: t('analytics.metrics.inactiveAge'),
            value: formatSeconds(data.risks.inactiveAgeSeconds),
            note: t('analytics.notes.sinceResourceUpdate'),
        },
    ];

    const childColumns = [
        {
            title: t('analytics.table.resource'),
            dataIndex: 'name',
            key: 'name',
            fixed: 'left' as const,
            render: (name: string, child: ResourceAnalyticsChild): React.ReactNode => {
                const url = childLink(child);
                return url ? <Link to={url}>{name}</Link> : name;
            },
        },
        {
            title: t('analytics.table.workflow'),
            key: 'workflow',
            render: (_: unknown, child: ResourceAnalyticsChild): React.ReactNode => {
                if (child.resourceType === 'job') {
                    return (
                        <span className='cvat-analytics-workflow-cell'>
                            <Tag>{child.stage}</Tag>
                            <Text type='secondary'>{child.state}</Text>
                        </span>
                    );
                }
                return child.resourceType === 'frame' ? `#${child.id}` : '—';
            },
        },
        {
            title: t('analytics.table.assignee'),
            dataIndex: 'assignee',
            key: 'assignee',
            render: (value: string | null): string => value || '—',
        },
        {
            title: t('analytics.table.frames'),
            dataIndex: 'frames',
            key: 'frames',
            align: 'right' as const,
            render: formatNumber,
        },
        {
            title: t('analytics.table.completion'),
            dataIndex: 'completionPercent',
            key: 'completionPercent',
            align: 'right' as const,
            render: (value: number | null): string => formatPercent(value),
        },
        {
            title: t('analytics.table.objects'),
            dataIndex: 'logicalObjects',
            key: 'logicalObjects',
            align: 'right' as const,
            render: formatNumber,
        },
        {
            title: t('analytics.table.issues'),
            dataIndex: 'openIssues',
            key: 'openIssues',
            align: 'right' as const,
            render: formatNumber,
        },
        {
            title: t('analytics.table.conflicts'),
            dataIndex: 'conflictCount',
            key: 'conflictCount',
            align: 'right' as const,
            render: formatNumber,
        },
        {
            title: t('analytics.table.quality'),
            dataIndex: 'qualityAccuracy',
            key: 'qualityAccuracy',
            align: 'right' as const,
            render: (value: number | null): string => formatPercent(value, 'ratio'),
        },
    ];

    return (
        <SectionState
            fetching={fetching}
            error={error}
            empty={false}
            onRetry={onRetry}
            emptyDescription={t('analytics.empty.overview')}
        >
            <MetricStrip items={metrics} />

            {annotationJobs ? (
                <section className='cvat-analytics-section cvat-analytics-progress-section'>
                    <div className='cvat-analytics-section-heading'>
                        <div>
                            <Title level={5}>{t('analytics.sections.progress')}</Title>
                            <Text type='secondary'>{t('analytics.definitions.completion')}</Text>
                        </div>
                        <Text strong>{annotationJobs.completed} / {annotationJobs.total}</Text>
                    </div>
                    <Progress percent={annotationJobs.percent} showInfo={false} strokeColor='#1890ff' />
                    <div className='cvat-analytics-distribution-row'>
                        {Object.entries(annotationJobs.byStage).map(([name, count]) => (
                            <span key={`stage-${name}`}><Text type='secondary'>{name}</Text> {count}</span>
                        ))}
                        {data.progress.groundTruthJobs ? (
                            <span><Text type='secondary'>{t('analytics.metrics.groundTruth')}</Text> {data.progress.groundTruthJobs}</span>
                        ) : null}
                        {data.progress.consensusJobs ? (
                            <span><Text type='secondary'>{t('analytics.metrics.consensus')}</Text> {data.progress.consensusJobs}</span>
                        ) : null}
                    </div>
                </section>
            ) : null}

            {data.quality.stale ? (
                <Alert
                    type='warning'
                    showIcon
                    message={t('analytics.quality.stale')}
                    description={t('analytics.quality.staleDescription')}
                    className='cvat-analytics-inline-alert'
                />
            ) : null}

            <section className='cvat-analytics-section'>
                <div className='cvat-analytics-section-heading'>
                    <div>
                        <Title level={5}>{t(`analytics.sections.children.${data.resource.type}`)}</Title>
                        <Text type='secondary'>
                            {t('analytics.notes.rowsShown', {
                                shown: data.children.length,
                                total: data.childrenCount,
                            })}
                        </Text>
                    </div>
                </div>
                <CVATTable
                    size='small'
                    rowKey={(child: ResourceAnalyticsChild): string => `${child.resourceType}-${child.id}`}
                    columns={childColumns}
                    dataSource={data.children}
                    pagination={false}
                    scroll={{ x: 960 }}
                    csvExport={{ filename: `${data.resource.type}-${data.resource.id}-health.csv` }}
                    searchDataIndex={['name', 'assignee']}
                />
            </section>

            <section className='cvat-analytics-section cvat-analytics-facts'>
                <Title level={5}>{t('analytics.sections.observedFacts')}</Title>
                <div className='cvat-analytics-fact-grid'>
                    <div><Text type='secondary'>{t('analytics.metrics.unassignedJobs')}</Text><strong>{data.risks.unassignedJobs}</strong></div>
                    <div><Text type='secondary'>{t('analytics.metrics.rejectedJobs')}</Text><strong>{data.risks.rejectedJobs}</strong></div>
                    <div><Text type='secondary'>{t('analytics.metrics.errors')}</Text><strong>{data.quality.errors}</strong></div>
                    <div><Text type='secondary'>{t('analytics.metrics.warnings')}</Text><strong>{data.quality.warnings}</strong></div>
                </div>
                <Text type='secondary' className='cvat-analytics-freshness'>
                    {t('analytics.freshness.snapshot', { date: formatDate(data.freshness.snapshotAt) })}
                    {data.freshness.qualityAt ? ` · ${t('analytics.freshness.quality', { date: formatDate(data.freshness.qualityAt) })}` : ''}
                </Text>
            </section>
        </SectionState>
    );
}

export default React.memo(AnalyticsOverview);
