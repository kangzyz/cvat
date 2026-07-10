// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, {
    useCallback, useEffect, useMemo, useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import dayjs, { Dayjs } from 'dayjs';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import DatePicker from 'antd/lib/date-picker';
import Empty from 'antd/lib/empty';
import Select from 'antd/lib/select';
import Space from 'antd/lib/space';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import notification from 'antd/lib/notification';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';

import {
    ResourceAnalyticsActivity,
    ResourceAnalyticsActivityFilter,
    ResourceAnalyticsEvent,
    ResourceAnalyticsEvents,
    ResourceAnalyticsEventsFilter,
    ResourceAnalyticsExportFilter,
    ResourceAnalyticsType,
} from 'cvat-core-wrapper';
import CVATTable from 'components/common/cvat-table';
import {
    formatDate, formatDuration, formatNumber, MetricItem, MetricStrip, SectionState,
} from './analytics-report-shared';

type Preset = '24h' | '7d' | '30d' | '90d' | 'lifetime' | 'custom';

interface Section<T> {
    data: T | null;
    fetching: boolean;
    error: string | null;
}

interface Props {
    resourceType: ResourceAnalyticsType;
    resourceID: number;
    resourceCreatedDate: string;
    activity: Section<ResourceAnalyticsActivity>;
    events: Section<ResourceAnalyticsEvents>;
    exporting: boolean;
    onLoadActivity(filter: ResourceAnalyticsActivityFilter): void;
    onLoadEvents(filter: ResourceAnalyticsEventsFilter): void;
    onExportEvents(filter: ResourceAnalyticsExportFilter): Promise<string>;
}

function rangeForPreset(preset: Exclude<Preset, 'custom'>, createdDate: string): [string, string] {
    const end = dayjs();
    if (preset === 'lifetime') return [dayjs(createdDate).toISOString(), end.toISOString()];
    const amount = {
        '24h': 24, '7d': 24 * 7, '30d': 24 * 30, '90d': 24 * 90,
    }[preset];
    return [end.subtract(amount, 'hour').toISOString(), end.toISOString()];
}

function AnalyticsActivity(props: Props): JSX.Element {
    const {
        resourceType,
        resourceID,
        resourceCreatedDate,
        activity,
        events,
        exporting,
        onLoadActivity,
        onLoadEvents,
        onExportEvents,
    } = props;
    const { t } = useTranslation('resources');
    const [preset, setPreset] = useState<Preset>('30d');
    const [range, setRange] = useState<[string, string]>(() => rangeForPreset('30d', resourceCreatedDate));
    const [eventPage, setEventPage] = useState(1);
    const pageSize = 50;

    const activityFilter = useMemo<ResourceAnalyticsActivityFilter>(() => ({
        from: range[0],
        to: range[1],
        bucket: 'auto',
    }), [range]);
    const eventsFilter = useMemo<ResourceAnalyticsEventsFilter>(() => ({
        from: range[0],
        to: range[1],
        bucket: 'auto',
        page: eventPage,
        pageSize,
    }), [range, eventPage]);

    useEffect(() => {
        onLoadActivity(activityFilter);
    }, [resourceType, resourceID, activityFilter, onLoadActivity]);

    useEffect(() => {
        onLoadEvents(eventsFilter);
    }, [resourceType, resourceID, eventsFilter, onLoadEvents]);

    const applyPreset = useCallback((value: Preset) => {
        setPreset(value);
        setEventPage(1);
        if (value !== 'custom') setRange(rangeForPreset(value, resourceCreatedDate));
    }, [resourceCreatedDate]);

    const refresh = useCallback(() => {
        onLoadActivity({ ...activityFilter, refresh: true });
        onLoadEvents(eventsFilter);
    }, [activityFilter, eventsFilter, onLoadActivity, onLoadEvents]);

    const exportRawEvents = useCallback(async () => {
        try {
            const filename = `${resourceType}-${resourceID}-events.csv`;
            const url = await onExportEvents({
                from: range[0],
                to: range[1],
                filename,
            });
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = filename;
            anchor.click();
            anchor.remove();
        } catch (error) {
            notification.error({
                message: t('analytics.export.failed'),
                description: error instanceof Error && error.message ?
                    error.message : t('analytics.export.unavailable'),
            });
        }
    }, [onExportEvents, range, resourceID, resourceType, t]);

    const activityData = activity.data;
    const selfOnly = activityData?.contributorScope.mode === 'self';
    const summaryMetrics: MetricItem[] = activityData ? [
        {
            label: t('analytics.metrics.workingTime'),
            value: formatDuration(activityData.summary.workingTimeMs),
            note: t('analytics.notes.estimatedActiveTime'),
        },
        {
            label: t('analytics.metrics.createdObjects'),
            value: formatNumber(activityData.summary.createdObjects),
            note: t('analytics.notes.grossCreated'),
        },
        {
            label: t('analytics.metrics.objectsPerHour'),
            value: formatNumber(activityData.summary.objectsPerActiveHour, 2),
            note: t('analytics.notes.speedDefinition'),
        },
        {
            label: t('analytics.metrics.updatedObjects'),
            value: formatNumber(activityData.summary.updatedObjects),
            note: t('analytics.notes.deletedObjects', { count: activityData.summary.deletedObjects }),
        },
        {
            label: t('analytics.metrics.netObjects'),
            value: formatNumber(activityData.summary.netObjects),
            note: t('analytics.notes.netDefinition'),
        },
        {
            label: t('analytics.metrics.reviewRejections'),
            value: formatNumber(activityData.summary.reviewRejections),
            note: t('analytics.notes.separateFromEdits'),
        },
        ...(!selfOnly ? [{
            label: t('analytics.metrics.activeContributors'),
            value: formatNumber(activityData.summary.activeContributors),
            note: t('analytics.notes.contributorsInRange'),
        }] : []),
    ] : [];

    const seriesColumns = [
        {
            title: t('analytics.table.time'), dataIndex: 'bucketStart', key: 'bucketStart', render: formatDate,
        },
        {
            title: t('analytics.metrics.workingTime'), dataIndex: 'workingTimeMs', key: 'workingTimeMs', align: 'right' as const, render: formatDuration,
        },
        {
            title: t('analytics.metrics.createdObjects'), dataIndex: 'createdObjects', key: 'createdObjects', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.updatedObjects'), dataIndex: 'updatedObjects', key: 'updatedObjects', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.deletedObjects'), dataIndex: 'deletedObjects', key: 'deletedObjects', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.netObjects'), dataIndex: 'netObjects', key: 'netObjects', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.objectsPerHour'), dataIndex: 'objectsPerActiveHour', key: 'objectsPerActiveHour', align: 'right' as const, render: (value: number | null): string => formatNumber(value, 2),
        },
    ];
    const contributorColumns = [
        {
            title: t('analytics.table.contributor'), dataIndex: 'userName', key: 'userName', render: (value: string | null): string => value || '—',
        },
        {
            title: t('analytics.metrics.workingTime'), dataIndex: 'workingTimeMs', key: 'workingTimeMs', align: 'right' as const, render: formatDuration,
        },
        {
            title: t('analytics.metrics.createdObjects'), dataIndex: 'createdObjects', key: 'createdObjects', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.updatedObjects'), dataIndex: 'updatedObjects', key: 'updatedObjects', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.deletedObjects'), dataIndex: 'deletedObjects', key: 'deletedObjects', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.metrics.objectsPerHour'), dataIndex: 'objectsPerActiveHour', key: 'objectsPerActiveHour', align: 'right' as const, render: (value: number | null): string => formatNumber(value, 2),
        },
        {
            title: t('analytics.table.lastActivity'), dataIndex: 'lastActivityAt', key: 'lastActivityAt', render: formatDate,
        },
    ];
    const transitionColumns = [
        {
            title: t('analytics.table.time'), dataIndex: 'timestamp', key: 'timestamp', render: formatDate,
        },
        {
            title: t('analytics.table.job'), dataIndex: 'jobId', key: 'jobId', render: (value: number | null): string => (value ? `#${value}` : '—'),
        },
        { title: t('analytics.table.field'), dataIndex: 'field', key: 'field' },
        {
            title: t('analytics.table.from'), dataIndex: 'oldValue', key: 'oldValue', render: (value: string | null): string => value || '—',
        },
        {
            title: t('analytics.table.to'), dataIndex: 'newValue', key: 'newValue', render: (value: string | null): string => value || '—',
        },
        {
            title: t('analytics.table.actor'), dataIndex: 'userName', key: 'userName', render: (value: string | null): string => value || '—',
        },
    ];
    const eventColumns = [
        {
            title: t('analytics.table.time'), dataIndex: 'timestamp', key: 'timestamp', render: formatDate, width: 170,
        },
        {
            title: t('analytics.table.actor'), dataIndex: 'userName', key: 'userName', render: (value: string | null): string => value || '—',
        },
        { title: t('analytics.table.event'), dataIndex: 'scope', key: 'scope' },
        {
            title: t('analytics.table.resource'),
            key: 'resource',
            render: (_: unknown, event: ResourceAnalyticsEvent): React.ReactNode => (
                <span className='cvat-analytics-event-resource'>
                    <Text>{event.resourceName || `#${event.jobId || event.taskId || event.projectId || '—'}`}</Text>
                    {!event.resourceExists ? <Tag>{t('analytics.events.deleted')}</Tag> : null}
                </span>
            ),
        },
        {
            title: t('analytics.table.workflow'),
            key: 'workflow',
            render: (_: unknown, event: ResourceAnalyticsEvent): React.ReactNode => (
                event.jobId ? (
                    <span className='cvat-analytics-event-workflow'>
                        <Text>{event.jobType || '—'}</Text>
                        <Text type='secondary'>{event.stage || '—'} / {event.state || '—'}</Text>
                        <Text type='secondary'>{event.assignee || '—'}</Text>
                    </span>
                ) : '—'
            ),
        },
        {
            title: t('analytics.table.object'), dataIndex: 'objName', key: 'objName', render: (value: string | null): string => value || '—',
        },
        {
            title: t('analytics.table.count'), dataIndex: 'count', key: 'count', align: 'right' as const, render: formatNumber,
        },
        {
            title: t('analytics.table.duration'), dataIndex: 'duration', key: 'duration', align: 'right' as const, render: (value: number): string => (value ? formatDuration(value) : '—'),
        },
    ];
    const chartRows = activityData?.series.slice(-90) || [];
    const chartMaximum = Math.max(...chartRows.map((row) => row.createdObjects), 1);
    const customValue: [Dayjs, Dayjs] = [dayjs(range[0]), dayjs(range[1])];

    return (
        <div className='cvat-analytics-activity'>
            <div className='cvat-analytics-toolbar'>
                <Space wrap>
                    <Select<Preset>
                        value={preset}
                        className='cvat-analytics-preset-select'
                        onChange={applyPreset}
                        options={(['24h', '7d', '30d', '90d', 'lifetime', 'custom'] as Preset[]).map((value) => ({
                            value,
                            label: t(`analytics.range.${value}`),
                        }))}
                    />
                    <DatePicker.RangePicker
                        value={customValue}
                        showTime
                        allowClear={false}
                        onChange={(value) => {
                            if (value?.[0] && value[1]) {
                                setPreset('custom');
                                setEventPage(1);
                                setRange([value[0].toISOString(), value[1].toISOString()]);
                            }
                        }}
                    />
                    <Text type='secondary'>{t('analytics.range.localDisplay')}</Text>
                </Space>
                <Space>
                    <Button icon={<ReloadOutlined />} onClick={refresh} loading={activity.fetching || events.fetching}>
                        {t('analytics.actions.refresh')}
                    </Button>
                    <Button
                        icon={<DownloadOutlined />}
                        onClick={exportRawEvents}
                        loading={exporting}
                    >
                        {t('analytics.actions.exportRaw')}
                    </Button>
                </Space>
            </div>

            <SectionState
                fetching={activity.fetching}
                error={activity.error}
                empty={!activityData}
                onRetry={() => onLoadActivity(activityFilter)}
                emptyDescription={t('analytics.empty.activity')}
            >
                {activityData ? (
                    <>
                        {selfOnly ? (
                            <Alert
                                type='info'
                                showIcon
                                message={t('analytics.scope.selfOnly')}
                                description={t('analytics.scope.selfOnlyDescription')}
                                className='cvat-analytics-inline-alert'
                            />
                        ) : null}
                        {!activityData.availability.available ? (
                            <Alert
                                type='warning'
                                showIcon
                                message={t('analytics.availability.unavailable')}
                                description={t('analytics.availability.unavailableDescription')}
                            />
                        ) : (
                            <>
                                <MetricStrip items={summaryMetrics} />

                                <section className='cvat-analytics-section'>
                                    <div className='cvat-analytics-section-heading'>
                                        <div>
                                            <Title level={5}>{t('analytics.sections.activityTrend')}</Title>
                                            <Text type='secondary'>{t('analytics.notes.bucket', { bucket: activityData.range.bucket })}</Text>
                                        </div>
                                    </div>
                                    {chartRows.length ? (
                                        <div className='cvat-analytics-bar-chart' aria-label={t('analytics.sections.activityTrend')}>
                                            {chartRows.map((row) => {
                                                const ratio = (row.createdObjects / chartMaximum) * 100;
                                                const height = Math.max(ratio, row.createdObjects ? 3 : 1);
                                                return (
                                                    <span
                                                        key={row.bucketStart}
                                                        title={`${formatDate(row.bucketStart)} · ${row.createdObjects}`}
                                                        style={{ height: `${height}%` }}
                                                    />
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <Empty
                                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                                            description={t('analytics.empty.noActivityInRange')}
                                        />
                                    )}
                                    <CVATTable
                                        size='small'
                                        rowKey='bucketStart'
                                        columns={seriesColumns}
                                        dataSource={activityData.series}
                                        pagination={{ pageSize: 12, showSizeChanger: true, position: ['bottomCenter'] }}
                                        scroll={{ x: 920 }}
                                        csvExport={{ filename: `${resourceType}-${resourceID}-activity-summary.csv` }}
                                    />
                                </section>

                                {!selfOnly ? (
                                    <section className='cvat-analytics-section'>
                                        <Title level={5}>{t('analytics.sections.contributors')}</Title>
                                        <Text type='secondary' className='cvat-analytics-section-copy'>
                                            {t('analytics.notes.neutralContributors')}
                                        </Text>
                                        <CVATTable
                                            size='small'
                                            rowKey={(row: {
                                                userId: number | null;
                                                userName: string | null;
                                            }): string => `${row.userId}-${row.userName}`}
                                            columns={contributorColumns}
                                            dataSource={activityData.contributors}
                                            pagination={false}
                                            scroll={{ x: 920 }}
                                            csvExport={{ filename: `${resourceType}-${resourceID}-contributors.csv` }}
                                            searchDataIndex={['userName']}
                                        />
                                    </section>
                                ) : null}

                                {!selfOnly ? (
                                    <section className='cvat-analytics-section cvat-analytics-workflow-section'>
                                        <div className='cvat-analytics-section-heading'>
                                            <div>
                                                <Title level={5}>{t('analytics.sections.workflowHistory')}</Title>
                                                <Text type='secondary'>{t('analytics.notes.dwellWallClock')}</Text>
                                            </div>
                                        </div>
                                        <div className='cvat-analytics-split-section'>
                                            <div>
                                                <Text strong>{t('analytics.sections.dwellByStage')}</Text>
                                                <div className='cvat-analytics-ranked-list'>
                                                    {Object.entries(activityData.workflow.dwellTimeByStage).map(
                                                        ([name, seconds]) => (
                                                            <div key={name}>
                                                                <Text>{name}</Text>
                                                                <Text strong>{formatDuration(seconds * 1000)}</Text>
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <Text strong>{t('analytics.sections.dwellByState')}</Text>
                                                <div className='cvat-analytics-ranked-list'>
                                                    {Object.entries(activityData.workflow.dwellTimeByState).map(
                                                        ([name, seconds]) => (
                                                            <div key={name}>
                                                                <Text>{name}</Text>
                                                                <Text strong>{formatDuration(seconds * 1000)}</Text>
                                                            </div>
                                                        ),
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <CVATTable
                                            size='small'
                                            rowKey={(row: {
                                                jobId: number | null;
                                                field: string;
                                                timestamp: string;
                                            }): string => `${row.jobId}-${row.field}-${row.timestamp}`}
                                            columns={transitionColumns}
                                            dataSource={activityData.workflow.transitions}
                                            pagination={{ pageSize: 10, position: ['bottomCenter'] }}
                                            scroll={{ x: 760 }}
                                        />
                                    </section>
                                ) : null}
                            </>
                        )}
                    </>
                ) : null}
            </SectionState>

            <section className='cvat-analytics-section cvat-analytics-events-section'>
                <div className='cvat-analytics-section-heading'>
                    <div>
                        <Title level={5}>{t('analytics.sections.events')}</Title>
                        <Text type='secondary'>{t('analytics.notes.eventsPaginated')}</Text>
                    </div>
                </div>
                {events.error ? (
                    <Alert
                        type='warning'
                        showIcon
                        message={events.error}
                        className='cvat-analytics-inline-alert'
                    />
                ) : null}
                {events.data && !events.data.availability.available ? (
                    <Alert
                        type='warning'
                        showIcon
                        message={t('analytics.availability.unavailable')}
                        description={t('analytics.availability.unavailableDescription')}
                    />
                ) : (
                    <CVATTable
                        size='small'
                        rowKey={(event: ResourceAnalyticsEvent, index?: number): string => (
                            `${eventPage}-${index ?? 0}-${event.timestamp}-${event.scope}-${event.objId}`
                        )}
                        columns={eventColumns}
                        dataSource={events.data?.results || []}
                        loading={events.fetching}
                        scroll={{ x: 1040 }}
                        pagination={{
                            current: eventPage,
                            pageSize,
                            total: events.data?.count || 0,
                            showSizeChanger: false,
                            position: ['bottomCenter'],
                            onChange: setEventPage,
                        }}
                        expandable={{
                            expandedRowRender: (event: ResourceAnalyticsEvent): JSX.Element => (
                                <pre className='cvat-analytics-event-payload'>
                                    {JSON.stringify(event.payload, null, 2) || t('analytics.events.noPayload')}
                                </pre>
                            ),
                            rowExpandable: (event: ResourceAnalyticsEvent): boolean => event.payload !== null,
                        }}
                    />
                )}
            </section>
        </div>
    );
}

export default React.memo(AnalyticsActivity);
