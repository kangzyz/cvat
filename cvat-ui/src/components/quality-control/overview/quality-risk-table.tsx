// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    CheckCircleFilled,
    ExclamationCircleFilled,
    MinusCircleOutlined,
    WarningFilled,
} from '@ant-design/icons';
import Button from 'antd/lib/button';
import Radio from 'antd/lib/radio';
import Space from 'antd/lib/space';
import Table, { TableProps } from 'antd/lib/table';
import Tag from 'antd/lib/tag';
import Text from 'antd/lib/typography/Text';
import dayjs from 'dayjs';

import {
    Job,
    JobType,
    Project,
    QualityReport,
    QualitySettings,
    Task,
} from 'cvat-core-wrapper';
import {
    deriveJobRisk,
    deriveTaskRisk,
    formatPercent,
    getReportRule,
    QualityRiskStatus,
} from '../quality-control-utils';

interface Props {
    instance: Project | Task;
    tasks: Task[];
    jobs: Job[];
    report: QualityReport;
    childReports: QualityReport[];
    jobReports: QualityReport[];
    settings: QualitySettings | null;
    childrenSettings: QualitySettings[];
    onOpenEvidence: (reportID: number, context: string) => void;
}

interface RiskRow {
    key: number;
    id: number;
    name: React.ReactNode;
    status: QualityRiskStatus;
    score: number | null;
    threshold: number | null;
    coverage: string;
    conflicts: string;
    createdDate: string | null;
    reportID: number | null;
    context: string;
    independent: boolean;
}

function StatusTag({ status }: Readonly<{ status: QualityRiskStatus }>): JSX.Element {
    const { t } = useTranslation('qualityReviewModels');
    const healthy = status === 'healthy';
    const neutral = ['custom', 'excluded'].includes(status);
    let icon = <WarningFilled />;
    let color = 'warning';
    if (healthy) {
        icon = <CheckCircleFilled />;
        color = 'success';
    } else if (neutral) {
        icon = <MinusCircleOutlined />;
        color = 'default';
    } else if (status === 'below') {
        icon = <ExclamationCircleFilled />;
        color = 'error';
    }
    return <Tag color={color} icon={icon}>{t(`quality.overview.risk.status.${status}`)}</Tag>;
}

export default function QualityRiskTable(props: Readonly<Props>): JSX.Element {
    const {
        instance,
        tasks,
        jobs,
        report,
        childReports,
        jobReports,
        settings,
        childrenSettings,
        onOpenEvidence,
    } = props;
    const { t } = useTranslation('qualityReviewModels');
    const [filter, setFilter] = useState('all');

    const rows = useMemo<RiskRow[]>(() => {
        if (instance instanceof Project) {
            return tasks.map((task) => {
                const taskReport = childReports.find((child) => child.taskID === task.id) || null;
                const taskSettings = childrenSettings.find((child) => child.taskId === task.id) || null;
                const risk = deriveTaskRisk(
                    task,
                    jobs,
                    taskReport,
                    taskSettings,
                    settings,
                    jobReports,
                );
                const jobsSummary = taskReport?.summary.jobs;
                return {
                    key: task.id,
                    id: task.id,
                    name: <Link to={`/tasks/${task.id}/quality-control`}>{task.name}</Link>,
                    status: risk.status,
                    score: risk.score,
                    threshold: risk.rule.threshold,
                    coverage: jobsSummary ? `${jobsSummary.included}/${jobsSummary.total}` : '—',
                    conflicts: taskReport ? `${taskReport.summary.errorCount}/${taskReport.summary.warningCount}` : '—',
                    createdDate: taskReport?.createdDate || null,
                    reportID: taskReport?.id || null,
                    context: task.name,
                    independent: Boolean(taskSettings && !taskSettings.inherit),
                };
            });
        }

        const parentRule = getReportRule(report, settings);
        const gtJob = jobs.find((job) => job.type === JobType.GROUND_TRUTH) || null;
        return jobs.filter((job) => job.type !== JobType.GROUND_TRUTH).map((job) => {
            const jobReport = childReports.find((child) => child.jobID === job.id) || null;
            const risk = deriveJobRisk(job, jobReport, parentRule, gtJob);
            return {
                key: job.id,
                id: job.id,
                name: (
                    <span>
                        <Link to={`/tasks/${instance.id}/jobs/${job.id}`}>
                            {t('quality.overview.risk.jobName', { id: job.id })}
                        </Link>
                        <Text type='secondary'>{job.assignee ? ` · ${job.assignee.username}` : ''}</Text>
                    </span>
                ),
                status: risk.status,
                score: risk.score,
                threshold: risk.rule.threshold,
                coverage: jobReport ?
                    `${jobReport.summary.validationFrames}/${jobReport.summary.totalFrames}` : '—',
                conflicts: jobReport ? `${jobReport.summary.errorCount}/${jobReport.summary.warningCount}` : '—',
                createdDate: jobReport?.createdDate || null,
                reportID: jobReport?.id || null,
                context: t('quality.overview.risk.jobName', { id: job.id }),
                independent: false,
            };
        });
    }, [instance, tasks, jobs, report, childReports, jobReports, settings, childrenSettings, t]);

    const filteredRows = rows.filter((row) => {
        if (filter === 'attention') return !['healthy', 'custom'].includes(row.status);
        if (filter === 'unconfigured') return row.status === 'unconfigured';
        if (filter === 'custom') return row.independent;
        return true;
    });
    const renderAction = (row: RiskRow): JSX.Element => {
        if (row.reportID) {
            return (
                <Button type='link' onClick={() => onOpenEvidence(row.reportID, row.context)}>
                    {t('quality.overview.actions.viewEvidence')}
                </Button>
            );
        }
        if (instance instanceof Project) {
            return (
                <Link to={`/tasks/${row.id}/quality-control`}>
                    {t('quality.overview.actions.configure')}
                </Link>
            );
        }
        return <Text type='secondary'>—</Text>;
    };
    const columns: TableProps<RiskRow>['columns'] = [
        {
            title: instance instanceof Project ? t('quality.overview.risk.task') : t('quality.overview.risk.job'),
            dataIndex: 'name',
            width: 220,
        },
        {
            title: t('quality.overview.risk.state'),
            dataIndex: 'status',
            width: 130,
            render: (status: QualityRiskStatus, row) => (
                <Space size={0} direction='vertical'>
                    <StatusTag status={status} />
                    {row.independent && status !== 'custom' && (
                        <Tag>{t('quality.overview.risk.status.custom')}</Tag>
                    )}
                </Space>
            ),
        },
        {
            title: t('quality.overview.risk.targetResult'),
            width: 150,
            render: (_value, row) => (
                <span>{formatPercent(row.score)} {row.threshold !== null ? `/ ${formatPercent(row.threshold)}` : ''}</span>
            ),
        },
        {
            title: t('quality.overview.risk.coverage'),
            dataIndex: 'coverage',
            width: 110,
        },
        {
            title: t('quality.overview.risk.errorsWarnings'),
            dataIndex: 'conflicts',
            width: 120,
        },
        {
            title: t('quality.overview.risk.latest'),
            dataIndex: 'createdDate',
            width: 160,
            render: (createdDate: string | null) => (createdDate ? dayjs(createdDate).format('MM-DD HH:mm') : '—'),
        },
        {
            title: t('quality.overview.risk.action'),
            width: 120,
            fixed: 'right',
            render: (_value, row) => renderAction(row),
        },
    ];

    const attentionCount = rows.filter(({ status }) => !['healthy', 'custom'].includes(status)).length;
    return (
        <section className='cvat-quality-section cvat-quality-risk'>
            <div className='cvat-quality-section-heading cvat-quality-risk-heading'>
                <div>
                    <Text strong>
                        {instance instanceof Project ? t('quality.overview.risk.tasksTitle') :
                            t('quality.overview.risk.jobsTitle')}
                    </Text>
                    <Text type='secondary'>{t('quality.overview.risk.attentionCount', { count: attentionCount })}</Text>
                </div>
                {instance instanceof Project && (
                    <Radio.Group size='small' value={filter} onChange={(event) => setFilter(event.target.value)}>
                        <Radio.Button value='all'>{t('quality.overview.risk.filters.all')}</Radio.Button>
                        <Radio.Button value='attention'>{t('quality.overview.risk.filters.attention')}</Radio.Button>
                        <Radio.Button value='unconfigured'>{t('quality.overview.risk.filters.unconfigured')}</Radio.Button>
                        <Radio.Button value='custom'>{t('quality.overview.risk.filters.custom')}</Radio.Button>
                    </Radio.Group>
                )}
            </div>
            <Table
                size='small'
                columns={columns}
                dataSource={filteredRows}
                pagination={false}
                scroll={{ x: 980 }}
                locale={{ emptyText: t('quality.overview.risk.empty') }}
            />
            <Space className='cvat-quality-risk-legend' size='middle' wrap>
                <Text type='secondary'>{t('quality.overview.risk.legend')}</Text>
            </Space>
        </section>
    );
}
