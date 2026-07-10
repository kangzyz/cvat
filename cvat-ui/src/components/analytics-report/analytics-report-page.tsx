// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';

import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import notification from 'antd/lib/notification';
import { Row, Col } from 'antd/lib/grid';

import {
    Project, Task, Job, getCore,
} from 'cvat-core-wrapper';
import { useInstanceType, useInstanceId } from 'utils/hooks';
import { InstanceType } from 'reducers';
import GoBackButton from 'components/common/go-back-button';
import CVATLoadingSpinner from 'components/common/loading-spinner';
import AnalyticsReportContent from './analytics-report-content';
import AnalyticsPageHeader from './analytics-page-header';

const core = getCore();

function AnalyticsReportPage(): JSX.Element {
    const { t } = useTranslation('resources');
    const requestedInstanceType: InstanceType = useInstanceType();
    const requestedInstanceId = useInstanceId(requestedInstanceType);
    const [resource, setResource] = useState<Project | Task | Job | null>(null);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        if (
            Number.isInteger(requestedInstanceId) &&
            [InstanceType.PROJECT, InstanceType.TASK, InstanceType.JOB].includes(requestedInstanceType)
        ) {
            let resourcePromise = null as (
                ReturnType<typeof core.projects.get> |
                ReturnType<typeof core.tasks.get> |
                ReturnType<typeof core.jobs.get> |
                null
            );

            if (requestedInstanceType === InstanceType.PROJECT) {
                resourcePromise = core.projects.get({ id: requestedInstanceId });
            } else if (requestedInstanceType === InstanceType.TASK) {
                resourcePromise = core.tasks.get({ id: requestedInstanceId });
            } else {
                resourcePromise = core.jobs.get({ jobID: requestedInstanceId });
            }

            setResource(null);
            setFetching(true);
            resourcePromise.then((_resource) => {
                setResource(_resource[0]);
            }).catch((error: unknown) => {
                notification.error({
                    message: t('analytics.errors.resource'),
                    description: error instanceof Error ? error.message : '',
                });
            }).finally(() => {
                setFetching(false);
            });
        }
    }, [requestedInstanceId, requestedInstanceType, t]);

    return (
        <div className='cvat-analytics-page'>
            <div className='cvat-analytics-wrapper'>
                <Row justify='center'>
                    <Col span={22} xl={18} xxl={14} className='cvat-task-top-bar'>
                        <GoBackButton />
                    </Col>
                </Row>
                <Row justify='center' className='cvat-analytics-inner-wrapper'>
                    <Col span={22} xl={18} xxl={14} className='cvat-analytics-inner'>
                        { resource && (
                            <AnalyticsPageHeader resource={resource} />
                        )}
                        { fetching && <CVATLoadingSpinner /> }
                        { resource && <AnalyticsReportContent timePeriod={null} resource={resource} /> }
                    </Col>
                </Row>
            </div>
        </div>
    );
}

export default React.memo(AnalyticsReportPage);
