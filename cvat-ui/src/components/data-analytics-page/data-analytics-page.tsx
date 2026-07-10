// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';

import React, { useCallback, useEffect, useState } from 'react';
import { useHistory, useParams } from 'react-router';
import { Redirect } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Layout from 'antd/lib/layout';
import { Row, Col } from 'antd/lib/grid';
import Card from 'antd/lib/card';
import Statistic from 'antd/lib/statistic';
import Table from 'antd/lib/table';
import Tabs from 'antd/lib/tabs';
import Button from 'antd/lib/button';
import Spin from 'antd/lib/spin';
import Tag from 'antd/lib/tag';
import Empty from 'antd/lib/empty';
import Progress from 'antd/lib/progress';
import Title from 'antd/lib/typography/Title';
import notification from 'antd/lib/notification';
import { ReloadOutlined } from '@ant-design/icons';
import {
    Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement,
} from 'chart.js';

import { getCore } from 'cvat-core-wrapper';
import { CombinedState } from 'reducers';
import ProjectAnalyticsDetail from './project-analytics-detail';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const core = getCore();

interface Overview {
    share_videos: number;
    frame_extraction: {
        total: number;
        by_status: Record<string, number>;
        saved_datasets: number;
        kept_frames: number;
        duplicate_frames: number;
    };
    projects: number;
    tasks: number;
    jobs: {
        total: number;
        completed: number;
        completion_percent: number;
        by_state: Record<string, number>;
        by_stage: Record<string, number>;
    };
    annotations: { shapes: number; tracks: number; tags: number };
}

interface ProjectRow {
    id: number;
    name: string;
    owner: string | null;
    organization: string | null;
    tasks_count: number;
    jobs_count: number;
    completed_jobs: number;
    completion_percent: number;
    labels_count: number;
    annotations: number;
}

interface DataSources {
    videos: {
        total: number;
        processed: number;
        listed: number;
        results: { path: string; size: number; processed: boolean }[];
    };
    frame_extraction_sessions: {
        id: string;
        status: string;
        owner: string | null;
        total_videos: number;
        sampled_frames: number;
        kept_frames: number;
        duplicate_frames: number;
        output_share_path: string;
        saved: boolean;
        usage: {
            task_id: number;
            task_name: string;
            project_id: number | null;
            project_name: string | null;
            linked: boolean;
        }[];
    }[];
}

function humanSize(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

function DataAnalyticsPage(): JSX.Element {
    const history = useHistory();
    const { pid } = useParams<{ pid?: string }>();
    const user = useSelector((state: CombinedState) => state.auth.user);
    const canAccessDataAnalytics = Boolean(user && (user.isStaff || user.isSuperuser));

    const [overview, setOverview] = useState<Overview | null>(null);
    const [projects, setProjects] = useState<ProjectRow[]>([]);
    const [dataSources, setDataSources] = useState<DataSources | null>(null);
    const [fetching, setFetching] = useState(true);

    const load = useCallback(() => {
        setFetching(true);
        Promise.all([
            core.server.getDataAnalyticsOverview(),
            core.server.getDataAnalyticsProjects({ pageSize: 100 }),
        ]).then(([overviewResult, projectsResult]) => {
            setOverview(overviewResult);
            setProjects(projectsResult.results);
            return core.server.getDataAnalyticsDataSources();
        }).then((dataSourcesResult) => {
            setDataSources(dataSourcesResult);
        }).catch((error: unknown) => {
            notification.error({
                message: '加载数据分析失败',
                description: error instanceof Error ? error.message : '',
            });
        }).finally(() => {
            setFetching(false);
        });
    }, []);

    useEffect(() => {
        if (canAccessDataAnalytics && !pid) {
            load();
        }
    }, [canAccessDataAnalytics, load, pid]);

    if (!canAccessDataAnalytics) {
        return <Redirect to='/tasks' />;
    }

    if (pid) {
        return (
            <Layout.Content className='cvat-data-analytics-page'>
                <ProjectAnalyticsDetail
                    projectID={+pid}
                    onBack={() => history.push('/data-analytics')}
                />
            </Layout.Content>
        );
    }

    const extraction = overview?.frame_extraction;

    return (
        <Layout.Content className='cvat-data-analytics-page'>
            <div className='cvat-data-analytics-page-header'>
                <Title level={3}>数据分析</Title>
                <Button icon={<ReloadOutlined />} onClick={load} loading={fetching}>刷新</Button>
            </div>

            {fetching && !overview ? <Spin className='cvat-spinner' /> : null}

            {overview ? (
                <Row gutter={[16, 16]}>
                    <Col span={4}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <Statistic title='共享视频文件' value={overview.share_videos} />
                        </Card>
                    </Col>
                    <Col span={4}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <Statistic title='抽帧会话' value={extraction?.total ?? 0} />
                        </Card>
                    </Col>
                    <Col span={4}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <Statistic title='已保存数据集' value={extraction?.saved_datasets ?? 0} />
                        </Card>
                    </Col>
                    <Col span={4}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <Statistic title='项目数' value={overview.projects} />
                        </Card>
                    </Col>
                    <Col span={4}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <Statistic title='任务数' value={overview.tasks} />
                        </Card>
                    </Col>
                    <Col span={4}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <Statistic title='作业数' value={overview.jobs.total} />
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <div className='ant-statistic-title'>整体作业完成度</div>
                            <Progress percent={overview.jobs.completion_percent} />
                            <div>{`${overview.jobs.completed} / ${overview.jobs.total} 作业已完成`}</div>
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <Statistic title='总标注量' value={
                                overview.annotations.shapes +
                                overview.annotations.tracks +
                                overview.annotations.tags
                            }
                            />
                            <div>
                                {`形状 ${overview.annotations.shapes} · ` +
                                `轨迹 ${overview.annotations.tracks} · ` +
                                `标签 ${overview.annotations.tags}`}
                            </div>
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <Statistic title='保留 / 重复帧' value={extraction?.kept_frames ?? 0} />
                            <div>{`重复帧 ${extraction?.duplicate_frames ?? 0}`}</div>
                        </Card>
                    </Col>
                    <Col span={6}>
                        <Card className='cvat-data-analytics-summary-card'>
                            <Statistic title='已处理视频' value={dataSources?.videos.processed ?? 0} />
                            <div>{`共 ${dataSources?.videos.total ?? 0} 个视频`}</div>
                        </Card>
                    </Col>
                </Row>
            ) : null}

            <Tabs
                className='cvat-data-analytics-tabs'
                defaultActiveKey='projects'
                items={[
                    {
                        key: 'projects',
                        label: '项目',
                        children: (
                            <Table
                                size='small'
                                rowKey='id'
                                dataSource={projects}
                                loading={fetching}
                                pagination={{ pageSize: 15, hideOnSinglePage: true }}
                                onRow={(row) => ({
                                    onClick: () => history.push(`/data-analytics/projects/${row.id}`),
                                    style: { cursor: 'pointer' },
                                })}
                                columns={[
                                    { title: '项目', dataIndex: 'name', key: 'name' },
                                    {
                                        title: 'Owner', dataIndex: 'owner', key: 'owner', width: 120,
                                    },
                                    {
                                        title: '组织', dataIndex: 'organization', key: 'organization', width: 120,
                                    },
                                    {
                                        title: '任务', dataIndex: 'tasks_count', key: 'tasks_count', width: 80,
                                    },
                                    {
                                        title: '完成度',
                                        key: 'completion',
                                        width: 180,
                                        render: (_: unknown, row: ProjectRow) => (
                                            <Progress percent={row.completion_percent} size='small' />
                                        ),
                                    },
                                    {
                                        title: '作业',
                                        key: 'jobs',
                                        width: 100,
                                        render: (_: unknown, row: ProjectRow) => (
                                            `${row.completed_jobs} / ${row.jobs_count}`
                                        ),
                                    },
                                    {
                                        title: '标签数', dataIndex: 'labels_count', key: 'labels_count', width: 90,
                                    },
                                    {
                                        title: '标注量', dataIndex: 'annotations', key: 'annotations', width: 100,
                                    },
                                ]}
                            />
                        ),
                    },
                    {
                        key: 'data-sources',
                        label: '数据源 / 抽帧',
                        children: (
                            <div>
                                <Title level={5} className='cvat-data-analytics-section-title'>共享视频</Title>
                                <Table
                                    size='small'
                                    rowKey='path'
                                    dataSource={dataSources?.videos.results ?? []}
                                    loading={fetching}
                                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                                    columns={[
                                        { title: '路径', dataIndex: 'path', key: 'path' },
                                        {
                                            title: '大小',
                                            dataIndex: 'size',
                                            key: 'size',
                                            width: 120,
                                            render: (value: number) => humanSize(value),
                                        },
                                        {
                                            title: '是否已抽帧',
                                            dataIndex: 'processed',
                                            key: 'processed',
                                            width: 120,
                                            render: (value: boolean) => (
                                                value ? <Tag color='green'>已抽帧</Tag> : <Tag>未处理</Tag>
                                            ),
                                        },
                                    ]}
                                />
                                <Title level={5} className='cvat-data-analytics-section-title'>抽帧会话</Title>
                                <Table
                                    size='small'
                                    rowKey='id'
                                    dataSource={dataSources?.frame_extraction_sessions ?? []}
                                    loading={fetching}
                                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                                    columns={[
                                        {
                                            title: '会话',
                                            key: 'session',
                                            render: (_: unknown, row) => row.output_share_path || row.id,
                                        },
                                        {
                                            title: '状态', dataIndex: 'status', key: 'status', width: 90,
                                        },
                                        {
                                            title: '视频数', dataIndex: 'total_videos', key: 'total_videos', width: 80,
                                        },
                                        {
                                            title: '保留帧', dataIndex: 'kept_frames', key: 'kept_frames', width: 80,
                                        },
                                        {
                                            title: '重复帧',
                                            dataIndex: 'duplicate_frames',
                                            key: 'duplicate_frames',
                                            width: 80,
                                        },
                                        {
                                            title: '被使用（任务 / 项目）',
                                            key: 'usage',
                                            render: (_: unknown, row) => (
                                                row.usage.length ? row.usage.map((item) => (
                                                    <Tag
                                                        key={item.task_id}
                                                        color={item.linked ? 'green' : 'orange'}
                                                        className='cvat-data-analytics-usage-tag'
                                                    >
                                                        {item.project_name ? `${item.project_name} / ` : ''}
                                                        {item.task_name}
                                                        {item.linked ? '' : '（推断）'}
                                                    </Tag>
                                                )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='未被使用' />
                                            ),
                                        },
                                    ]}
                                />
                            </div>
                        ),
                    },
                ]}
            />
        </Layout.Content>
    );
}

export default React.memo(DataAnalyticsPage);
