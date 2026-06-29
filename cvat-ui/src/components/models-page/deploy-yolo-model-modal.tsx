// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { useState } from 'react';
import { InboxOutlined } from '@ant-design/icons';
import Alert from 'antd/lib/alert';
import Button from 'antd/lib/button';
import Form from 'antd/lib/form';
import Input from 'antd/lib/input';
import Modal from 'antd/lib/modal';
import notification from 'antd/lib/notification';
import Space from 'antd/lib/space';
import Text from 'antd/lib/typography/Text';
import Upload from 'antd/lib/upload';
import { RcFile, UploadFile } from 'antd/lib/upload/interface';

import { getCore } from 'cvat-core-wrapper';
import {
    LocalYoloDeployment,
    LocalYoloDeploymentRequest,
    makeLocalYoloFunctionName,
    parseLocalYoloLabels,
} from './local-yolo-deployments';

const core = getCore();

interface Props {
    open: boolean;
    onClose: () => void;
    onDeploymentStarted: (deployment: LocalYoloDeployment, request: LocalYoloDeploymentRequest) => void;
}

interface FormValues {
    name: string;
    functionName?: string;
    labels: string;
}

function fileStem(fileName: string): string {
    return fileName.replace(/\.[^.]+$/, '');
}

function makeUploadFile(file: RcFile): UploadFile {
    return {
        uid: file.uid,
        name: file.name,
        size: file.size,
        type: file.type,
        status: 'done',
        originFileObj: file,
    };
}

export default function DeployYoloModelModal(props: Readonly<Props>): JSX.Element {
    const { open, onClose, onDeploymentStarted } = props;
    const [form] = Form.useForm<FormValues>();
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const resetAndClose = (): void => {
        if (submitting) {
            return;
        }

        form.resetFields();
        setFileList([]);
        onClose();
    };

    const onSubmit = async (): Promise<void> => {
        const values = await form.validateFields();
        const file = fileList[0]?.originFileObj as File | undefined;
        if (!file) {
            notification.error({
                message: '请选择 YOLO 模型文件',
                description: '当前仅支持上传 .pt 文件。',
            });
            return;
        }

        setSubmitting(true);
        try {
            const displayName = values.name.trim();
            const functionName = makeLocalYoloFunctionName(values.functionName?.trim() || displayName);
            const deployment: LocalYoloDeployment = {
                localYoloDeployment: true,
                id: functionName,
                name: displayName,
                labels: parseLocalYoloLabels(values.labels),
                status: 'uploading',
                createdAt: new Date().toISOString(),
            };
            const request = core.lambda.deployLocalYoloModel({
                model: file,
                name: displayName,
                labels: values.labels,
                functionName: values.functionName?.trim() || undefined,
            });

            onDeploymentStarted(deployment, request);
            notification.info({
                message: '模型已提交部署',
                description: `${displayName} 已加入模型列表，部署状态会自动同步。`,
            });
            form.resetFields();
            setFileList([]);
            onClose();
        } catch (error: unknown) {
            notification.error({
                message: '模型提交失败',
                description: error instanceof Error ? error.message : String(error),
                duration: null,
            });
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            className='cvat-deploy-yolo-model-modal'
            title='上传并部署 YOLO 模型'
            open={open}
            onCancel={resetAndClose}
            width={640}
            footer={(
                <Space>
                    <Button disabled={submitting} onClick={resetAndClose}>取消</Button>
                    <Button type='primary' loading={submitting} onClick={onSubmit}>
                        上传并部署
                    </Button>
                </Space>
            )}
            destroyOnClose
        >
            <Alert
                showIcon
                type='info'
                message='本地部署说明'
                description='此功能会将 .pt 文件封装为 Nuclio detector。请先启动 serverless 组件，并确保 cvat_server 可以访问 nuctl 和 Docker socket。'
            />
            <Form form={form} layout='vertical' className='cvat-deploy-yolo-model-form'>
                <Form.Item label='模型文件' required>
                    <Upload.Dragger
                        accept='.pt'
                        maxCount={1}
                        fileList={fileList}
                        disabled={submitting}
                        beforeUpload={(file) => {
                            if (!file.name.toLowerCase().endsWith('.pt')) {
                                notification.error({
                                    message: '文件类型不支持',
                                    description: '请选择 YOLO 训练得到的 .pt 文件。',
                                });
                                return Upload.LIST_IGNORE;
                            }

                            setFileList([makeUploadFile(file)]);
                            const stem = fileStem(file.name);
                            if (!form.getFieldValue('name')) {
                                form.setFieldValue('name', stem);
                            }
                            if (!form.getFieldValue('functionName')) {
                                form.setFieldValue('functionName', stem);
                            }
                            return false;
                        }}
                        onRemove={() => {
                            setFileList([]);
                        }}
                    >
                        <p className='ant-upload-drag-icon'>
                            <InboxOutlined />
                        </p>
                        <Text>点击或拖拽 .pt 文件到此处</Text>
                    </Upload.Dragger>
                </Form.Item>
                <Form.Item
                    label='显示名称'
                    name='name'
                    rules={[{ required: true, message: '请输入模型显示名称' }]}
                >
                    <Input placeholder='例如：车牌检测 YOLOv8' disabled={submitting} />
                </Form.Item>
                <Form.Item label='函数名称' name='functionName'>
                    <Input placeholder='可选；留空时根据显示名称自动生成' disabled={submitting} />
                </Form.Item>
                <Form.Item
                    label='标签列表'
                    name='labels'
                    extra='按模型训练类别顺序填写。支持每行一个标签，也支持逗号分隔。'
                    rules={[{ required: true, message: '请输入模型标签列表' }]}
                >
                    <Input.TextArea
                        rows={6}
                        placeholder={'person\ncar\nlicense_plate'}
                        disabled={submitting}
                    />
                </Form.Item>
            </Form>
        </Modal>
    );
}
