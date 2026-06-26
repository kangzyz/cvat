// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import Button from 'antd/lib/button';
import Collapse from 'antd/lib/collapse';
import InputNumber from 'antd/lib/input-number';
import notification from 'antd/lib/notification';
import Row from 'antd/lib/row';
import Col from 'antd/lib/col';
import Select from 'antd/lib/select';
import Space from 'antd/lib/space';
import Switch from 'antd/lib/switch';
import Tabs from 'antd/lib/tabs';
import Text from 'antd/lib/typography/Text';
import Upload from 'antd/lib/upload';
import { RcFile, UploadFile } from 'antd/lib/upload/interface';
import {
    FolderOpenOutlined,
    LoadingOutlined,
    ScissorOutlined,
    UploadOutlined,
} from '@ant-design/icons';

import { getCore } from 'cvat-core-wrapper';
import RemoteBrowser, { RemoteFile } from 'components/file-manager/remote-browser';

interface PreparedDatasetStats {
    keptFrames: number;
    duplicateFrames: number;
    totalVideos: number;
    sharePath: string;
    usedBackend: string;
}

interface Props {
    onPrepared: (sharePath: string, stats: PreparedDatasetStats) => void;
}

const core = getCore();
const videoExtensionPattern = /\.(avi|m4v|mkv|mov|mp4|mpeg|mpg|webm)$/i;
type ProcessingBackend = 'auto' | 'cpu' | 'ffmpeg_gpu';

function backendLabel(backend: string): string {
    if (backend === 'ffmpeg_gpu') {
        return 'GPU';
    }
    if (backend === 'cpu') {
        return 'CPU';
    }
    if (backend === 'mixed') {
        return 'GPU/CPU';
    }
    return backend;
}

function makeUploadFile(file: RcFile): UploadFile {
    return {
        uid: file.uid,
        name: file.name,
        status: 'done',
        originFileObj: file,
    };
}

export default function VideoCurationPanel(props: Props): JSX.Element {
    const { onPrepared } = props;
    const [source, setSource] = useState<'local' | 'share'>('share');
    const [localFiles, setLocalFiles] = useState<UploadFile[]>([]);
    const [shareFiles, setShareFiles] = useState<RemoteFile[]>([]);
    const [frameInterval, setFrameInterval] = useState(25);
    const [duplicateThreshold, setDuplicateThreshold] = useState(4);
    const [deduplicate, setDeduplicate] = useState(true);
    const [processingBackend, setProcessingBackend] = useState<ProcessingBackend>('auto');
    const [processing, setProcessing] = useState(false);

    const runCuration = async (): Promise<void> => {
        const clientFiles = localFiles
            .map((file) => file.originFileObj)
            .filter((file): file is RcFile => !!file);
        const selectedShareFiles = shareFiles.map((file) => file.key);

        if (source === 'local' && !clientFiles.length) {
            notification.error({
                message: '请选择本地视频',
            });
            return;
        }

        if (source === 'share' && !selectedShareFiles.length) {
            notification.error({
                message: '请选择共享视频或目录',
            });
            return;
        }

        setProcessing(true);
        try {
            const result = await core.server.prepareVideoDataset({
                clientFiles: source === 'local' ? clientFiles : [],
                shareFiles: source === 'share' ? selectedShareFiles : [],
                frameInterval,
                deduplicate,
                duplicateThreshold,
                recursive: true,
                imageQuality: 95,
                processingBackend,
            });

            notification.success({
                message: '视频候选帧已生成',
                description: (
                    `保留 ${result.keptFrames} 帧，去重 ${result.duplicateFrames} 帧，` +
                    `使用 ${backendLabel(result.usedBackend)}，路径 ${result.sharePath}`
                ),
                className: 'cvat-notification-video-curation-success',
            });

            onPrepared(result.sharePath, {
                keptFrames: result.keptFrames,
                duplicateFrames: result.duplicateFrames,
                totalVideos: result.totalVideos,
                sharePath: result.sharePath,
                usedBackend: result.usedBackend,
            });
        } catch (error: any) {
            notification.error({
                message: '视频处理失败',
                description: error.toString(),
                className: 'cvat-notification-video-curation-failed',
            });
        } finally {
            setProcessing(false);
        }
    };

    return (
        <Collapse
            className='cvat-video-curation-wrapper'
            items={[{
                key: 'video-curation',
                label: (
                    <Space>
                        <ScissorOutlined />
                        <Text className='cvat-title'>视频抽帧去重</Text>
                    </Space>
                ),
                children: (
                    <Row gutter={[8, 12]}>
                        <Col span={24}>
                            <Tabs
                                activeKey={source}
                                onChange={(key) => setSource(key as 'local' | 'share')}
                                items={[{
                                    key: 'share',
                                    label: (
                                        <Space>
                                            <FolderOpenOutlined />
                                            共享文件
                                        </Space>
                                    ),
                                    children: (
                                        <RemoteBrowser
                                            resource='share'
                                            onSelectFiles={setShareFiles}
                                        />
                                    ),
                                }, {
                                    key: 'local',
                                    label: (
                                        <Space>
                                            <UploadOutlined />
                                            本地视频
                                        </Space>
                                    ),
                                    children: (
                                        <Upload.Dragger
                                            accept='video/*,.avi,.m4v,.mkv,.mov,.mp4,.mpeg,.mpg,.webm'
                                            maxCount={1}
                                            fileList={localFiles}
                                            beforeUpload={(file: RcFile): boolean | typeof Upload.LIST_IGNORE => {
                                                if (!file.type.startsWith('video/') && !videoExtensionPattern.test(file.name)) {
                                                    notification.error({
                                                        message: '只支持视频文件',
                                                    });
                                                    return Upload.LIST_IGNORE;
                                                }

                                                setLocalFiles([makeUploadFile(file)]);
                                                return false;
                                            }}
                                            onRemove={() => {
                                                setLocalFiles([]);
                                            }}
                                        >
                                            <p className='ant-upload-drag-icon'>
                                                <UploadOutlined />
                                            </p>
                                            <p className='ant-upload-text'>选择视频</p>
                                        </Upload.Dragger>
                                    ),
                                }]}
                            />
                        </Col>
                        <Col span={6}>
                            <Text className='cvat-text-color'>抽帧间隔</Text>
                            <InputNumber
                                min={1}
                                value={frameInterval}
                                onChange={(value) => setFrameInterval(value || 1)}
                            />
                        </Col>
                        <Col span={6}>
                            <Text className='cvat-text-color'>去重阈值</Text>
                            <InputNumber
                                min={0}
                                max={64}
                                disabled={!deduplicate}
                                value={duplicateThreshold}
                                onChange={(value) => setDuplicateThreshold(value || 0)}
                            />
                        </Col>
                        <Col span={6}>
                            <Text className='cvat-text-color'>处理方式</Text>
                            <Select
                                value={processingBackend}
                                onChange={(value: ProcessingBackend) => setProcessingBackend(value)}
                                options={[{
                                    value: 'auto',
                                    label: '自动',
                                }, {
                                    value: 'ffmpeg_gpu',
                                    label: 'GPU',
                                }, {
                                    value: 'cpu',
                                    label: 'CPU',
                                }]}
                            />
                        </Col>
                        <Col span={6}>
                            <Space className='cvat-video-curation-switch'>
                                <Switch checked={deduplicate} onChange={setDeduplicate} />
                                <Text className='cvat-text-color'>自动去重</Text>
                            </Space>
                        </Col>
                        <Col span={24}>
                            <Button
                                type='primary'
                                icon={processing ? <LoadingOutlined /> : <ScissorOutlined />}
                                loading={processing}
                                onClick={runCuration}
                            >
                                抽帧去重
                            </Button>
                        </Col>
                    </Row>
                ),
            }]}
        />
    );
}
