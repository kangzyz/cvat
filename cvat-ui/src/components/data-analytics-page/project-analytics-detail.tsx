// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import { Row, Col } from 'antd/lib/grid';
import Card from 'antd/lib/card';
import Table from 'antd/lib/table';
import Spin from 'antd/lib/spin';
import Button from 'antd/lib/button';
import Progress from 'antd/lib/progress';
import Tag from 'antd/lib/tag';
import Empty from 'antd/lib/empty';
import Title from 'antd/lib/typography/Title';
import notification from 'antd/lib/notification';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Pie, Bar, Doughnut } from 'react-chartjs-2';

import { getCore } from 'cvat-core-wrapper';

const core = getCore();

const CHART_COLORS = [
    '#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1',
    '#13c2c2', '#eb2f96', '#fa8c16', '#a0d911', '#2f54eb',
];

interface ProjectDetail {
    id: number;
    name: string;
    owner: string | null;
    organization: string | null;
    jobs: {
        total: number;
        completed: number;
        completion_percent: number;
        by_state: Record<string, number>;
        by_stage: Record<string, number>;
    };
    labels: { label: string; count: number }[];
    shape_types: { type: string; count: number }[];
    sources: { source: string; count: number }[];
    tasks: {
        id: number;
        name: string;
        media_type: string;
        jobs_count: number;
        completed_jobs: number;
        completion_percent: number;
        annotations: number;
        source_frame_extraction: string | null;
    }[];
    frame_extraction_sessions: {
        id: string; status: string; output_share_path: string; kept_frames: number;
    }[];
}

function toChart(data: Record<string, number>): { labels: string[]; values: number[] } {
    const entries = Object.entries(data).filter(([, value]) => value > 0);
    return { labels: entries.map(([key]) => key), values: entries.map(([, value]) => value) };
}

interface Props {
    projectID: number;
    onBack: () => void;
}

function ProjectAnalyticsDetail({ projectID, onBack }: Props): JSX.Element {
    const [detail, setDetail] = useState<ProjectDetail | null>(null);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        let mounted = true;
        setFetching(true);
        core.server.getDataAnalyticsProject(projectID)
            .then((result: ProjectDetail) => {
                if (mounted) setDetail(result);
            })
            .catch((error: unknown) => {
                notification.error({
                    message: '加载项目分析数据失败',
                    description: error instanceof Error ? error.message : '',
                });
            })
            .finally(() => {
                if (mounted) setFetching(false);
            });
        return () => { mounted = false; };
    }, [projectID]);

    if (fetching) {
        return <Spin className='cvat-spinner' />;
    }

    if (!detail) {
        return <Empty description='暂无数据' />;
    }

    const stateChart = toChart(detail.jobs.by_state);
    const stageChart = toChart(detail.jobs.by_stage);
    const labelChart = {
        labels: detail.labels.map((item) => item.label),
        values: detail.labels.map((item) => item.count),
    };
    const shapeChart = {
        labels: detail.shape_types.map((item) => item.type),
        values: detail.shape_types.map((item) => item.count),
    };

    return (
        <div className='cvat-data-analytics-project-detail'>
            <Button type='link' icon={<ArrowLeftOutlined />} onClick={onBack} className='cvat-data-analytics-back'>
                返回项目列表
            </Button>
            <Title level={4}>{`项目：${detail.name}`}</Title>
            <Row gutter={[16, 16]}>
                <Col span={6}>
                    <Card className='cvat-data-analytics-summary-card'>
                        <div className='ant-statistic-title'>作业完成度</div>
                        <Progress type='dashboard' percent={detail.jobs.completion_percent} width={120} />
                        <div>{`${detail.jobs.completed} / ${detail.jobs.total} 作业已完成`}</div>
                    </Card>
                </Col>
                <Col span={9}>
                    <Card title='作业状态分布（State）' className='cvat-data-analytics-chart-card'>
                        <div className='cvat-data-analytics-chart-wrapper'>
                            {stateChart.values.length ? (
                                <Pie
                                    data={{
                                        labels: stateChart.labels,
                                        datasets: [{ data: stateChart.values, backgroundColor: CHART_COLORS }],
                                    }}
                                    options={{ maintainAspectRatio: false }}
                                />
                            ) : <Empty description='暂无作业' />}
                        </div>
                    </Card>
                </Col>
                <Col span={9}>
                    <Card title='作业阶段分布（Stage）' className='cvat-data-analytics-chart-card'>
                        <div className='cvat-data-analytics-chart-wrapper'>
                            {stageChart.values.length ? (
                                <Bar
                                    data={{
                                        labels: stageChart.labels,
                                        datasets: [{
                                            label: '作业数',
                                            data: stageChart.values,
                                            backgroundColor: '#1890ff',
                                        }],
                                    }}
                                    options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                                />
                            ) : <Empty description='暂无作业' />}
                        </div>
                    </Card>
                </Col>
                <Col span={12}>
                    <Card title='标签统计' className='cvat-data-analytics-chart-card'>
                        <div className='cvat-data-analytics-chart-wrapper'>
                            {labelChart.values.length ? (
                                <Bar
                                    data={{
                                        labels: labelChart.labels,
                                        datasets: [{
                                            label: '标注数',
                                            data: labelChart.values,
                                            backgroundColor: '#52c41a',
                                        }],
                                    }}
                                    options={{
                                        maintainAspectRatio: false,
                                        indexAxis: 'y' as const,
                                        plugins: { legend: { display: false } },
                                    }}
                                />
                            ) : <Empty description='暂无标注' />}
                        </div>
                    </Card>
                </Col>
                <Col span={12}>
                    <Card title='形状类型分布' className='cvat-data-analytics-chart-card'>
                        <div className='cvat-data-analytics-chart-wrapper'>
                            {shapeChart.values.length ? (
                                <Doughnut
                                    data={{
                                        labels: shapeChart.labels,
                                        datasets: [{ data: shapeChart.values, backgroundColor: CHART_COLORS }],
                                    }}
                                    options={{ maintainAspectRatio: false }}
                                />
                            ) : <Empty description='暂无形状标注' />}
                        </div>
                    </Card>
                </Col>
            </Row>

            <Title level={5} className='cvat-data-analytics-section-title'>标注来源</Title>
            <Row gutter={[8, 8]}>
                {detail.sources.length ? detail.sources.map((item) => (
                    <Col key={item.source}>
                        <Tag color='blue'>{`${item.source}: ${item.count}`}</Tag>
                    </Col>
                )) : <Empty description='暂无标注' />}
            </Row>

            <Title level={5} className='cvat-data-analytics-section-title'>任务列表</Title>
            <Table
                size='small'
                rowKey='id'
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                dataSource={detail.tasks}
                columns={[
                    { title: '任务', dataIndex: 'name', key: 'name' },
                    {
                        title: '媒体类型', dataIndex: 'media_type', key: 'media_type', width: 100,
                    },
                    {
                        title: '完成度',
                        key: 'completion',
                        width: 160,
                        render: (_: unknown, row) => (
                            <Progress percent={row.completion_percent} size='small' />
                        ),
                    },
                    {
                        title: '作业',
                        key: 'jobs',
                        width: 100,
                        render: (_: unknown, row) => `${row.completed_jobs} / ${row.jobs_count}`,
                    },
                    {
                        title: '标注量', dataIndex: 'annotations', key: 'annotations', width: 100,
                    },
                    {
                        title: '来源抽帧',
                        dataIndex: 'source_frame_extraction',
                        key: 'source_frame_extraction',
                        width: 120,
                        render: (value: string | null) => (
                            value ? <Tag color='green'>抽帧</Tag> : <Tag>—</Tag>
                        ),
                    },
                ]}
            />

            {detail.frame_extraction_sessions.length ? (
                <>
                    <Title level={5} className='cvat-data-analytics-section-title'>关联抽帧数据集</Title>
                    <Row gutter={[8, 8]}>
                        {detail.frame_extraction_sessions.map((session) => (
                            <Col key={session.id}>
                                <Tag color='purple' className='cvat-data-analytics-usage-tag'>
                                    {`${session.output_share_path || session.id}（${session.kept_frames} 帧）`}
                                </Tag>
                            </Col>
                        ))}
                    </Row>
                </>
            ) : null}
        </div>
    );
}

export default React.memo(ProjectAnalyticsDetail);
