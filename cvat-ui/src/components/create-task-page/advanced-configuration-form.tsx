// Copyright (C) 2020-2022 Intel Corporation
// Copyright (C) CVAT.ai Corporation
//
// SPDX-License-Identifier: MIT

import React, { RefObject } from 'react';
import { Row, Col } from 'antd/lib/grid';
import { PercentageOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import Input from 'antd/lib/input';
import Space from 'antd/lib/space';
import Switch from 'antd/lib/switch';
import Tooltip from 'antd/lib/tooltip';
import Radio from 'antd/lib/radio';
import Checkbox from 'antd/lib/checkbox';
import Form, { FormInstance, RuleObject, RuleRender } from 'antd/lib/form';
import Text from 'antd/lib/typography/Text';
import { Store } from 'antd/lib/form/interface';
import i18n from 'i18n';
import CVATTooltip from 'components/common/cvat-tooltip';
import patterns from 'utils/validation-patterns';
import { isInteger } from 'utils/validation';
import SourceStorageField from 'components/storage/source-storage-field';
import TargetStorageField from 'components/storage/target-storage-field';

import {
    getCore, Storage, StorageData, StorageLocation,
} from 'cvat-core-wrapper';

const core = getCore();

export enum SortingMethod {
    LEXICOGRAPHICAL = 'lexicographical',
    NATURAL = 'natural',
    PREDEFINED = 'predefined',
    RANDOM = 'random',
}

export interface AdvancedConfiguration {
    bugTracker?: string;
    imageQuality?: number;
    overlapSize?: number;
    segmentSize?: number;
    startFrame?: number;
    stopFrame?: number;
    frameFilter?: string;
    useZipChunks: boolean;
    dataChunkSize?: number;
    useCache: boolean;
    copyData?: boolean;
    sortingMethod: SortingMethod;
    useProjectSourceStorage: boolean;
    useProjectTargetStorage: boolean;
    consensusReplicas: number;
    sourceStorage: StorageData;
    targetStorage: StorageData;
}

export enum AdvancedConfigurationSection {
    SORTING = 'sorting',
    COPY_DATA = 'copyData',
    CHUNKING = 'chunking',
    IMAGE_QUALITY = 'imageQuality',
    FRAME_RANGE = 'frameRange',
    CHUNK_SIZE = 'chunkSize',
    CONSENSUS = 'consensus',
    BUG_TRACKER = 'bugTracker',
    STORAGE = 'storage',
}

export const CV_ADVANCED_CONFIGURATION_SECTIONS = [
    AdvancedConfigurationSection.SORTING,
    AdvancedConfigurationSection.COPY_DATA,
    AdvancedConfigurationSection.CHUNKING,
    AdvancedConfigurationSection.IMAGE_QUALITY,
    AdvancedConfigurationSection.FRAME_RANGE,
    AdvancedConfigurationSection.CHUNK_SIZE,
    AdvancedConfigurationSection.CONSENSUS,
    AdvancedConfigurationSection.BUG_TRACKER,
    AdvancedConfigurationSection.STORAGE,
];

export const AUDIO_ADVANCED_CONFIGURATION_SECTIONS = [
    AdvancedConfigurationSection.CONSENSUS,
    AdvancedConfigurationSection.BUG_TRACKER,
    AdvancedConfigurationSection.STORAGE,
];

const initialValues: AdvancedConfiguration = {
    imageQuality: 70,
    useZipChunks: true,
    useCache: true,
    copyData: false,
    sortingMethod: SortingMethod.LEXICOGRAPHICAL,
    useProjectSourceStorage: true,
    useProjectTargetStorage: true,
    consensusReplicas: 0,

    sourceStorage: {
        location: StorageLocation.LOCAL,
        cloudStorageId: undefined,
    },
    targetStorage: {
        location: StorageLocation.LOCAL,
        cloudStorageId: undefined,
    },
};

interface Props {
    onSubmit(values: AdvancedConfiguration): Promise<void>;
    onChangeUseProjectSourceStorage(value: boolean): void;
    onChangeUseProjectTargetStorage(value: boolean): void;
    onChangeSourceStorageLocation: (value: StorageLocation) => void;
    onChangeTargetStorageLocation: (value: StorageLocation) => void;
    onChangeSortingMethod(value: SortingMethod): void;
    projectId: number | null;
    useProjectSourceStorage: boolean;
    useProjectTargetStorage: boolean;
    activeFileManagerTab?: string;
    sourceStorageLocation: StorageLocation;
    targetStorageLocation: StorageLocation;
    visibleSections?: AdvancedConfigurationSection[];
}

function validateURL(_: RuleObject, value: string): Promise<void> {
    if (value && !patterns.validateURL.pattern.test(value)) {
        return Promise.reject(new Error(i18n.t('forms:validation.urlInvalid')));
    }

    return Promise.resolve();
}

const validateOverlapSize: RuleRender = ({ getFieldValue }): RuleObject => ({
    validator(_: RuleObject, value?: string | number): Promise<void> {
        if (typeof value !== 'undefined' && value !== '') {
            const segmentSize = getFieldValue('segmentSize');
            if (typeof segmentSize !== 'undefined' && segmentSize !== '') {
                if (+segmentSize <= +value) {
                    return Promise.reject(new Error(i18n.t('forms:validation.segmentMoreThanOverlap')));
                }
            }
        }

        return Promise.resolve();
    },
});

const validateStopFrame: RuleRender = ({ getFieldValue }): RuleObject => ({
    validator(_: RuleObject, value?: string | number): Promise<void> {
        if (typeof value !== 'undefined' && value !== '') {
            const startFrame = getFieldValue('startFrame');
            if (typeof startFrame !== 'undefined' && startFrame !== '') {
                if (+startFrame > +value) {
                    return Promise.reject(new Error(i18n.t('forms:validation.startNotMoreThanStop')));
                }
            }
        }

        return Promise.resolve();
    },
});

class AdvancedConfigurationForm extends React.PureComponent<Props> {
    private formRef: RefObject<FormInstance>;

    public constructor(props: Props) {
        super(props);
        this.formRef = React.createRef<FormInstance>();
    }

    private hasSection(section: AdvancedConfigurationSection): boolean {
        const { visibleSections = CV_ADVANCED_CONFIGURATION_SECTIONS } = this.props;
        return visibleSections.includes(section);
    }

    private getValuesWithoutFrameStep(values: Store): AdvancedConfiguration {
        const entries = Object.entries(values).filter(
            (entry: [string, unknown]): boolean => entry[0] !== 'frameStep',
        );

        return (Object.fromEntries(entries) as any) as AdvancedConfiguration;
    }

    private getFrameFilter(values: Store): Pick<AdvancedConfiguration, 'frameFilter'> {
        if (!this.hasSection(AdvancedConfigurationSection.FRAME_RANGE)) {
            return {};
        }

        return {
            frameFilter: values.frameStep ? `step=${values.frameStep}` : undefined,
        };
    }

    public submit(): Promise<void> {
        const { onSubmit, projectId } = this.props;

        if (this.formRef.current) {
            if (projectId) {
                return Promise.all([
                    core.projects.get({ id: projectId }),
                    this.formRef.current.validateFields(),
                ]).then(([getProjectResponse, values]) => {
                    const [project] = getProjectResponse;

                    return onSubmit({
                        ...this.getValuesWithoutFrameStep(values),
                        ...this.getFrameFilter(values),
                        sourceStorage: values.useProjectSourceStorage ?
                            new Storage(project.sourceStorage || { location: StorageLocation.LOCAL }) :
                            new Storage(values.sourceStorage),
                        targetStorage: values.useProjectTargetStorage ?
                            new Storage(project.targetStorage || { location: StorageLocation.LOCAL }) :
                            new Storage(values.targetStorage),
                    });
                });
            }

            return this.formRef.current.validateFields()
                .then(
                    (values: Store): Promise<void> => (
                        onSubmit({
                            ...this.getValuesWithoutFrameStep(values),
                            ...this.getFrameFilter(values),
                            sourceStorage: new Storage(values.sourceStorage),
                            targetStorage: new Storage(values.targetStorage),
                        })
                    ),
                );
        }

        return Promise.reject(new Error(i18n.t('forms:validation.formRefEmpty')));
    }

    public resetFields(): void {
        if (this.formRef.current) {
            this.formRef.current.resetFields();
        }
    }

    private renderCopyDataCheckbox(): JSX.Element {
        return (
            <Form.Item
                help={i18n.t('forms:help.copyData')}
                name='copyData'
                valuePropName='checked'
            >
                <Checkbox>
                    <Text className='cvat-text-color'>{i18n.t('forms:fields.copyData', { defaultValue: '复制数据到 CVAT' })}</Text>
                </Checkbox>
            </Form.Item>
        );
    }

    private renderSortingMethodRadio(): JSX.Element {
        const { onChangeSortingMethod } = this.props;

        return (
            <Form.Item
                label={i18n.t('forms:fields.sortingMethod')}
                name='sortingMethod'
                rules={[
                    {
                        required: true,
                        message: i18n.t('forms:validation.fieldRequiredWithPeriod'),
                    },
                ]}
                help={i18n.t('forms:help.sortingMethod')}
            >
                <Radio.Group buttonStyle='solid' onChange={(e) => onChangeSortingMethod(e.target.value)}>
                    <Radio.Button value={SortingMethod.LEXICOGRAPHICAL} key={SortingMethod.LEXICOGRAPHICAL}>
                        {i18n.t('forms:options.lexicographical')}
                    </Radio.Button>
                    <Radio.Button value={SortingMethod.NATURAL} key={SortingMethod.NATURAL}>
                        {i18n.t('forms:options.natural')}
                    </Radio.Button>
                    <Radio.Button value={SortingMethod.PREDEFINED} key={SortingMethod.PREDEFINED}>
                        {i18n.t('forms:options.predefined')}
                    </Radio.Button>
                    <Radio.Button value={SortingMethod.RANDOM} key={SortingMethod.RANDOM}>
                        {i18n.t('forms:options.random')}
                    </Radio.Button>
                </Radio.Group>
            </Form.Item>
        );
    }

    private renderImageQuality(): JSX.Element {
        return (
            <CVATTooltip title={i18n.t('forms:help.imageQuality')}>
                <Form.Item
                    label={i18n.t('forms:fields.imageQuality')}
                    name='imageQuality'
                    rules={[
                        {
                            required: true,
                            message: i18n.t('forms:validation.fieldRequiredWithPeriod'),
                        },
                        { validator: isInteger({ min: 5, max: 100 }) },
                    ]}
                >
                    <Input size='large' type='number' min={5} max={100} suffix={<PercentageOutlined />} />
                </Form.Item>
            </CVATTooltip>
        );
    }

    private renderOverlap(): JSX.Element {
        return (
            <CVATTooltip title={i18n.t('forms:help.overlapSize')}>
                <Form.Item
                    label={i18n.t('forms:fields.overlapSize')}
                    name='overlapSize'
                    dependencies={['segmentSize']}
                    rules={[{ validator: isInteger({ min: 0 }) }, validateOverlapSize]}
                >
                    <Input size='large' type='number' min={0} />
                </Form.Item>
            </CVATTooltip>
        );
    }

    private renderSegmentSize(): JSX.Element {
        return (
            <CVATTooltip title={i18n.t('forms:help.segmentSize')}>
                <Form.Item label={i18n.t('forms:fields.segmentSize')} name='segmentSize' rules={[{ validator: isInteger({ min: 1 }) }]}>
                    <Input size='large' type='number' min={1} />
                </Form.Item>
            </CVATTooltip>
        );
    }

    private renderStartFrame(): JSX.Element {
        return (
            <Form.Item label={i18n.t('forms:fields.startFrame')} name='startFrame' rules={[{ validator: isInteger({ min: 0 }) }]}>
                <Input size='large' type='number' min={0} step={1} />
            </Form.Item>
        );
    }

    private renderStopFrame(): JSX.Element {
        return (
            <Form.Item
                label={i18n.t('forms:fields.stopFrame')}
                name='stopFrame'
                dependencies={['startFrame']}
                rules={[{ validator: isInteger({ min: 0 }) }, validateStopFrame]}
            >
                <Input size='large' type='number' min={0} step={1} />
            </Form.Item>
        );
    }

    private renderFrameStep(): JSX.Element {
        return (
            <Form.Item label={i18n.t('forms:fields.frameStep')} name='frameStep' rules={[{ validator: isInteger({ min: 1 }) }]}>
                <Input size='large' type='number' min={1} step={1} />
            </Form.Item>
        );
    }

    private renderBugTracker(): JSX.Element {
        return (
            <Form.Item
                hasFeedback
                name='bugTracker'
                label={i18n.t('forms:fields.issueTracker')}
                extra={i18n.t('forms:help.issueTrackerTask')}
                rules={[{ validator: validateURL }]}
            >
                <Input size='large' />
            </Form.Item>
        );
    }

    private renderUzeZipChunks(): JSX.Element {
        return (
            <Space>
                <Form.Item
                    name='useZipChunks'
                    valuePropName='checked'
                    className='cvat-settings-switch'
                >
                    <Switch />
                </Form.Item>
                <Text className='cvat-text-color'>{i18n.t('forms:fields.preferZipChunks', { defaultValue: '优先使用 ZIP 块' })}</Text>
                <Tooltip title={i18n.t('forms:help.preferZipChunks')}>
                    <QuestionCircleOutlined style={{ opacity: 0.5 }} />
                </Tooltip>
            </Space>
        );
    }

    private renderCreateTaskMethod(): JSX.Element {
        return (
            <Space>
                <Form.Item
                    name='useCache'
                    valuePropName='checked'
                    className='cvat-settings-switch'
                >
                    <Switch defaultChecked />
                </Form.Item>
                <Text className='cvat-text-color'>{i18n.t('forms:fields.useCache', { defaultValue: '使用缓存' })}</Text>
                <Tooltip title={i18n.t('forms:help.useCache')}>
                    <QuestionCircleOutlined style={{ opacity: 0.5 }} />
                </Tooltip>
            </Space>
        );
    }

    private renderChunkSize(): JSX.Element {
        return (
            <CVATTooltip
                title={(
                    <>
                        {i18n.t('forms:help.chunkSize')}
                        <br />
                        {i18n.t('forms:help.recommendedValues')}
                        <br />
                        {i18n.t('forms:help.resolution1080')}
                        <br />
                        {i18n.t('forms:help.resolution2k')}
                        <br />
                        {i18n.t('forms:help.resolution4k')}
                        <br />
                        {i18n.t('forms:help.resolutionMore')}
                    </>
                )}
            >
                <Form.Item label={i18n.t('forms:fields.chunkSize')} name='dataChunkSize' rules={[{ validator: isInteger({ min: 1 }) }]}>
                    <Input size='large' type='number' />
                </Form.Item>
            </CVATTooltip>
        );
    }

    private renderConsensusReplicas(): JSX.Element {
        return (
            <Form.Item
                label={i18n.t('forms:fields.consensusReplicas')}
                name='consensusReplicas'
                rules={[
                    {
                        validator: isInteger({
                            min: 0,
                            max: 10,
                            filter: (intValue: number): boolean => intValue !== 1,
                        }),
                    },
                ]}
            >
                <Input
                    size='large'
                    type='number'
                    min={0}
                    max={10}
                    step={1}
                />
            </Form.Item>
        );
    }

    private renderSourceStorage(): JSX.Element {
        const {
            projectId,
            useProjectSourceStorage,
            sourceStorageLocation,
            onChangeUseProjectSourceStorage,
            onChangeSourceStorageLocation,
        } = this.props;
        return (
            <SourceStorageField
                instanceId={projectId}
                locationValue={sourceStorageLocation}
                switchDescription={i18n.t('forms:help.useProjectSourceStorage')}
                storageDescription={i18n.t('forms:help.sourceStorage')}
                useDefaultStorage={useProjectSourceStorage}
                onChangeUseDefaultStorage={onChangeUseProjectSourceStorage}
                onChangeLocationValue={onChangeSourceStorageLocation}
            />
        );
    }

    private renderTargetStorage(): JSX.Element {
        const {
            projectId,
            useProjectTargetStorage,
            targetStorageLocation,
            onChangeUseProjectTargetStorage,
            onChangeTargetStorageLocation,
        } = this.props;
        return (
            <TargetStorageField
                instanceId={projectId}
                locationValue={targetStorageLocation}
                switchDescription={i18n.t('forms:help.useProjectTargetStorage')}
                storageDescription={i18n.t('forms:help.targetStorage')}
                useDefaultStorage={useProjectTargetStorage}
                onChangeUseDefaultStorage={onChangeUseProjectTargetStorage}
                onChangeLocationValue={onChangeTargetStorageLocation}
            />
        );
    }

    public render(): JSX.Element {
        const { activeFileManagerTab } = this.props;
        const hasSorting = this.hasSection(AdvancedConfigurationSection.SORTING);
        const hasCopyData = this.hasSection(AdvancedConfigurationSection.COPY_DATA);
        const hasChunking = this.hasSection(AdvancedConfigurationSection.CHUNKING);
        const hasImageQuality = this.hasSection(AdvancedConfigurationSection.IMAGE_QUALITY);
        const hasFrameRange = this.hasSection(AdvancedConfigurationSection.FRAME_RANGE);
        const hasChunkSize = this.hasSection(AdvancedConfigurationSection.CHUNK_SIZE);
        const hasConsensus = this.hasSection(AdvancedConfigurationSection.CONSENSUS);
        const hasBugTracker = this.hasSection(AdvancedConfigurationSection.BUG_TRACKER);
        const hasStorage = this.hasSection(AdvancedConfigurationSection.STORAGE);

        return (
            <Form initialValues={initialValues} ref={this.formRef} layout='vertical'>
                {hasSorting && (
                    <Row>
                        <Col>{this.renderSortingMethodRadio()}</Col>
                    </Row>
                )}
                {hasCopyData && activeFileManagerTab === 'share' && (
                    <Row>
                        <Col>{this.renderCopyDataCheckbox()}</Col>
                    </Row>
                )}
                {hasChunking && (
                    <Row>
                        <Col span={12}>{this.renderUzeZipChunks()}</Col>
                        <Col span={12}>{this.renderCreateTaskMethod()}</Col>
                    </Row>
                )}
                {hasImageQuality && (
                    <Row justify='start'>
                        <Col span={7}>{this.renderImageQuality()}</Col>
                        <Col span={7} offset={1}>
                            {this.renderOverlap()}
                        </Col>
                        <Col span={7} offset={1}>
                            {this.renderSegmentSize()}
                        </Col>
                    </Row>
                )}
                {hasFrameRange && (
                    <Row justify='start'>
                        <Col span={7}>{this.renderStartFrame()}</Col>
                        <Col span={7} offset={1}>
                            {this.renderStopFrame()}
                        </Col>
                        <Col span={7} offset={1}>
                            {this.renderFrameStep()}
                        </Col>
                    </Row>
                )}
                {hasChunkSize && (
                    <Row justify='start'>
                        <Col span={7}>{this.renderChunkSize()}</Col>
                    </Row>
                )}
                {hasConsensus && (
                    <Row justify='start'>
                        <Col span={7}>
                            {this.renderConsensusReplicas()}
                        </Col>
                    </Row>
                )}
                {hasBugTracker && (
                    <Row>
                        <Col span={24}>{this.renderBugTracker()}</Col>
                    </Row>
                )}
                {hasStorage && (
                    <Row justify='space-between'>
                        <Col span={11}>
                            {this.renderSourceStorage()}
                        </Col>
                        <Col span={11} offset={1}>
                            {this.renderTargetStorage()}
                        </Col>
                    </Row>
                )}
            </Form>
        );
    }
}

export default AdvancedConfigurationForm;
