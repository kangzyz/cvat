// Copyright (C) 2021-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import './styles.scss';
import React, { useCallback, useEffect, useReducer } from 'react';
import { connect, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router';
import Modal from 'antd/lib/modal';
import Form, { RuleObject } from 'antd/lib/form';
import Text from 'antd/lib/typography/Text';
import Select from 'antd/lib/select';
import Notification from 'antd/lib/notification';
import message from 'antd/lib/message';
import Upload, { RcFile } from 'antd/lib/upload';
import Input from 'antd/lib/input/Input';
import Radio from 'antd/lib/radio';
import {
    UploadOutlined, InboxOutlined, QuestionCircleOutlined,
} from '@ant-design/icons';
import CVATTooltip from 'components/common/cvat-tooltip';
import CVATMarkdown from 'components/common/cvat-markdown';
import { CombinedState } from 'reducers';
import { importActions, importDatasetAsync } from 'actions/import-actions';
import Space from 'antd/lib/space';
import Switch from 'antd/lib/switch';
import {
    getCore, Job, Loader, Project, Storage, StorageData, StorageLocation,
    Task,
} from 'cvat-core-wrapper';
import StorageField from 'components/storage/storage-field';
import { createAction, ActionUnion } from 'utils/redux';

const { confirm } = Modal;

const core = getCore();

type AnnotationImportMode = 'replace' | 'append';

type FormValues = {
    selectedFormat: string | undefined;
    fileName?: string | undefined;
    sourceStorage: StorageData;
    useDefaultSettings: boolean;
    importMode: AnnotationImportMode;
};

const initialValues: FormValues = {
    selectedFormat: undefined,
    fileName: undefined,
    sourceStorage: {
        location: StorageLocation.LOCAL,
        cloudStorageId: undefined,
    },
    useDefaultSettings: true,
    importMode: 'replace',
};

interface UploadParams {
    resource: 'annotation' | 'dataset' | null;
    convMaskToPoly: boolean;
    useDefaultSettings: boolean;
    sourceStorage: Storage;
    selectedFormat: string | null;
    importMode: AnnotationImportMode;
    file: File | null;
    fileName: string | null;
}

interface State {
    instanceType: string;
    file: File | null;
    selectedLoader: any;
    useDefaultSettings: boolean;
    defaultStorageLocation: StorageLocation | null;
    defaultStorageCloudId?: number;
    helpMessage: string;
    selectedSourceStorageLocation: StorageLocation;
    uploadParams: UploadParams;
    resource: string;
}

enum ReducerActionType {
    SET_INSTANCE_TYPE = 'SET_INSTANCE_TYPE',
    SET_FILE = 'SET_FILE',
    SET_SELECTED_LOADER = 'SET_SELECTED_LOADER',
    SET_USE_DEFAULT_SETTINGS = 'SET_USE_DEFAULT_SETTINGS',
    SET_DEFAULT_STORAGE_LOCATION = 'SET_DEFAULT_STORAGE_LOCATION',
    SET_DEFAULT_STORAGE_CLOUD_ID = 'SET_DEFAULT_STORAGE_CLOUD_ID',
    SET_HELP_MESSAGE = 'SET_HELP_MESSAGE',
    SET_SELECTED_SOURCE_STORAGE_LOCATION = 'SET_SELECTED_SOURCE_STORAGE_LOCATION',
    SET_FILE_NAME = 'SET_FILE_NAME',
    SET_SELECTED_FORMAT = 'SET_SELECTED_FORMAT',
    SET_IMPORT_MODE = 'SET_IMPORT_MODE',
    SET_CONV_MASK_TO_POLY = 'SET_CONV_MASK_TO_POLY',
    SET_SOURCE_STORAGE = 'SET_SOURCE_STORAGE',
    SET_RESOURCE = 'SET_RESOURCE',
}

export const reducerActions = {
    setInstanceType: (instanceType: string) => (
        createAction(ReducerActionType.SET_INSTANCE_TYPE, { instanceType })
    ),
    setFile: (file: File | null) => (
        createAction(ReducerActionType.SET_FILE, { file })
    ),
    setSelectedLoader: (selectedLoader: any) => (
        createAction(ReducerActionType.SET_SELECTED_LOADER, { selectedLoader })
    ),
    setUseDefaultSettings: (useDefaultSettings: boolean) => (
        createAction(ReducerActionType.SET_USE_DEFAULT_SETTINGS, { useDefaultSettings })
    ),
    setDefaultStorageLocation: (defaultStorageLocation: StorageLocation | null) => (
        createAction(ReducerActionType.SET_DEFAULT_STORAGE_LOCATION, { defaultStorageLocation })
    ),
    setDefaultStorageCloudId: (defaultStorageCloudId?: number) => (
        createAction(ReducerActionType.SET_DEFAULT_STORAGE_CLOUD_ID, { defaultStorageCloudId })
    ),
    setHelpMessage: (helpMessage: string) => (
        createAction(ReducerActionType.SET_HELP_MESSAGE, { helpMessage })
    ),
    setSelectedSourceStorageLocation: (selectedSourceStorageLocation: StorageLocation) => (
        createAction(ReducerActionType.SET_SELECTED_SOURCE_STORAGE_LOCATION, { selectedSourceStorageLocation })
    ),
    setFileName: (fileName: string) => (
        createAction(ReducerActionType.SET_FILE_NAME, { fileName })
    ),
    setSelectedFormat: (selectedFormat: string) => (
        createAction(ReducerActionType.SET_SELECTED_FORMAT, { selectedFormat })
    ),
    setImportMode: (importMode: AnnotationImportMode) => (
        createAction(ReducerActionType.SET_IMPORT_MODE, { importMode })
    ),
    setConvMaskToPoly: (convMaskToPoly: boolean) => (
        createAction(ReducerActionType.SET_CONV_MASK_TO_POLY, { convMaskToPoly })
    ),
    setSourceStorage: (sourceStorage: Storage) => (
        createAction(ReducerActionType.SET_SOURCE_STORAGE, { sourceStorage })
    ),
    setResource: (resource: string) => (
        createAction(ReducerActionType.SET_RESOURCE, { resource })
    ),
};

const reducer = (state: State, action: ActionUnion<typeof reducerActions>): State => {
    if (action.type === ReducerActionType.SET_INSTANCE_TYPE) {
        return {
            ...state,
            instanceType: action.payload.instanceType,
        };
    }

    if (action.type === ReducerActionType.SET_FILE) {
        return {
            ...state,
            file: action.payload.file,
            uploadParams: {
                ...state.uploadParams,
                file: action.payload.file,
            },
        };
    }

    if (action.type === ReducerActionType.SET_SELECTED_LOADER) {
        return {
            ...state,
            selectedLoader: action.payload.selectedLoader,
        };
    }

    if (action.type === ReducerActionType.SET_USE_DEFAULT_SETTINGS) {
        const isDefaultSettings = action.payload.useDefaultSettings;
        return {
            ...state,
            useDefaultSettings: action.payload.useDefaultSettings,
            uploadParams: {
                ...state.uploadParams,
                useDefaultSettings: action.payload.useDefaultSettings,
                sourceStorage: isDefaultSettings ? new Storage({
                    location: state.defaultStorageLocation === StorageLocation.LOCAL ?
                        StorageLocation.LOCAL : StorageLocation.CLOUD_STORAGE,
                    cloudStorageId: state.defaultStorageCloudId,
                }) : state.uploadParams.sourceStorage,
            },
        };
    }

    if (action.type === ReducerActionType.SET_DEFAULT_STORAGE_LOCATION) {
        return {
            ...state,
            defaultStorageLocation: action.payload.defaultStorageLocation,
            uploadParams: {
                ...state.uploadParams,
                sourceStorage: new Storage({
                    location: action.payload.defaultStorageLocation === StorageLocation.LOCAL ?
                        StorageLocation.LOCAL : StorageLocation.CLOUD_STORAGE,
                    cloudStorageId: state.defaultStorageCloudId,
                }),
            },
        };
    }

    if (action.type === ReducerActionType.SET_DEFAULT_STORAGE_CLOUD_ID) {
        return {
            ...state,
            defaultStorageCloudId: action.payload.defaultStorageCloudId,
            uploadParams: {
                ...state.uploadParams,
                sourceStorage: new Storage({
                    location: state.defaultStorageLocation === StorageLocation.LOCAL ?
                        StorageLocation.LOCAL : StorageLocation.CLOUD_STORAGE,
                    cloudStorageId: action.payload.defaultStorageCloudId,
                }),
            },
        };
    }

    if (action.type === ReducerActionType.SET_HELP_MESSAGE) {
        return {
            ...state,
            helpMessage: action.payload.helpMessage,
        };
    }

    if (action.type === ReducerActionType.SET_SELECTED_SOURCE_STORAGE_LOCATION) {
        return {
            ...state,
            selectedSourceStorageLocation: action.payload.selectedSourceStorageLocation,
        };
    }

    if (action.type === ReducerActionType.SET_FILE_NAME) {
        return {
            ...state,
            uploadParams: {
                ...state.uploadParams,
                fileName: action.payload.fileName,
            },
        };
    }

    if (action.type === ReducerActionType.SET_SELECTED_FORMAT) {
        return {
            ...state,
            uploadParams: {
                ...state.uploadParams,
                selectedFormat: action.payload.selectedFormat,
            },
        };
    }

    if (action.type === ReducerActionType.SET_IMPORT_MODE) {
        return {
            ...state,
            uploadParams: {
                ...state.uploadParams,
                importMode: action.payload.importMode,
            },
        };
    }

    if (action.type === ReducerActionType.SET_CONV_MASK_TO_POLY) {
        return {
            ...state,
            uploadParams: {
                ...state.uploadParams,
                convMaskToPoly: action.payload.convMaskToPoly,
            },
        };
    }

    if (action.type === ReducerActionType.SET_SOURCE_STORAGE) {
        return {
            ...state,
            uploadParams: {
                ...state.uploadParams,
                sourceStorage: action.payload.sourceStorage,
            },
        };
    }

    if (action.type === ReducerActionType.SET_RESOURCE) {
        return {
            ...state,
            resource: action.payload.resource,
            uploadParams: {
                ...state.uploadParams,
                resource: action.payload.resource === 'dataset' ? 'dataset' : 'annotation',
            },
        };
    }

    return state;
};

function ImportDatasetModal(props: StateToProps): JSX.Element {
    const {
        importers,
        instanceT,
        instance,
    } = props;
    const { t } = useTranslation('importExport');
    const [form] = Form.useForm();
    const appDispatch = useDispatch();
    const history = useHistory();
    const getInstanceTypeLabel = useCallback((type: string): string => (
        t(`resourceTypes.${type}`, { defaultValue: type })
    ), [t]);
    const getResourceLabel = useCallback((resourceName: string): string => (
        t(`resourceTypes.${resourceName}`, { defaultValue: resourceName })
    ), [t]);
    const getInstanceReferenceLabel = useCallback((reference: string): string => {
        const [type, id] = reference.split(' ');
        return [getInstanceTypeLabel(type), id].filter(Boolean).join(' ');
    }, [getInstanceTypeLabel]);
    const getStorageLocationLabel = useCallback((location: StorageLocation | null | undefined): string => {
        const storageCode = location ? location.split('_')[0] : 'local';
        return t(`storageLocations.${storageCode}`, { defaultValue: storageCode });
    }, [t]);

    const [state, dispatch] = useReducer(reducer, {
        instanceType: '',
        file: null,
        selectedLoader: null,
        useDefaultSettings: true,
        defaultStorageLocation: StorageLocation.LOCAL,
        defaultStorageCloudId: undefined,
        helpMessage: '',
        selectedSourceStorageLocation: StorageLocation.LOCAL,
        uploadParams: {
            resource: null,
            convMaskToPoly: true,
            useDefaultSettings: true,
            sourceStorage: new Storage({
                location: StorageLocation.LOCAL,
                cloudStorageId: undefined,
            }),
            selectedFormat: null,
            importMode: 'replace',
            file: null,
            fileName: null,
        },
        resource: '',
    });

    const {
        instanceType,
        file,
        selectedLoader,
        useDefaultSettings,
        defaultStorageLocation,
        defaultStorageCloudId,
        helpMessage,
        selectedSourceStorageLocation,
        uploadParams,
        resource,
    } = state;

    useEffect(() => {
        if (instanceT === 'project') {
            dispatch(reducerActions.setResource('dataset'));
        } else if (instanceT === 'task' || instanceT === 'job') {
            dispatch(reducerActions.setResource('annotation'));
        }
    }, [instanceT]);

    const isDataset = useCallback((): boolean => resource === 'dataset', [resource]);
    const isAnnotation = useCallback((): boolean => resource === 'annotation', [resource]);

    const isProject = useCallback((): boolean => instance instanceof core.classes.Project, [instance]);
    const isTask = useCallback((): boolean => instance instanceof core.classes.Task, [instance]);

    useEffect(() => {
        if (instance) {
            dispatch(reducerActions.setDefaultStorageLocation(instance.sourceStorage.location));
            dispatch(reducerActions.setDefaultStorageCloudId(instance.sourceStorage.cloudStorageId));
            let type: 'project' | 'task' | 'job' = 'job';

            if (isProject()) {
                type = 'project';
            } else if (isTask()) {
                type = 'task';
            }
            dispatch(reducerActions.setInstanceType(`${type} #${instance.id}`));
        }
    }, [instance, resource]);

    useEffect(() => {
        const cloudId = defaultStorageCloudId ? ` #${defaultStorageCloudId}` : '';
        dispatch(reducerActions.setHelpMessage(
            t('help.importDefaultStorage', {
                location: getStorageLocationLabel(defaultStorageLocation),
                cloudId,
            }),
        ));
    }, [defaultStorageLocation, defaultStorageCloudId, getStorageLocationLabel, t]);

    const uploadLocalFile = (): JSX.Element => (
        <Form.Item
            getValueFromEvent={(e) => {
                if (Array.isArray(e)) {
                    return e;
                }
                return e?.fileList[0];
            }}
            name='dragger'
            rules={[{ required: true, message: t('validation.fileRequired') }]}
        >
            <Upload.Dragger
                listType='text'
                fileList={file ? [file] : ([] as any[])}
                accept={
                    selectedLoader?.format
                        .toLowerCase()
                        .split(',')
                        .map((v: string) => `.${v.trim()}`)
                        .join(',')
                }
                beforeUpload={(_file: RcFile): boolean => {
                    if (!selectedLoader) {
                        message.warning(t('validation.selectFormatFirst'), 3);
                    } else if (isDataset() && !['application/zip', 'application/x-zip-compressed'].includes(_file.type)) {
                        message.error(t('validation.onlyZipDataset'));
                    } else if (isAnnotation() &&
                                !selectedLoader.format.toLowerCase().split(', ').includes(_file.name.split('.')[_file.name.split('.').length - 1])) {
                        message.error(
                            t('validation.invalidFormatExtension', {
                                format: selectedLoader.name,
                                extensions: selectedLoader.format.toLowerCase(),
                            }),
                        );
                    } else {
                        dispatch(reducerActions.setFile(_file));
                    }
                    return false;
                }}
                onRemove={() => {
                    dispatch(reducerActions.setFile(null));
                }}
            >
                <p className='ant-upload-drag-icon'>
                    <InboxOutlined />
                </p>
                <p className='ant-upload-text'>{t('upload.dragFile')}</p>
            </Upload.Dragger>
        </Form.Item>
    );

    const validateFileName = (_: RuleObject, value: string): Promise<void> => {
        if (!selectedLoader) {
            message.warning(t('validation.selectFormatFirst'), 3);
            return Promise.reject();
        }
        if (value) {
            const extension = value.toLowerCase().split('.')[value.split('.').length - 1];
            if (isAnnotation()) {
                const allowedExtensions = selectedLoader.format.toLowerCase().split(', ');
                if (!allowedExtensions.includes(extension)) {
                    return Promise.reject(new Error(
                        t('validation.invalidFormatExtension', {
                            format: selectedLoader.name,
                            extensions: selectedLoader.format.toLowerCase(),
                        }),
                    ));
                }
            }
            if (isDataset()) {
                if (extension !== 'zip') {
                    return Promise.reject(new Error(t('validation.onlyZipDataset')));
                }
            }
        }

        return Promise.resolve();
    };

    const renderCustomName = (): JSX.Element => (
        <Form.Item
            label={<Text strong>{t('fields.fileName')}</Text>}
            name='fileName'
            hasFeedback
            dependencies={['selectedFormat']}
            rules={[{ validator: validateFileName }, { required: true, message: t('validation.nameRequired') }]}
            required
        >
            <Input
                placeholder={t('placeholders.datasetFileName')}
                className='cvat-modal-import-filename-input'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dispatch(reducerActions.setFileName(e.target.value || ''));
                }}
            />
        </Form.Item>
    );

    const closeModal = useCallback((): void => {
        dispatch(reducerActions.setUseDefaultSettings(true));
        dispatch(reducerActions.setSelectedSourceStorageLocation(StorageLocation.LOCAL));
        form.resetFields();
        dispatch(reducerActions.setFile(null));
        dispatch(reducerActions.setFileName(''));
        dispatch(reducerActions.setImportMode('replace'));
        if (instance) {
            appDispatch(importActions.closeImportDatasetModal(instance));
        }
    }, [form, instance]);

    const onUpload = (): void => {
        if (instance && uploadParams && uploadParams.resource) {
            appDispatch(
                importDatasetAsync(
                    instance,
                    uploadParams.selectedFormat as string,
                    uploadParams.useDefaultSettings,
                    uploadParams.sourceStorage,
                    uploadParams.file || uploadParams.fileName as string,
                    uploadParams.convMaskToPoly,
                    uploadParams.importMode,
                ));
            const resourceLabel = getResourceLabel(uploadParams.resource);
            Notification.info({
                message: t('notifications.importStarted', { resource: resourceLabel }),
                description: (
                    <CVATMarkdown history={history}>
                        {t('notifications.importStartedDescription', {
                            resource: resourceLabel,
                            instance: getInstanceReferenceLabel(instanceType),
                        })}
                    </CVATMarkdown>
                ),
                className: `cvat-notification-notice-import-${uploadParams.resource}-start`,
            });
        }
    };

    const confirmUpload = (): void => {
        const isAppend = uploadParams.importMode === 'append';
        const annotationEntity = isTask() ? 'task' : 'job';
        const title = isAppend ? t('modals.appendAnnotationsTitle') : t('modals.replaceAnnotationsTitle');
        const content = isAppend ?
            t('help.appendAnnotationsContent', { instanceType: getInstanceTypeLabel(annotationEntity) }) :
            t('help.replaceAnnotationsContent', { instanceType: getInstanceTypeLabel(annotationEntity) });

        confirm({
            title,
            content,
            className: `cvat-modal-content-load-${instanceType.split(' ')[0]}-annotation`,
            onOk: () => {
                onUpload();
            },
            okButtonProps: {
                type: 'primary',
                danger: true,
            },
            okText: isAppend ? t('actions.appendAnnotations') : t('actions.replaceAnnotations'),
            cancelText: t('actions.cancel'),
        });
    };

    const handleImport = useCallback(
        (): void => {
            if (isAnnotation()) {
                confirmUpload();
            } else {
                onUpload();
            }
            closeModal();
        },
        [instance, uploadParams],
    );

    const loadFromLocal = (useDefaultSettings && (
        defaultStorageLocation === StorageLocation.LOCAL ||
        defaultStorageLocation === null
    )) || (!useDefaultSettings && selectedSourceStorageLocation === StorageLocation.LOCAL);

    return (
        <Modal
            title={(
                <>
                    <Text strong>
                        {t('modals.importTitle', {
                            resource: getResourceLabel(resource),
                            instance: getInstanceReferenceLabel(instanceType),
                        })}
                    </Text>
                    {
                        instance instanceof core.classes.Project && (
                            <CVATTooltip
                                title={
                                    instance && !instance.labels.length ?
                                        t('help.projectLabelsImported') :
                                        t('help.projectLabelsUsed')
                                }
                            >
                                <QuestionCircleOutlined className='cvat-modal-import-header-question-icon' />
                            </CVATTooltip>
                        )
                    }
                </>
            )}
            open={!!instance}
            onCancel={closeModal}
            onOk={() => form.submit()}
            className='cvat-modal-import-dataset'
            destroyOnClose
        >
            <Form
                name={`Import ${resource}`}
                form={form}
                initialValues={{
                    ...initialValues,
                    convMaskToPoly: uploadParams.convMaskToPoly,
                }}
                onFinish={handleImport}
                layout='vertical'
            >
                <Form.Item
                    name='selectedFormat'
                    label={t('fields.importFormat')}
                    rules={[{ required: true, message: t('validation.formatRequired') }]}
                    hasFeedback
                >
                    <Select
                        placeholder={t('placeholders.selectResourceFormat', { resource: getResourceLabel(resource) })}
                        className='cvat-modal-import-select'
                        virtual={false}
                        onChange={(format: string) => {
                            const [loader] = importers.filter(
                                (importer: any): boolean => importer.name === format,
                            );
                            dispatch(reducerActions.setSelectedLoader(loader));
                            dispatch(reducerActions.setSelectedFormat(format));
                        }}
                    >
                        {importers
                            .sort((a: any, b: any) => a.name.localeCompare(b.name))
                            .filter(
                                (importer: any): boolean => (
                                    instance !== null &&
                                    (!instance?.dimension || importer.dimension === instance.dimension)
                                ),
                            )
                            .map(
                                (importer: any): JSX.Element => (
                                    <Select.Option
                                        value={importer.name}
                                        key={importer.name}
                                        className='cvat-modal-import-dataset-option-item'
                                    >
                                        <UploadOutlined />
                                        <Text>{importer.name}</Text>
                                    </Select.Option>
                                ),
                            )}
                    </Select>
                </Form.Item>
                <Space className='cvat-modal-import-switch-conv-mask-to-poly-container'>
                    <Form.Item
                        name='convMaskToPoly'
                        valuePropName='checked'
                        className='cvat-modal-import-switch-conv-mask-to-poly'
                    >
                        <Switch
                            onChange={(value: boolean) => {
                                dispatch(reducerActions.setConvMaskToPoly(value));
                            }}
                        />
                    </Form.Item>
                    <Text strong>{t('fields.convertMasksToPolygons')}</Text>
                    <CVATTooltip title={t('help.masksOnly')}>
                        <QuestionCircleOutlined />
                    </CVATTooltip>
                </Space>
                <Space className='cvat-modal-import-switch-use-default-storage-container'>
                    <Form.Item
                        name='useDefaultSettings'
                        valuePropName='checked'
                        className='cvat-modal-import-switch-use-default-storage'
                    >
                        <Switch
                            onChange={(value: boolean) => {
                                dispatch(reducerActions.setUseDefaultSettings(value));
                            }}
                        />
                    </Form.Item>
                    <Text strong>{t('fields.useDefaultSettings')}</Text>
                    <CVATTooltip title={helpMessage}>
                        <QuestionCircleOutlined />
                    </CVATTooltip>
                </Space>
                {isAnnotation() && (
                    <Form.Item
                        name='importMode'
                        label={(
                            <Space className='cvat-modal-import-mode-label' size={4}>
                                <Text strong>{t('fields.importMode')}</Text>
                                <CVATTooltip
                                    title={(
                                        <div>
                                            <div>{t('help.importModeIntro')}</div>
                                            <div>{t('help.replaceMode')}</div>
                                            <div>{t('help.appendMode')}</div>
                                        </div>
                                    )}
                                >
                                    <QuestionCircleOutlined />
                                </CVATTooltip>
                            </Space>
                        )}
                        className='cvat-modal-import-mode'
                    >
                        <Radio.Group
                            buttonStyle='solid'
                            onChange={(event) => {
                                dispatch(reducerActions.setImportMode(event.target.value));
                            }}
                        >
                            <Radio.Button value='replace'>{t('options.replace')}</Radio.Button>
                            <Radio.Button value='append'>{t('options.append')}</Radio.Button>
                        </Radio.Group>
                    </Form.Item>
                )}
                {!useDefaultSettings && (
                    <StorageField
                        locationName={['sourceStorage', 'location']}
                        selectCloudStorageName={['sourceStorage', 'cloudStorageId']}
                        onChangeStorage={(value: StorageData) => {
                            dispatch(reducerActions.setSourceStorage(new Storage({
                                location: value?.location || defaultStorageLocation,
                                cloudStorageId: (value.location) ? value.cloudStorageId : defaultStorageCloudId,
                            })));
                        }}
                        locationValue={selectedSourceStorageLocation}
                        onChangeLocationValue={(value: StorageLocation) => {
                            dispatch(reducerActions.setSelectedSourceStorageLocation(value));
                        }}
                    />
                )}
                { !loadFromLocal && renderCustomName() }
                { loadFromLocal && uploadLocalFile() }
            </Form>
        </Modal>
    );
}

interface StateToProps {
    importers: Loader[];
    instanceT: 'project' | 'task' | 'job' | null;
    instance: Project | Task | Job | null;
}

function mapStateToProps(state: CombinedState): StateToProps {
    const { instanceType } = state.import;

    return {
        importers: state.formats.annotationFormats?.loaders ?? [],
        instanceT: instanceType,
        instance: !instanceType ? null : (
            state.import[`${instanceType}s` as 'projects' | 'tasks' | 'jobs']
        ).dataset.modalInstance,
    };
}

export default connect(mapStateToProps)(ImportDatasetModal);
