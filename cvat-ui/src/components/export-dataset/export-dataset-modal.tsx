// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useState, useEffect, useCallback } from 'react';
import {
    connect, useDispatch, useSelector,
} from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router';
import Modal from 'antd/lib/modal';
import Notification from 'antd/lib/notification';
import { DownloadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import Text from 'antd/lib/typography/Text';
import Select from 'antd/lib/select';
import Input from 'antd/lib/input';
import Form from 'antd/lib/form';
import Switch from 'antd/lib/switch';
import Space from 'antd/lib/space';
import Tooltip from 'antd/lib/tooltip';
import TargetStorageField from 'components/storage/target-storage-field';
import CVATMarkdown from 'components/common/cvat-markdown';
import NameTemplateTooltip from 'components/common/cvat-name-template-tooltip';
import { shallowEqual } from 'utils/redux';
import { CombinedState } from 'reducers';
import { exportActions, exportDatasetAsync } from 'actions/export-actions';
import { makeBulkOperationAsync } from 'actions/bulk-actions';
import {
    Dumper, ProjectOrTaskOrJob, Job, Project,
    Storage, StorageData, StorageLocation, Task,
} from 'cvat-core-wrapper';

type FormValues = {
    selectedFormat: string | undefined;
    saveImages: boolean;
    customName: string | undefined;
    targetStorage: StorageData;
    useProjectTargetStorage: boolean;
};

const initialValues: FormValues = {
    selectedFormat: undefined,
    saveImages: false,
    customName: undefined,
    targetStorage: {
        location: StorageLocation.LOCAL,
        cloudStorageId: undefined,
    },
    useProjectTargetStorage: true,
};

const DEFAULT_EXPORT_EXTENSION = '.zip';

function normalizeExportExtension(extension: string | undefined): string {
    if (!extension) return DEFAULT_EXPORT_EXTENSION;
    const normalized = extension.trim().toLowerCase();
    if (!normalized) return DEFAULT_EXPORT_EXTENSION;
    return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

function getExportExtension(dumpers: Dumper[], selectedFormat: string | undefined): string {
    const selectedDumper = dumpers.find((dumper: Dumper) => dumper.name === selectedFormat);
    return normalizeExportExtension(selectedDumper?.format);
}

function appendExportExtension(name: string, extension: string): string {
    return name.toLowerCase().endsWith(extension.toLowerCase()) ? name : `${name}${extension}`;
}

function ExportDatasetModal(props: Readonly<StateToProps>): JSX.Element {
    const { dumpers, instance } = props;
    const { t } = useTranslation('importExport');

    const [instanceType, setInstanceType] = useState('');
    const [useDefaultTargetStorage, setUseDefaultTargetStorage] = useState(true);
    const [selectedFormat, setSelectedFormat] = useState<string>();
    const [form] = Form.useForm();
    const [targetStorage, setTargetStorage] = useState<StorageData>({
        location: StorageLocation.LOCAL,
    });
    const [defaultStorageLocation, setDefaultStorageLocation] = useState(StorageLocation.LOCAL);
    const [defaultStorageCloudId, setDefaultStorageCloudId] = useState<number>();
    const [helpMessage, setHelpMessage] = useState('');
    const dispatch = useDispatch();
    const history = useHistory();
    const getInstanceTypeLabel = useCallback((type: string): string => (
        t(`resourceTypes.${type}`, { defaultValue: type })
    ), [t]);
    const getResourceLabel = useCallback((resource: string): string => (
        t(`resourceTypes.${resource}`, { defaultValue: resource })
    ), [t]);
    const getStorageLocationLabel = useCallback((location: StorageLocation | null | undefined): string => {
        const storageCode = location ? location.split('_')[0] : 'local';
        return t(`storageLocations.${storageCode}`, { defaultValue: storageCode });
    }, [t]);

    const {
        selectedIds,
        allTasks,
        allProjects,
        allJobs,
    } = useSelector((state: CombinedState) => {
        const getSelectedIds = (): number[] => {
            if (instanceType === 'project') {
                return state.projects.selected;
            }

            if (instanceType === 'task') {
                return state.tasks.selected;
            }

            if (instanceType === 'job') {
                return state.jobs.selected;
            }

            return [];
        };

        return {
            selectedIds: getSelectedIds(),
            allTasks: state.tasks.current,
            allProjects: state.projects.current,
            allJobs: state.jobs.current,
        };
    }, shallowEqual);

    const isBulkMode = selectedIds.length > 1;
    const [selectedInstances, setSelectedInstances] = useState<ProjectOrTaskOrJob[]>([]);
    useEffect(() => {
        if (isBulkMode) {
            let filtered: ProjectOrTaskOrJob[] = [];
            if (instanceType === 'task') {
                filtered = allTasks.filter((task) => selectedIds.includes(task.id));
            } else if (instanceType === 'project') {
                filtered = allProjects.filter((project) => selectedIds.includes(project.id));
            } else if (instanceType === 'job') {
                filtered = allJobs.filter((job) => selectedIds.includes(job.id));
            }
            setSelectedInstances(filtered);
        } else if (instance && (instance instanceof Task || instance instanceof Project || instance instanceof Job)) {
            setSelectedInstances([instance]);
        } else {
            setSelectedInstances([]);
        }
    }, [isBulkMode, instanceType, allTasks, allProjects, allJobs, instance]);

    const [nameTemplate, setNameTemplate] = useState(`数据集_任务_${'{{id}}'}`);

    useEffect(() => {
        let newInstanceType = '';
        let initialSelectedFormat: string | undefined;
        if (instance instanceof Project) {
            newInstanceType = 'project';
        } else if (instance instanceof Task || instance instanceof Job) {
            if (instance instanceof Task) {
                newInstanceType = 'task';
            } else {
                newInstanceType = 'job';
            }
            if (instance.mode === 'interpolation' && instance.dimension === '2d') {
                initialSelectedFormat = 'CVAT for video 1.1';
            } else if (instance.mode === 'annotation' && instance.dimension === '2d') {
                initialSelectedFormat = 'CVAT for images 1.1';
            }
        }
        form.setFieldsValue({ selectedFormat: initialSelectedFormat });
        setSelectedFormat(initialSelectedFormat);
        setNameTemplate([
            t('fileNamePrefixes.dataset'),
            getInstanceTypeLabel(newInstanceType),
            '{{id}}',
        ].filter(Boolean).join('_'));
        setInstanceType(newInstanceType);
    }, [getInstanceTypeLabel, instance, t]);

    useEffect(() => {
        if (instance) {
            setDefaultStorageLocation(instance.targetStorage.location);
            setDefaultStorageCloudId(instance.targetStorage.cloudStorageId);
        }
    }, [instance]);

    useEffect(() => {
        const cloudId = defaultStorageCloudId !== undefined && defaultStorageCloudId !== null ?
            ` #${defaultStorageCloudId}` : '';
        setHelpMessage(t('help.exportDatasetDefaultStorage', {
            location: getStorageLocationLabel(defaultStorageLocation),
            cloudId,
        }));
    }, [defaultStorageLocation, defaultStorageCloudId, getStorageLocationLabel, t]);

    const closeModal = (): void => {
        setUseDefaultTargetStorage(true);
        setTargetStorage({ location: StorageLocation.LOCAL });
        setSelectedFormat(undefined);
        form.resetFields();
        if (instance) {
            dispatch(exportActions.closeExportDatasetModal(instance));
        }
    };

    const handleExport = useCallback(
        (values: FormValues): void => {
            const exportExtension = getExportExtension(dumpers, values.selectedFormat);
            if (isBulkMode) {
                dispatch(makeBulkOperationAsync<ProjectOrTaskOrJob>(
                    selectedInstances,
                    async (inst: ProjectOrTaskOrJob, idx: number) => {
                        let exportName = nameTemplate
                            .replaceAll('{{id}}', String(inst.id))
                            .replaceAll('{{name}}', ('name' in inst ? inst.name : '') ?? '')
                            .replaceAll('{{index}}', String(idx + 1));
                        exportName = appendExportExtension(exportName, exportExtension);
                        dispatch(
                            exportDatasetAsync(
                                inst,
                                values.selectedFormat as string,
                                values.saveImages,
                                false, // always custom storage in bulk
                                new Storage({
                                    location: values.targetStorage?.location,
                                    cloudStorageId: values.targetStorage?.cloudStorageId,
                                }),
                                exportName,
                            ),
                        );
                    },
                    (inst: ProjectOrTaskOrJob, idx: number, total: number) => (
                        t('notifications.bulkOperationDataset', {
                            instanceType: getInstanceTypeLabel(instanceType),
                            id: inst.id,
                            current: idx + 1,
                            total,
                        })
                    ),
                ));
                closeModal();
                const resource = getResourceLabel(values.saveImages ? 'dataset' : 'annotations');
                Notification.info({
                    message: t('notifications.bulkExportStarted', { resource }),
                    description: (
                        <CVATMarkdown history={history}>
                            {t('notifications.bulkExportStartedDescription', { resource })}
                        </CVATMarkdown>
                    ),
                    className: `cvat-notification-notice-export-${instanceType.split(' ')[0]}-start`,
                });
                return;
            }
            // have to validate format before so it would not be undefined
            dispatch(
                exportDatasetAsync(
                    instance as ProjectOrTaskOrJob,
                    values.selectedFormat as string,
                    values.saveImages,
                    useDefaultTargetStorage,
                    useDefaultTargetStorage ? new Storage({
                        location: defaultStorageLocation,
                        cloudStorageId: defaultStorageCloudId,
                    }) : new Storage(targetStorage),
                    values.customName ? appendExportExtension(values.customName, exportExtension) : undefined,
                ),
            );
            closeModal();
            const resource = getResourceLabel(values.saveImages ? 'dataset' : 'annotations');
            Notification.info({
                message: t('notifications.exportStarted', { resource }),
                description: (
                    <CVATMarkdown history={history}>
                        {t('notifications.exportStartedDescription', {
                            resource,
                            instanceType: getInstanceTypeLabel(instanceType),
                        })}
                    </CVATMarkdown>
                ),
                className: `cvat-notification-notice-export-${instanceType.split(' ')[0]}-start`,
            });
        },
        [
            instance,
            instanceType,
            useDefaultTargetStorage,
            defaultStorageLocation,
            defaultStorageCloudId,
            targetStorage,
            isBulkMode,
            selectedInstances,
            nameTemplate,
            dumpers,
            getInstanceTypeLabel,
            getResourceLabel,
            t,
        ],
    );

    const exportExtension = getExportExtension(dumpers, selectedFormat);
    let exampleName = appendExportExtension([
        t('fileNamePrefixes.dataset'),
        getInstanceTypeLabel(instanceType),
        '1',
    ].filter(Boolean).join('_'), exportExtension);
    if (isBulkMode && selectedInstances.length > 0 && selectedInstances[0]) {
        const first = selectedInstances[0];
        const firstName = 'name' in first ? first.name : '';
        exampleName = nameTemplate
            .replaceAll('{{id}}', String(first.id))
            .replaceAll('{{name}}', firstName ?? '')
            .replaceAll('{{index}}', '1');
        exampleName = appendExportExtension(exampleName, exportExtension);
    }

    const sortedDumpers = dumpers.slice();
    sortedDumpers.sort((a: Dumper, b: Dumper) => a.name.localeCompare(b.name));

    return (
        <Modal
            title={
                isBulkMode ? (
                    <Text strong>
                        {t('modals.exportDatasetBulkTitle', {
                            count: selectedInstances.length,
                            instanceType: getInstanceTypeLabel(instanceType),
                        })}
                    </Text>
                ) : (
                    <Text strong>
                        {t('modals.exportDatasetTitle', { instanceType: getInstanceTypeLabel(instanceType) })}
                    </Text>
                )
            }
            open={!!instance}
            onCancel={closeModal}
            onOk={() => form.submit()}
            className={`cvat-modal-export-${instanceType.split(' ')[0]}`}
            destroyOnClose
        >
            <Form
                name='Export dataset'
                form={form}
                layout='vertical'
                initialValues={initialValues}
                onFinish={handleExport}
                onValuesChange={(changedValues: Partial<FormValues>) => {
                    if ('selectedFormat' in changedValues) {
                        setSelectedFormat(changedValues.selectedFormat);
                    }
                }}
            >
                <Form.Item
                    name='selectedFormat'
                    label={<Text strong>{t('fields.exportFormat')}</Text>}
                    rules={[{ required: true, message: t('validation.formatRequired') }]}
                >
                    <Select
                        virtual={false}
                        placeholder={t('placeholders.selectDatasetFormat')}
                        className='cvat-modal-export-select'
                    >
                        {sortedDumpers
                            .filter(
                                (dumper: Dumper): boolean => dumper.dimension === instance?.dimension ||
                                    (instance instanceof Project && instance.dimension === null),
                            )
                            .map(
                                (dumper: Dumper): JSX.Element => (
                                    <Select.Option
                                        value={dumper.name}
                                        key={dumper.name}
                                        className='cvat-modal-export-option-item'
                                    >
                                        <DownloadOutlined />
                                        <Text>{dumper.name}</Text>
                                    </Select.Option>
                                ),
                            )}
                    </Select>
                </Form.Item>
                <Space>
                    <Form.Item
                        className='cvat-modal-export-switch-use-default-storage'
                        name='saveImages'
                        valuePropName='checked'
                    >
                        <Switch className='cvat-modal-export-save-images' />
                    </Form.Item>
                    <Text strong>{t('fields.saveImages')}</Text>
                </Space>
                {isBulkMode ? (
                    <Form.Item label={<Text strong>{t('fields.nameTemplate')}</Text>} required>
                        <Input
                            value={nameTemplate}
                            onChange={(e) => setNameTemplate(e.target.value)}
                            placeholder={[t('fileNamePrefixes.dataset'), '{{id}}'].join('_')}
                            suffix={exportExtension}
                            className='cvat-modal-export-filename-input'
                        />
                        <Text type='secondary'>
                            <Tooltip
                                title={(
                                    <NameTemplateTooltip
                                        example={exampleName}
                                    />
                                )}
                            >
                                {t('help.datasetNameTemplate')}
                                {' '}
                                <QuestionCircleOutlined />
                            </Tooltip>
                        </Text>
                    </Form.Item>
                ) : (
                    <Form.Item label={<Text strong>{t('fields.customName')}</Text>} name='customName'>
                        <Input
                            placeholder={t('placeholders.customDatasetName')}
                            suffix={exportExtension}
                            className='cvat-modal-export-filename-input'
                        />
                    </Form.Item>
                )}
                <TargetStorageField
                    instanceId={instance ? instance.id : null}
                    switchDescription={t('fields.useDefaultSettings')}
                    switchHelpMessage={helpMessage}
                    useDefaultStorage={isBulkMode ? false : useDefaultTargetStorage}
                    storageDescription={t('help.targetDatasetStorage')}
                    locationValue={targetStorage.location}
                    onChangeUseDefaultStorage={isBulkMode ? undefined : (value: boolean) => {
                        setUseDefaultTargetStorage(value);
                    }}
                    onChangeStorage={(value: StorageData) => setTargetStorage(value)}
                    onChangeLocationValue={(value: StorageLocation) => { setTargetStorage({ location: value }); }}
                    disableSwitch={isBulkMode}
                />
            </Form>
        </Modal>
    );
}

interface StateToProps {
    dumpers: Dumper[];
    instance: Project | Task | Job | null;
}

function mapStateToProps(state: CombinedState): StateToProps {
    const { instanceType } = state.export;
    const instance = !instanceType ? null : (
        state.export[`${instanceType}s`]
    ).dataset.modalInstance;

    return {
        instance,
        dumpers: state.formats.annotationFormats?.dumpers ?? [],
    };
}

export default connect(mapStateToProps)(ExportDatasetModal);
