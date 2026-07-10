// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Row, Col } from 'antd/lib/grid';
import Card from 'antd/lib/card';
import Table from 'antd/lib/table';
import Spin from 'antd/lib/spin';
import Button from 'antd/lib/button';
import Progress from 'antd/lib/progress';
import Tag from 'antd/lib/tag';
import Empty from 'antd/lib/empty';
import Popover from 'antd/lib/popover';
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

type ProjectDetail = Awaited<ReturnType<typeof core.server.getDataAnalyticsProject>>;
type TaskDataSource = ProjectDetail['tasks'][number]['original_data_sources'][number];

const MAX_VISIBLE_TASK_SOURCES = 2;
const TASK_SOURCE_LABELS: Record<TaskDataSource['kind'], string> = {
    frame_extraction_dataset: '抽帧目录',
    client_file: '上传文件',
    server_file: '共享目录/文件',
    remote_file: '远程地址',
};
const TASK_SOURCE_COLORS: Partial<Record<TaskDataSource['kind'], string>> = {
    frame_extraction_dataset: 'purple',
    remote_file: 'blue',
};

function toChart(data: Record<string, number>): { labels: string[]; values: number[] } {
    const entries = Object.entries(data).filter(([, value]) => value > 0);
    return { labels: entries.map(([key]) => key), values: entries.map(([, value]) => value) };
}

interface Props {
    projectID: number;
    onBack: () => void;
}

interface TaskDataSourceTagProps {
    source: TaskDataSource;
    compact: boolean;
}

function TaskDataSourceTag({ source, compact }: TaskDataSourceTagProps): JSX.Element {
    const className = compact ?
        'cvat-data-analytics-task-source-tag cvat-data-analytics-task-source-tag-compact' :
        'cvat-data-analytics-task-source-tag';

    return (
        <Tag color={TASK_SOURCE_COLORS[source.kind]} className={className} title={source.value}>
            <span className='cvat-data-analytics-task-source-value'>{source.value}</span>
        </Tag>
    );
}

interface TaskDataSourcesProps {
    sources: TaskDataSource[];
    title: string;
}

function TaskDataSources({ sources, title }: TaskDataSourcesProps): JSX.Element {
    if (!sources.length) {
        return <>—</>;
    }

    const visibleSources = sources.slice(0, MAX_VISIBLE_TASK_SOURCES);
    const remainingCount = sources.length - visibleSources.length;
    const compact = sources.length > 1;
    const popoverContent = (
        <div className='cvat-data-analytics-task-source-list'>
            {sources.map((source) => (
                <div className='cvat-data-analytics-task-source-list-item' key={`${source.kind}:${source.value}`}>
                    <span className='cvat-data-analytics-task-source-kind'>
                        {TASK_SOURCE_LABELS[source.kind]}
                    </span>
                    <span className='cvat-data-analytics-task-source-full-value'>{source.value}</span>
                </div>
            ))}
        </div>
    );

    return (
        <div className='cvat-data-analytics-task-sources'>
            {visibleSources.map((source) => (
                <TaskDataSourceTag
                    source={source}
                    compact={compact}
                    key={`${source.kind}:${source.value}`}
                />
            ))}
            {remainingCount > 0 ? (
                <Popover
                    content={popoverContent}
                    title={`${title}（${sources.length}）`}
                    trigger='click'
                    placement='bottomRight'
                    overlayClassName='cvat-data-analytics-task-sources-popover'
                >
                    <Button
                        type='link'
                        size='small'
                        className='cvat-data-analytics-task-sources-more'
                        aria-label={`查看其余 ${remainingCount} 项来源`}
                    >
                        {`+${remainingCount}`}
                    </Button>
                </Popover>
            ) : null}
        </div>
    );
}

function ProjectAnalyticsDetail({ projectID, onBack }: Props): JSX.Element {
    const { t } = useTranslation('resources');
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
                    {
                        title: t('fields.originalDataSources'),
                        dataIndex: 'original_data_sources',
                        key: 'original_data_sources',
                        width: 360,
                        render: (value: TaskDataSource[] | undefined) => (
                            <TaskDataSources
                                sources={value || []}
                                title={t('fields.originalDataSources')}
                            />
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
