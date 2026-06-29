// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, {
    useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Empty from 'antd/lib/empty';
import Input from 'antd/lib/input';
import InputNumber from 'antd/lib/input-number';
import Modal from 'antd/lib/modal';
import Pagination from 'antd/lib/pagination';
import Progress from 'antd/lib/progress';
import Radio from 'antd/lib/radio';
import Select from 'antd/lib/select';
import Space from 'antd/lib/space';
import Spin from 'antd/lib/spin';
import Switch from 'antd/lib/switch';
import Tag from 'antd/lib/tag';
import Tooltip from 'antd/lib/tooltip';
import Text from 'antd/lib/typography/Text';
import Title from 'antd/lib/typography/Title';
import notification from 'antd/lib/notification';
import { Col, Row } from 'antd/lib/grid';
import {
    CopyOutlined,
    DeleteOutlined,
    EyeOutlined,
    ExportOutlined,
    FolderOpenOutlined,
    HistoryOutlined,
    LeftOutlined,
    ReloadOutlined,
    RightOutlined,
    SaveOutlined,
    ScissorOutlined,
    UndoOutlined,
} from '@ant-design/icons';
import { useHistory } from 'react-router-dom';

import { getCore } from 'cvat-core-wrapper';
import RemoteBrowser, { RemoteFile } from 'components/file-manager/remote-browser';

type ProcessingBackend = 'auto' | 'cpu' | 'ffmpeg_gpu';
type SessionStatus = 'queued' | 'started' | 'finished' | 'failed' | 'saved';
type ExcludedFilter = 'false' | 'true' | 'all';

interface FrameExtractionSession {
    id: string;
    status: SessionStatus;
    progress: number;
    sourcePaths: string[];
    outputSharePath: string;
    totalVideos: number;
    processedVideos: number;
    failedVideos: number;
    sampledFrames: number;
    keptFrames: number;
    duplicateFrames: number;
    excludedFrames: number;
    usedBackend: string;
    error: string;
    createdDate: string;
    updatedDate: string;
    finishedDate: string | null;
}

interface FrameExtractionFrame {
    id: number;
    order: number;
    name: string;
    sourcePath: string;
    sourceFrame: number | null;
    width: number | null;
    height: number | null;
    excluded: boolean;
}

interface FramePage {
    count: number;
    page: number;
    pageSize: number;
    results: FrameExtractionFrame[];
}

interface SessionPage {
    count: number;
    page: number;
    pageSize: number;
    results: FrameExtractionSession[];
}

const core = getCore();
const PAGE_SIZE = 60;
const SESSION_PAGE_SIZE = 20;

function statusLabel(status: SessionStatus | null): string {
    if (status === 'queued') return '排队中';
    if (status === 'started') return '抽帧中';
    if (status === 'finished') return '待保存';
    if (status === 'saved') return '已保存';
    if (status === 'failed') return '失败';
    return '未开始';
}

function statusColor(status: SessionStatus | null): string {
    if (status === 'finished') return 'blue';
    if (status === 'saved') return 'green';
    if (status === 'failed') return 'red';
    if (status === 'queued' || status === 'started') return 'orange';
    return 'default';
}

function backendLabel(backend: string): string {
    if (backend === 'ffmpeg_gpu') return 'GPU';
    if (backend === 'cpu') return 'CPU';
    if (backend === 'mixed') return 'GPU/CPU';
    if (backend === 'none') return '无';
    return backend || '自动';
}

function defaultDatasetName(sessionID: string): string {
    return `frames-${sessionID.slice(0, 8)}`;
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '-';

    return new Date(value).toLocaleString();
}

function formatSourcePaths(paths: string[]): string {
    if (!paths.length) return '-';
    if (paths.length === 1) return paths[0];

    return `${paths[0]} 等 ${paths.length} 项`;
}

export default function FrameExtractionPage(): JSX.Element {
    const history = useHistory();
    const [shareFiles, setShareFiles] = useState<RemoteFile[]>([]);
    const [frameInterval, setFrameInterval] = useState(25);
    const [rotateAngle, setRotateAngle] = useState(0);
    const [duplicateThreshold, setDuplicateThreshold] = useState(4);
    const [imageQuality, setImageQuality] = useState(95);
    const [deduplicate, setDeduplicate] = useState(true);
    const [recursive, setRecursive] = useState(true);
    const [processingBackend, setProcessingBackend] = useState<ProcessingBackend>('auto');
    const [sessionID, setSessionID] = useState<string | null>(null);
    const [session, setSession] = useState<FrameExtractionSession | null>(null);
    const [sessions, setSessions] = useState<FrameExtractionSession[]>([]);
    const [sessionCount, setSessionCount] = useState(0);
    const [sessionPage, setSessionPage] = useState(1);
    const [frames, setFrames] = useState<FramePage | null>(null);
    const [excludedFilter, setExcludedFilter] = useState<ExcludedFilter>('false');
    const [page, setPage] = useState(1);
    const [datasetName, setDatasetName] = useState('');
    const [selected, setSelected] = useState<number[]>([]);
    const [starting, setStarting] = useState(false);
    const [loadingSessions, setLoadingSessions] = useState(false);
    const [loadingFrames, setLoadingFrames] = useState(false);
    const [saving, setSaving] = useState(false);
    const [previewFrameID, setPreviewFrameID] = useState<number | null>(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const pollRef = useRef<number | null>(null);
    const selectedSessionRef = useRef<string | null>(null);

    const selectedSharePaths = useMemo(() => shareFiles.map((file) => file.key), [shareFiles]);
    const canEditFrames = session?.status === 'finished';
    const running = session?.status === 'queued' || session?.status === 'started';

    useEffect(() => {
        selectedSessionRef.current = sessionID;
    }, [sessionID]);

    const loadSession = useCallback(async (id: string): Promise<FrameExtractionSession> => {
        const nextSession = await core.server.getFrameExtractionSession(id);
        setSession(nextSession);
        return nextSession;
    }, []);

    const loadSessions = useCallback(async (nextPage = 1): Promise<FrameExtractionSession[]> => {
        setLoadingSessions(true);
        try {
            const response = await core.server.listFrameExtractionSessions({
                page: nextPage,
                pageSize: SESSION_PAGE_SIZE,
            }) as SessionPage;
            setSessions(response.results);
            setSessionCount(response.count);
            setSessionPage(response.page);
            return response.results;
        } catch (error: any) {
            notification.error({
                message: '无法加载抽帧历史',
                description: error.toString(),
            });
            return [];
        } finally {
            setLoadingSessions(false);
        }
    }, []);

    const loadFrames = useCallback(async (
        id: string,
        nextPage = 1,
        nextFilter: ExcludedFilter = 'false',
    ): Promise<FramePage | null> => {
        setLoadingFrames(true);
        try {
            const framePage = await core.server.getFrameExtractionFrames(id, {
                page: nextPage,
                pageSize: PAGE_SIZE,
                excluded: nextFilter,
            });
            setFrames(framePage);
            return framePage;
        } catch (error: any) {
            notification.error({
                message: '无法加载候选帧',
                description: error.toString(),
            });
            return null;
        } finally {
            setLoadingFrames(false);
        }
    }, []);

    const openSession = useCallback(async (id: string): Promise<void> => {
        setSessionID(id);
        setSelected([]);
        setPage(1);
        setExcludedFilter('false');
        setFrames(null);
        setPreviewFrameID(null);

        try {
            const nextSession = await loadSession(id);
            setDatasetName(nextSession.outputSharePath ? '' : defaultDatasetName(id));

            if (nextSession.status === 'finished' || nextSession.status === 'saved') {
                await loadFrames(id, 1, 'false');
            }
        } catch (error: any) {
            notification.error({
                message: '无法打开抽帧记录',
                description: error.toString(),
            });
        }
    }, [loadFrames, loadSession]);

    useEffect(() => {
        let disposed = false;

        const bootstrap = async (): Promise<void> => {
            const results = await loadSessions(1);
            if (!disposed && !selectedSessionRef.current && results.length) {
                await openSession(results[0].id);
            }
        };

        bootstrap();

        return () => {
            disposed = true;
        };
    }, [loadSessions, openSession]);

    useEffect(() => () => {
        if (pollRef.current !== null) {
            window.clearTimeout(pollRef.current);
        }
    }, []);

    useEffect(() => {
        if (!sessionID || !running) return undefined;

        const poll = async (): Promise<void> => {
            try {
                const nextSession = await loadSession(sessionID);
                if (nextSession.status === 'finished' || nextSession.status === 'saved') {
                    await loadFrames(sessionID, 1, excludedFilter);
                    await loadSessions(sessionPage);
                    setPage(1);
                } else if (nextSession.status === 'failed') {
                    await loadSessions(sessionPage);
                    notification.error({
                        message: '抽帧任务失败',
                        description: nextSession.error,
                    });
                } else {
                    pollRef.current = window.setTimeout(poll, 3000);
                }
            } catch (error: any) {
                notification.error({
                    message: '无法获取抽帧状态',
                    description: error.toString(),
                });
            }
        };

        pollRef.current = window.setTimeout(poll, 1500);
        return () => {
            if (pollRef.current !== null) {
                window.clearTimeout(pollRef.current);
            }
        };
    }, [sessionID, running, loadFrames, loadSession, loadSessions, excludedFilter, sessionPage]);

    const startExtraction = async (): Promise<void> => {
        if (!selectedSharePaths.length) {
            notification.error({ message: '请选择共享视频或目录' });
            return;
        }

        setStarting(true);
        setSelected([]);
        setFrames(null);
        setPreviewFrameID(null);
        try {
            const result = await core.server.startFrameExtraction({
                sharePaths: selectedSharePaths,
                frameInterval,
                rotateAngle,
                deduplicate,
                duplicateThreshold,
                recursive,
                imageQuality,
                processingBackend,
            });
            setSessionID(result.sessionId);
            setDatasetName(defaultDatasetName(result.sessionId));
            await loadSession(result.sessionId);
            await loadSessions(1);
            notification.success({ message: '抽帧任务已启动' });
        } catch (error: any) {
            notification.error({
                message: '启动抽帧失败',
                description: error.toString(),
            });
        } finally {
            setStarting(false);
        }
    };

    const updateFrames = async (
        payload: { exclude?: number[]; restore?: number[] },
        options: { keepPreview?: boolean } = {},
    ): Promise<FramePage | null> => {
        if (!sessionID || !canEditFrames) return null;

        try {
            await core.server.updateFrameExtractionFrames(sessionID, payload);
            setSelected([]);
            await loadSession(sessionID);
            let nextPage = page;
            let nextFramePage = await loadFrames(sessionID, nextPage, excludedFilter);
            if (nextFramePage && !nextFramePage.results.length && nextFramePage.count > 0 && nextPage > 1) {
                nextPage = Math.ceil(nextFramePage.count / nextFramePage.pageSize);
                setPage(nextPage);
                nextFramePage = await loadFrames(sessionID, nextPage, excludedFilter);
            }
            if (!options.keepPreview) {
                setPreviewFrameID(null);
            }
            return nextFramePage;
        } catch (error: any) {
            notification.error({
                message: '更新筛选状态失败',
                description: error.toString(),
            });
            return null;
        }
    };

    const openCreateTask = useCallback((sharePath: string): void => {
        history.push(`/tasks/create?share_path=${encodeURIComponent(sharePath)}`);
    }, [history]);

    const copySharePath = async (): Promise<void> => {
        if (!session?.outputSharePath) return;

        try {
            await navigator.clipboard.writeText(session.outputSharePath);
            notification.success({ message: '共享路径已复制' });
        } catch (error: any) {
            notification.error({
                message: '复制共享路径失败',
                description: error.toString(),
            });
        }
    };

    const saveDataset = async (createTaskAfterSave = false): Promise<void> => {
        if (!sessionID || !session) return;

        setSaving(true);
        try {
            const result = await core.server.saveFrameExtractionDataset(sessionID, {
                outputName: datasetName.trim() || undefined,
            });
            await loadSession(sessionID);
            await loadSessions(sessionPage);
            notification.success({
                message: '数据集已保存',
                description: `共享路径：${result.sharePath}`,
            });
            if (createTaskAfterSave) {
                openCreateTask(result.sharePath);
            }
        } catch (error: any) {
            notification.error({
                message: '保存数据集失败',
                description: error.toString(),
            });
        } finally {
            setSaving(false);
        }
    };

    const refreshFrames = async (): Promise<void> => {
        if (!sessionID) return;
        await loadSession(sessionID);
        await loadFrames(sessionID, page, excludedFilter);
        setSelected([]);
        setPreviewFrameID(null);
    };

    const toggleSelected = (frameID: number): void => {
        setSelected((prev) => (
            prev.includes(frameID) ? prev.filter((id) => id !== frameID) : [...prev, frameID]
        ));
    };

    const visibleFrameIDs = frames?.results.map((frame) => frame.id) || [];
    const allVisibleSelected = visibleFrameIDs.length > 0 &&
        visibleFrameIDs.every((frameID) => selected.includes(frameID));
    const previewFrameIndex = frames?.results.findIndex((frame) => frame.id === previewFrameID) ?? -1;
    const previewFrame = frames && previewFrameIndex >= 0 ? frames.results[previewFrameIndex] : null;
    const lastPreviewPage = frames ? Math.max(1, Math.ceil(frames.count / frames.pageSize)) : 1;
    const canPreviewPrevious = !!previewFrame && !!frames && (
        previewFrameIndex > 0 || frames.page > 1
    );
    const canPreviewNext = !!previewFrame && !!frames && (
        previewFrameIndex < frames.results.length - 1 || frames.page < lastPreviewPage
    );

    const openFramePreview = (frameID: number): void => {
        setPreviewFrameID(frameID);
    };

    const navigatePreviewFrame = async (direction: -1 | 1): Promise<void> => {
        if (!frames || !sessionID || previewFrameIndex < 0 || previewBusy) return;

        const nextIndex = previewFrameIndex + direction;
        if (nextIndex >= 0 && nextIndex < frames.results.length) {
            setPreviewFrameID(frames.results[nextIndex].id);
            return;
        }

        const nextPage = frames.page + direction;
        if (nextPage < 1 || nextPage > lastPreviewPage) return;

        setPreviewBusy(true);
        try {
            const nextFramePage = await loadFrames(sessionID, nextPage, excludedFilter);
            if (nextFramePage?.results.length) {
                setPage(nextPage);
                const nextFrame = direction > 0 ?
                    nextFramePage.results[0] :
                    nextFramePage.results[nextFramePage.results.length - 1];
                setPreviewFrameID(nextFrame.id);
            }
        } finally {
            setPreviewBusy(false);
        }
    };

    const togglePreviewFrameStatus = async (): Promise<void> => {
        if (!previewFrame || previewBusy) return;

        setPreviewBusy(true);
        try {
            const currentFrameID = previewFrame.id;
            const currentFrameIndex = previewFrameIndex;
            const nextFramePage = await updateFrames(
                previewFrame.excluded ?
                    { restore: [previewFrame.id] } :
                    { exclude: [previewFrame.id] },
                { keepPreview: true },
            );

            if (!nextFramePage) return;

            if (excludedFilter === 'all') {
                setPreviewFrameID(currentFrameID);
                return;
            }

            const replacementFrame = nextFramePage.results[
                Math.min(currentFrameIndex, nextFramePage.results.length - 1)
            ];
            setPreviewFrameID(replacementFrame?.id ?? null);
        } finally {
            setPreviewBusy(false);
        }
    };

    return (
        <div className='cvat-frame-extraction-page'>
            <div className='cvat-frame-extraction-header'>
                <Space align='center'>
                    <ScissorOutlined />
                    <Title level={4}>抽帧筛选</Title>
                </Space>
                <Space>
                    <Tag color={statusColor(session?.status || null)}>
                        {statusLabel(session?.status || null)}
                    </Tag>
                    {session?.outputSharePath ? (
                        <Tooltip title={session.outputSharePath}>
                            <Tag color='green'>已保存</Tag>
                        </Tooltip>
                    ) : null}
                </Space>
            </div>

            <Row gutter={[16, 16]} className='cvat-frame-extraction-control-band'>
                <Col xs={24} xl={5}>
                    <div className='cvat-frame-extraction-panel cvat-frame-extraction-history-panel'>
                        <div className='cvat-frame-extraction-panel-title'>
                            <HistoryOutlined />
                            <Text strong>历史任务</Text>
                        </div>
                        {loadingSessions ? (
                            <div className='cvat-frame-extraction-history-loading'>
                                <Spin />
                            </div>
                        ) : null}
                        {!loadingSessions && sessions.length ? (
                            <div className='cvat-frame-extraction-history'>
                                {sessions.map((item) => (
                                    <button
                                        key={item.id}
                                        type='button'
                                        className={[
                                            'cvat-frame-extraction-history-item',
                                            item.id === sessionID ? 'cvat-frame-extraction-history-item-active' : '',
                                        ].filter(Boolean).join(' ')}
                                        onClick={() => openSession(item.id)}
                                    >
                                        <span className='cvat-frame-extraction-history-item-head'>
                                            <Tag color={statusColor(item.status)}>
                                                {statusLabel(item.status)}
                                            </Tag>
                                            <Text type='secondary'>{formatDateTime(item.createdDate)}</Text>
                                        </span>
                                        <Text ellipsis title={formatSourcePaths(item.sourcePaths)}>
                                            {formatSourcePaths(item.sourcePaths)}
                                        </Text>
                                        <span className='cvat-frame-extraction-history-item-meta'>
                                            <Text type='secondary'>{`保留 ${item.keptFrames}`}</Text>
                                            <Text type='secondary'>{`排除 ${item.excludedFrames}`}</Text>
                                        </span>
                                        {item.outputSharePath ? (
                                            <Text ellipsis type='secondary' title={item.outputSharePath}>
                                                {item.outputSharePath}
                                            </Text>
                                        ) : null}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        {!loadingSessions && !sessions.length ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='暂无历史任务' />
                        ) : null}
                        {sessionCount > SESSION_PAGE_SIZE ? (
                            <Pagination
                                className='cvat-frame-extraction-history-pagination'
                                size='small'
                                current={sessionPage}
                                pageSize={SESSION_PAGE_SIZE}
                                total={sessionCount}
                                showSizeChanger={false}
                                onChange={async (nextPage) => {
                                    await loadSessions(nextPage);
                                }}
                            />
                        ) : null}
                    </div>
                </Col>
                <Col xs={24} xl={11}>
                    <div className='cvat-frame-extraction-panel'>
                        <div className='cvat-frame-extraction-panel-title'>
                            <FolderOpenOutlined />
                            <Text strong>共享视频或目录</Text>
                        </div>
                        <RemoteBrowser resource='share' onSelectFiles={setShareFiles} />
                    </div>
                </Col>
                <Col xs={24} xl={8}>
                    <div className='cvat-frame-extraction-panel cvat-frame-extraction-settings'>
                        <Row gutter={[12, 12]}>
                            <Col xs={24} sm={12}>
                                <Text className='cvat-text-color'>抽帧间隔</Text>
                                <InputNumber
                                    min={1}
                                    value={frameInterval}
                                    onChange={(value) => setFrameInterval(value || 1)}
                                />
                            </Col>
                            <Col xs={24} sm={12}>
                                <Text className='cvat-text-color'>处理方式</Text>
                                <Select
                                    value={processingBackend}
                                    onChange={(value: ProcessingBackend) => setProcessingBackend(value)}
                                    options={[
                                        { value: 'auto', label: '自动' },
                                        { value: 'ffmpeg_gpu', label: 'GPU' },
                                        { value: 'cpu', label: 'CPU' },
                                    ]}
                                />
                            </Col>
                            <Col xs={24} sm={12}>
                                <Text className='cvat-text-color'>去重阈值</Text>
                                <InputNumber
                                    min={0}
                                    max={64}
                                    disabled={!deduplicate}
                                    value={duplicateThreshold}
                                    onChange={(value) => setDuplicateThreshold(value || 0)}
                                />
                            </Col>
                            <Col xs={24} sm={12}>
                                <Text className='cvat-text-color'>旋转角度</Text>
                                <InputNumber
                                    min={-360}
                                    max={360}
                                    step={90}
                                    value={rotateAngle}
                                    onChange={(value) => setRotateAngle(value || 0)}
                                />
                            </Col>
                            <Col xs={24} sm={12}>
                                <Text className='cvat-text-color'>图片质量</Text>
                                <InputNumber
                                    min={1}
                                    max={100}
                                    value={imageQuality}
                                    onChange={(value) => setImageQuality(value || 95)}
                                />
                            </Col>
                            <Col xs={24} sm={12}>
                                <Space className='cvat-frame-extraction-switch-row'>
                                    <Switch checked={deduplicate} onChange={setDeduplicate} />
                                    <Text>自动去重</Text>
                                </Space>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Space className='cvat-frame-extraction-switch-row'>
                                    <Switch checked={recursive} onChange={setRecursive} />
                                    <Text>递归目录</Text>
                                </Space>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Button
                                    type='primary'
                                    icon={<ScissorOutlined />}
                                    loading={starting}
                                    disabled={running}
                                    onClick={startExtraction}
                                >
                                    启动抽帧
                                </Button>
                            </Col>
                        </Row>

                        <div className='cvat-frame-extraction-status'>
                            <Progress percent={Math.round((session?.progress || 0) * 100)} />
                            <Row gutter={[8, 8]}>
                                <Col span={8}>
                                    <Text type='secondary'>视频</Text>
                                    <Text strong>
                                        {`${session?.processedVideos || 0}/${session?.totalVideos || 0}`}
                                    </Text>
                                </Col>
                                <Col span={8}>
                                    <Text type='secondary'>保留</Text>
                                    <Text strong>{session?.keptFrames || 0}</Text>
                                </Col>
                                <Col span={8}>
                                    <Text type='secondary'>排除</Text>
                                    <Text strong>{session?.excludedFrames || 0}</Text>
                                </Col>
                                <Col span={8}>
                                    <Text type='secondary'>采样</Text>
                                    <Text strong>{session?.sampledFrames || 0}</Text>
                                </Col>
                                <Col span={8}>
                                    <Text type='secondary'>去重</Text>
                                    <Text strong>{session?.duplicateFrames || 0}</Text>
                                </Col>
                                <Col span={8}>
                                    <Text type='secondary'>后端</Text>
                                    <Text strong>{backendLabel(session?.usedBackend || processingBackend)}</Text>
                                </Col>
                            </Row>
                            {session?.status === 'failed' ? (
                                <Alert type='error' message={session.error} showIcon />
                            ) : null}
                            {session?.status === 'finished' ? (
                                <div className='cvat-frame-extraction-save-actions'>
                                    <Text className='cvat-text-color'>数据集目录名</Text>
                                    <Input
                                        value={datasetName}
                                        maxLength={128}
                                        placeholder={defaultDatasetName(session.id)}
                                        onChange={(event) => setDatasetName(event.target.value)}
                                    />
                                    <Space wrap>
                                        <Button
                                            icon={<SaveOutlined />}
                                            loading={saving}
                                            onClick={() => saveDataset(false)}
                                        >
                                            保存数据集
                                        </Button>
                                        <Button
                                            type='primary'
                                            icon={<ExportOutlined />}
                                            loading={saving}
                                            onClick={() => saveDataset(true)}
                                        >
                                            保存并创建任务
                                        </Button>
                                    </Space>
                                </div>
                            ) : null}
                            {session?.outputSharePath ? (
                                <div className='cvat-frame-extraction-saved-path'>
                                    <Alert
                                        type='success'
                                        message='已保存到共享目录'
                                        description={session.outputSharePath}
                                        showIcon
                                    />
                                    <Space wrap>
                                        <Button icon={<CopyOutlined />} onClick={copySharePath}>
                                            复制路径
                                        </Button>
                                        <Button
                                            type='primary'
                                            icon={<ExportOutlined />}
                                            onClick={() => openCreateTask(session.outputSharePath)}
                                        >
                                            创建任务
                                        </Button>
                                    </Space>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </Col>
            </Row>

            <div className='cvat-frame-extraction-toolbar'>
                <Space wrap>
                    <Radio.Group
                        value={excludedFilter}
                        onChange={async (event) => {
                            const nextFilter = event.target.value as ExcludedFilter;
                            setExcludedFilter(nextFilter);
                            setPage(1);
                            setSelected([]);
                            setPreviewFrameID(null);
                            if (sessionID) await loadFrames(sessionID, 1, nextFilter);
                        }}
                    >
                        <Radio.Button value='false'>保留</Radio.Button>
                        <Radio.Button value='true'>已排除</Radio.Button>
                        <Radio.Button value='all'>全部</Radio.Button>
                    </Radio.Group>
                    <Button
                        icon={<ReloadOutlined />}
                        disabled={!sessionID}
                        onClick={refreshFrames}
                    >
                        刷新
                    </Button>
                    <Button
                        disabled={!visibleFrameIDs.length}
                        onClick={() => {
                            setSelected(allVisibleSelected ? [] : visibleFrameIDs);
                        }}
                    >
                        {allVisibleSelected ? '取消选择' : '选择当前页'}
                    </Button>
                    <Button
                        danger
                        icon={<DeleteOutlined />}
                        disabled={!selected.length || !canEditFrames}
                        onClick={() => updateFrames({ exclude: selected })}
                    >
                        删除选中
                    </Button>
                    <Button
                        icon={<UndoOutlined />}
                        disabled={!selected.length || !canEditFrames}
                        onClick={() => updateFrames({ restore: selected })}
                    >
                        恢复选中
                    </Button>
                </Space>
            </div>

            <div className='cvat-frame-extraction-grid-wrap'>
                {loadingFrames ? (
                    <div className='cvat-frame-extraction-loading'>
                        <Spin />
                    </div>
                ) : null}
                {!loadingFrames && frames && frames.results.length ? (
                    <div className='cvat-frame-extraction-grid'>
                        {frames.results.map((frame) => {
                            const isSelected = selected.includes(frame.id);
                            return (
                                <div
                                    key={frame.id}
                                    className={[
                                        'cvat-frame-extraction-frame',
                                        frame.excluded ? 'cvat-frame-extraction-frame-excluded' : '',
                                        isSelected ? 'cvat-frame-extraction-frame-selected' : '',
                                    ].filter(Boolean).join(' ')}
                                >
                                    <button
                                        type='button'
                                        className='cvat-frame-extraction-frame-preview-button'
                                        aria-label={`查看 ${frame.name}`}
                                        onClick={() => openFramePreview(frame.id)}
                                    >
                                        <img
                                            src={core.server.getFrameExtractionImageURL(sessionID as string, frame.id)}
                                            alt={frame.name}
                                        />
                                        <span className='cvat-frame-extraction-frame-preview-hint'>
                                            <EyeOutlined />
                                            查看
                                        </span>
                                    </button>
                                    <button
                                        type='button'
                                        className='cvat-frame-extraction-frame-meta'
                                        aria-pressed={isSelected}
                                        onClick={() => toggleSelected(frame.id)}
                                    >
                                        <span className='cvat-frame-extraction-frame-name' title={frame.name}>
                                            {frame.name}
                                        </span>
                                        <span className='cvat-frame-extraction-frame-number'>
                                            {frame.sourceFrame === null ? '-' : `#${frame.sourceFrame}`}
                                        </span>
                                    </button>
                                    <div className='cvat-frame-extraction-frame-actions'>
                                        <Tooltip title={frame.excluded ? '恢复' : '删除'}>
                                            <Button
                                                size='small'
                                                icon={frame.excluded ? <UndoOutlined /> : <DeleteOutlined />}
                                                disabled={!canEditFrames}
                                                danger={!frame.excluded}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    updateFrames(
                                                        frame.excluded ?
                                                            { restore: [frame.id] } :
                                                            { exclude: [frame.id] },
                                                    );
                                                }}
                                            />
                                        </Tooltip>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
                {!loadingFrames && (!frames || !frames.results.length) ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description='暂无候选帧' />
                ) : null}
            </div>

            {frames ? (
                <div className='cvat-frame-extraction-pagination'>
                    <Pagination
                        current={page}
                        pageSize={frames.pageSize}
                        total={frames.count}
                        showSizeChanger={false}
                        onChange={async (nextPage) => {
                            setPage(nextPage);
                            setSelected([]);
                            setPreviewFrameID(null);
                            if (sessionID) await loadFrames(sessionID, nextPage, excludedFilter);
                        }}
                    />
                </div>
            ) : null}
            <Modal
                className='cvat-frame-extraction-preview-modal'
                title={previewFrame ? previewFrame.name : '查看图片'}
                open={!!previewFrame}
                width='calc(100vw - 96px)'
                footer={null}
                centered
                destroyOnClose
                onCancel={() => setPreviewFrameID(null)}
            >
                {previewFrame ? (
                    <div className='cvat-frame-extraction-preview'>
                        <div className='cvat-frame-extraction-preview-main'>
                            <Tooltip title='上一张'>
                                <Button
                                    className='cvat-frame-extraction-preview-nav'
                                    icon={<LeftOutlined />}
                                    disabled={!canPreviewPrevious || previewBusy}
                                    onClick={() => navigatePreviewFrame(-1)}
                                />
                            </Tooltip>
                            <div className='cvat-frame-extraction-preview-image-wrap'>
                                <img
                                    src={core.server.getFrameExtractionImageURL(
                                        sessionID as string,
                                        previewFrame.id,
                                        'full',
                                    )}
                                    alt={previewFrame.name}
                                />
                            </div>
                            <Tooltip title='下一张'>
                                <Button
                                    className='cvat-frame-extraction-preview-nav'
                                    icon={<RightOutlined />}
                                    disabled={!canPreviewNext || previewBusy}
                                    onClick={() => navigatePreviewFrame(1)}
                                />
                            </Tooltip>
                        </div>
                        <div className='cvat-frame-extraction-preview-footer'>
                            <div className='cvat-frame-extraction-preview-info'>
                                <Text strong ellipsis title={previewFrame.name}>
                                    {previewFrame.name}
                                </Text>
                                <Space wrap size={[12, 4]}>
                                    <Text type='secondary'>
                                        {previewFrame.sourceFrame === null ? '帧号 -' : `帧号 #${previewFrame.sourceFrame}`}
                                    </Text>
                                    <Text type='secondary'>
                                        {previewFrame.width && previewFrame.height ?
                                            `${previewFrame.width}x${previewFrame.height}` :
                                            '尺寸 -'}
                                    </Text>
                                    <Text type='secondary' ellipsis title={previewFrame.sourcePath}>
                                        {previewFrame.sourcePath}
                                    </Text>
                                </Space>
                            </div>
                            <Space wrap className='cvat-frame-extraction-preview-actions'>
                                <Button
                                    icon={<LeftOutlined />}
                                    disabled={!canPreviewPrevious || previewBusy}
                                    onClick={() => navigatePreviewFrame(-1)}
                                >
                                    上一张
                                </Button>
                                <Button
                                    icon={<RightOutlined />}
                                    disabled={!canPreviewNext || previewBusy}
                                    onClick={() => navigatePreviewFrame(1)}
                                >
                                    下一张
                                </Button>
                                <Button
                                    danger={!previewFrame.excluded}
                                    icon={previewFrame.excluded ? <UndoOutlined /> : <DeleteOutlined />}
                                    disabled={!canEditFrames}
                                    loading={previewBusy}
                                    onClick={togglePreviewFrameStatus}
                                >
                                    {previewFrame.excluded ? '恢复' : '删除'}
                                </Button>
                            </Space>
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}
