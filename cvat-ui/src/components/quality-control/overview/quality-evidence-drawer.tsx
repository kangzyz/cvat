// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ExclamationCircleFilled, WarningFilled } from '@ant-design/icons';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Drawer from 'antd/lib/drawer';
import Empty from 'antd/lib/empty';
import Spin from 'antd/lib/spin';
import Table, { TableProps } from 'antd/lib/table';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';

import {
    ConflictSeverity,
    Job,
    JobType,
    Project,
    QualityConflict,
    QualityReport,
    Task,
} from 'cvat-core-wrapper';
import { QualityConflictsState } from 'reducers';
import { makeReviewURL } from '../quality-control-utils';

interface Props {
    open: boolean;
    context: string;
    reportID: number | null;
    filter: { severity?: 'error' | 'warning'; conflictType?: string };
    conflictState?: QualityConflictsState;
    instance: Project | Task;
    jobs: Job[];
    jobReports: QualityReport[];
    onClose: () => void;
    onResetFilter: () => void;
    onRetry: () => void;
}

interface ConflictRow {
    key: number;
    conflict: QualityConflict;
    job: Job | null;
    taskID: number | null;
}

export default function QualityEvidenceDrawer(props: Readonly<Props>): JSX.Element {
    const {
        open,
        context,
        filter,
        conflictState,
        instance,
        jobs,
        jobReports,
        onClose,
        onResetFilter,
        onRetry,
    } = props;
    const { t } = useTranslation('qualityReviewModels');
    const gtJobIDs = new Set(jobs.filter((job) => job.type === JobType.GROUND_TRUTH).map(({ id }) => id));
    const filtered = (conflictState?.items || []).filter((conflict) => (
        (!filter.severity || conflict.severity === filter.severity) &&
        (!filter.conflictType || conflict.type === filter.conflictType)
    ));
    const rows: ConflictRow[] = filtered.map((conflict) => {
        const report = jobReports.find(({ id }) => id === conflict.reportID);
        const fallbackJobID = conflict.annotationConflicts.find(({ jobID }) => !gtJobIDs.has(jobID))?.jobID;
        const job = jobs.find(({ id }) => id === (report?.jobID || fallbackJobID)) || null;
        return {
            key: conflict.id,
            conflict,
            job,
            taskID: job?.taskId || report?.taskID || (instance instanceof Task ? instance.id : null),
        };
    });
    const columns: TableProps<ConflictRow>['columns'] = [
        {
            title: t('quality.overview.drawer.severity'),
            width: 100,
            render: (_value, row) => (row.conflict.severity === ConflictSeverity.ERROR ? (
                <Tag color='error' icon={<ExclamationCircleFilled />}>
                    {t('quality.overview.drawer.error')}
                </Tag>
            ) : (
                <Tag color='warning' icon={<WarningFilled />}>
                    {t('quality.overview.drawer.warning')}
                </Tag>
            )),
        },
        {
            title: t('quality.overview.drawer.type'),
            width: 150,
            render: (_value, row) => t(`quality.overview.conflicts.${row.conflict.type}`),
        },
        {
            title: t('quality.overview.drawer.location'),
            width: 120,
            render: (_value, row) => (row.conflict.frame === null ? '—' : t(
                row.job ? 'quality.overview.drawer.locationWithJob' : 'quality.overview.drawer.locationWithoutJob',
                { job: row.job?.id, frame: row.conflict.frame },
            )),
        },
        {
            title: t('quality.overview.drawer.explanation'),
            render: (_value, row) => t(`quality.overview.conflictHelp.${row.conflict.type}`),
        },
        {
            title: t('quality.overview.risk.action'),
            width: 100,
            fixed: 'right',
            render: (_value, row) => (row.job && row.taskID !== null && row.conflict.frame !== null ? (
                <Link
                    to={makeReviewURL(row.taskID, row.job.id, row.conflict.frame, row.conflict)}
                    aria-label={t('quality.overview.drawer.reviewAria', {
                        job: row.job.id,
                        frame: row.conflict.frame,
                    })}
                >
                    {t('quality.overview.drawer.openReview')}
                </Link>
            ) : '—'),
        },
    ];

    let activeFilter: string | null = null;
    if (filter.severity) {
        activeFilter = t(`quality.overview.drawer.${filter.severity}`);
    } else if (filter.conflictType) {
        activeFilter = t(`quality.overview.conflicts.${filter.conflictType}`);
    }

    let content: JSX.Element = <Empty description={t('quality.overview.drawer.empty')} />;
    if (conflictState?.error) {
        content = (
            <Alert
                type='error'
                showIcon
                message={t('quality.overview.drawer.loadFailed')}
                description={conflictState.error.message}
                action={<Button size='small' onClick={onRetry}>{t('quality.overview.actions.retry')}</Button>}
            />
        );
    } else if (conflictState?.fetching) {
        content = <div className='cvat-quality-drawer-loading'><Spin /></div>;
    } else if (rows.length) {
        content = (
            <Table
                size='small'
                columns={columns}
                dataSource={rows}
                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                scroll={{ x: 720 }}
            />
        );
    }

    return (
        <Drawer
            className='cvat-quality-evidence-drawer'
            title={t('quality.overview.drawer.title', { context })}
            open={open}
            onClose={onClose}
            width={760}
        >
            {activeFilter && (
                <div className='cvat-quality-drawer-filter'>
                    <Text type='secondary'>{t('quality.overview.drawer.filter', { filter: activeFilter })}</Text>
                    <Button type='link' size='small' onClick={onResetFilter}>
                        {t('quality.overview.drawer.reset')}
                    </Button>
                </div>
            )}
            {content}
        </Drawer>
    );
}
