// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { ReloadOutlined, SettingOutlined } from '@ant-design/icons';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import { Row, Col } from 'antd/lib/grid';
import Space from 'antd/lib/space';
import Statistic from 'antd/lib/statistic';
import Text from 'antd/lib/typography/Text';
import dayjs from 'dayjs';

import {
    JobType, Project, QualityReport, QualitySettings, Task, getCore,
} from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';
import CVATLoadingSpinner from 'components/common/loading-spinner';
import { shallowEqual } from 'utils/redux';

interface Props {
    instance: Project | Task;
    qualitySettings: {
        settings: QualitySettings | null;
        childrenSettings: QualitySettings[] | null;
    };
}

const core = getCore();

function formatPercent(value?: number): string {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return '无数据';
    }

    return `${(value * 100).toFixed(1)}%`;
}

function metricName(value: string | undefined): string {
    if (value === 'precision') {
        return '精确率';
    }

    if (value === 'recall') {
        return '召回率';
    }

    return '准确率';
}

function QualityOverviewTab(props: Readonly<Props>): JSX.Element {
    const { instance, qualitySettings } = props;
    const [report, setReport] = useState<QualityReport | null>(null);
    const [fetching, setFetching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const receiveLatestReport = useCallback(async (): Promise<void> => {
        setFetching(true);
        setError(null);

        try {
            const filter = instance instanceof Task ? {
                taskID: instance.id,
                target: 'task',
                pageSize: 1,
            } : {
                projectID: instance.id,
                target: 'project',
                pageSize: 1,
            };
            const [latestReport] = await core.analytics.quality.reports(filter);
            setReport(latestReport || null);
        } catch (reportError: unknown) {
            setError(reportError instanceof Error ? reportError.message : String(reportError));
        } finally {
            setFetching(false);
        }
    }, [instance]);

    useEffect(() => {
        receiveLatestReport();
    }, [receiveLatestReport]);

    const settings = qualitySettings.settings;
    const summary = report?.summary;
    const taskHasGroundTruth = !(instance instanceof Task) ||
        instance.jobs.some((job) => job.type === JobType.GROUND_TRUTH);

    return (
        <div className='cvat-quality-overview-tab'>
            <Row justify='space-between' align='middle' className='cvat-quality-overview-header'>
                <Col>
                    <Text strong>社区版质量概览</Text>
                    <br />
                    <Text type='secondary'>
                        基于真值作业和当前质量设置汇总最近一次质量报告。
                    </Text>
                </Col>
                <Col>
                    <Space>
                        <Button
                            icon={<SettingOutlined />}
                            onClick={() => {
                                window.location.hash = 'settings';
                            }}
                        >
                            打开设置
                        </Button>
                        <Button
                            icon={<ReloadOutlined />}
                            loading={fetching}
                            onClick={receiveLatestReport}
                        >
                            刷新
                        </Button>
                    </Space>
                </Col>
            </Row>

            {!taskHasGroundTruth && (
                <Alert
                    className='cvat-quality-overview-alert'
                    type='warning'
                    showIcon
                    message='当前任务还没有真值作业'
                    description='质量控制需要 Ground Truth 作业作为基准。创建真值作业后，概览会显示质量报告结果。'
                />
            )}

            {error && (
                <Alert
                    className='cvat-quality-overview-alert'
                    type='error'
                    showIcon
                    message='无法获取质量报告'
                    description={error}
                />
            )}

            {fetching && !report ? (
                <div className='cvat-quality-overview-loading'>
                    <CVATLoadingSpinner />
                </div>
            ) : (
                <>
                    <Row className='cvat-quality-overview-summary' gutter={[16, 16]}>
                        <Col xs={12} md={6}>
                            <Statistic title='准确率' value={formatPercent(summary?.accuracy)} />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic title='精确率' value={formatPercent(summary?.precision)} />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic title='召回率' value={formatPercent(summary?.recall)} />
                        </Col>
                        <Col xs={12} md={6}>
                            <Statistic title='冲突数' value={summary?.conflictCount ?? '无数据'} />
                        </Col>
                    </Row>

                    <Row className='cvat-quality-overview-details' gutter={[16, 16]}>
                        <Col xs={24} md={12}>
                            <div>
                                <Text type='secondary'>目标指标</Text>
                                <br />
                                <Text>
                                    {metricName(settings?.targetMetric)}
                                    {typeof settings?.targetMetricThreshold === 'number' &&
                                        ` >= ${formatPercent(settings.targetMetricThreshold)}`}
                                </Text>
                            </div>
                        </Col>
                        <Col xs={24} md={12}>
                            <div>
                                <Text type='secondary'>每个作业最大验证次数</Text>
                                <br />
                                <Text>{settings?.maxValidationsPerJob ?? '无数据'}</Text>
                            </div>
                        </Col>
                        <Col xs={24} md={12}>
                            <div>
                                <Text type='secondary'>最近报告</Text>
                                <br />
                                <Text>
                                    {report?.createdDate ? dayjs(report.createdDate).format('YYYY-MM-DD HH:mm') : '暂无报告'}
                                </Text>
                            </div>
                        </Col>
                        <Col xs={24} md={12}>
                            <div>
                                <Text type='secondary'>验证帧</Text>
                                <br />
                                <Text>
                                    {typeof summary?.validationFrames === 'number' ?
                                        `${summary.validationFrames} / ${summary.totalFrames ?? 0}` : '无数据'}
                                </Text>
                            </div>
                        </Col>
                    </Row>

                    {!report && (
                        <Alert
                            className='cvat-quality-overview-alert'
                            type='info'
                            showIcon
                            message='暂无质量报告'
                            description='质量设置已经可用。生成质量报告后，这里会显示最近一次结果和关键指标。'
                        />
                    )}
                </>
            )}
        </div>
    );
}

function QualityOverviewTabWrap(props: Readonly<Props>): JSX.Element {
    const { instance } = props;

    const {
        taskOverrides, projectOverrides,
    } = useSelector((state: CombinedState) => ({
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

    return <QualityOverviewTab {...props} />;
}

export default React.memo(QualityOverviewTabWrap);
