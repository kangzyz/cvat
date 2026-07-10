// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Tabs from 'antd/lib/tabs';

import {
    Job, Project, ResourceAnalyticsActivityFilter, ResourceAnalyticsEventsFilter,
    ResourceAnalyticsExportFilter, ResourceAnalyticsType, Task,
} from 'cvat-core-wrapper';
import {
    analyticsReportActions,
    exportAnalyticsEventsAsync,
    getAnalyticsActivityAsync,
    getAnalyticsAnnotationsAsync,
    getAnalyticsEventsAsync,
    getAnalyticsOverviewAsync,
} from 'actions/analytics-report-actions';
import { CombinedState } from 'reducers';
import { shallowEqual, ThunkDispatch } from 'utils/redux';
import { TimePeriod } from '.';
import AnalyticsActivity from './analytics-activity';
import AnalyticsAnnotations from './analytics-annotations';
import AnalyticsOverview from './analytics-overview';

interface Props {
    resource: Project | Task | Job;
    timePeriod: TimePeriod | null;
}

function resourceTypeOf(resource: Project | Task | Job): ResourceAnalyticsType {
    if (resource instanceof Project) return 'project';
    if (resource instanceof Task) return 'task';
    return 'job';
}

function AnalyticsReportContent({ resource }: Readonly<Props>): JSX.Element {
    const { t } = useTranslation('resources');
    const dispatch = useDispatch<ThunkDispatch>();
    const [activeTab, setActiveTab] = useState('overview');
    const state = useSelector((combined: CombinedState) => combined.analyticsReport, shallowEqual);
    const resourceType = resourceTypeOf(resource);
    const resourceID = resource.id;

    const loadOverview = useCallback(() => {
        dispatch(getAnalyticsOverviewAsync(resourceType, resourceID));
    }, [dispatch, resourceID, resourceType]);
    const loadAnnotations = useCallback(() => {
        dispatch(getAnalyticsAnnotationsAsync(resourceType, resourceID));
    }, [dispatch, resourceID, resourceType]);
    const loadActivity = useCallback((filter: ResourceAnalyticsActivityFilter) => {
        dispatch(getAnalyticsActivityAsync(resourceType, resourceID, filter));
    }, [dispatch, resourceID, resourceType]);
    const loadEvents = useCallback((filter: ResourceAnalyticsEventsFilter) => {
        dispatch(getAnalyticsEventsAsync(resourceType, resourceID, filter));
    }, [dispatch, resourceID, resourceType]);
    const exportEvents = useCallback((filter: ResourceAnalyticsExportFilter): Promise<string> => (
        dispatch(exportAnalyticsEventsAsync(resourceType, resourceID, filter))
    ), [dispatch, resourceID, resourceType]);

    useEffect(() => {
        setActiveTab('overview');
        loadOverview();
        return () => {
            dispatch(analyticsReportActions.reset());
        };
    }, [dispatch, loadOverview]);

    const onTabChange = useCallback((key: string) => {
        setActiveTab(key);
        if (key === 'overview' && !state.overview.data) loadOverview();
        if (key === 'annotations' && !state.annotations.data) loadAnnotations();
    }, [loadAnnotations, loadOverview, state.annotations.data, state.overview.data]);

    return (
        <Tabs
            activeKey={activeTab}
            onChange={onTabChange}
            className='cvat-analytics-tabs'
            items={[
                {
                    key: 'overview',
                    label: t('analytics.tabs.overview'),
                    children: (
                        <AnalyticsOverview
                            data={state.overview.data}
                            fetching={state.overview.fetching}
                            error={state.overview.error}
                            onRetry={loadOverview}
                        />
                    ),
                },
                {
                    key: 'annotations',
                    label: t('analytics.tabs.annotations'),
                    children: (
                        <AnalyticsAnnotations
                            data={state.annotations.data}
                            fetching={state.annotations.fetching}
                            error={state.annotations.error}
                            onRetry={loadAnnotations}
                        />
                    ),
                },
                {
                    key: 'activity',
                    label: t('analytics.tabs.activity'),
                    children: (
                        <AnalyticsActivity
                            key={`${resourceType}-${resourceID}`}
                            resourceType={resourceType}
                            resourceID={resourceID}
                            resourceCreatedDate={resource.createdDate}
                            activity={state.activity}
                            events={state.events}
                            exporting={state.export.fetching}
                            onLoadActivity={loadActivity}
                            onLoadEvents={loadEvents}
                            onExportEvents={exportEvents}
                        />
                    ),
                },
            ]}
        />
    );
}

function AnalyticsReportContentWrap(props: Readonly<Props>): JSX.Element {
    const overrides = useSelector(
        (state: CombinedState) => state.plugins.overridableComponents.analyticsReportPage.content,
    );

    if (overrides.length) {
        const [Component] = overrides.slice(-1);
        return <Component {...props} />;
    }

    return <AnalyticsReportContent {...props} />;
}

export default React.memo(AnalyticsReportContentWrap);
