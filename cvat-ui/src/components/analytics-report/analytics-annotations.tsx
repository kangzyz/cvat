// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';

import { ResourceAnalyticsAnnotations } from 'cvat-core-wrapper';
import CVATTable from 'components/common/cvat-table';
import {
    formatDate, formatNumber, MetricStrip, SectionState,
} from './analytics-report-shared';

interface Props {
    data: ResourceAnalyticsAnnotations | null;
    fetching: boolean;
    error: string | null;
    onRetry(): void;
}

function AnalyticsAnnotations(props: Props): JSX.Element {
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
                emptyDescription={t('analytics.empty.annotations')}
            >
                {null}
            </SectionState>
        );
    }

    const metrics = [
        { label: t('analytics.metrics.logicalObjects'), value: formatNumber(data.totals.logicalObjects), note: t('analytics.notes.logicalObjects') },
        { label: t('analytics.metrics.shapes'), value: formatNumber(data.totals.shapes) },
        { label: t('analytics.metrics.tracks'), value: formatNumber(data.totals.tracks), note: t('analytics.notes.tracksOnce') },
        { label: t('analytics.metrics.tags'), value: formatNumber(data.totals.tags) },
        { label: t('analytics.metrics.intervals'), value: formatNumber(data.totals.intervals) },
        { label: t('analytics.metrics.keyframes'), value: formatNumber(data.totals.keyframes), note: t('analytics.notes.interpolated', { count: data.totals.interpolatedFrames }) },
    ];

    const labelColumns = [
        {
            title: t('analytics.table.label'), dataIndex: 'label', key: 'label', fixed: 'left' as const,
        },
        {
            title: t('analytics.metrics.shapes'), dataIndex: 'shapes', key: 'shapes', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.tracks'), dataIndex: 'tracks', key: 'tracks', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.tags'), dataIndex: 'tags', key: 'tags', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.intervals'), dataIndex: 'intervals', key: 'intervals', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.keyframes'), dataIndex: 'keyframes', key: 'keyframes', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.interpolatedFrames'), dataIndex: 'interpolatedFrames', key: 'interpolatedFrames', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.table.total'), dataIndex: 'total', key: 'total', align: 'right' as const, render: formatNumber,
        },
    ];
    const densityMaximum = Math.max(...data.frameDensity.map((row) => row.objectCount), 1);

    return (
        <SectionState
            fetching={fetching}
            error={error}
            empty={false}
            onRetry={onRetry}
            emptyDescription={t('analytics.empty.annotations')}
        >
            <MetricStrip items={metrics} />
            <div className='cvat-analytics-definition'>
                <Text strong>{t('analytics.definitions.inventoryTitle')}</Text>
                <Text type='secondary'>{t('analytics.definitions.inventory')}</Text>
            </div>

            <section className='cvat-analytics-section'>
                <Title level={5}>{t('analytics.sections.byLabel')}</Title>
                <CVATTable
                    size='small'
                    rowKey='labelId'
                    columns={labelColumns}
                    dataSource={data.byLabel}
                    pagination={{ pageSize: 20, showSizeChanger: true, position: ['bottomCenter'] }}
                    scroll={{ x: 900 }}
                    csvExport={{ filename: 'annotation-label-distribution.csv' }}
                    searchDataIndex={['label']}
                />
            </section>

            <section className='cvat-analytics-section cvat-analytics-split-section'>
                <div>
                    <Title level={5}>{t('analytics.sections.byType')}</Title>
                    <div className='cvat-analytics-ranked-list'>
                        {data.byType.map((row) => (
                            <div key={row.name}>
                                <Text>{row.name}</Text>
                                <Text strong>{formatNumber(row.count)}</Text>
                            </div>
                        ))}
                    </div>
                </div>
                <div>
                    <Title level={5}>{t('analytics.sections.bySource')}</Title>
                    <div className='cvat-analytics-ranked-list'>
                        {data.bySource.map((row) => (
                            <div key={row.name}>
                                <Text>{row.name}</Text>
                                <Text strong>{formatNumber(row.count)}</Text>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className='cvat-analytics-section'>
                <div className='cvat-analytics-section-heading'>
                    <div>
                        <Title level={5}>{t('analytics.sections.frameDensity')}</Title>
                        <Text type='secondary'>{t('analytics.notes.densityBounded')}</Text>
                    </div>
                </div>
                <div className='cvat-analytics-density-list'>
                    {data.frameDensity.map((row) => {
                        const ratio = (row.objectCount / densityMaximum) * 100;
                        const width = Math.max(ratio, row.objectCount ? 2 : 0);
                        return (
                            <div className='cvat-analytics-density-row' key={`${row.jobId}-${row.startFrame}`}>
                                <div className='cvat-analytics-density-label'>
                                    <Link to={`/tasks/${row.taskId}/jobs/${row.jobId}/analytics`}>
                                        Job #{row.jobId}
                                    </Link>
                                    <Text type='secondary'>{row.startFrame}–{row.stopFrame}</Text>
                                </div>
                                <div className='cvat-analytics-density-track'>
                                    <span style={{ width: `${width}%` }} />
                                </div>
                                <div className='cvat-analytics-density-values'>
                                    <span>{formatNumber(row.objectCount)} {t('analytics.table.objects')}</span>
                                    <span>{formatNumber(row.issueCount)} {t('analytics.table.issues')}</span>
                                    <span>{formatNumber(row.conflictCount)} {t('analytics.table.conflicts')}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <Text type='secondary' className='cvat-analytics-freshness'>
                {t('analytics.freshness.snapshot', { date: formatDate(data.snapshotAt) })}
            </Text>
        </SectionState>
    );
}

export default React.memo(AnalyticsAnnotations);
